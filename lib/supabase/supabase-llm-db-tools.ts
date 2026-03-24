import { createClient } from "@supabase/supabase-js"
import { tool } from "ai"
import { z } from "zod"

import {
  getSupabaseQuerySensitivePatterns,
  getSupabaseRagPoisonPatterns,
  logSecurityPatternRegistryLoad,
} from "@/lib/security/security-patterns"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"

type JsonObject = Record<string, unknown>

const IDENTIFIER_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/
const FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/
const MAX_PAYLOAD_SIZE_BYTES = 32_000
const MAX_FIELDS_PER_COLLECTION = 50
const MAX_QUERY_LIMIT = 100
const MAX_WORKSPACES_PER_USER = 25
const MAX_SECURITY_REASONS = 20
const MAX_BATCH_SIZE = 50
const MAX_SEARCH_RESULTS = 100

const RAG_POISON_PATTERNS = getSupabaseRagPoisonPatterns()
const QUERY_SENSITIVE_PATTERNS = getSupabaseQuerySensitivePatterns()

logSecurityPatternRegistryLoad("supabase-llm-db-tools")

const TABLES = {
  workspaces:
    process.env.SUPABASE_LLM_WORKSPACES_TABLE ||
    process.env.NEXT_PUBLIC_SUPABASE_LLM_WORKSPACES_TABLE ||
    "llm_workspaces",
  collections:
    process.env.SUPABASE_LLM_COLLECTIONS_TABLE ||
    process.env.NEXT_PUBLIC_SUPABASE_LLM_COLLECTIONS_TABLE ||
    "llm_collections",
  documents:
    process.env.SUPABASE_LLM_DOCUMENTS_TABLE ||
    process.env.NEXT_PUBLIC_SUPABASE_LLM_DOCUMENTS_TABLE ||
    "llm_documents",
}

export const SUPABASE_LLM_DB_TOOL_NAMES = [
  "createRapidFireDb",
  "listRapidFireDbs",
  "getRapidFireDb",
  "updateRapidFireDb",
  "deleteRapidFireDb",
  "verifyRapidFireDbDeleted",
  "createRapidFireCollection",
  "listRapidFireCollections",
  "getRapidFireCollection",
  "updateRapidFireCollection",
  "deleteRapidFireCollection",
  "verifyRapidFireCollectionDeleted",
  "upsertRapidFireDocument",
  "batchUpsertRapidFireDocuments",
  "queryRapidFireDocuments",
  "searchRapidFireDocuments",
  "getRapidFireDocument",
  "deleteRapidFireDocument",
  "verifyRapidFireDocumentDeleted",
  "getWorkspaceStats",
] as const

function isSupabaseLlmDbToolsEnabled(): boolean {
  return process.env.ENABLE_SUPABASE_LLM_DB_TOOLS === "true"
}

function toBoolEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value || "").trim().toLowerCase()
  if (normalized === "true") {
    return true
  }
  if (normalized === "false") {
    return false
  }
  return fallback
}

function shouldBlockPoisonedRagDocuments(): boolean {
  return toBoolEnv(
    process.env.SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS,
    process.env.NODE_ENV === "production",
  )
}

function shouldRequireTrustedDocumentSource(): boolean {
  return toBoolEnv(process.env.SUPABASE_LLM_REQUIRE_TRUSTED_SOURCE_FOR_UPSERT, false)
}

function shouldFilterUntrustedQueryDocuments(): boolean {
  return toBoolEnv(
    process.env.SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS,
    process.env.NODE_ENV === "production",
  )
}

function shouldRedactSensitiveQueryPayloads(): boolean {
  return toBoolEnv(
    process.env.SUPABASE_LLM_REDACT_SENSITIVE_QUERY_FIELDS,
    process.env.NODE_ENV === "production",
  )
}

function parseLowerCsvSet(value: string | undefined): Set<string> {
  if (!value) {
    return new Set<string>()
  }
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function getTrustedSourceAllowlist(): Set<string> {
  return parseLowerCsvSet(process.env.SUPABASE_LLM_TRUSTED_SOURCES)
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as JsonObject
}

function extractSourceLabel(metadata: unknown): string | null {
  const record = asObject(metadata)
  const sourceCandidate =
    (typeof record.source === "string" && record.source) ||
    (typeof record.sourceId === "string" && record.sourceId) ||
    (typeof record.source_id === "string" && record.source_id) ||
    (typeof record.sourceType === "string" && record.sourceType) ||
    (typeof record.source_type === "string" && record.source_type) ||
    null
  if (!sourceCandidate) {
    return null
  }
  const normalized = sourceCandidate.trim().toLowerCase()
  return normalized || null
}

function isTrustedSource(source: string | null, allowlist: Set<string>): boolean {
  if (allowlist.size === 0) {
    return true
  }
  if (!source) {
    return false
  }
  return allowlist.has(source)
}

function collectStringPatternMatches(
  value: unknown,
  patterns: readonly RegExp[],
  path: string,
  matches: string[],
  maxMatches: number,
): void {
  if (matches.length >= maxMatches) {
    return
  }

  if (typeof value === "string") {
    const sample = value.slice(0, 20_000)
    for (const pattern of patterns) {
      if (pattern.test(sample)) {
        matches.push(`${path}: ${pattern.source}`)
        if (matches.length >= maxMatches) {
          break
        }
      }
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectStringPatternMatches(entry, patterns, `${path}[${index}]`, matches, maxMatches),
    )
    return
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as JsonObject)) {
      collectStringPatternMatches(entry, patterns, `${path}.${key}`, matches, maxMatches)
      if (matches.length >= maxMatches) {
        break
      }
    }
  }
}

