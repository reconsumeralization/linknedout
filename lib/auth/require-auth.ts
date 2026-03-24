import { getDefaultAuthRedirect, normalizeRedirectPath } from "@/lib/auth/auth-redirect"
import {
  buildBearerChallenge,
  createUnauthorizedResponse,
  isRequestSecure,
  shouldRequireHttpsForMcp
} from "@/lib/auth/mcp-auth"
import {
  authenticateMcpRequest,
  authorizeToolAccess
} from "@/lib/auth/mcp-request-auth"
import {
  resolveSupabaseAuthContextFromRequest,
  type SupabaseAuthContext,
} from "@/lib/supabase/supabase-auth"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result of an authentication check - either authenticated or error response */
export type RequireAuthResult =
  | { auth: SupabaseAuthContext; response: null }
  | { auth: null; response: Response }

/** Options for customizing unauthorized responses */
export type RequireAuthOptions = {
  /** Custom JSON error body when unauthorized. */
  errorBody?: Record<string, unknown>
  /** HTTP status when unauthorized. Default 401. */
  status?: number
  /** Optional headers to merge into the error response. */
  headers?: HeadersInit
  /** Whether to include WWW-Authenticate header with bearer challenge. Default false. */
  includeBearerChallenge?: boolean
  /** Custom error message for logging purposes. */
  logMessage?: string
}

/** Options for MCP authentication with optional tool access validation */
export type RequireMcpAuthOptions = {
  /** Tool name to check access for. If provided, validates tool-specific scopes. */
  toolName?: string
  /** Required scopes beyond tool-specific scopes. */
  requiredScopes?: string[]
  /** Whether to allow expired tokens with grace period. Default false. */
  allowGracePeriod?: boolean
}

/** Combined auth options supporting both Supabase and MCP auth */
export type RequireAnyAuthOptions = RequireAuthOptions & RequireMcpAuthOptions & {
  /** Prefer MCP auth over Supabase auth when both are present. Default false. */
  preferMcp?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ERROR_BODY = {
  error: "Unauthorized. Provide a valid Supabase bearer token.",
}

const MCP_ERROR_BODY = {
  error: "unauthorized",
  error_description: "Valid bearer token required for MCP access.",
}

/** Cache TTL for auth context (in milliseconds) */
const AUTH_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve Supabase auth from the request. If missing or invalid, returns a
 * Response suitable to return from an API route. Use this in any route that
 * must be protected so auth logic stays consistent and is easy to audit.
 *
 * @param req - The incoming request
 * @param options - Configuration options for error responses
 * @returns Promise resolving to auth context or error response
 *
 * @example
 *   const result = await requireSupabaseAuth(req)
 *   if (!result.auth) return result.response
 *   const { auth } = result
 *
 * @example
 *   // With custom error body
 *   const result = await requireSupabaseAuth(req, {
 *     errorBody: { code: "AUTH_REQUIRED", message: "Please sign in" },
 *     includeBearerChallenge: true,
 *   })
 */
export async function requireSupabaseAuth(
  req: Request,
  options: RequireAuthOptions = {},
): Promise<RequireAuthResult> {
  const auth = await resolveSupabaseAuthContextFromRequest(req)
  if (auth) {
    return { auth, response: null }
  }

  const {
    errorBody = DEFAULT_ERROR_BODY,
    status = 401,
    headers: extraHeaders = {},
    includeBearerChallenge = false,
  } = options

  const responseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }

  if (includeBearerChallenge) {
    responseHeaders["WWW-Authenticate"] = buildBearerChallenge(req)
  }

  const response = new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      ...responseHeaders,
      ...extraHeaders,
    },
  })
  return { auth: null, response }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve MCP auth from the request with full validation.
 * Checks transport security, token validity, issuer, audience, and scopes.
 * Optionally validates access to a specific tool.
 *
 * @param req - The incoming request
 * @param options - Configuration options including tool name and required scopes
 * @returns Promise resolving to auth context or error response
 *
 * @example
 *   const result = await requireMcpAuth(req)
 *   if (!result.auth) return result.response
 *   const { auth } = result
 *
 * @example
 *   // With tool-specific access check
 *   const result = await requireMcpAuth(req, { toolName: "createDraft" })
 *   if (!result.auth) return result.response
 *
 * @example
 *   // With additional required scopes
 *   const result = await requireMcpAuth(req, {
 *     toolName: "publishDraft",
 *     requiredScopes: ["write:drafts"],
 *   })
 */
export async function requireMcpAuth(
  req: Request,
  options: RequireMcpAuthOptions = {},
): Promise<RequireAuthResult> {
  // Use the comprehensive MCP authentication
  const { auth, error } = await authenticateMcpRequest(req)

  if (error) {
    return { auth: null, response: error }
  }

  if (!auth) {
    return {
      auth: null,
      response: createUnauthorizedResponse(req, {
        errorDescription: "Authentication required",
      }),
    }
  }

  // If a specific tool is requested, validate access
  if (options.toolName) {
    const toolError = authorizeToolAccess(req, auth, options.toolName)
    if (toolError) {
      return { auth: null, response: toolError }
    }
  }

  return { auth, response: null }
}

