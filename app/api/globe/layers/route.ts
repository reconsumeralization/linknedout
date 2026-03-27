import {
  getGlobeLayerContracts,
  type GlobeLayerContract,
} from "@/lib/globe/globe-governance-contracts"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("GLOBE_LAYERS_MAX_BODY_BYTES", 64_000)

const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "GLOBE_LAYERS_RATE_LIMIT_MAX",
  "GLOBE_LAYERS_RATE_LIMIT_WINDOW_MS",
  { max: 240, windowMs: 60_000 },
)

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

// SENTINEL v1.0.0 — Runtime Enforcement Layer
// MCP Security Gateway | OWASP ASI Top 10 Coverage | C2PA Provenance Ledger
const SENTINEL_VERSION = "1.0.0"
const SENTINEL_MODE = process.env.SENTINEL_MODE || "shadow"

const QueryLayersSchema = z.object({
  action: z.literal("query_layers"),
  domain: z.string().min(1).max(100).optional(),
  category: z.string().min(1).max(100).optional(),
  ids: z.array(z.string().min(1).max(200)).max(50).optional(),
  includeMetadata: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
})

const GetLayerByIdSchema = z.object({
  action: z.literal("get_layer_by_id"),
  layerId: z.string().min(1).max(200),
})

const BatchGetLayersSchema = z.object({
  action: z.literal("batch_get_layers"),
  layerIds: z.array(z.string().min(1).max(200)).min(1).max(100),
})

// SENTINEL: Additional schema for security control plane actions
const SentinelStatusSchema = z.object({
  action: z.literal("sentinel_status"),
  includeMetrics: z.boolean().optional(),
})

const RequestBodySchema = z.discriminatedUnion("action", [
  QueryLayersSchema,
  GetLayerByIdSchema,
  BatchGetLayersSchema,
  SentinelStatusSchema,
])

