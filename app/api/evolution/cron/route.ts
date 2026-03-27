import { runEvolutionLoop } from "@/lib/sovereign/evolution-loop"
import { timingSafeEqual } from "node:crypto"

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

function secretsEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8")
  const receivedBuffer = Buffer.from(received, "utf8")
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(req: Request): Promise<Response> {
  // Auth: bearer token or x-cron-secret header
  const authHeader = req.headers.get("authorization") ?? ""
  const cronHeader = req.headers.get("x-cron-secret") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if (!CRON_SECRET) {
    return jsonResponse({ ok: false, error: "Server misconfigured: EVOLUTION_CRON_SECRET is required." }, 503)
  }

  const isAuthorized = secretsEqual(CRON_SECRET, bearerToken) || secretsEqual(CRON_SECRET, cronHeader)

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

export async function GET(req: Request): Promise<Response> {
  // Vercel Cron triggers via GET — check for cron secret
  const cronHeader = req.headers.get("x-cron-secret") ?? ""
  const authHeader = req.headers.get("authorization") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  const isCronAuthorized = CRON_SECRET && (
    secretsEqual(CRON_SECRET, cronHeader) || secretsEqual(CRON_SECRET, bearerToken)
  )

  if (isCronAuthorized) {
    const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    const mode = hasSupabase ? "live" : "demo"
    try {
      const result = await runEvolutionLoop(mode, bearerToken || undefined)
      return jsonResponse({ ok: true, result }, 200)
    } catch (err) {
      return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Evolution loop failed." }, 500)
    }
  }

  // Unauthenticated GET returns demo
  const result = await runEvolutionLoop("demo")
  return jsonResponse({ ok: true, result }, 200)
}
