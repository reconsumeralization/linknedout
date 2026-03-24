import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("A2A_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "A2A_RATE_LIMIT_MAX",
  "A2A_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const PublishCardSchema = z.object({
  action: z.literal("publish_card"),
  displayName: z.string().min(1).max(200),
  capabilities: z.array(z.string().min(1).max(120)).min(1).max(50),
  pricingTokensPerTask: z.number().min(0).optional(),
  trustScoreMinimum: z.number().min(0).max(100).optional(),
  agentDefinitionId: z.string().max(120).optional(),
})

const UpdateCardSchema = z.object({
  action: z.literal("update_card"),
  cardId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200).optional(),
  capabilities: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
  pricingTokensPerTask: z.number().min(0).optional(),
  trustScoreMinimum: z.number().min(0).max(100).optional(),
  agentDefinitionId: z.string().max(120).optional(),
  availability: z.string().max(40).optional(),
})

const DiscoverAgentsSchema = z.object({
  action: z.literal("discover_agents"),
  capability: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(100).optional(),
})

const InitiateHandshakeSchema = z.object({
  action: z.literal("initiate_handshake"),
  providerAgentCardId: z.string().min(1).max(120),
  taskDescription: z.string().min(1).max(5000),
  taskPayload: z.record(z.unknown()).optional(),
})

const AcceptHandshakeSchema = z.object({
  action: z.literal("accept_handshake"),
  handshakeId: z.string().min(1).max(120),
  agreedPriceTokens: z.number().min(0),
})

const DeliverResultSchema = z.object({
  action: z.literal("deliver_result"),
  handshakeId: z.string().min(1).max(120),
  resultPayload: z.record(z.unknown()),
})

const RateHandshakeSchema = z.object({
  action: z.literal("rate_handshake"),
  handshakeId: z.string().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(2000).optional(),
})

const ListMyHandshakesSchema = z.object({
  action: z.literal("list_my_handshakes"),
  role: z.enum(["requester", "provider"]).optional(),
  status: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  PublishCardSchema,
  UpdateCardSchema,
  DiscoverAgentsSchema,
  InitiateHandshakeSchema,
  AcceptHandshakeSchema,
  DeliverResultSchema,
  RateHandshakeSchema,
  ListMyHandshakesSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `a2a:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

function createSupabaseClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  )
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

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

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponse({ ok: false, error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const parsed = PostRequestSchema.safeParse(parsedBody.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request payload.",
        details: parsed.error.flatten(),
      },
      400,
      rateLimit,
    )
  }

  const input: PostRequest = parsed.data
  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for this action." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const accessToken = authResult.auth.accessToken
  const userId = authResult.auth.userId
  const supabase = createSupabaseClient(accessToken)

  /* ---- publish_card ---- */
  if (input.action === "publish_card") {
    const { data, error } = await supabase
      .from("a2a_agent_cards")
      .insert({
        owner_user_id: userId,
        display_name: input.displayName,
        capabilities: input.capabilities,
        pricing_tokens_per_task: input.pricingTokensPerTask ?? null,
        trust_score_minimum: input.trustScoreMinimum ?? null,
        agent_definition_id: input.agentDefinitionId ?? null,
        availability: "available",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, card: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_card ---- */
  if (input.action === "update_card") {
    const updates: Record<string, unknown> = {}
    if (input.displayName !== undefined) updates.display_name = input.displayName
    if (input.capabilities !== undefined) updates.capabilities = input.capabilities
    if (input.pricingTokensPerTask !== undefined) updates.pricing_tokens_per_task = input.pricingTokensPerTask
    if (input.trustScoreMinimum !== undefined) updates.trust_score_minimum = input.trustScoreMinimum
    if (input.agentDefinitionId !== undefined) updates.agent_definition_id = input.agentDefinitionId
    if (input.availability !== undefined) updates.availability = input.availability

    const { data, error } = await supabase
      .from("a2a_agent_cards")
      .update(updates)
      .eq("id", input.cardId)
      .eq("owner_user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, card: data },
      200,
      rateLimit,
    )
  }

  /* ---- discover_agents ---- */
  if (input.action === "discover_agents") {
    const limit = input.limit ?? 20

    const { data, error } = await supabase
      .from("a2a_agent_cards")
      .select("*")
      .contains("capabilities", [input.capability])
      .eq("availability", "available")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, agents: data },
      200,
      rateLimit,
    )
  }

  /* ---- initiate_handshake ---- */
  if (input.action === "initiate_handshake") {
    // Look up the agent card to get the provider user id
    const { data: card, error: cardError } = await supabase
      .from("a2a_agent_cards")
      .select("id, owner_user_id")
      .eq("id", input.providerAgentCardId)
      .single()

    if (cardError || !card) {
      return jsonResponse({ ok: false, error: cardError?.message ?? "Agent card not found." }, 404, rateLimit)
    }

    const { data, error } = await supabase
      .from("a2a_handshakes")
      .insert({
        requester_user_id: userId,
        provider_user_id: card.owner_user_id,
        provider_agent_card_id: input.providerAgentCardId,
        task_description: input.taskDescription,
        task_payload: input.taskPayload ?? null,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, handshake: data },
      200,
      rateLimit,
    )
  }

  /* ---- accept_handshake ---- */
  if (input.action === "accept_handshake") {
    const { data, error } = await supabase
      .from("a2a_handshakes")
      .update({
        status: "accepted",
        agreed_price_tokens: input.agreedPriceTokens,
      })
      .eq("id", input.handshakeId)
      .eq("provider_user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, handshake: data },
      200,
      rateLimit,
    )
  }

  /* ---- deliver_result ---- */
  if (input.action === "deliver_result") {
    const { data, error } = await supabase
      .from("a2a_handshakes")
      .update({
        status: "completed",
        result_payload: input.resultPayload,
      })
      .eq("id", input.handshakeId)
      .eq("provider_user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, handshake: data },
      200,
      rateLimit,
    )
  }

  /* ---- rate_handshake ---- */
  if (input.action === "rate_handshake") {
    const { data, error } = await supabase
      .from("a2a_handshakes")
      .update({
        quality_rating: input.rating,
        quality_feedback: input.feedback ?? null,
      })
      .eq("id", input.handshakeId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, handshake: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_my_handshakes ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("a2a_handshakes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.role === "requester") {
    query = query.eq("requester_user_id", userId)
  } else if (input.role === "provider") {
    query = query.eq("provider_user_id", userId)
  } else {
    query = query.or(`requester_user_id.eq.${userId},provider_user_id.eq.${userId}`)
  }

  if (input.status) {
    query = query.eq("status", input.status)
  }

  const { data, error } = await query

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, handshakes: data },
    200,
    rateLimit,
  )
}