function inspectPotentialRagPoisoning(input: {
  documentKey: string
  data: JsonObject
  metadata: JsonObject
}): string[] {
  const reasons: string[] = []
  collectStringPatternMatches(input.data, RAG_POISON_PATTERNS, "$.data", reasons, MAX_SECURITY_REASONS)
  collectStringPatternMatches(
    input.metadata,
    RAG_POISON_PATTERNS,
    "$.metadata",
    reasons,
    MAX_SECURITY_REASONS,
  )
  collectStringPatternMatches(
    input.documentKey,
    RAG_POISON_PATTERNS,
    "$.documentKey",
    reasons,
    MAX_SECURITY_REASONS,
  )
  return reasons
}

function redactSensitiveValue(
  value: unknown,
): { value: unknown; redactedCount: number } {
  if (typeof value === "string") {
    for (const pattern of QUERY_SENSITIVE_PATTERNS) {
      if (pattern.test(value)) {
        return { value: "[REDACTED:SENSITIVE_VALUE]", redactedCount: 1 }
      }
    }
    return { value, redactedCount: 0 }
  }

  if (Array.isArray(value)) {
    let redactedCount = 0
    const next = value.map((entry) => {
      const result = redactSensitiveValue(entry)
      redactedCount += result.redactedCount
      return result.value
    })
    return { value: next, redactedCount }
  }

  if (value && typeof value === "object") {
    let redactedCount = 0
    const next: JsonObject = {}
    for (const [key, entry] of Object.entries(value as JsonObject)) {
      const result = redactSensitiveValue(entry)
      redactedCount += result.redactedCount
      next[key] = result.value
    }
    return { value: next, redactedCount }
  }

  return { value, redactedCount: 0 }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function getPayloadSizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8")
}

function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return null
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return null
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function ensureWorkspaceAccess(
  client: ReturnType<typeof createUserScopedClient>,
  workspaceId: string,
): Promise<{ ok: true; workspace?: JsonObject } | { ok: false; error: string }> {
  if (!client) {
    return { ok: false, error: "Supabase environment is not configured." }
  }

  const { data, error } = await client
    .from(TABLES.workspaces)
    .select("id,name,slug,description,created_at,updated_at")
    .eq("id", workspaceId)
    .single()
  if (error || !data) {
    return { ok: false, error: "Workspace not found or access denied." }
  }

  return { ok: true, workspace: data }
}

async function ensureCollectionAccess(
  client: ReturnType<typeof createUserScopedClient>,
  workspaceId: string,
  collectionId: string,
): Promise<{ ok: true; collection?: JsonObject } | { ok: false; error: string }> {
  if (!client) {
    return { ok: false, error: "Supabase environment is not configured." }
  }

  const { data, error } = await client
    .from(TABLES.collections)
    .select("id,name,workspace_id,schema_definition,created_at,updated_at")
    .eq("id", collectionId)
    .eq("workspace_id", workspaceId)
    .single()

  if (error || !data) {
    return { ok: false, error: "Collection not found or access denied." }
  }

  return { ok: true, collection: data }
}

function normalizeDataForStorage(value: JsonObject): JsonObject {
  const copy: JsonObject = {}
  for (const [key, keyValue] of Object.entries(value)) {
    copy[key] = keyValue
  }
  return copy
}

function buildSearchableText(data: JsonObject, metadata: JsonObject): string {
  const parts: string[] = []

  const extractStrings = (obj: unknown, depth: number = 0): void => {
    if (depth > 5) return
    if (typeof obj === "string") {
      parts.push(obj)
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => extractStrings(item, depth + 1))
    } else if (obj && typeof obj === "object") {
      Object.values(obj).forEach((val) => extractStrings(val, depth + 1))
    }
  }

  extractStrings(data)
  extractStrings(metadata)

  return parts.join(" ").slice(0, 10000)
}

