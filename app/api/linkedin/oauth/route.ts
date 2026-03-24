/**
 * LinkedIn Consumer OAuth (OpenID Connect) route.
 *
 * GET /api/linkedin/oauth?action=start
 *   -> redirects to LinkedIn authorization endpoint
 *
 * GET /api/linkedin/oauth?action=callback&code=...&state=...
 *   -> exchanges code for token and fetches /v2/userinfo
 *
 * GET /api/linkedin/oauth?action=status
 *   -> reports whether LinkedIn env configuration is present
 *
 * Docs:
 * - https://learn.microsoft.com/en-us/linkedin/consumer/
 * - https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
 */

import { upsertLinkedInIdentity } from "@/lib/linkedin/linkedin-identity-server"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const OAUTH_STATE_COOKIE = "linkedout_linkedin_oauth_state"
const OAUTH_USER_ID_COOKIE = "linkedout_linkedin_user_id"
const OAUTH_RETURN_TO_COOKIE = "linkedout_linkedin_oauth_return_to"
const OAUTH_STATE_TTL_SECONDS = 15 * 60

const SENTINEL_VERSION = "1.0.0"
const SENTINEL_MODE = process.env.SENTINEL_MODE || "shadow"

const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "LINKEDIN_OAUTH_RATE_LIMIT_MAX",
  "LINKEDIN_OAUTH_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Sentinel-Version": SENTINEL_VERSION,
  "X-Sentinel-Mode": SENTINEL_MODE,
}

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
const LINKEDIN_SCOPES_SIGNIN = "openid profile email"
const LINKEDIN_SCOPE_SHARE = "w_member_social"

type LinkedInTokenResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  id_token?: string
}

type LinkedInUserInfo = {
  sub?: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  locale?: string
}

function shouldUseSecureCookies(): boolean {
  try {
    const parsed = new URL(APP_URL)
    return parsed.protocol === "https:"
  } catch {
    return process.env.NODE_ENV === "production"
  }
}

function buildSetCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number,
  path = "/api/linkedin/oauth",
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (shouldUseSecureCookies()) {
    parts.push("Secure")
  }
  return parts.join("; ")
}

function clearCookieHeader(name: string, path = "/api/linkedin/oauth"): string {
  return buildSetCookieHeader(name, "", 0, path)
}

function redirectWithCookies(target: URL | string, setCookies: string[]): Response {
  const response = Response.redirect(typeof target === "string" ? target : target.toString())
  setCookies.forEach((c) => response.headers.append("Set-Cookie", c))
  return response
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie")
  if (!header) return null

  const entries = header.split(";")
  for (const entry of entries) {
    const [rawKey, ...rest] = entry.trim().split("=")
    if (rawKey !== name) continue
    const rawValue = rest.join("=")
    if (!rawValue) return null
    try {
      return decodeURIComponent(rawValue)
    } catch {
      return rawValue
    }
  }
  return null
}

function issueOAuthState(): string {
  return crypto.randomUUID().replace(/-/g, "")
}

function normalizeReturnToPath(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null
  }
  if (/[\r\n]/.test(trimmed)) {
    return null
  }
  return trimmed.slice(0, 300)
}

function buildCallbackRedirectUrl(returnToPath: string | null): URL {
  if (returnToPath) {
    return new URL(returnToPath, APP_URL)
  }
  const redirectUrl = new URL("/", APP_URL)
  redirectUrl.searchParams.set("view", "settings")
  return redirectUrl
}

function sanitizeForQuery(value: string, maxLength = 120): string {
  return value
    .replace(/[^\w @.+-]+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function normalizePublicErrorCode(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
  return normalized || fallback
}

function resolveLinkedInRedirectUri(): string {
  return process.env.LINKEDIN_REDIRECT_URI ?? `${APP_URL}/api/linkedin/oauth?action=callback`
}

function redirectWithCookie(target: URL | string, setCookie: string): Response {
  const response = Response.redirect(typeof target === "string" ? target : target.toString())
  response.headers.append("Set-Cookie", setCookie)
  return response
}

function isLinkedInConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

function buildLinkedInAuthUrl(state: string, includeShareScope = false): string {
  const scopes = includeShareScope
    ? `${LINKEDIN_SCOPES_SIGNIN} ${LINKEDIN_SCOPE_SHARE}`
    : LINKEDIN_SCOPES_SIGNIN
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: resolveLinkedInRedirectUri(),
    state,
    scope: scopes,
  })
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`
}

async function exchangeLinkedInCode(code: string): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    redirect_uri: resolveLinkedInRedirectUri(),
  })

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error")
    throw new Error(`LinkedIn token exchange failed: ${text}`)
  }

  return (await res.json()) as LinkedInTokenResponse
}

async function fetchLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo | null> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!res.ok) {
    return null
  }
  return (await res.json()) as LinkedInUserInfo
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `linkedin-oauth:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit?: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...(rateLimit ? createRateLimitHeaders(rateLimit) : {}),
      ...(extraHeaders || {}),
    },
  })
}

function jsonResponseWithCookies(
  payload: unknown,
  status: number,
  cookies: string[],
  rateLimit?: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  const response = jsonResponse(payload, status, rateLimit, extraHeaders)
  cookies.forEach((cookie) => response.headers.append("Set-Cookie", cookie))
  return response
}

