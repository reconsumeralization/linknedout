/**
 * LinkedIn Consumer Solutions Platform — shared helpers for Identity Bridge and Share.
 *
 * - Token introspection (POST /oauth/v2/introspectToken)
 * - UGC Post create (POST /v2/ugcPosts) with X-Restli-Protocol-Version and 429 handling
 * - Optional in-memory userinfo cache (short TTL)
 *
 * Docs:
 * - https://learn.microsoft.com/en-us/linkedin/consumer/
 * - https://learn.microsoft.com/en-us/linkedin/compliance/integrations/shares/ugc-post-api
 */

const LINKEDIN_INTROSPECT_URL = "https://www.linkedin.com/oauth/v2/introspectToken"
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
const LINKEDIN_UGCPOSTS_URL = "https://api.linkedin.com/v2/ugcPosts"
const RESTLI_PROTOCOL_VERSION = "2.0.0"

/** Scopes for Sign In with LinkedIn (OIDC). */
export const LINKEDIN_SCOPES_SIGNIN = "openid profile email"

/** Scope required to create posts on behalf of the member. */
export const LINKEDIN_SCOPE_SHARE = "w_member_social"

export type LinkedInUserInfo = {
  sub?: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  locale?: string
}

export type LinkedInTokenResponse = {
  access_token?: string
  expires_in?: number
  scope?: string
  id_token?: string
}

export type IntrospectResult = {
  active: boolean
  client_id?: string
  scope?: string
  expires_at?: number
  status?: string
  error?: string
}

/** In-memory cache entry for userinfo (short TTL to reduce calls). */
const userinfoCache = new Map<
  string,
  { data: LinkedInUserInfo; expiresAt: number }
>()
const USERINFO_CACHE_TTL_MS = 60 * 1000 // 1 minute

/**
 * Introspect a LinkedIn access token (3-legged).
 * Returns active, expires_at, scope. Use before posting and for compliance telemetry.
 */
export async function introspectToken(token: string): Promise<IntrospectResult | null> {
  const body = new URLSearchParams({ token })
  const res = await fetch(LINKEDIN_INTROSPECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  })
  if (!res.ok) {
    return null
  }
  const data = (await res.json()) as IntrospectResult & { exp?: number }
  if (data.exp != null && typeof data.exp === "number") {
    data.expires_at = data.exp
  }
  return data
}

/**
 * Fetch LinkedIn OpenID userinfo. Uses short-TTL in-memory cache keyed by token.
 */
export async function fetchUserInfo(
  accessToken: string,
  options?: { skipCache?: boolean }
): Promise<LinkedInUserInfo | null> {
  if (!options?.skipCache) {
    const cached = userinfoCache.get(accessToken)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }
  }

  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!res.ok) {
    return null
  }
  const data = (await res.json()) as LinkedInUserInfo
  userinfoCache.set(accessToken, {
    data,
    expiresAt: Date.now() + USERINFO_CACHE_TTL_MS,
  })
  return data
}

/** Clear userinfo cache (e.g. after disconnect). */
export function clearUserInfoCache(): void {
  userinfoCache.clear()
}

/** UGC Post request body (text-only share). */
export type UgcPostPayload = {
  author: string // urn:li:person:{sub}
  lifecycleState: "PUBLISHED"
  specificContent: {
    "com.linkedin.ugc.ShareContent": {
      shareCommentary: { text: string; attributes?: unknown[] }
      shareMediaCategory: "NONE"
      media?: never
    }
  }
  visibility: {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"
  }
}

/** Build a text-only UGC post body. Author must be urn:li:person:{linkedin_sub}. */
export function buildUgcPostBody(
  linkedinSubjectId: string,
  text: string,
  visibility: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN" = "PUBLIC"
): UgcPostPayload {
  const author = linkedinSubjectId.startsWith("urn:li:person:")
    ? linkedinSubjectId
    : `urn:li:person:${linkedinSubjectId}`
  const trimmed = text.slice(0, 3000)
  return {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: trimmed, attributes: [] },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": visibility,
    },
  }
}

export type CreateUgcPostResult =
  | { ok: true; ugcPostId: string }
  | { ok: false; status: number; error: string; retryAfter?: number }

/**
 * Create a UGC post. Uses X-Restli-Protocol-Version: 2.0.0.
 * On 429, returns retryAfter from Retry-After header when present.
 */
export async function createUgcPost(
  accessToken: string,
  payload: UgcPostPayload
): Promise<CreateUgcPostResult> {
  const res = await fetch(LINKEDIN_UGCPOSTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": RESTLI_PROTOCOL_VERSION,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After")
    const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : undefined
    return {
      ok: false,
      status: 429,
      error: "Rate limit exceeded",
      retryAfter: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
    }
  }

  if (res.status === 201) {
    const id = res.headers.get("x-restli-id") ?? ""
    return { ok: true, ugcPostId: id }
  }

  const text = await res.text().catch(() => "unknown error")
  return {
    ok: false,
    status: res.status,
    error: text.slice(0, 500),
  }
}

/**
 * Create UGC post with one retry on 429 using Retry-After delay.
 */
export async function createUgcPostWithRetry(
  accessToken: string,
  payload: UgcPostPayload
): Promise<CreateUgcPostResult> {
  const first = await createUgcPost(accessToken, payload)
  if (first.ok || first.status !== 429 || first.retryAfter == null) {
    return first
  }
  await new Promise((r) => setTimeout(r, first.retryAfter! * 1000))
  return createUgcPost(accessToken, payload)
}
