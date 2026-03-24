import "server-only"

import {
  canAccessTool,
  createForbiddenResponse,
  createUnauthorizedResponse,
  getAccessibleTools,
  getMcpAuthMode,
  getMcpIntrospectionConfig,
  getMissingScopesForTool,
  isRequestSecure,
  shouldRequireHttpsForMcp,
  validateMcpAuth,
} from "@/lib/auth/mcp-auth"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"

type IntrospectionPayload = Record<string, unknown>

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const value = headerValue.trim()
  if (!value.toLowerCase().startsWith("bearer ")) {
    return null
  }

  const token = value.slice(7).trim()
  return token.length > 0 ? token : null
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseScope(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(" ")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  return []
}

function parseAudience(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : []
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  return []
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function normalizeIntrospectionResponseToContext(
  token: string,
  payload: IntrospectionPayload,
): SupabaseAuthContext | null {
  const active = payload.active
  if (active !== true) {
    return null
  }

  const exp = parseTimestamp(payload.exp)
  if (exp !== null && exp <= Math.floor(Date.now() / 1000)) {
    return null
  }

  const subject = asString(payload.sub) || asString(payload.user_id) || asString(payload.client_id)
  if (!subject) {
    return null
  }

  return {
    accessToken: token,
    userId: subject,
    email: asString(payload.email) || asString(payload.username),
    issuer: asString(payload.iss),
    audiences: parseAudience(payload.aud),
    scopes: parseScope(payload.scope),
    tokenClaims: payload,
    isSupabaseSession: false,
  }
}

async function resolveFromIntrospection(
  token: string,
): Promise<SupabaseAuthContext | null> {
  const config = getMcpIntrospectionConfig()
  if (!config.url) {
    return null
  }

  let introspectionUrl: URL
  try {
    introspectionUrl = new URL(config.url)
  } catch {
    return null
  }

  if (shouldRequireHttpsForMcp() && introspectionUrl.protocol !== "https:") {
    return null
  }

  const form = new URLSearchParams()
  form.set("token", token)

  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
  })

  if (config.authMethod === "basic") {
    if (!config.clientId || !config.clientSecret) {
      return null
    }
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")
    headers.set("Authorization", `Basic ${credentials}`)
  } else {
    if (config.clientId) {
      form.set("client_id", config.clientId)
    }
    if (config.clientSecret) {
      form.set("client_secret", config.clientSecret)
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(introspectionUrl.toString(), {
      method: "POST",
      headers,
      body: form.toString(),
      cache: "no-store",
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json().catch(() => null)) as IntrospectionPayload | null
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null
    }

    return normalizeIntrospectionResponseToContext(token, payload)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Resolve MCP authentication context from an incoming request.
 * Supports multiple auth modes: supabase, introspection, or auto (try both).
 */
export async function resolveMcpAuthContextFromRequest(
  req: Request,
): Promise<SupabaseAuthContext | null> {
  const mode = getMcpAuthMode()
  const token = extractBearerToken(req.headers.get("authorization"))
  if (!token) {
    return null
  }

  if (mode === "supabase") {
    return resolveSupabaseAuthContextFromRequest(req)
  }

  if (mode === "introspection") {
    return resolveFromIntrospection(token)
  }

  // auto mode
  const supabaseAuth = await resolveSupabaseAuthContextFromRequest(req)
  if (supabaseAuth) {
    return supabaseAuth
  }

  return resolveFromIntrospection(token)
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Validation & Authorization Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface McpAuthResult {
  auth: SupabaseAuthContext | null
  error: Response | null
}

/**
 * Authenticate and validate an MCP request.
 * Returns the auth context if successful, or an error response if not.
 * Checks transport security, token validity, and MCP-specific validation.
 */
export async function authenticateMcpRequest(req: Request): Promise<McpAuthResult> {
  // Check transport security
  if (shouldRequireHttpsForMcp() && !isRequestSecure(req)) {
    return {
      auth: null,
      error: createUnauthorizedResponse(req, {
        error: "invalid_token",
        errorDescription: "HTTPS required for MCP requests",
      }),
    }
  }

  // Resolve authentication
  const auth = await resolveMcpAuthContextFromRequest(req)
  if (!auth) {
    return {
      auth: null,
      error: createUnauthorizedResponse(req, {
        errorDescription: "Valid bearer token required",
      }),
    }
  }

  // Validate MCP-specific requirements (issuer, audience, scopes)
  const validation = validateMcpAuth(auth, req)
  if (!validation.valid) {
    if (validation.code === "insufficient_scope") {
      const missingScopes = validation.reason.match(/Missing required scopes: (.+)/)?.[1]?.split(", ") || []
      return {
        auth: null,
        error: createForbiddenResponse(req, missingScopes),
      }
    }

    return {
      auth: null,
      error: createUnauthorizedResponse(req, {
        error: "invalid_token",
        errorDescription: validation.reason,
      }),
    }
  }

  return { auth, error: null }
}

/**
 * Check if the authenticated context can access a specific tool.
 * Returns an error response if access is denied.
 */
export function authorizeToolAccess(
  req: Request,
  auth: SupabaseAuthContext | null,
  toolName: string,
): Response | null {
  if (!auth) {
    return createUnauthorizedResponse(req)
  }

  if (!canAccessTool(auth, toolName)) {
    const missingScopes = getMissingScopesForTool(auth, toolName)
    return createForbiddenResponse(req, missingScopes)
  }

  return null
}

/**
 * Filter a list of tool names to only those accessible by the auth context.
 */
export function filterAccessibleTools(
  auth: SupabaseAuthContext | null,
  toolNames: string[],
): string[] {
  return getAccessibleTools(auth, toolNames)
}

// Re-export commonly used functions from mcp-auth for convenience
export {
  canAccessTool, createForbiddenResponse, createUnauthorizedResponse, getMissingScopesForTool, isRequestSecure,
  shouldRequireHttpsForMcp, validateMcpAuth
}
