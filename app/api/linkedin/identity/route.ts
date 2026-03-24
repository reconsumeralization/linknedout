/**
 * GET /api/linkedin/identity — return current user's LinkedIn identity (from Supabase).
 * Requires Authorization: Bearer <Supabase session>.
 * Returns public fields only (no access_token).
 */

import { getLinkedInIdentity } from "@/lib/linkedin/linkedin-identity-server"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const auth = await resolveSupabaseAuthContextFromRequest(req)
  if (!auth?.userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized", message: "Sign in required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )
  }

  const identity = await getLinkedInIdentity(auth.userId)
  return new Response(
    JSON.stringify({
      ok: true,
      identity: identity ?? null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  )
}
