/**
 * Email OAuth routes — start + callback for Gmail and Outlook.
 *
 * GET /api/email/oauth?action=start&provider=gmail    → redirects to Google OAuth
 * GET /api/email/oauth?action=start&provider=outlook  → redirects to Microsoft OAuth
 * GET /api/email/oauth?action=callback&provider=gmail&code=...   → exchanges code, stores tokens
 * GET /api/email/oauth?action=callback&provider=outlook&code=... → exchanges code, stores tokens
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
 *
 * The callback returns provider tokens in URL fragment; the authenticated client
 * then persists them via POST /api/email/integrations.
 */

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
const OAUTH_STATE_COOKIE = "linkedout_oauth_state"
const OAUTH_USER_ID_COOKIE = "linkedout_oauth_user_id"
const OAUTH_RETURN_TO_COOKIE = "linkedout_oauth_return_to"
const OAUTH_STATE_TTL_SECONDS = 15 * 60

// SENTINEL v1.0.0 — Runtime Enforcement Layer
const SENTINEL_VERSION = "1.0.0"
const SENTINEL_MODE = process.env.SENTINEL_MODE || "shadow"

// Rate limiting configuration
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "EMAIL_OAUTH_RATE_LIMIT_MAX",
  "EMAIL_OAUTH_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Sentinel-Version": SENTINEL_VERSION,
  "X-Sentinel-Mode": SENTINEL_MODE,
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
  path = "/api/email/oauth",
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

function clearCookieHeader(name: string, path = "/api/email/oauth"): string {
  return buildSetCookieHeader(name, "", 0, path)
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie")
  if (!header) return null

  const entries = header.split(";")
  for (const entry of entries) {
    const [rawKey, ...rest] = entry.trim().split("=")
    if (!rawKey || rawKey !== name) continue
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

function issueOAuthState(provider: "gmail" | "outlook"): string {
  return `${provider}-${crypto.randomUUID().replace(/-/g, "")}`
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

function normalizePublicErrorDescription(value: string): string | null {
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim()
  if (!normalized) return null
  return normalized.slice(0, 200)
}

function redirectWithCookie(target: URL | string, setCookie: string): Response {
  const response = Response.redirect(typeof target === "string" ? target : target.toString())
  response.headers.append("Set-Cookie", setCookie)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Pragma", "no-cache")
  return response
}

function redirectWithCookies(target: URL | string, setCookies: string[]): Response {
  const response = Response.redirect(typeof target === "string" ? target : target.toString())
  setCookies.forEach((cookie) => response.headers.append("Set-Cookie", cookie))
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Pragma", "no-cache")
  return response
}

function normalizeReturnToPath(value: string | null): string | null {
  if (!value) {
    return null
  }
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
  const target = new URL(returnToPath || "/", APP_URL)
  if (!returnToPath) {
    target.searchParams.set("view", "email")
  }
  return target
}

function clearOAuthCookies(): string[] {
  return [
    clearCookieHeader(OAUTH_STATE_COOKIE),
    clearCookieHeader(OAUTH_USER_ID_COOKIE, "/"),
    clearCookieHeader(OAUTH_RETURN_TO_COOKIE),
  ]
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "email",
  "profile",
].join(" ")

function buildGmailAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? `${APP_URL}/api/email/oauth?action=callback&provider=gmail`,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

async function exchangeGmailCode(code: string): Promise<{ accessToken: string; refreshToken?: string; email?: string; expiresIn?: number }> {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? `${APP_URL}/api/email/oauth?action=callback&provider=gmail`,
    grant_type: "authorization_code",
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error")
    throw new Error(`Gmail token exchange failed: ${err}`)
  }

  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  const accessToken = json.access_token ?? ""
  const refreshToken = json.refresh_token ?? undefined
  const expiresIn = json.expires_in ?? undefined

  // Fetch user email
  let email: string | undefined
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { email?: string }
      email = profile.email
    }
  } catch {
    // non-fatal
  }

  return { accessToken, refreshToken, email, expiresIn }
}

// ─── Outlook ──────────────────────────────────────────────────────────────────

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
const MS_SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "offline_access",
  "email",
  "profile",
  "openid",
].join(" ")

function buildOutlookAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? `${APP_URL}/api/email/oauth?action=callback&provider=outlook`,
    response_type: "code",
    scope: MS_SCOPES,
    state,
  })
  return `${MS_AUTH_URL}?${params.toString()}`
}

async function exchangeOutlookCode(code: string): Promise<{ accessToken: string; refreshToken?: string; email?: string; expiresIn?: number }> {
  const params = new URLSearchParams({
    code,
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? `${APP_URL}/api/email/oauth?action=callback&provider=outlook`,
    grant_type: "authorization_code",
    scope: MS_SCOPES,
  })

  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error")
    throw new Error(`Outlook token exchange failed: ${err}`)
  }

  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  const accessToken = json.access_token ?? ""
  const refreshToken = json.refresh_token ?? undefined
  const expiresIn = json.expires_in ?? undefined

  let email: string | undefined
  try {
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { mail?: string; userPrincipalName?: string }
      email = profile.mail ?? profile.userPrincipalName
    }
  } catch {
    // non-fatal
  }

  return { accessToken, refreshToken, email, expiresIn }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `email-oauth:${clientAddress}`,
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

function isValidProvider(provider: string): provider is "gmail" | "outlook" {
  return provider === "gmail" || provider === "outlook"
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
  const provider = url.searchParams.get("provider") ?? "gmail"

  // Validate provider
  if (!isValidProvider(provider)) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_provider",
        message: "Supported providers: gmail, outlook",
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      400,
      rateLimit,
    )
  }

  // ── Start: redirect to provider OAuth ──────────────────────────────────────
  if (action === "start") {
    const auth = await resolveSupabaseAuthContextFromRequest(req)
    if (!auth?.userId) {
      return jsonResponse(
        {
          ok: false,
          error: "unauthorized",
          message: "A valid Supabase bearer token is required to start OAuth.",
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
        },
        401,
        rateLimit,
      )
    }

    const state = issueOAuthState(provider)
    const returnToPath = normalizeReturnToPath(url.searchParams.get("returnTo"))
    const cookies = [
      buildSetCookieHeader(
        OAUTH_STATE_COOKIE,
        `${provider}:${state}`,
        OAUTH_STATE_TTL_SECONDS,
      ),
      buildSetCookieHeader(
        OAUTH_USER_ID_COOKIE,
        auth.userId,
        OAUTH_STATE_TTL_SECONDS,
        "/",
      ),
      buildSetCookieHeader(
        OAUTH_RETURN_TO_COOKIE,
        returnToPath || "",
        OAUTH_STATE_TTL_SECONDS,
      ),
    ]
    const responseMode = url.searchParams.get("response")

    const redirectToProvider = (
      authUrl: string,
      docs: string[],
    ): Response => {
      if (responseMode === "json") {
        return jsonResponseWithCookies(
          {
            ok: true,
            provider,
            authUrl,
            docs,
            sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
          },
          200,
          cookies,
          rateLimit,
        )
      }
      return redirectWithCookies(authUrl, cookies)
    }

    if (provider === "gmail") {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return jsonResponse(
          {
            ok: false,
            error: "configuration_error",
            message: "GOOGLE_CLIENT_ID env var not configured.",
            sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
          },
          501,
          rateLimit,
        )
      }
      return redirectToProvider(buildGmailAuthUrl(state), [
        "https://developers.google.com/identity/protocols/oauth2",
      ])
    }

    if (provider === "outlook") {
      if (!process.env.MICROSOFT_CLIENT_ID) {
        return jsonResponse(
          {
            ok: false,
            error: "configuration_error",
            message: "MICROSOFT_CLIENT_ID env var not configured.",
            sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
          },
          501,
          rateLimit,
        )
      }
      return redirectToProvider(buildOutlookAuthUrl(state), [
        "https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow",
      ])
    }

    // Exhaustive check (should not reach here due to earlier validation)
    return jsonResponse(
      {
        ok: false,
        error: "unsupported_provider",
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      400,
      rateLimit,
    )
  }

  // ── Callback: exchange code + redirect to app ───────────────────────────────
  if (action === "callback") {
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const errorParam = url.searchParams.get("error")
    const errorDescription = url.searchParams.get("error_description")
    const stateCookieRaw = readCookie(req, OAUTH_STATE_COOKIE)
    const userId = readCookie(req, OAUTH_USER_ID_COOKIE)
    const returnToPath = normalizeReturnToPath(readCookie(req, OAUTH_RETURN_TO_COOKIE))
    const hasBoundUserId = Boolean(
      userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId),
    )
    const storedState = stateCookieRaw
      ? (() => {
          const [cookieProvider, ...cookieStateParts] = stateCookieRaw.split(":")
          const cookieState = cookieStateParts.join(":")
          if (!isValidProvider(cookieProvider)) {
            return null
          }
          if (!/^[A-Za-z0-9_-]{16,200}$/.test(cookieState)) {
            return null
          }
          return { provider: cookieProvider, state: cookieState }
        })()
      : null

    const stateIsValid =
      Boolean(state) &&
      Boolean(storedState) &&
      state === storedState?.state &&
      provider === storedState?.provider &&
      hasBoundUserId

    if (errorParam || !code || !stateIsValid) {
      const redirectUrl = buildCallbackRedirectUrl(returnToPath)
      redirectUrl.searchParams.set(
        "oauthError",
        normalizePublicErrorCode(
          errorParam ?? (!code ? "no_code" : !hasBoundUserId ? "auth_required" : "invalid_state"),
          "oauth_error",
        ),
      )
      if (errorDescription) {
        const sanitizedDescription = normalizePublicErrorDescription(errorDescription)
        if (sanitizedDescription) {
          redirectUrl.searchParams.set("oauthErrorDescription", sanitizedDescription)
        }
      }
      redirectUrl.searchParams.set("provider", provider)
      return redirectWithCookies(redirectUrl, clearOAuthCookies())
    }

    try {
      let tokens: { accessToken: string; refreshToken?: string; email?: string; expiresIn?: number }

      if (provider === "gmail") {
        tokens = await exchangeGmailCode(code)
      } else if (provider === "outlook") {
        tokens = await exchangeOutlookCode(code)
      } else {
        return jsonResponse(
          {
            ok: false,
            error: "unsupported_provider_callback",
            sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
          },
          400,
          rateLimit,
        )
      }

      // Validate we got an access token
      if (!tokens.accessToken) {
        const redirectUrl = buildCallbackRedirectUrl(returnToPath)
        redirectUrl.searchParams.set("oauthError", "no_access_token")
        redirectUrl.searchParams.set("provider", provider)
        return redirectWithCookies(redirectUrl, clearOAuthCookies())
      }

      // Redirect back to the app with tokens in URL hash (client-side only, not server-logged)
      // The email panel will pick these up and call POST /api/email/integrations to save
      const redirectUrl = buildCallbackRedirectUrl(returnToPath)
      redirectUrl.searchParams.set("oauthProvider", provider)
      redirectUrl.searchParams.set("oauthEmail", tokens.email ?? "")
      redirectUrl.searchParams.set("oauthSuccess", "true")

      // Pass token via fragment so it's not logged by servers
      const fragmentParams: Record<string, string> = {
        accessToken: tokens.accessToken,
      }
      if (tokens.refreshToken) {
        fragmentParams.refreshToken = tokens.refreshToken
      }
      if (tokens.expiresIn !== undefined) {
        fragmentParams.expiresIn = String(tokens.expiresIn)
      }
      const fragment = new URLSearchParams(fragmentParams).toString()
      return redirectWithCookies(
        `${redirectUrl.toString()}#oauth=${encodeURIComponent(fragment)}`,
        clearOAuthCookies(),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OAuth exchange failed"
      console.error(`[email-oauth] Exchange error for ${provider}:`, msg)
      const redirectUrl = buildCallbackRedirectUrl(returnToPath)
      redirectUrl.searchParams.set("provider", provider)
      redirectUrl.searchParams.set("oauthError", "exchange_failed")
      return redirectWithCookies(redirectUrl, clearOAuthCookies())
    }
  }

  // ── Status: check configuration ─────────────────────────────────────────────
  if (action === "status") {
    const gmailConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    const outlookConfigured = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)

    return jsonResponse(
      {
        ok: true,
        providers: {
          gmail: { configured: gmailConfigured },
          outlook: { configured: outlookConfigured },
        },
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
        generatedAt: new Date().toISOString(),
      },
      200,
      rateLimit,
    )
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
