import { createClient } from "@supabase/supabase-js"

type JsonObject = Record<string, unknown>

export interface SupabaseAuthContext {
  accessToken: string
  userId: string
  email: string | null
  issuer: string | null
  audiences: string[]
  scopes: string[]
  tokenClaims: JsonObject | null
  isSupabaseSession: boolean
}

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

function decodeJwtPayload(token: string): JsonObject | null {
  const parts = token.split(".")
  if (parts.length < 2) {
    return null
  }

  try {
    const payloadSegment = parts[1]
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    return parsed as JsonObject
  } catch {
    return null
  }
}

function parseScopeClaim(payload: JsonObject | null): string[] {
  if (!payload) {
    return []
  }

  const scope = payload.scope
  if (typeof scope === "string") {
    return scope
      .split(" ")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (Array.isArray(scope)) {
    return scope
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  return []
}

function parseAudienceClaim(payload: JsonObject | null): string[] {
  if (!payload) {
    return []
  }

  const aud = payload.aud
  if (typeof aud === "string") {
    return aud.trim() ? [aud.trim()] : []
  }

  if (Array.isArray(aud)) {
    return aud
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  return []
}

function parseIssuerClaim(payload: JsonObject | null): string | null {
  if (!payload) {
    return null
  }

  const iss = payload.iss
  return typeof iss === "string" && iss.trim().length > 0 ? iss.trim() : null
}

export async function resolveSupabaseAuthContextFromRequest(
  req: Request,
): Promise<SupabaseAuthContext | null> {
  const accessToken = extractBearerToken(req.headers.get("authorization"))
  if (!accessToken) {
    return null
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return null
  }

  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await authClient.auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }

  const tokenClaims = decodeJwtPayload(accessToken)

  return {
    accessToken,
    userId: data.user.id,
    email: data.user.email ?? null,
    issuer: parseIssuerClaim(tokenClaims),
    audiences: parseAudienceClaim(tokenClaims),
    scopes: parseScopeClaim(tokenClaims),
    tokenClaims,
    isSupabaseSession: true,
  }
}
