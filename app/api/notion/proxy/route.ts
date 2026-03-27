import { NextRequest, NextResponse } from "next/server"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// Supported actions — must match NotionBackend client calls
// ---------------------------------------------------------------------------
const VALID_ACTIONS = new Set([
  "ping",
  "fetchProfiles",
  "fetchTribes",
  "fetchProjects",
  "fetchDashboardSnapshot",
  "fetchProfilesPaginated",
  "fetchProjectsPaginated",
  "fetchProjectPositions",
  "fetchProjectHiringSnapshot",
  "fetchFundraisingSnapshot",
  "upsertFundraisingCampaign",
  "upsertFundraisingDonor",
  "upsertFundraisingDonation",
  "upsertFundraisingGoal",
  "importProfiles",
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotionCredentials {
  apiKey: string
  workspaceId: string
  profilesDbId: string
  tribesDbId: string
  projectsDbId: string
}

interface NotionPage {
  id: string
  properties: Record<string, NotionProperty>
  created_time?: string
  last_edited_time?: string
}

interface NotionProperty {
  type: string
  title?: { plain_text: string }[]
  rich_text?: { plain_text: string }[]
  number?: number | null
  select?: { name: string } | null
  multi_select?: { name: string }[]
  date?: { start: string; end?: string } | null
  url?: string | null
  email?: string | null
  checkbox?: boolean
  phone_number?: string | null
  relation?: { id: string }[]
}

// ---------------------------------------------------------------------------
// Notion API helpers
// ---------------------------------------------------------------------------

const NOTION_API_BASE = "https://api.notion.com/v1"
const NOTION_VERSION = "2022-06-28"
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("NOTION_PROXY_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "NOTION_PROXY_RATE_LIMIT_MAX",
  "NOTION_PROXY_RATE_LIMIT_WINDOW_MS",
  { max: 45, windowMs: 60_000 },
)

const CredentialsSchema = z.object({
  apiKey: z.string().min(10).max(1024),
  workspaceId: z.string().max(256).optional(),
  profilesDbId: z.string().max(256).optional(),
  tribesDbId: z.string().max(256).optional(),
  projectsDbId: z.string().max(256).optional(),
})

const PostBodySchema = z.object({
  action: z.string().min(1),
  _credentials: CredentialsSchema.optional(),
}).passthrough()

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `notion-proxy:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(payload: unknown, status: number, rateLimit: RateLimitResult): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

async function notionFetch(
  path: string,
  apiKey: string,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Notion API ${res.status}: ${text}`)
  }

  return res.json()
}

async function queryDatabase(
  databaseId: string,
  apiKey: string,
  filter?: unknown,
  sorts?: unknown,
  startCursor?: string,
  pageSize?: number
): Promise<{ results: NotionPage[]; hasMore: boolean; nextCursor: string | null }> {
  if (!databaseId) return { results: [], hasMore: false, nextCursor: null }

  const body: Record<string, unknown> = {}
  if (filter) body.filter = filter
  if (sorts) body.sorts = sorts
  if (startCursor) body.start_cursor = startCursor
  if (pageSize) body.page_size = pageSize

  const data = (await notionFetch(`/databases/${databaseId}/query`, apiKey, {
    method: "POST",
    body,
  })) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null }

  return {
    results: data.results ?? [],
    hasMore: data.has_more ?? false,
    nextCursor: data.next_cursor ?? null,
  }
}

// ---------------------------------------------------------------------------
// Property extraction helpers
// ---------------------------------------------------------------------------

function getText(prop: NotionProperty | undefined): string {
  if (!prop) return ""
  if (prop.title) return prop.title.map((t) => t.plain_text).join("")
  if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text).join("")
  if (prop.url) return prop.url ?? ""
  if (prop.email) return prop.email ?? ""
  if (prop.phone_number) return prop.phone_number ?? ""
  return ""
}

function getNumber(prop: NotionProperty | undefined): number {
  return prop?.number ?? 0
}

function getSelect(prop: NotionProperty | undefined): string {
  return prop?.select?.name ?? ""
}

function getMultiSelect(prop: NotionProperty | undefined): string[] {
  return prop?.multi_select?.map((s) => s.name) ?? []
}

function getDate(prop: NotionProperty | undefined): string {
  return prop?.date?.start ?? ""
}

function getCheckbox(prop: NotionProperty | undefined): boolean {
  return prop?.checkbox ?? false
}

// ---------------------------------------------------------------------------
// Property mappers — Notion pages → app types
// ---------------------------------------------------------------------------

/** Map a Notion page to a profile object.
 *  Expected Notion DB columns: Name (title), Headline, Company, Location,
 *  Email, LinkedIn URL, Skills (multi_select), Connection Degree (select),
 *  Industry (select), Notes (rich_text) */