export async function GET(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "rate_limit_exceeded",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      429,
      rateLimit,
    )
  }

  const url = new URL(req.url)
  const action = url.searchParams.get("action") ?? "start"

  if (action === "status") {
    return jsonResponse(
      {
        ok: true,
        provider: "linkedin",
        configured: isLinkedInConfigured(),
        scopes: LINKEDIN_SCOPES_SIGNIN.split(" "),
        shareScope: LINKEDIN_SCOPE_SHARE,
        docs: [
          "https://learn.microsoft.com/en-us/linkedin/consumer/",
          "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2",
          "https://api.linkedin.com/v2/userinfo",
        ],
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
        generatedAt: new Date().toISOString(),
      },
      200,
      rateLimit,
    )
  }

  if (action === "start") {
    if (!isLinkedInConfigured()) {
      return jsonResponse(
        {
          ok: false,
          error: "configuration_error",
          message: "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be configured.",
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
        },
        501,
        rateLimit,
      )
    }

    const state = issueOAuthState()
    const returnToPath = normalizeReturnToPath(url.searchParams.get("returnTo"))
    const cookies: string[] = [
      buildSetCookieHeader(OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL_SECONDS),
      buildSetCookieHeader(OAUTH_RETURN_TO_COOKIE, returnToPath || "", OAUTH_STATE_TTL_SECONDS),
    ]
    const auth = await resolveSupabaseAuthContextFromRequest(req)
    if (auth?.userId) {
      cookies.push(
        buildSetCookieHeader(OAUTH_USER_ID_COOKIE, auth.userId, OAUTH_STATE_TTL_SECONDS, "/"),
      )
    }
    const includeShare = url.searchParams.get("scope") === "share"
    const authUrl = buildLinkedInAuthUrl(state, includeShare)
    const responseMode = url.searchParams.get("response")

    if (responseMode === "json") {
      return jsonResponseWithCookies(
        {
          ok: true,
          provider: "linkedin",
          authUrl,
          includeShareScope: includeShare,
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
        },
        200,
        cookies,
        rateLimit,
      )
    }

    return redirectWithCookies(authUrl, cookies)
  }

  if (action === "callback") {
    const code = url.searchParams.get("code") 
    const state = url.searchParams.get("state")
    const errorParam = url.searchParams.get("error")
    const storedState = readCookie(req, OAUTH_STATE_COOKIE)
    const returnToPath = normalizeReturnToPath(readCookie(req, OAUTH_RETURN_TO_COOKIE))
    const stateIsValid = Boolean(state && storedState && state === storedState)

    const clearBothCookies = (): string[] => [
      clearCookieHeader(OAUTH_STATE_COOKIE),
      clearCookieHeader(OAUTH_USER_ID_COOKIE, "/"),
      clearCookieHeader(OAUTH_RETURN_TO_COOKIE),
    ]

    if (errorParam || !code || !stateIsValid) {
      const redirectUrl = buildCallbackRedirectUrl(returnToPath)
      redirectUrl.searchParams.set(
        "linkedinError",
        normalizePublicErrorCode(errorParam ?? (!code ? "no_code" : "invalid_state"), "oauth_error"),
      )
      return redirectWithCookies(redirectUrl, clearBothCookies())
    }

    try {
      const token = await exchangeLinkedInCode(code)
      if (!token.access_token) {
        const redirectUrl = buildCallbackRedirectUrl(returnToPath)
        redirectUrl.searchParams.set("linkedinError", "no_access_token")
        return redirectWithCookies(redirectUrl, clearBothCookies())
      }

      const userInfo = await fetchLinkedInUserInfo(token.access_token)
      const userId = readCookie(req, OAUTH_USER_ID_COOKIE)
      if (userId) {
        const upsert = await upsertLinkedInIdentity(userId, token, userInfo ?? null)
        if (!upsert.ok) {
          console.warn("[linkedin-oauth] upsert identity failed:", upsert.error)
        }
      }

      const redirectUrl = buildCallbackRedirectUrl(returnToPath)
      redirectUrl.searchParams.set("linkedinAuthSuccess", "true")
      if (userInfo?.name) {
        redirectUrl.searchParams.set("linkedinName", sanitizeForQuery(userInfo.name))
      } else if (userInfo?.given_name || userInfo?.family_name) {
        const fallbackName = `${userInfo.given_name ?? ""} ${userInfo.family_name ?? ""}`.trim()
        if (fallbackName) {
          redirectUrl.searchParams.set("linkedinName", sanitizeForQuery(fallbackName))
        }
      }
      if (userInfo?.email) {
        redirectUrl.searchParams.set("linkedinEmail", sanitizeForQuery(userInfo.email))
      }
      if (typeof token.expires_in === "number" && Number.isFinite(token.expires_in)) {
        redirectUrl.searchParams.set("linkedinExpiresIn", String(token.expires_in))
      }

      return redirectWithCookies(redirectUrl, clearBothCookies())
    } catch (error) {
      console.error(
        "[linkedin-oauth] callback exchange failed:",
        error instanceof Error ? error.message : "unknown",
      )
      const redirectUrl = buildCallbackRedirectUrl(returnToPath)
      redirectUrl.searchParams.set("linkedinError", "exchange_failed")
      return redirectWithCookies(redirectUrl, clearBothCookies())
    }
  }

  return jsonResponse(
    {
      ok: false,
      error: "unknown_action",
      message: "Supported actions: start, callback, status",
      sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
    },
    400,
    rateLimit,
  )
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "X-Sentinel-Version": SENTINEL_VERSION,
      "X-Sentinel-Mode": SENTINEL_MODE,
    },
  })
}