function scoreSearchMatch(
  searchableText: string,
  searchTerms: string[],
): { score: number; matchedTerms: string[] } {
  const lowerText = searchableText.toLowerCase()
  const matchedTerms: string[] = []
  let score = 0

  for (const term of searchTerms) {
    const lowerTerm = term.toLowerCase()
    const occurrences = (lowerText.match(new RegExp(lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length
    if (occurrences > 0) {
      matchedTerms.push(term)
      score += occurrences * (1 + term.length / 10)
    }
  }

  return { score, matchedTerms }
}

const fieldTypeSchema = z.enum(["string", "number", "boolean", "json"])

export function createSupabaseLlmDbTools(authContext: SupabaseAuthContext | null) {
  if (!isSupabaseLlmDbToolsEnabled() || !authContext) {
    return {}
  }

  const client = createUserScopedClient(authContext.accessToken)

  return {
    createRapidFireDb: tool({
      description:
        "Create a user-scoped LLM workspace (logical database). No raw SQL. Use for RAG/knowledge bases. Then createRapidFireCollection and upsertRapidFireDocument.",
      inputSchema: z.object({
        databaseName: z.string().min(3).max(80),
        description: z.string().max(240).nullable(),
        defaultCollection: z.string().min(3).max(64).nullable(),
        tags: z.array(z.string().max(32)).max(10).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const { count, error: countError } = await client
          .from(TABLES.workspaces)
          .select("id", { head: true, count: "exact" })

        if (countError) {
          return { ok: false, error: "Unable to validate workspace quota." }
        }

        if ((count || 0) >= MAX_WORKSPACES_PER_USER) {
          return {
            ok: false,
            error: `Workspace quota reached (${MAX_WORKSPACES_PER_USER}).`,
          }
        }

        const slug = toSlug(input.databaseName)
        if (slug.length < 3) {
          return { ok: false, error: "Database name is not valid." }
        }

        const workspacePayload = {
          owner_user_id: authContext.userId,
          name: input.databaseName.trim(),
          slug,
          description: input.description?.trim() || null,
          metadata: {
            tags: input.tags || [],
            createdBy: "llm-db-tools",
            version: "2.0",
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        const { data: workspace, error: workspaceError } = await client
          .from(TABLES.workspaces)
          .insert(workspacePayload)
          .select("id,name,slug,description,metadata,created_at")
          .single()

        if (workspaceError || !workspace) {
          return { ok: false, error: "Failed to create database workspace." }
        }

        let createdCollection: Record<string, unknown> | null = null
        const defaultCollection = input.defaultCollection?.trim()
        if (defaultCollection) {
          const collectionSlug = toSlug(defaultCollection)
          if (!IDENTIFIER_REGEX.test(collectionSlug)) {
            return {
              ok: true,
              workspace,
              warning: "Workspace created, but default collection name is invalid.",
            }
          }

          const { data: collection, error: collectionError } = await client
            .from(TABLES.collections)
            .insert({
              owner_user_id: authContext.userId,
              workspace_id: workspace.id,
              name: collectionSlug,
              schema_definition: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select("id,name,workspace_id,created_at")
            .single()

          if (!collectionError && collection) {
            createdCollection = collection
          }
        }

        return {
          ok: true,
          workspace,
          defaultCollection: createdCollection,
          security: "RLS enforced with authenticated user scope",
          suggestedNextTools: "createRapidFireCollection(workspaceId, collectionName); listRapidFireDbs to see all workspaces",
        }
      },
    }),

    listRapidFireDbs: tool({
      description:
        "List LLM database workspaces (id, name, slug) for the authenticated user. Use to pick workspaceId for createRapidFireCollection or queryRapidFireDocuments.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).nullable(),
        searchQuery: z.string().max(100).nullable(),
        sortBy: z.enum(["updated_at", "created_at", "name"]).nullable(),
        sortOrder: z.enum(["asc", "desc"]).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const limit = input.limit || 25
        const sortBy = input.sortBy || "updated_at"
        const ascending = input.sortOrder === "asc"

        let query = client
          .from(TABLES.workspaces)
          .select("id,name,slug,description,metadata,created_at,updated_at")
          .order(sortBy, { ascending })
          .limit(limit)

        if (input.searchQuery) {
          query = query.or(
            `name.ilike.%${input.searchQuery}%,slug.ilike.%${input.searchQuery}%,description.ilike.%${input.searchQuery}%`
          )
        }

        const { data, error } = await query

        if (error) {
          return { ok: false, error: "Failed to list workspaces." }
        }

        return {
          ok: true,
          workspaces: data || [],
          count: (data || []).length,
          suggestedNextTools: "getRapidFireDb(workspaceId) for details; createRapidFireCollection(workspaceId, collectionName); createRapidFireDb if you need a new workspace",
        }
      },
    }),

    getRapidFireDb: tool({
      description:
        "Get detailed information about a specific workspace including collections count and document count.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        includeCollections: z.boolean().nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const { count: collectionsCount } = await client
          .from(TABLES.collections)
          .select("id", { head: true, count: "exact" })
          .eq("workspace_id", input.workspaceId)

        const { count: documentsCount } = await client
          .from(TABLES.documents)
          .select("id", { head: true, count: "exact" })
          .eq("workspace_id", input.workspaceId)

        let collections: JsonObject[] = []
        if (input.includeCollections) {
          const { data: collectionData } = await client
            .from(TABLES.collections)
            .select("id,name,schema_definition,created_at,updated_at")
            .eq("workspace_id", input.workspaceId)
            .order("updated_at", { ascending: false })
            .limit(50)

          collections = collectionData || []
        }

        return {
          ok: true,
          workspace: workspaceCheck.workspace,
          stats: {
            collectionsCount: collectionsCount || 0,
            documentsCount: documentsCount || 0,
          },
          collections: input.includeCollections ? collections : undefined,
          suggestedNextTools: "listRapidFireCollections(workspaceId); updateRapidFireDb to modify; deleteRapidFireDb to remove",
        }
      },
    }),

    updateRapidFireDb: tool({
      description:
        "Update workspace name, description, or metadata tags.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        name: z.string().min(3).max(80).nullable(),
        description: z.string().max(240).nullable(),
        tags: z.array(z.string().max(32)).max(10).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const updates: JsonObject = {
          updated_at: new Date().toISOString(),
        }

        if (input.name) {
          updates.name = input.name.trim()
          updates.slug = toSlug(input.name)
        }

        if (input.description !== undefined) {
          updates.description = input.description?.trim() || null
        }

        if (input.tags !== undefined) {
          const existingMetadata = asObject(
            (workspaceCheck.workspace as JsonObject)?.metadata
          )
          updates.metadata = {
            ...existingMetadata,
            tags: input.tags || [],
          }
        }

        const { data, error } = await client
          .from(TABLES.workspaces)
          .update(updates)
          .eq("id", input.workspaceId)
          .select("id,name,slug,description,metadata,updated_at")
          .single()

        if (error || !data) {
          return { ok: false, error: "Failed to update workspace." }
        }

        return {
          ok: true,
          workspace: data,
          suggestedNextTools: "getRapidFireDb(workspaceId) to verify changes",
        }
      },
    }),

    deleteRapidFireDb: tool({
      description:
        "Delete a workspace and all its collections and documents. This action is irreversible.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        confirmDelete: z.boolean(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        if (!input.confirmDelete) {
          return { ok: false, error: "Deletion not confirmed. Set confirmDelete to true." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        // Delete documents first (due to foreign key constraints)
        const { error: docError } = await client
          .from(TABLES.documents)
          .delete()
          .eq("workspace_id", input.workspaceId)

        if (docError) {
          return { ok: false, error: "Failed to delete workspace documents." }
        }

        // Delete collections
        const { error: colError } = await client
          .from(TABLES.collections)
          .delete()
          .eq("workspace_id", input.workspaceId)

        if (colError) {
          return { ok: false, error: "Failed to delete workspace collections." }
        }

        // Delete workspace
        const { error: wsError } = await client
          .from(TABLES.workspaces)
          .delete()
          .eq("id", input.workspaceId)

        if (wsError) {
          return { ok: false, error: "Failed to delete workspace." }
        }

        return {
          ok: true,
          deleted: {
            workspaceId: input.workspaceId,
            workspaceName: (workspaceCheck.workspace as JsonObject)?.name,
          },
          suggestedNextTools:
            "verifyRapidFireDbDeleted(workspaceId) to confirm deletion; listRapidFireDbs to see remaining workspaces; createRapidFireDb to create a new one",
        }
      },
    }),

    verifyRapidFireDbDeleted: tool({
      description:
        "Verify a workspace deletion by checking whether the workspace still exists. Use after deleteRapidFireDb before claiming completion.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const { data, error } = await client
          .from(TABLES.workspaces)
          .select("id,name,updated_at")
          .eq("id", input.workspaceId)
          .maybeSingle()

        if (error) {
          return { ok: false, error: "Unable to verify workspace deletion." }
        }

        const exists = Boolean(data)
        return {
          ok: true,
          verification: {
            targetTool: "deleteRapidFireDb",
            subject: `workspace:${input.workspaceId}`,
            verified: !exists,
            evidence: {
              workspaceExists: exists,
              workspaceId: input.workspaceId,
              workspaceName: exists ? (data as JsonObject).name : null,
            },
          },
          suggestedNextTools: !exists
            ? "listRapidFireDbs to confirm current workspaces; createRapidFireDb if needed"
            : "deleteRapidFireDb(workspaceId, confirmDelete: true) to retry deletion",
        }
      },
    }),

    createRapidFireCollection: tool({
      description:
        "Create a collection in a workspace with optional schemaDefinition (field names and types). Use after createRapidFireDb or listRapidFireDbs. Then upsertRapidFireDocument to add documents.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionName: z.string().min(3).max(64),
        schemaDefinition: z.record(z.string(), fieldTypeSchema).nullable(),
        description: z.string().max(240).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const normalizedName = toSlug(input.collectionName)
        if (!IDENTIFIER_REGEX.test(normalizedName)) {
          return { ok: false, error: "Collection name must match secure identifier rules." }
        }

        const schemaDefinition = input.schemaDefinition || {}
        const fields = Object.keys(schemaDefinition)
        if (fields.length > MAX_FIELDS_PER_COLLECTION) {
          return {
            ok: false,
            error: `Collection schema can include at most ${MAX_FIELDS_PER_COLLECTION} fields.`,
          }
        }

        for (const field of fields) {
          if (!FIELD_NAME_REGEX.test(field)) {
            return { ok: false, error: `Invalid field name: ${field}` }
          }
        }

        const { data, error } = await client
          .from(TABLES.collections)
          .insert({
            owner_user_id: authContext.userId,
            workspace_id: input.workspaceId,
            name: normalizedName,
            schema_definition: schemaDefinition,
            metadata: {
              description: input.description?.trim() || null,
              createdBy: "llm-db-tools",
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id,name,workspace_id,schema_definition,metadata,created_at")
          .single()

        if (error || !data) {
          return { ok: false, error: "Failed to create collection." }
        }

        return {
          ok: true,
          collection: data,
          suggestedNextTools: "upsertRapidFireDocument(workspaceId, collectionId, documentKey, data); queryRapidFireDocuments to search later",
        }
      },
    }),

    listRapidFireCollections: tool({
      description:
        "List all collections in a workspace with document counts.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).nullable(),
        includeDocumentCounts: z.boolean().nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const limit = input.limit || 25

        const { data, error } = await client
          .from(TABLES.collections)
          .select("id,name,schema_definition,metadata,created_at,updated_at")
          .eq("workspace_id", input.workspaceId)
          .order("updated_at", { ascending: false })
          .limit(limit)

        if (error) {
          return { ok: false, error: "Failed to list collections." }
        }

        const collections = data || []

        if (input.includeDocumentCounts && collections.length > 0) {
          const collectionIds = collections.map((c) => (c as JsonObject).id as string)

          for (const col of collections) {
            const { count } = await client
              .from(TABLES.documents)
              .select("id", { head: true, count: "exact" })
              .eq("collection_id", (col as JsonObject).id)

            ;(col as JsonObject).documentCount = count || 0
          }
        }

        return {
          ok: true,
          collections,
          count: collections.length,
          suggestedNextTools: "getRapidFireCollection(workspaceId, collectionId) for details; createRapidFireCollection for new collection",
        }
      },
    }),

    getRapidFireCollection: tool({
      description:
        "Get detailed information about a specific collection including schema and document count.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const collectionCheck = await ensureCollectionAccess(
          client,
          input.workspaceId,
          input.collectionId
        )
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const { count: documentsCount } = await client
          .from(TABLES.documents)
          .select("id", { head: true, count: "exact" })
          .eq("collection_id", input.collectionId)

        return {
          ok: true,
          collection: collectionCheck.collection,
          stats: {
            documentsCount: documentsCount || 0,
          },
          suggestedNextTools: "queryRapidFireDocuments to list documents; updateRapidFireCollection to modify schema",
        }
      },
    }),

    updateRapidFireCollection: tool({
      description:
        "Update collection name, schema definition, or description.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        name: z.string().min(3).max(64).nullable(),
        schemaDefinition: z.record(z.string(), fieldTypeSchema).nullable(),
        description: z.string().max(240).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const collectionCheck = await ensureCollectionAccess(
          client,
          input.workspaceId,
          input.collectionId
        )
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const updates: JsonObject = {
          updated_at: new Date().toISOString(),
        }

        if (input.name) {
          const normalizedName = toSlug(input.name)
          if (!IDENTIFIER_REGEX.test(normalizedName)) {
            return { ok: false, error: "Collection name must match secure identifier rules." }
          }
          updates.name = normalizedName
        }

        if (input.schemaDefinition !== undefined) {
          const fields = Object.keys(input.schemaDefinition || {})
          if (fields.length > MAX_FIELDS_PER_COLLECTION) {
            return {
              ok: false,
              error: `Collection schema can include at most ${MAX_FIELDS_PER_COLLECTION} fields.`,
            }
          }
          for (const field of fields) {
            if (!FIELD_NAME_REGEX.test(field)) {
              return { ok: false, error: `Invalid field name: ${field}` }
            }
          }
          updates.schema_definition = input.schemaDefinition || {}
        }

        if (input.description !== undefined) {
          const existingMetadata = asObject(
            (collectionCheck.collection as JsonObject)?.metadata
          )
          updates.metadata = {
            ...existingMetadata,
            description: input.description?.trim() || null,
          }
        }

        const { data, error } = await client
          .from(TABLES.collections)
          .update(updates)
          .eq("id", input.collectionId)
          .select("id,name,workspace_id,schema_definition,metadata,updated_at")
          .single()

        if (error || !data) {
          return { ok: false, error: "Failed to update collection." }
        }

        return {
          ok: true,
          collection: data,
          suggestedNextTools: "getRapidFireCollection(workspaceId, collectionId) to verify changes",
        }
      },
    }),

    deleteRapidFireCollection: tool({
      description:
        "Delete a collection and all its documents. This action is irreversible.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        confirmDelete: z.boolean(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        if (!input.confirmDelete) {
          return { ok: false, error: "Deletion not confirmed. Set confirmDelete to true." }
        }

        const collectionCheck = await ensureCollectionAccess(
          client,
          input.workspaceId,
          input.collectionId
        )
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        // Delete documents first
        const { error: docError } = await client
          .from(TABLES.documents)
          .delete()
          .eq("collection_id", input.collectionId)

        if (docError) {
          return { ok: false, error: "Failed to delete collection documents." }
        }

        // Delete collection
        const { error: colError } = await client
          .from(TABLES.collections)
          .delete()
          .eq("id", input.collectionId)

        if (colError) {
          return { ok: false, error: "Failed to delete collection." }
        }

        return {
          ok: true,
          deleted: {
            collectionId: input.collectionId,
            collectionName: (collectionCheck.collection as JsonObject)?.name,
          },
          suggestedNextTools:
            "verifyRapidFireCollectionDeleted(workspaceId, collectionId) to confirm deletion; listRapidFireCollections to see remaining collections",
        }
      },
    }),

    verifyRapidFireCollectionDeleted: tool({
      description:
        "Verify a collection deletion by checking whether the collection still exists in the workspace.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const { data, error } = await client
          .from(TABLES.collections)
          .select("id,name,workspace_id,updated_at")
          .eq("workspace_id", input.workspaceId)
          .eq("id", input.collectionId)
          .maybeSingle()

        if (error) {
          return { ok: false, error: "Unable to verify collection deletion." }
        }

        const exists = Boolean(data)
        return {
          ok: true,
          verification: {
            targetTool: "deleteRapidFireCollection",
            subject: `workspace:${input.workspaceId}|collection:${input.collectionId}`,
            verified: !exists,
            evidence: {
              collectionExists: exists,
              workspaceId: input.workspaceId,
              collectionId: input.collectionId,
              collectionName: exists ? (data as JsonObject).name : null,
            },
          },
          suggestedNextTools: !exists
            ? "listRapidFireCollections(workspaceId) to confirm current collections"
            : "deleteRapidFireCollection(workspaceId, collectionId, confirmDelete: true) to retry deletion",
        }
      },
    }),

    upsertRapidFireDocument: tool({
      description:
        "Create or update a document in a collection (documentKey, data, optional metadata). Payload size capped; RAG poisoning and trusted-source checks apply. Use queryRapidFireDocuments to retrieve.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        documentKey: z.string().min(3).max(128).regex(IDENTIFIER_REGEX),
        data: z.record(z.string(), z.any()),
        metadata: z.record(z.string(), z.any()).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const collectionCheck = await ensureCollectionAccess(client, input.workspaceId, input.collectionId)
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const normalizedData = normalizeDataForStorage(input.data)
        const normalizedMetadata = asObject(input.metadata || {})
        const sourceAllowlist = getTrustedSourceAllowlist()
        const source = extractSourceLabel(normalizedMetadata)
        const sourceTrusted = isTrustedSource(source, sourceAllowlist)
        const poisoningMatches = inspectPotentialRagPoisoning({
          documentKey: input.documentKey,
          data: normalizedData,
          metadata: normalizedMetadata,
        })

        if (poisoningMatches.length > 0 && shouldBlockPoisonedRagDocuments()) {
          return {
            ok: false,
            error: "Document blocked by RAG poisoning policy.",
            details: poisoningMatches.slice(0, MAX_SECURITY_REASONS),
          }
        }

        if (shouldRequireTrustedDocumentSource() && !sourceTrusted) {
          return {
            ok: false,
            error: "Document source is not trusted by policy.",
            details: {
              source: source || null,
              trustedSourcesConfigured: sourceAllowlist.size > 0,
            },
          }
        }

        const searchableText = buildSearchableText(normalizedData, normalizedMetadata)

        const securityMetadata = {
          scannedAt: new Date().toISOString(),
          source: source || null,
          sourceTrusted,
          sourcePolicy: sourceAllowlist.size > 0 ? "allowlist" : "open",
          promptPoisoningDetected: poisoningMatches.length > 0,
          promptPoisoningMatches: poisoningMatches.slice(0, MAX_SECURITY_REASONS),
        }
        const mergedMetadata = {
          ...normalizedMetadata,
          _security: securityMetadata,
          _searchableText: searchableText,
        }

        const payloadSize = getPayloadSizeBytes(normalizedData)
        if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
          return {
            ok: false,
            error: `Document payload too large (${payloadSize} bytes). Max allowed is ${MAX_PAYLOAD_SIZE_BYTES}.`,
          }
        }

        const { data, error } = await client
          .from(TABLES.documents)
          .upsert(
            {
              owner_user_id: authContext.userId,
              workspace_id: input.workspaceId,
              collection_id: input.collectionId,
              document_key: input.documentKey,
              payload: normalizedData,
              metadata: mergedMetadata,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "collection_id,document_key" },
          )
          .select("id,workspace_id,collection_id,document_key,payload,metadata,updated_at")
          .single()

        if (error || !data) {
          return { ok: false, error: "Failed to upsert document." }
        }

        return {
          ok: true,
          document: data,
          payloadBytes: payloadSize,
          security: {
            source: source || null,
            sourceTrusted,
            promptPoisoningDetected: poisoningMatches.length > 0,
            promptPoisoningMatches: poisoningMatches.slice(0, MAX_SECURITY_REASONS),
          },
          suggestedNextTools: "queryRapidFireDocuments(workspaceId, collectionId) to read back; upsertRapidFireDocument to update same documentKey",
        }
      },
    }),

    batchUpsertRapidFireDocuments: tool({
      description:
        "Batch create or update multiple documents in a collection. More efficient than individual upserts. Returns results for each document.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        documents: z.array(
          z.object({
            documentKey: z.string().min(3).max(128).regex(IDENTIFIER_REGEX),
            data: z.record(z.string(), z.any()),
            metadata: z.record(z.string(), z.any()).nullable(),
          })
        ).min(1).max(MAX_BATCH_SIZE),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const collectionCheck = await ensureCollectionAccess(client, input.workspaceId, input.collectionId)
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const sourceAllowlist = getTrustedSourceAllowlist()
        const results: JsonObject[] = []
        const documentsToInsert: JsonObject[] = []
        let blockedCount = 0
        let oversizedCount = 0

        for (const doc of input.documents) {
          const normalizedData = normalizeDataForStorage(doc.data)
          const normalizedMetadata = asObject(doc.metadata || {})
          const source = extractSourceLabel(normalizedMetadata)
          const sourceTrusted = isTrustedSource(source, sourceAllowlist)
          const poisoningMatches = inspectPotentialRagPoisoning({
            documentKey: doc.documentKey,
            data: normalizedData,
            metadata: normalizedMetadata,
          })

          if (poisoningMatches.length > 0 && shouldBlockPoisonedRagDocuments()) {
            blockedCount++
            results.push({
              documentKey: doc.documentKey,
              ok: false,
              error: "Blocked by RAG poisoning policy",
            })
            continue
          }

          if (shouldRequireTrustedDocumentSource() && !sourceTrusted) {
            blockedCount++
            results.push({
              documentKey: doc.documentKey,
              ok: false,
              error: "Source not trusted",
            })
            continue
          }

          const payloadSize = getPayloadSizeBytes(normalizedData)
          if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
            oversizedCount++
            results.push({
              documentKey: doc.documentKey,
              ok: false,
              error: `Payload too large (${payloadSize} bytes)`,
            })
            continue
          }

          const searchableText = buildSearchableText(normalizedData, normalizedMetadata)

          const securityMetadata = {
            scannedAt: new Date().toISOString(),
            source: source || null,
            sourceTrusted,
            sourcePolicy: sourceAllowlist.size > 0 ? "allowlist" : "open",
            promptPoisoningDetected: poisoningMatches.length > 0,
            promptPoisoningMatches: poisoningMatches.slice(0, MAX_SECURITY_REASONS),
          }

          documentsToInsert.push({
            owner_user_id: authContext.userId,
            workspace_id: input.workspaceId,
            collection_id: input.collectionId,
            document_key: doc.documentKey,
            payload: normalizedData,
            metadata: {
              ...normalizedMetadata,
              _security: securityMetadata,
              _searchableText: searchableText,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }

        if (documentsToInsert.length > 0) {
          const { data, error } = await client
            .from(TABLES.documents)
            .upsert(documentsToInsert, { onConflict: "collection_id,document_key" })
            .select("id,document_key,updated_at")

          if (error) {
            return {
              ok: false,
              error: "Batch upsert failed.",
              partialResults: results,
            }
          }

          for (const inserted of data || []) {
            results.push({
              documentKey: (inserted as JsonObject).document_key,
              ok: true,
              id: (inserted as JsonObject).id,
            })
          }
        }

        return {
          ok: true,
          results,
          summary: {
            total: input.documents.length,
            succeeded: documentsToInsert.length,
            blocked: blockedCount,
            oversized: oversizedCount,
          },
          suggestedNextTools: "queryRapidFireDocuments to verify; searchRapidFireDocuments to find documents",
        }
      },
    }),

    queryRapidFireDocuments: tool({
      description:
        "Read documents from a collection (pagination: limit, offset; optional documentKeys filter). Untrusted/poisoned docs filtered when policy enabled. Use after upsertRapidFireDocument to retrieve stored data.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        documentKeys: z.array(z.string().regex(IDENTIFIER_REGEX)).nullable(),
        limit: z.number().int().min(1).max(MAX_QUERY_LIMIT).nullable(),
        offset: z.number().int().min(0).max(5000).nullable(),
        sortBy: z.enum(["updated_at", "created_at", "document_key"]).nullable(),
        sortOrder: z.enum(["asc", "desc"]).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const collectionCheck = await ensureCollectionAccess(client, input.workspaceId, input.collectionId)
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const limit = input.limit || 25
        const offset = input.offset || 0
        const sortBy = input.sortBy || "updated_at"
        const ascending = input.sortOrder === "asc"

        let query = client
          .from(TABLES.documents)
          .select("id,document_key,payload,metadata,created_at,updated_at")
          .eq("workspace_id", input.workspaceId)
          .eq("collection_id", input.collectionId)
          .order(sortBy, { ascending })
          .range(offset, offset + limit - 1)

        if (input.documentKeys && input.documentKeys.length > 0) {
          query = query.in("document_key", input.documentKeys.slice(0, MAX_QUERY_LIMIT))
        }

        const { data, error } = await query
        if (error) {
          return { ok: false, error: "Failed to query documents." }
        }

        const sourceAllowlist = getTrustedSourceAllowlist()
        const filterUntrusted = shouldFilterUntrustedQueryDocuments()
        const redactSensitive = shouldRedactSensitiveQueryPayloads()

        const rawDocuments = Array.isArray(data) ? data : []
        let filteredPoisoned = 0
        let filteredUntrusted = 0
        let redactedFieldCount = 0

        const documents = rawDocuments
          .map((row) => {
            const record = asObject(row)
            const metadata = asObject(record.metadata)
            const security = asObject(metadata._security)
            const source = extractSourceLabel(metadata)
            const sourceTrusted =
              typeof security.sourceTrusted === "boolean"
                ? security.sourceTrusted
                : isTrustedSource(source, sourceAllowlist)
            const poisoningDetected =
              security.promptPoisoningDetected === true ||
              (Array.isArray(security.promptPoisoningMatches) &&
                security.promptPoisoningMatches.length > 0)

            if (filterUntrusted) {
              if (poisoningDetected) {
                filteredPoisoned += 1
                return null
              }
              if (!sourceTrusted) {
                filteredUntrusted += 1
                return null
              }
            }

            const payload = record.payload
            if (!redactSensitive) {
              return record
            }

            const redaction = redactSensitiveValue(payload)
            redactedFieldCount += redaction.redactedCount
            return {
              ...record,
              payload: redaction.value,
            }
          })
          .filter((item): item is JsonObject => Boolean(item))

        return {
          ok: true,
          documents,
          page: {
            limit,
            offset,
            returnedCount: documents.length,
          },
          security: {
            trustedSourceAllowlistEnabled: sourceAllowlist.size > 0,
            filterUntrustedQueryResults: filterUntrusted,
            redactSensitiveQueryFields: redactSensitive,
            filteredPoisonedDocuments: filteredPoisoned,
            filteredUntrustedDocuments: filteredUntrusted,
            redactedSensitiveFields: redactedFieldCount,
          },
          suggestedNextTools: "searchRapidFireDocuments for text search; getRapidFireDocument for single document; upsertRapidFireDocument to add or update",
        }
      },
    }),

    searchRapidFireDocuments: tool({
      description:
        "Full-text search across documents in a collection. Searches document keys, payload, and metadata. Returns ranked results with match scores.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).nullable(),
        minScore: z.number().min(0).max(100).nullable(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        const collectionCheck = await ensureCollectionAccess(client, input.workspaceId, input.collectionId)
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const limit = input.limit || 25
        const minScore = input.minScore || 0

        // Fetch all documents for the collection (with reasonable limit)
        const { data, error } = await client
          .from(TABLES.documents)
          .select("id,document_key,payload,metadata,created_at,updated_at")
          .eq("workspace_id", input.workspaceId)
          .eq("collection_id", input.collectionId)
          .limit(500)

        if (error) {
          return { ok: false, error: "Failed to search documents." }
        }

        const searchTerms = input.query
          .toLowerCase()
          .split(/\s+/)
          .filter((term) => term.length >= 2)

        if (searchTerms.length === 0) {
          return { ok: false, error: "Search query must contain at least one valid term." }
        }

        const sourceAllowlist = getTrustedSourceAllowlist()
        const filterUntrusted = shouldFilterUntrustedQueryDocuments()
        const redactSensitive = shouldRedactSensitiveQueryPayloads()

        const rawDocuments = Array.isArray(data) ? data : []
        let filteredPoisoned = 0
        let filteredUntrusted = 0

        const scoredDocuments = rawDocuments
          .map((row) => {
            const record = asObject(row)
            const metadata = asObject(record.metadata)
            const security = asObject(metadata._security)
            const source = extractSourceLabel(metadata)
            const sourceTrusted =
              typeof security.sourceTrusted === "boolean"
                ? security.sourceTrusted
                : isTrustedSource(source, sourceAllowlist)
            const poisoningDetected =
              security.promptPoisoningDetected === true ||
              (Array.isArray(security.promptPoisoningMatches) &&
                security.promptPoisoningMatches.length > 0)

            if (filterUntrusted) {
              if (poisoningDetected) {
                filteredPoisoned += 1
                return null
              }
              if (!sourceTrusted) {
                filteredUntrusted += 1
                return null
              }
            }

            // Get searchable text from metadata or build it
            const searchableText =
              (typeof metadata._searchableText === "string" && metadata._searchableText) ||
              buildSearchableText(asObject(record.payload), metadata)

            const documentKeyText = String(record.document_key || "")
            const combinedText = `${documentKeyText} ${searchableText}`

            const { score, matchedTerms } = scoreSearchMatch(combinedText, searchTerms)

            if (score < minScore) {
              return null
            }

            const result: JsonObject = {
              ...record,
              _searchScore: score,
              _matchedTerms: matchedTerms,
            }

            if (redactSensitive) {
              const redaction = redactSensitiveValue(record.payload)
              result.payload = redaction.value
            }

            return result
          })
          .filter((item): item is JsonObject => Boolean(item))
          .sort((a, b) => (b._searchScore as number) - (a._searchScore as number))
          .slice(0, limit)

        return {
          ok: true,
          documents: scoredDocuments,
          query: input.query,
          searchTerms,
          resultCount: scoredDocuments.length,
          security: {
            filteredPoisonedDocuments: filteredPoisoned,
            filteredUntrustedDocuments: filteredUntrusted,
          },
          suggestedNextTools: "getRapidFireDocument(workspaceId, collectionId, documentKey) for full document; queryRapidFireDocuments for pagination",
        }
      },
    }),

    getRapidFireDocument: tool({
      description:
        "Get a single document by its key with full payload and metadata.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        documentKey: z.string().min(3).max(128).regex(IDENTIFIER_REGEX),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const collectionCheck = await ensureCollectionAccess(
          client,
          input.workspaceId,
          input.collectionId
        )
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const { data, error } = await client
          .from(TABLES.documents)
          .select("id,document_key,payload,metadata,created_at,updated_at")
          .eq("workspace_id", input.workspaceId)
          .eq("collection_id", input.collectionId)
          .eq("document_key", input.documentKey)
          .single()

        if (error || !data) {
          return { ok: false, error: "Document not found." }
        }

        const record = asObject(data)
        const metadata = asObject(record.metadata)
        const security = asObject(metadata._security)

        const redactSensitive = shouldRedactSensitiveQueryPayloads()
        let finalPayload = record.payload
        let redactedFieldCount = 0

        if (redactSensitive) {
          const redaction = redactSensitiveValue(record.payload)
          finalPayload = redaction.value
          redactedFieldCount = redaction.redactedCount
        }

        return {
          ok: true,
          document: {
            ...record,
            payload: finalPayload,
          },
          security: {
            source: security.source || null,
            sourceTrusted: security.sourceTrusted,
            promptPoisoningDetected: security.promptPoisoningDetected,
            redactedSensitiveFields: redactedFieldCount,
          },
          suggestedNextTools: "upsertRapidFireDocument to update; deleteRapidFireDocument to remove",
        }
      },
    }),

    deleteRapidFireDocument: tool({
      description:
        "Delete a document from a collection. This action is irreversible.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        documentKey: z.string().min(3).max(128).regex(IDENTIFIER_REGEX),
        confirmDelete: z.boolean(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        if (!input.confirmDelete) {
          return { ok: false, error: "Deletion not confirmed. Set confirmDelete to true." }
        }

        const collectionCheck = await ensureCollectionAccess(
          client,
          input.workspaceId,
          input.collectionId
        )
        if (!collectionCheck.ok) {
          return { ok: false, error: collectionCheck.error }
        }

        const { data: existing, error: existError } = await client
          .from(TABLES.documents)
          .select("id,document_key")
          .eq("workspace_id", input.workspaceId)
          .eq("collection_id", input.collectionId)
          .eq("document_key", input.documentKey)
          .single()

        if (existError || !existing) {
          return { ok: false, error: "Document not found." }
        }

        const { error: deleteError } = await client
          .from(TABLES.documents)
          .delete()
          .eq("id", (existing as JsonObject).id)

        if (deleteError) {
          return { ok: false, error: "Failed to delete document." }
        }

        return {
          ok: true,
          deleted: {
            documentKey: input.documentKey,
            collectionId: input.collectionId,
          },
          suggestedNextTools:
            "verifyRapidFireDocumentDeleted(workspaceId, collectionId, documentKey) to confirm deletion; queryRapidFireDocuments to verify deletion",
        }
      },
    }),

    verifyRapidFireDocumentDeleted: tool({
      description:
        "Verify a document deletion by checking whether the document key still exists in the collection.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
        collectionId: z.string().uuid(),
        documentKey: z.string().min(3).max(128).regex(IDENTIFIER_REGEX),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const { data, error } = await client
          .from(TABLES.documents)
          .select("id,document_key,updated_at")
          .eq("workspace_id", input.workspaceId)
          .eq("collection_id", input.collectionId)
          .eq("document_key", input.documentKey)
          .maybeSingle()

        if (error) {
          return { ok: false, error: "Unable to verify document deletion." }
        }

        const exists = Boolean(data)
        return {
          ok: true,
          verification: {
            targetTool: "deleteRapidFireDocument",
            subject: `workspace:${input.workspaceId}|collection:${input.collectionId}|document:${input.documentKey}`,
            verified: !exists,
            evidence: {
              documentExists: exists,
              workspaceId: input.workspaceId,
              collectionId: input.collectionId,
              documentKey: input.documentKey,
            },
          },
          suggestedNextTools: !exists
            ? "queryRapidFireDocuments(workspaceId, collectionId) to confirm remaining documents"
            : "deleteRapidFireDocument(workspaceId, collectionId, documentKey, confirmDelete: true) to retry deletion",
        }
      },
    }),

    getWorkspaceStats: tool({
      description:
        "Get comprehensive statistics for a workspace including collection counts, document counts, and storage usage estimates.",
      inputSchema: z.object({
        workspaceId: z.string().uuid(),
      }),
      execute: async (input) => {
        if (!client) {
          return { ok: false, error: "Supabase environment is not configured." }
        }

        const workspaceCheck = await ensureWorkspaceAccess(client, input.workspaceId)
        if (!workspaceCheck.ok) {
          return { ok: false, error: workspaceCheck.error }
        }

        // Get collections with document counts
        const { data: collections, error: colError } = await client
          .from(TABLES.collections)
          .select("id,name,created_at,updated_at")
          .eq("workspace_id", input.workspaceId)

        if (colError) {
          return { ok: false, error: "Failed to fetch workspace statistics." }
        }

        const collectionStats: JsonObject[] = []
        let totalDocuments = 0

        for (const col of collections || []) {
          const { count } = await client
            .from(TABLES.documents)
            .select("id", { head: true, count: "exact" })
            .eq("collection_id", (col as JsonObject).id)

          const docCount = count || 0
          totalDocuments += docCount

          collectionStats.push({
            id: (col as JsonObject).id,
            name: (col as JsonObject).name,
            documentCount: docCount,
            createdAt: (col as JsonObject).created_at,
            updatedAt: (col as JsonObject).updated_at,
          })
        }

        // Get most recent document update
        const { data: recentDoc } = await client
          .from(TABLES.documents)
          .select("updated_at")
          .eq("workspace_id", input.workspaceId)
          .order("updated_at", { ascending: false })
          .limit(1)

        return {
          ok: true,
          workspace: workspaceCheck.workspace,
          stats: {
            collectionsCount: (collections || []).length,
            totalDocuments,
            lastDocumentUpdate: recentDoc?.[0]?.updated_at || null,
          },
          collections: collectionStats,
          quotas: {
            maxWorkspacesPerUser: MAX_WORKSPACES_PER_USER,
            maxFieldsPerCollection: MAX_FIELDS_PER_COLLECTION,
            maxPayloadSizeBytes: MAX_PAYLOAD_SIZE_BYTES,
            maxQueryLimit: MAX_QUERY_LIMIT,
            maxBatchSize: MAX_BATCH_SIZE,
          },
          suggestedNextTools: "listRapidFireCollections for detailed collection info; createRapidFireCollection to add more",
        }
      },
    }),
  } as const
}
