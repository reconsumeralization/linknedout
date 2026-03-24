import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated string into an array of trimmed, non-empty values.
 */
function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Normalize a URL or string for comparison by removing trailing slashes.
 */
function normalizeForCompare(value: string): string {
  return value.replace(/\/+$/g, "")
}

/**
 * Parse a JSON string mapping tool names to required scopes.
 * Supports both space-separated string values and string arrays.
 *
 * @example
 * // Input: '{"toolA": "scope1 scope2", "toolB": ["scope3", "scope4"]}'
 * // Output: { toolA: ["scope1", "scope2"], toolB: ["scope3", "scope4"] }
 */
function parseToolScopeMapJson(value: string | undefined): Record<string, string[]> {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    const output: Record<string, string[]> = {}
    for (const [toolName, scopeValue] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedToolName = toolName.trim()
      if (!normalizedToolName) {
        continue
      }

      if (typeof scopeValue === "string") {
        const scopes = scopeValue
          .split(" ")
          .map((item) => item.trim())
          .filter(Boolean)
        if (scopes.length > 0) {
          output[normalizedToolName] = scopes
        }
        continue
      }

      if (Array.isArray(scopeValue)) {
        const scopes = scopeValue
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
        if (scopes.length > 0) {
          output[normalizedToolName] = scopes
        }
      }
    }

    return output
  } catch {
    return {}
  }
}

/**
 * Escape double quotes in a string for use in HTTP header values.
 */
