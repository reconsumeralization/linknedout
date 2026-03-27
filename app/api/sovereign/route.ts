import { resolveSupabaseClientFromRequest } from "@/lib/shared/resolve-request-keys"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"
import { createSovereignTools } from "@/lib/sovereign/sovereign-tools"
import { sanitizeErrorForClient } from "@/lib/shared/error-sanitizer"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
} from "@/lib/shared/request-rate-limit"
import { NextResponse } from "next/server"
import { z } from "zod"

export const maxDuration = 120
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("SOVEREIGN_API_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT = parseRateLimitConfigFromEnv("SOVEREIGN_RATE_LIMIT_MAX", "SOVEREIGN_RATE_LIMIT_WINDOW_MS", { max: 60, windowMs: 60_000 })

const PostBodySchema = z.object({
  tool: z.string().min(1).max(120),
  params: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Unified Sovereign API — dispatches to any of the 148 sovereign tools
 * POST /api/sovereign { tool: "toolName", params: { ... } }
 * GET  /api/sovereign — lists all available tools
 */
export async function POST(req: Request) {
  const rl = await checkRateLimit({ key: `sovereign:${getClientAddressFromRequest(req)}`, max: RATE_LIMIT.max, windowMs: RATE_LIMIT.windowMs })
  if (!rl.allowed) return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429, headers: createRateLimitHeaders(rl) })

  try {
    const authContext = await resolveSupabaseAuthContextFromRequest(req)
    if (!authContext?.userId) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 })
    }

    const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
    if (!parsedBody.ok) {
      return NextResponse.json({ ok: false, error: parsedBody.error }, { status: parsedBody.status })
    }

    const parsed = PostBodySchema.safeParse(parsedBody.value)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request payload.", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const toolName = parsed.data.tool
    const params = parsed.data.params ?? {}

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
    console.error("[sovereign] POST error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: sanitizeErrorForClient(err) }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const includeTools = url.searchParams.get("tools") === "true"

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
    { range: "#467-471", name: "Civic Sovereign", route: "/api/sovereign" },
    { range: "#528-532", name: "Strategic Sovereign", route: "/api/sovereign" },
    { range: "#533-537", name: "Protector Sovereign", route: "/api/sovereign" },
    { range: "#538-542", name: "Global Human", route: "/api/sovereign" },
    { range: "#576-580", name: "Psychological Sovereign", route: "/api/sovereign" },
    { range: "#581-584", name: "Identity Sovereign", route: "/api/sovereign" },
    { range: "#585-589", name: "Thermodynamic Sovereign", route: "/api/sovereign" },
    { range: "#590-594", name: "Project Genesis", route: "/api/sovereign" },
    { range: "ARC", name: "ARC AGI Solver (Active Inference)", route: "/api/sovereign" },
    { range: "BENCH", name: "Self-Improving LLM Benchmark (vs Opus 4.6)", route: "/api/sovereign" },
  ]

  // Optionally include full tool list with descriptions
  let toolList: { name: string; description: string }[] | undefined
  if (includeTools) {
    const tools = createSovereignTools(null)
    toolList = Object.entries(tools).map(([name, t]) => ({
      name,
      description: (t as { description?: string }).description ?? "",
    }))
  }

  return NextResponse.json({
    ok: true,
    totalTools: 329,
    totalCategories: categories.length,
    usage: "POST /api/sovereign { tool: 'toolName', params: { ... } }",
    categories,
    ...(toolList ? { tools: toolList } : {}),
  })
}
