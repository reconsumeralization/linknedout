import { resolveSupabaseClientFromRequest } from "@/lib/shared/resolve-request-keys"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"
import { createSovereignTools } from "@/lib/sovereign/sovereign-tools"
import { NextResponse } from "next/server"

export const maxDuration = 120

/**
 * Unified Sovereign API — dispatches to any of the 148 sovereign tools
 * POST /api/sovereign { tool: "toolName", params: { ... } }
 * GET  /api/sovereign — lists all available tools
 */
export async function POST(req: Request) {
  try {
    const authContext = await resolveSupabaseAuthContextFromRequest(req)
    if (!authContext?.userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 })
    }

    const body = await req.json()
    const toolName = body.tool as string
    const params = body.params ?? {}

    if (!toolName) {
      return NextResponse.json({ ok: false, error: "Missing 'tool' field. POST { tool: 'toolName', params: {} }" }, { status: 400 })
    }

    const tools = createSovereignTools(authContext)
    const toolDef = (tools as Record<string, unknown>)[toolName]

    if (!toolDef) {
      return NextResponse.json(
        { ok: false, error: `Tool "${toolName}" not found. Use GET /api/sovereign for available tools.` },
        { status: 404 },
      )
    }

    const result = await (toolDef as unknown as { execute: (input: Record<string, unknown>) => Promise<unknown> }).execute(params)
    return NextResponse.json({ ok: true, tool: toolName, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  // Return tool categories for discovery
  const categories = [
    { range: "#1-128", name: "LinkedIn CRM & Intelligence", route: "/api/chat" },
    { range: "#129-131", name: "Recursive Self-Improvement", route: "/api/evolution" },
    { range: "#132-135", name: "SherLog Forensics", route: "/api/sherlog" },
    { range: "#136-139", name: "LeWorldModel / Latent Physics", route: "/api/imagination" },
    { range: "#140-145", name: "Pacific Rim Shield", route: "/api/shield" },
    { range: "#146-149", name: "Interplanetary Pipeline", route: "/api/pipeline" },
    { range: "#150-155", name: "Recursive Meta-Agent", route: "/api/meta-agent" },
    { range: "#156-160", name: "Invisible Infrastructure", route: "/api/invisible" },
    { range: "#161-164", name: "Diplomatic Integrity", route: "/api/diplomatic" },
    { range: "#165-168", name: "Blockade Bypass", route: "/api/blockade" },
    { range: "#169-172", name: "Forensic Accountability", route: "/api/accountability" },
    { range: "#173-176", name: "A2A + Bounty + Decoupling + Experience", route: "/api/sovereign" },
    { range: "#177-180", name: "Morpheus Protocol", route: "/api/morpheus" },
    { range: "#181-197", name: "LinkedIn Workflow Automation", route: "/api/linkedin/workflow" },
    { range: "#198-201", name: "DNS Sovereign Resolver", route: "/api/sovereign" },
    { range: "#202-207", name: "Singularity Ascent", route: "/api/sovereign" },
    { range: "#208-214", name: "Nuance Layer / Circuit Breakers", route: "/api/sovereign" },
    { range: "#215-221", name: "Sovereign Health & Atoms", route: "/api/sovereign" },
    { range: "#222-228", name: "Validation & Integrity Stack", route: "/api/sovereign" },
    { range: "#229-232", name: "Harness Evolution", route: "/api/sovereign" },
    { range: "#233-236", name: "Geopolitical Integrity", route: "/api/sovereign" },
    { range: "#237-240", name: "Cosmological Intelligence", route: "/api/sovereign" },
    { range: "#241-247", name: "Cosmological Nuance", route: "/api/sovereign" },
    { range: "#248-252", name: "Solar Sovereign", route: "/api/sovereign" },
    { range: "#253-256", name: "Archeological Sovereign", route: "/api/sovereign" },
    { range: "#257-260", name: "Cognitive Virology", route: "/api/sovereign" },
    { range: "#261-267", name: "Phenomenological Sanctuary", route: "/api/sovereign" },
    { range: "#268-271", name: "Sovereign Soul", route: "/api/sovereign" },
    { range: "#272-276", name: "Affective Sovereign", route: "/api/sovereign" },
    { range: "#277-280", name: "Economic Sovereign", route: "/api/sovereign" },
  ]

  return NextResponse.json({
    ok: true,
    totalTools: 280,
    totalCategories: categories.length,
    usage: "POST /api/sovereign { tool: 'toolName', params: { ... } }",
    categories,
  })
}
