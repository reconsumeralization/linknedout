import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"

const CORS_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS"
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization"

function resolveAllowedOrigin(): string {
  const configuredOrigin = process.env.EMAIL_API_CORS_ORIGIN?.trim()
  if (configuredOrigin) {
    return configuredOrigin
  }
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://localhost"
}

export function emailApiResponse(payload: unknown, status = 200): Response {
  const origin = resolveAllowedOrigin()
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
      "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    },
  })
}

export function emailApiOptionsResponse(): Response {
  const origin = resolveAllowedOrigin()
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
      "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  })
}

export async function resolveEmailAuthOrResponse(
  req: Request,
): Promise<{ auth: SupabaseAuthContext; response: null } | { auth: null; response: Response }> {
  const result = await requireSupabaseAuth(req, {
    errorBody: { error: "Unauthorized. Provide a valid Supabase bearer token." },
  })
  if (!result.auth) {
    return { auth: null, response: result.response }
  }
  return { auth: result.auth, response: null }
}