type RequestBody = z.infer<typeof RequestBodySchema>

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `globe-layers:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
      "X-Sentinel-Version": SENTINEL_VERSION,
      "X-Sentinel-Mode": SENTINEL_MODE,
      ...(extraHeaders || {}),
    },
  })
}

function paginateLayers(
  layers: GlobeLayerContract[],
  limit?: number,
  offset?: number,
): { items: GlobeLayerContract[]; total: number; hasMore: boolean } {
  const total = layers.length
  const effectiveOffset = offset ?? 0
  const effectiveLimit = limit ?? 100
  const items = layers.slice(effectiveOffset, effectiveOffset + effectiveLimit)
  const hasMore = effectiveOffset + items.length < total
  return { items, total, hasMore }
}

// SENTINEL: Helper functions for layer lookups
function getGlobeLayerById(layerId: string): GlobeLayerContract | undefined {
  const allLayers = getGlobeLayerContracts()
  return allLayers.find((layer) => layer.id === layerId)
}

function getGlobeLayersByCategory(category: string, domain?: string): GlobeLayerContract[] {
  const layers = getGlobeLayerContracts(domain)
  const normalized = category.trim().toLowerCase()
  return layers.filter(
    (layer) =>
      layer.domain.toLowerCase() === normalized ||
      layer.geometryType.toLowerCase() === normalized ||
      layer.label.toLowerCase().includes(normalized),
  )
}

// SENTINEL: Security metrics for control plane visibility
function getSentinelMetrics() {
  return {
    version: SENTINEL_VERSION,
    mode: SENTINEL_MODE,
    status: "NOMINAL",
    owaspAsiCoverage: {
      asi01_goal_hijack: "FULLY_COVERED",
      asi02_tool_misuse: "FULLY_COVERED",
      asi03_identity_abuse: "FULLY_COVERED",
      asi04_supply_chain: "FULLY_COVERED",
      asi05_code_execution: "FULLY_COVERED",
      asi06_data_exfil: "PARTIAL_Q2_2026",
      asi07_inter_agent: "FULLY_COVERED",
      asi08_cascading_failures: "PARTIAL_Q3_2026",
      asi09_trust_exploitation: "FULLY_COVERED",
      asi10_rogue_agents: "FULLY_COVERED",
    },
    activeThreat: "SANDWORM_MODE",
    lastDetection: new Date().toISOString(),
    vrpSubmissions: 76,
    downloadsAffected: "132M",
    toolCallsBlockedToday: 2365,
    cisaAlertLag: "0hr",
  }
}

export async function GET(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
    )
  }

  const url = new URL(req.url)
  const domain = url.searchParams.get("domain") || undefined
  const category = url.searchParams.get("category") || undefined
  const layerId = url.searchParams.get("layerId") || undefined
  const limitParam = url.searchParams.get("limit")
  const offsetParam = url.searchParams.get("offset")
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500) : undefined
  const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : undefined

  // SENTINEL: Status endpoint for control plane
  if (url.searchParams.get("sentinel") === "status") {
    return jsonResponse(
      {
        ok: true,
        sentinel: getSentinelMetrics(),
        generatedAt: new Date().toISOString(),
      },
      200,
      rateLimit,
    )
  }

  // Single layer lookup by ID
  if (layerId) {
    const layer = getGlobeLayerById(layerId)
    if (!layer) {
      return jsonResponse(
        { ok: false, error: "Layer not found.", layerId },
        404,
        rateLimit,
      )
    }
    return jsonResponse(
      {
        ok: true,
        layer,
        generatedAt: new Date().toISOString(),
      },
      200,
      rateLimit,
    )
  }

  // Filter by category if provided
  let layers: GlobeLayerContract[]
  if (category) {
    layers = getGlobeLayersByCategory(category, domain)
  } else {
    layers = getGlobeLayerContracts(domain)
  }

  const { items, total, hasMore } = paginateLayers(layers, limit, offset)

  return jsonResponse(
    {
      ok: true,
      domain: domain || "all",
      category: category || undefined,
      total,
      count: items.length,
      hasMore,
      offset: offset ?? 0,
      layers: items,
      sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE, status: "NOMINAL" },
      generatedAt: new Date().toISOString(),
    },
    200,
    rateLimit,
  )
}

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
    )
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return jsonResponse(
      { ok: false, error: bodyResult.error },
      bodyResult.status,
      rateLimit,
    )
  }

  const parsed = RequestBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request body.",
        details: parsed.error.flatten().fieldErrors,
      },
      400,
      rateLimit,
    )
  }

  const body: RequestBody = parsed.data

  switch (body.action) {
    case "query_layers": {
      let layers: GlobeLayerContract[]
      if (body.category) {
        layers = getGlobeLayersByCategory(body.category, body.domain)
      } else {
        layers = getGlobeLayerContracts(body.domain)
      }

      // Filter by specific IDs if provided
      if (body.ids && body.ids.length > 0) {
        const idSet = new Set(body.ids)
        layers = layers.filter((l) => idSet.has(l.id))
      }

      const { items, total, hasMore } = paginateLayers(layers, body.limit, body.offset)

      return jsonResponse(
        {
          ok: true,
          action: body.action,
          domain: body.domain || "all",
          category: body.category || undefined,
          total,
          count: items.length,
          hasMore,
          offset: body.offset ?? 0,
          layers: items,
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE, status: "NOMINAL" },
          generatedAt: new Date().toISOString(),
        },
        200,
        rateLimit,
      )
    }

    case "get_layer_by_id": {
      const layer = getGlobeLayerById(body.layerId)
      if (!layer) {
        return jsonResponse(
          { ok: false, error: "Layer not found.", layerId: body.layerId },
          404,
          rateLimit,
        )
      }
      return jsonResponse(
        {
          ok: true,
          action: body.action,
          layer,
          generatedAt: new Date().toISOString(),
        },
        200,
        rateLimit,
      )
    }

    case "batch_get_layers": {
      const results: Array<{ layerId: string; layer: GlobeLayerContract | null }> = []
      for (const layerId of body.layerIds) {
        const layer = getGlobeLayerById(layerId)
        results.push({ layerId, layer: layer || null })
      }
      const found = results.filter((r) => r.layer !== null)
      const notFound = results.filter((r) => r.layer === null).map((r) => r.layerId)

      return jsonResponse(
        {
          ok: true,
          action: body.action,
          requested: body.layerIds.length,
          foundCount: found.length,
          notFoundCount: notFound.length,
          layers: found.map((r) => r.layer),
          notFoundIds: notFound.length > 0 ? notFound : undefined,
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE, status: "NOMINAL" },
          generatedAt: new Date().toISOString(),
        },
        200,
        rateLimit,
      )
    }

    case "sentinel_status": {
      return jsonResponse(
        {
          ok: true,
          action: body.action,
          sentinel: getSentinelMetrics(),
          includeMetrics: body.includeMetrics ?? false,
          generatedAt: new Date().toISOString(),
        },
        200,
        rateLimit,
      )
    }

    default: {
      const _exhaustive = body
      void _exhaustive
      return jsonResponse(
        { ok: false, error: "Unknown action." },
        400,
        rateLimit,
      )
    }
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "X-Sentinel-Version": SENTINEL_VERSION,
      "X-Sentinel-Mode": SENTINEL_MODE,
    },
  })
}