/**
 * Require either Supabase or MCP auth from the request.
 * Useful for endpoints that need to support both authentication methods.
 *
 * @param req - The incoming request
 * @param options - Configuration options for both auth types
 * @returns Promise resolving to auth context or error response
 *
 * @example
 *   const result = await requireAnyAuth(req)
 *   if (!result.auth) return result.response
 */
export async function requireAnyAuth(
  req: Request,
  options: RequireAnyAuthOptions = {},
): Promise<RequireAuthResult> {
  const { preferMcp = false, ...restOptions } = options

  if (preferMcp) {
    // Try MCP first
    const mcpResult = await requireMcpAuth(req, restOptions)
    if (mcpResult.auth) return mcpResult

    // Fall back to Supabase
    return requireSupabaseAuth(req, restOptions)
  }

  // Try Supabase first (default)
  const supabaseResult = await requireSupabaseAuth(req, restOptions)
  if (supabaseResult.auth) return supabaseResult

  // Fall back to MCP
  return requireMcpAuth(req, restOptions)
}

// ─────────────────────────────────────────────────────────────────────────────
// Redirect Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a safe redirect URL from query parameters.
 * Uses the allowlist from auth-redirect to prevent open redirects.
 *
 * @param req - The incoming request
 * @param paramName - Query parameter name to check (default: "redirect")
 * @returns A validated redirect path
 *
 * @example
 *   const redirectPath = getSafeRedirectFromRequest(req)
 *   // Returns normalized path or default if invalid
 */
export function getSafeRedirectFromRequest(
  req: Request,
  paramName: string = "redirect",
): string {
  const url = new URL(req.url)
  const redirectParam = url.searchParams.get(paramName)
  return normalizeRedirectPath(redirectParam)
}

/**
 * Create a redirect response to the auth page with return URL.
 * Useful for protecting pages that require authentication.
 *
 * @param req - The incoming request
 * @param returnTo - Optional path to return to after auth (defaults to current path)
 * @returns A redirect Response to the auth page
 *
 * @example
 *   // In a protected page route
 *   if (!isAuthenticated) {
 *     return createAuthRedirectResponse(req)
 *   }
 *
 * @example
 *   // With explicit return path
 *   return createAuthRedirectResponse(req, "/dashboard")
 */
export function createAuthRedirectResponse(
  req: Request,
  returnTo?: string,
): Response {
  const url = new URL(req.url)
  const currentPath = returnTo || url.pathname + url.search
  const authPath = getDefaultAuthRedirect()
  
  // Only include redirect param if it's different from the default
  const redirectUrl = currentPath !== authPath
    ? `${authPath}?redirect=${encodeURIComponent(currentPath)}`
    : authPath

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the request meets transport security requirements.
 * Returns an error response if HTTPS is required but not present.
 *
 * @param req - The incoming request
 * @returns Error response if insecure, null if secure
 *
 * @example
 *   const insecureResponse = requireSecureTransport(req)
 *   if (insecureResponse) return insecureResponse
 */
export function requireSecureTransport(req: Request): Response | null {
  if (shouldRequireHttpsForMcp() && !isRequestSecure(req)) {
    return createUnauthorizedResponse(req, {
      error: "invalid_token",
      errorDescription: "HTTPS required",
    })
  }
  return null
}

/**
 * Extract bearer token from Authorization header.
 * Returns null if header is missing or malformed.
 *
 * @param req - The incoming request
 * @returns Bearer token string or null
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }
  const token = authHeader.slice(7).trim()
  return token.length > 0 ? token : null
}

/**
 * Check if request has any form of authentication.
 * Does not validate the auth, just checks for presence.
 *
 * @param req - The incoming request
 * @returns True if auth credentials are present
 */
export function hasAuthCredentials(req: Request): boolean {
  const hasBearer = extractBearerToken(req) !== null
  const hasCookie = req.headers.get("Cookie")?.includes("sb-") ?? false
  return hasBearer || hasCookie
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export {
  resolveSupabaseAuthContextFromRequest,
  type SupabaseAuthContext
} from "@/lib/supabase/supabase-auth"

export {
  authenticateMcpRequest,
  authorizeToolAccess,
  filterAccessibleTools, resolveMcpAuthContextFromRequest
} from "@/lib/auth/mcp-request-auth"

export {
  buildBearerChallenge, canAccessTool, createForbiddenResponse, createUnauthorizedResponse, getMissingScopesForTool,
  validateMcpAuth
} from "@/lib/auth/mcp-auth"

export {
  getDefaultAuthRedirect, normalizeRedirectPath
} from "@/lib/auth/auth-redirect"
