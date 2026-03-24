import { GET as baseGet, OPTIONS as baseOptions, POST as basePost } from "../../route"

export const runtime = "nodejs"

function withSupabaseSubagent(req: Request): Request {
  const url = new URL(req.url)
  url.pathname = "/api/realtime/session"
  url.searchParams.set("subagent", "supabase")
  return new Request(url.toString(), req)
}

export async function GET(req: Request): Promise<Response> {
  return baseGet(withSupabaseSubagent(req))
}

export async function POST(req: Request): Promise<Response> {
  return basePost(withSupabaseSubagent(req))
}

export async function OPTIONS(req: Request): Promise<Response> {
  void req
  return baseOptions()
}
