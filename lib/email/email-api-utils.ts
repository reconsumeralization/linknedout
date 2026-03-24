import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"

const CORS_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS"
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization"

export function emailApiResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
      "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    },
  })
}

export function emailApiOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
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
