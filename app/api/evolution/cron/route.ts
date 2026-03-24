import { runEvolutionLoop } from "@/lib/sovereign/evolution-loop"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CRON_SECRET = process.env.EVOLUTION_CRON_SECRET || ""

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers: COMMON_HEADERS })
}

export async function POST(req: Request): Promise<Response> {
  // Auth: bearer token or x-cron-secret header
  const authHeader = req.headers.get("authorization") ?? ""
  const cronHeader = req.headers.get("x-cron-secret") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  const isAuthorized =
    !CRON_SECRET || // If no secret configured, allow in dev
    bearerToken === CRON_SECRET ||
    cronHeader === CRON_SECRET

  if (!isAuthorized) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401)
  }

  // Determine mode: if Supabase is configured and we have a token, go live
  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  const mode = hasSupabase ? "live" : "demo"

  try {
    const result = await runEvolutionLoop(mode, bearerToken || undefined)
    return jsonResponse({ ok: true, result }, 200)
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Evolution loop failed." },
      500,
    )
  }
}

export async function GET(): Promise<Response> {
  // GET returns demo mode result (no auth required, read-only)
  const result = await runEvolutionLoop("demo")
  return jsonResponse({ ok: true, result }, 200)
}
