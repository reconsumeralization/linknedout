import { resolveSupabaseClientFromRequest, resolveSupabaseCredentials } from "@/lib/shared/resolve-request-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TableStatus = "present" | "missing" | "unknown"

const REQUIRED_TABLES = [
  "profiles",
  "tribes",
  "projects",
  "company_portfolio",
  "company_agents",
  "operator_decisions",
] as const

async function probeTable(client: NonNullable<ReturnType<typeof resolveSupabaseClientFromRequest>>, table: string): Promise<TableStatus> {
  try {
    const { error } = await client.from(table).select("*").limit(1)
    if (!error) return "present"

    const msg = (error as { message?: string } | null)?.message ?? ""
    // PostgREST typically returns "relation \"public.table\" does not exist" for missing tables.
    if (/does not exist/i.test(msg) || /relation .* does not exist/i.test(msg) || /42P01/i.test(msg)) return "missing"
    return "unknown"
  } catch {
    return "unknown"
  }
}

export async function GET(req: Request) {
  const creds = resolveSupabaseCredentials(req)
  if (!creds) {
    return Response.json(
      {
        ok: false,
        message: "Supabase is not configured (missing URL/anon key).",
        tables: {},
      },
      { status: 200 },
    )
  }

  const client = resolveSupabaseClientFromRequest(req)
  if (!client) {
    return Response.json(
      {
        ok: false,
        message: "Could not create Supabase client for schema check.",
        tables: {},
      },
      { status: 200 },
    )
  }

  const tables: Record<string, TableStatus> = {}
  for (const t of REQUIRED_TABLES) {
    tables[t] = await probeTable(client, t)
  }

  const present = Object.values(tables).filter((v) => v === "present").length
  const missing = Object.values(tables).filter((v) => v === "missing").length
  const unknown = Object.values(tables).filter((v) => v === "unknown").length

  const usingUserKeys = Boolean(req.headers.get("x-user-supabase-url") && req.headers.get("x-user-supabase-anon-key"))

  const recommendedAction =
    missing > 0
      ? usingUserKeys
        ? "Your configured Supabase project is missing required tables. Apply repo migrations (supabase/migrations/) to that project, then re-run this check."
        : "This deployment’s Supabase project is missing required tables. Apply repo migrations (supabase/migrations/) to the Supabase project used by this environment."
      : unknown > 0
        ? "Some tables could not be verified (unknown). Confirm your Supabase credentials and permissions, then retry."
        : "Schema looks good. Next: sign in and import profiles."

  return Response.json(
    {
      ok: true,
      supabase: { url: creds.url, source: usingUserKeys ? "user" : "env" },
      tables,
      summary: { present, missing, unknown, total: REQUIRED_TABLES.length },
      recommendedAction,
    },
    { status: 200 },
  )
}