function escapeHeaderValue(value: string): string {
  return value.replace(/"/g, '\\"')
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Resource Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the MCP resource URL (the protected resource endpoint).
 * Falls back to /api/mcp on the current request origin if not configured.
 */
export function getMcpResourceUrl(req: Request): string {
  const configured = process.env.MCP_RESOURCE_URL?.trim()
  if (configured) {
    return configured
  }

  return new URL("/api/mcp", req.url).toString()
}

/**
 * Get the OAuth Protected Resource Metadata URL.
 * Falls back to /.well-known/oauth-protected-resource on the current request origin.
 */
export function getMcpResourceMetadataUrl(req: Request): string {
  const configured = process.env.MCP_RESOURCE_METADATA_URL?.trim()
  if (configured) {
    return configured
  }

  return new URL("/.well-known/oauth-protected-resource", req.url).toString()
}

/**
 * Get the list of authorization servers that can issue tokens for this resource.
 * Falls back to Supabase Auth if not explicitly configured.
 */
export function getMcpAuthorizationServers(): string[] {
  const configured = parseCsv(process.env.MCP_AUTHORIZATION_SERVERS)
  if (configured.length > 0) {
    return configured
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (supabaseUrl) {
    return [`${normalizeForCompare(supabaseUrl)}/auth/v1`]
  }

  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the list of scopes supported by this MCP resource.
 * Defaults to ["mcp:tools"] if not configured.
 */
export function getMcpScopesSupported(): string[] {
  const configured = parseCsv(process.env.MCP_SCOPES_SUPPORTED)
  return configured.length > 0 ? configured : ["mcp:tools"]
}

/**
 * Get the tool-to-scope mapping for fine-grained access control.
 */
export function getMcpToolScopeMap(): Record<string, string[]> {
  return parseToolScopeMapJson(process.env.MCP_TOOL_SCOPE_MAP_JSON)
}

/**
 * Get the globally required scopes for accessing any MCP tool.
 * Only enforced when MCP_ENFORCE_SCOPES is "true".
 */
export function getMcpRequiredScopes(): string[] {
  if (process.env.MCP_ENFORCE_SCOPES !== "true") {
    return []
  }

  const configured = parseCsv(process.env.MCP_REQUIRED_SCOPES)
  return configured.length > 0 ? configured : getMcpScopesSupported()
}

/**
 * Get the required scopes for a specific tool.
 * Returns an empty array if no specific scopes are required.
 */
export function getRequiredScopesForTool(toolName: string): string[] {
  const map = getMcpToolScopeMap()
  return map[toolName] || []
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Access Control
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the authenticated context has access to a specific tool.
 * Returns true if no specific scopes are required for the tool,
 * or if the auth context has all required scopes.
 */
export function canAccessTool(auth: SupabaseAuthContext | null, toolName: string): boolean {
  const required = getRequiredScopesForTool(toolName)
  if (required.length === 0) {
    return true
  }
  if (!auth) {
    return false
  }
  return hasRequiredScopes(auth, required)
}

/**
 * Get a list of tools that the authenticated context can access.
 * Useful for filtering tool listings based on authorization.
 */
export function getAccessibleTools(auth: SupabaseAuthContext | null, toolNames: string[]): string[] {
  return toolNames.filter((toolName) => canAccessTool(auth, toolName))
}

/**
 * Get the missing scopes required to access a specific tool.
 * Returns an empty array if access is granted or no scopes are required.
 */
export function getMissingScopesForTool(auth: SupabaseAuthContext | null, toolName: string): string[] {
  const required = getRequiredScopesForTool(toolName)
  if (required.length === 0) {
    return []
  }
  if (!auth) {
    return required
  }

  const granted = new Set(auth.scopes.map((scope) => scope.trim()).filter(Boolean))
  return required.filter((scope) => !granted.has(scope))
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Validation Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the expected audiences for token validation.
 * When MCP_ENFORCE_AUDIENCE is true, defaults to the resource URL.
 */
export function getMcpExpectedAudiences(req: Request): string[] {
  const configured = parseCsv(process.env.MCP_EXPECTED_AUDIENCES)
  if (configured.length > 0) {
    return configured
  }

  if (process.env.MCP_ENFORCE_AUDIENCE === "true") {
    return [getMcpResourceUrl(req)]
  }

  return []
}

/**
 * Get the expected issuer for token validation.
 * When MCP_ENFORCE_ISSUER is true, defaults to Supabase Auth URL.
 */
export function getMcpExpectedIssuer(): string | null {
  const configured = process.env.MCP_EXPECTED_ISSUER?.trim()
  if (configured) {
    return configured
  }

  if (process.env.MCP_ENFORCE_ISSUER === "true") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    if (supabaseUrl) {
      return `${normalizeForCompare(supabaseUrl)}/auth/v1`
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Mode Configuration
// ─────────────────────────────────────────────────────────────────────────────

export type McpAuthMode = "supabase" | "introspection" | "auto"

/**
 * Get the authentication mode for MCP requests.
 * - "supabase": Use Supabase JWT validation (default)
 * - "introspection": Use OAuth 2.0 token introspection
 * - "auto": Try Supabase first, fall back to introspection
 */
export function getMcpAuthMode(): McpAuthMode {
  const value = (process.env.MCP_AUTH_MODE || "supabase").trim().toLowerCase()
  if (value === "introspection" || value === "auto" || value === "supabase") {
    return value
  }
  return "supabase"
}

export interface McpIntrospectionConfig {
  url: string | null
  clientId: string | null
  clientSecret: string | null
  authMethod: "client_secret_post" | "basic"
  timeoutMs: number
}

/**
 * Get the OAuth 2.0 token introspection configuration.
 * Used when MCP_AUTH_MODE is "introspection" or "auto".
 */
export function getMcpIntrospectionConfig(): McpIntrospectionConfig {
  const url = process.env.MCP_INTROSPECTION_URL?.trim() || null
  const clientId = process.env.MCP_INTROSPECTION_CLIENT_ID?.trim() || null
  const clientSecret = process.env.MCP_INTROSPECTION_CLIENT_SECRET?.trim() || null
  const rawAuthMethod = (process.env.MCP_INTROSPECTION_AUTH_METHOD || "client_secret_post")
    .trim()
    .toLowerCase()
  const authMethod = rawAuthMethod === "basic" ? "basic" : "client_secret_post"
  const timeoutMsValue = Number(process.env.MCP_INTROSPECTION_TIMEOUT_MS || 5000)
  const timeoutMs = Number.isFinite(timeoutMsValue) && timeoutMsValue > 0
    ? Math.min(timeoutMsValue, 30_000)
    : 5000

  return {
    url,
    clientId,
    clientSecret,
    authMethod,
    timeoutMs,
  }
}

/**
 * Check if introspection is properly configured.
 */
export function isIntrospectionConfigured(): boolean {
  const config = getMcpIntrospectionConfig()
  return Boolean(config.url && config.clientId && config.clientSecret)
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport Security
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if HTTPS should be required for MCP requests.
 * Defaults to true in production unless explicitly disabled.
 */
export function shouldRequireHttpsForMcp(): boolean {
  if (process.env.MCP_REQUIRE_HTTPS === "false") {
    return false
  }
  return process.env.NODE_ENV === "production"
}

/**
 * Check if the incoming request is secure (HTTPS).
 * Handles both direct HTTPS connections and proxied requests.
 */
export function isRequestSecure(req: Request): boolean {
  const url = new URL(req.url)
  if (url.protocol === "https:") {
    return true
  }

  // Check for proxy headers indicating HTTPS termination
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.headers.get("X-Forwarded-Proto")
  if (!forwardedProto) {
    return false
  }

  return forwardedProto
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === "https")
}

/**
 * Get security-related information about the request.
 */
export function getRequestSecurityInfo(req: Request): {
  isSecure: boolean
  protocol: string
  forwardedProto: string | null
  requiresHttps: boolean
  isCompliant: boolean
} {
  const isSecure = isRequestSecure(req)
  const requiresHttps = shouldRequireHttpsForMcp()
  const url = new URL(req.url)

  return {
    isSecure,
    protocol: url.protocol,
    forwardedProto: req.headers.get("x-forwarded-proto"),
    requiresHttps,
    isCompliant: !requiresHttps || isSecure,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the auth context has all required scopes.
 */
export function hasRequiredScopes(auth: SupabaseAuthContext, requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) {
    return true
  }

  const granted = new Set(auth.scopes.map((scope) => scope.trim()).filter(Boolean))
  return requiredScopes.every((scope) => granted.has(scope))
}

/**
 * Check if the auth context has at least one of the expected audiences.
 */
export function hasAllowedAudience(auth: SupabaseAuthContext, expectedAudiences: string[]): boolean {
  if (expectedAudiences.length === 0) {
    return true
  }

  const normalizedExpected = expectedAudiences.map((item) => normalizeForCompare(item))
  const normalizedActual = auth.audiences.map((item) => normalizeForCompare(item))
  return normalizedExpected.some((expected) => normalizedActual.includes(expected))
}

/**
 * Check if the auth context was issued by the expected issuer.
 */
export function hasExpectedIssuer(auth: SupabaseAuthContext, expectedIssuer: string | null): boolean {
  if (!expectedIssuer) {
    return true
  }

  if (!auth.issuer) {
    return false
  }

  return normalizeForCompare(auth.issuer) === normalizeForCompare(expectedIssuer)
}

/**
 * Validate all aspects of the auth context against MCP requirements.
 */
export function validateMcpAuth(
  auth: SupabaseAuthContext,
  req: Request
): { valid: true } | { valid: false; reason: string; code: "invalid_issuer" | "invalid_audience" | "insufficient_scope" } {
  const expectedIssuer = getMcpExpectedIssuer()
  if (!hasExpectedIssuer(auth, expectedIssuer)) {
    return {
      valid: false,
      reason: `Token issuer '${auth.issuer || "unknown"}' does not match expected issuer '${expectedIssuer}'`,
      code: "invalid_issuer",
    }
  }

  const expectedAudiences = getMcpExpectedAudiences(req)
  if (!hasAllowedAudience(auth, expectedAudiences)) {
    return {
      valid: false,
      reason: `Token audience does not match any expected audiences`,
      code: "invalid_audience",
    }
  }

  const requiredScopes = getMcpRequiredScopes()
  if (!hasRequiredScopes(auth, requiredScopes)) {
    return {
      valid: false,
      reason: `Missing required scopes: ${requiredScopes.filter((s) => !auth.scopes.includes(s)).join(", ")}`,
      code: "insufficient_scope",
    }
  }

  return { valid: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Response Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface BearerChallengeOptions {
  error?: "invalid_token" | "insufficient_scope"
  errorDescription?: string
  scope?: string
}

/**
 * Build a WWW-Authenticate header value for bearer token challenges.
 * Includes resource metadata URL for OAuth discovery.
 */
export function buildBearerChallenge(req: Request, options?: BearerChallengeOptions): string {
  const parts = [
    `Bearer realm="mcp"`,
    `resource_metadata="${escapeHeaderValue(getMcpResourceMetadataUrl(req))}"`,
  ]

  if (options?.error) {
    parts.push(`error="${options.error}"`)
  }

  if (options?.errorDescription) {
    parts.push(`error_description="${escapeHeaderValue(options.errorDescription)}"`)
  }

  if (options?.scope) {
    parts.push(`scope="${escapeHeaderValue(options.scope)}"`)
  }

  return parts.join(", ")
}

/**
 * Create a 401 Unauthorized response with appropriate WWW-Authenticate header.
 */
export function createUnauthorizedResponse(req: Request, options?: BearerChallengeOptions): Response {
  return new Response(
    JSON.stringify({
      error: options?.error || "unauthorized",
      error_description: options?.errorDescription || "Authentication required",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": buildBearerChallenge(req, options),
      },
    }
  )
}

/**
 * Create a 403 Forbidden response for scope/permission errors.
 */
export function createForbiddenResponse(req: Request, missingScopes: string[]): Response {
  return new Response(
    JSON.stringify({
      error: "insufficient_scope",
      error_description: `Missing required scopes: ${missingScopes.join(", ")}`,
      required_scopes: missingScopes,
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": buildBearerChallenge(req, {
          error: "insufficient_scope",
          errorDescription: `Missing scopes: ${missingScopes.join(" ")}`,
          scope: missingScopes.join(" "),
        }),
      },
    }
  )
}