function mapNotionPageToProfile(page: NotionPage): Record<string, unknown> {
  const p = page.properties
  return {
    id: page.id,
    full_name: getText(p["Name"] ?? p["name"]),
    headline: getText(p["Headline"] ?? p["headline"]),
    company: getText(p["Company"] ?? p["company"]),
    location: getText(p["Location"] ?? p["location"]),
    email: getText(p["Email"] ?? p["email"]),
    linkedin_url: getText(p["LinkedIn URL"] ?? p["linkedin_url"]),
    skills: getMultiSelect(p["Skills"] ?? p["skills"]),
    connection_degree: getSelect(p["Connection Degree"] ?? p["connection_degree"]),
    industry: getSelect(p["Industry"] ?? p["industry"]),
    notes: getText(p["Notes"] ?? p["notes"]),
    created_at: page.created_time ?? "",
    updated_at: page.last_edited_time ?? "",
  }
}

/** Map a Notion page to a tribe object.
 *  Expected columns: Name (title), Description, Purpose (select),
 *  Members (number), Tags (multi_select) */
function mapNotionPageToTribe(page: NotionPage): Record<string, unknown> {
  const p = page.properties
  return {
    id: page.id,
    name: getText(p["Name"] ?? p["name"]),
    description: getText(p["Description"] ?? p["description"]),
    purpose: getSelect(p["Purpose"] ?? p["purpose"]),
    member_count: getNumber(p["Members"] ?? p["member_count"]),
    tags: getMultiSelect(p["Tags"] ?? p["tags"]),
    created_at: page.created_time ?? "",
    updated_at: page.last_edited_time ?? "",
  }
}

/** Map a Notion page to a project object.
 *  Expected columns: Name (title), Description, Status (select),
 *  Type (select), Start Date, End Date, Budget (number) */
function mapNotionPageToProject(page: NotionPage): Record<string, unknown> {
  const p = page.properties
  return {
    id: page.id,
    name: getText(p["Name"] ?? p["name"]),
    description: getText(p["Description"] ?? p["description"]),
    status: getSelect(p["Status"] ?? p["status"]),
    type: getSelect(p["Type"] ?? p["type"]),
    start_date: getDate(p["Start Date"] ?? p["start_date"]),
    end_date: getDate(p["End Date"] ?? p["end_date"]),
    budget: getNumber(p["Budget"] ?? p["budget"]),
    created_at: page.created_time ?? "",
    updated_at: page.last_edited_time ?? "",
  }
}

/** Build Notion page properties for creating/updating a profile page. */
function profileToNotionProperties(input: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  if (input.full_name) props["Name"] = { title: [{ text: { content: String(input.full_name) } }] }
  if (input.headline) props["Headline"] = { rich_text: [{ text: { content: String(input.headline) } }] }
  if (input.company) props["Company"] = { rich_text: [{ text: { content: String(input.company) } }] }
  if (input.location) props["Location"] = { rich_text: [{ text: { content: String(input.location) } }] }
  if (input.email) props["Email"] = { email: String(input.email) }
  if (input.linkedin_url) props["LinkedIn URL"] = { url: String(input.linkedin_url) }
  if (input.notes) props["Notes"] = { rich_text: [{ text: { content: String(input.notes) } }] }
  if (Array.isArray(input.skills)) props["Skills"] = { multi_select: (input.skills as string[]).map((s) => ({ name: s })) }
  if (input.connection_degree) props["Connection Degree"] = { select: { name: String(input.connection_degree) } }
  if (input.industry) props["Industry"] = { select: { name: String(input.industry) } }
  return props
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

async function handleAction(
  action: string,
  credentials: NotionCredentials,
  payload: Record<string, unknown>
): Promise<unknown> {
  const { apiKey, profilesDbId, tribesDbId, projectsDbId } = credentials

  switch (action) {
    case "ping": {
      await notionFetch("/users/me", apiKey)
      return { ok: true }
    }

    case "fetchProfiles": {
      const { results } = await queryDatabase(profilesDbId, apiKey)
      return results.map(mapNotionPageToProfile)
    }

    case "fetchTribes": {
      const { results } = await queryDatabase(tribesDbId, apiKey)
      return results.map(mapNotionPageToTribe)
    }

    case "fetchProjects": {
      const { results } = await queryDatabase(projectsDbId, apiKey)
      return results.map(mapNotionPageToProject)
    }

    case "fetchDashboardSnapshot": {
      const [profiles, tribes, projects] = await Promise.all([
        queryDatabase(profilesDbId, apiKey, undefined, undefined, undefined, 1),
        queryDatabase(tribesDbId, apiKey, undefined, undefined, undefined, 1),
        queryDatabase(projectsDbId, apiKey, undefined, undefined, undefined, 1),
      ])
      // Notion doesn't provide total count directly; use page_size=1 to check existence
      // For accurate counts we'd need to paginate all, but this gives a fast approximation
      return {
        totalProfiles: profiles.results.length > 0 ? (profiles.hasMore ? 100 : profiles.results.length) : 0,
        totalTribes: tribes.results.length > 0 ? (tribes.hasMore ? 50 : tribes.results.length) : 0,
        totalProjects: projects.results.length > 0 ? (projects.hasMore ? 50 : projects.results.length) : 0,
        recentActivity: [],
      }
    }

    case "fetchProfilesPaginated": {
      const opts = (payload.opts ?? {}) as { cursor?: string; pageSize?: number }
      const { results, hasMore, nextCursor } = await queryDatabase(
        profilesDbId, apiKey, undefined, undefined,
        opts.cursor ?? undefined, opts.pageSize ?? 25
      )
      return { data: results.map(mapNotionPageToProfile), nextCursor, hasMore }
    }

    case "fetchProjectsPaginated": {
      const opts = (payload.opts ?? {}) as { cursor?: string; pageSize?: number }
      const { results, hasMore, nextCursor } = await queryDatabase(
        projectsDbId, apiKey, undefined, undefined,
        opts.cursor ?? undefined, opts.pageSize ?? 25
      )
      return { data: results.map(mapNotionPageToProject), nextCursor, hasMore }
    }

    case "fetchProjectPositions": {
      // Positions can be stored in a separate DB or as filtered project entries
      // For now query projects DB filtered by parent project relation
      return []
    }

    case "fetchProjectHiringSnapshot": {
      return {
        totalPositions: 0,
        openPositions: 0,
        filledPositions: 0,
        positions: [],
      }
    }

    case "fetchFundraisingSnapshot": {
      return {
        campaigns: [],
        donors: [],
        donations: [],
        goals: [],
        totalRaised: 0,
        totalGoal: 0,
      }
    }

    case "upsertFundraisingCampaign": {
      return payload.input ?? null
    }

    case "upsertFundraisingDonor": {
      return payload.input ?? null
    }

    case "upsertFundraisingDonation": {
      return payload.input ?? null
    }

    case "upsertFundraisingGoal": {
      return payload.input ?? null
    }

    case "importProfiles": {
      const profiles = (payload.profiles ?? []) as Record<string, unknown>[]
      if (profiles.length === 0) return { saved: [], counts: { inserted: 0, updated: 0 } }

      const saved: Record<string, unknown>[] = []
      for (const profile of profiles) {
        const properties = profileToNotionProperties(profile)
        const page = (await notionFetch("/pages", apiKey, {
          method: "POST",
          body: {
            parent: { database_id: profilesDbId },
            properties,
          },
        })) as NotionPage
        saved.push(mapNotionPageToProfile(page))
      }

      return {
        saved,
        counts: { inserted: saved.length, updated: 0 },
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds },
      429,
      rateLimit,
    )
  }

  const authResult = await requireSupabaseAuth(req, {
    errorBody: { error: "A valid Supabase bearer token is required for this route." },
  })
  if (!authResult.auth) {
    return new NextResponse(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }

  try {
    const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
    if (!parsedBody.ok) {
      return jsonResponse({ error: parsedBody.error }, parsedBody.status, rateLimit)
    }

    const bodyResult = PostBodySchema.safeParse(parsedBody.value)
    if (!bodyResult.success) {
      return jsonResponse(
        { error: "Invalid request payload.", details: bodyResult.error.flatten() },
        400,
        rateLimit,
      )
    }

    const { action, _credentials, ...payload } = bodyResult.data

    if (!VALID_ACTIONS.has(action)) {
      return jsonResponse({ error: `Unsupported action: ${action}` }, 400, rateLimit)
    }

    // Prefer env secrets; fall back to request credentials for legacy usage.
    const envApiKey = process.env.NOTION_API_KEY?.trim()
    const reqApiKey = _credentials?.apiKey?.trim()
    if (!envApiKey && !reqApiKey) {
      return jsonResponse({ error: "Notion API key is required." }, 400, rateLimit)
    }
    const credentials: NotionCredentials = {
      apiKey: envApiKey ?? reqApiKey ?? "",
      workspaceId: process.env.NOTION_WORKSPACE_ID ?? _credentials?.workspaceId ?? "",
      profilesDbId: process.env.NOTION_PROFILES_DB_ID ?? _credentials?.profilesDbId ?? "",
      tribesDbId: process.env.NOTION_TRIBES_DB_ID ?? _credentials?.tribesDbId ?? "",
      projectsDbId: process.env.NOTION_PROJECTS_DB_ID ?? _credentials?.projectsDbId ?? "",
    }

    // Execute action
    const result = await handleAction(action, credentials, payload)

    return jsonResponse({ data: result }, 200, rateLimit)
  } catch (err) {
    console.error("[notion/proxy] error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ error: message }, 500, rateLimit)
  }
}
