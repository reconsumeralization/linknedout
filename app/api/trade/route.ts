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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("TRADE_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "TRADE_RATE_LIMIT_MAX",
  "TRADE_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                        */
/* ------------------------------------------------------------------ */

const OfferTypeSchema = z.enum([
  "skill",
  "service",
  "asset",
  "data",
  "credential",
  "custom",
])

const VisibilitySchema = z.enum([
  "public",
  "tribe_only",
  "direct",
  "private",
])

const CreateOfferSchema = z.object({
  action: z.literal("create_offer"),
  offerType: OfferTypeSchema,
  assetDescription: z.string().min(1).max(5000),
  quantity: z.number().min(0),
  minAcceptableReturn: z.record(z.unknown()).optional(),
  visibility: VisibilitySchema,
  targetUserId: z.string().min(1).max(120).optional(),
  targetTribeId: z.string().min(1).max(120).optional(),
  expiresAt: z.string().datetime().optional(),
})

const BrowseOffersSchema = z.object({
  action: z.literal("browse_offers"),
  offerType: z.string().min(1).max(60).optional(),
  visibility: z.string().min(1).max(60).optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
})

const InitiateNegotiationSchema = z.object({
  action: z.literal("initiate_negotiation"),
  offerId: z.string().min(1).max(120),
  partyBAgentConfig: z.record(z.unknown()).optional(),
})

const SubmitRoundSchema = z.object({
  action: z.literal("submit_round"),
  sessionId: z.string().min(1).max(120),
  proposal: z.record(z.unknown()),
})

const AcceptTermsSchema = z.object({
  action: z.literal("accept_terms"),
  sessionId: z.string().min(1).max(120),
  agreedTerms: z.record(z.unknown()),
})

const ExecuteTradeSchema = z.object({
  action: z.literal("execute_trade"),
  sessionId: z.string().min(1).max(120),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateOfferSchema,
  BrowseOffersSchema,
  InitiateNegotiationSchema,
  SubmitRoundSchema,
  AcceptTermsSchema,
  ExecuteTradeSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `trade:${clientAddress}`,
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

function userClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function serviceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                        */
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

  /* ---- create_offer ---- */
  if (input.action === "create_offer") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("sovereign_trade_offers")
      .insert({
        offerer_user_id: userId,
        offer_type: input.offerType,
        asset_description: input.assetDescription,
        quantity: input.quantity,
        min_acceptable_return: input.minAcceptableReturn ?? null,
        visibility: input.visibility,
        target_user_id: input.targetUserId ?? null,
        target_tribe_id: input.targetTribeId ?? null,
        expires_at: input.expiresAt ?? null,
        status: "open",
      })
      .select("*")
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, offer: data },
      200,
      rateLimit,
    )
  }

  /* ---- browse_offers ---- */
  if (input.action === "browse_offers") {
    const supabase = userClient(accessToken)

    let query = supabase
      .from("sovereign_trade_offers")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1)

    if (input.offerType) {
      query = query.eq("offer_type", input.offerType)
    }
    if (input.visibility) {
      query = query.eq("visibility", input.visibility)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, offers: data },
      200,
      rateLimit,
    )
  }

  /* ---- initiate_negotiation ---- */
  if (input.action === "initiate_negotiation") {
    const supabase = userClient(accessToken)

    // Look up the offer
    const { data: offer, error: offerErr } = await supabase
      .from("sovereign_trade_offers")
      .select("*")
      .eq("id", input.offerId)
      .eq("status", "open")
      .single()

    if (offerErr) {
      return jsonResponse({ ok: false, error: offerErr.message }, 400, rateLimit)
    }

    // Create negotiation session
    const { data: session, error: sessionErr } = await supabase
      .from("sovereign_trade_sessions")
      .insert({
        offer_id: input.offerId,
        party_a: offer.offerer_user_id,
        party_b: userId,
        party_b_agent_config: input.partyBAgentConfig ?? null,
        status: "initializing",
        current_round: 0,
        negotiation_rounds: [],
      })
      .select("*")
      .single()

    if (sessionErr) {
      return jsonResponse({ ok: false, error: sessionErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, session },
      200,
      rateLimit,
    )
  }

  /* ---- submit_round ---- */
  if (input.action === "submit_round") {
    const supabase = userClient(accessToken)

    // Fetch current session
    const { data: session, error: fetchErr } = await supabase
      .from("sovereign_trade_sessions")
      .select("*")
      .eq("id", input.sessionId)
      .single()

    if (fetchErr) {
      return jsonResponse({ ok: false, error: fetchErr.message }, 400, rateLimit)
    }

    if (session.party_a !== userId && session.party_b !== userId) {
      return jsonResponse(
        { ok: false, error: "You are not a party to this negotiation session." },
        403,
        rateLimit,
      )
    }

    // Append to negotiation_rounds and increment current_round
    const updatedRounds = [
      ...(session.negotiation_rounds ?? []),
      {
        round: (session.current_round ?? 0) + 1,
        submitted_by: userId,
        proposal: input.proposal,
        submitted_at: new Date().toISOString(),
      },
    ]

    const { data: updated, error: updateErr } = await supabase
      .from("sovereign_trade_sessions")
      .update({
        negotiation_rounds: updatedRounds,
        current_round: (session.current_round ?? 0) + 1,
      })
      .eq("id", input.sessionId)
      .select("*")
      .single()

    if (updateErr) {
      return jsonResponse({ ok: false, error: updateErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, session: updated },
      200,
      rateLimit,
    )
  }

  /* ---- accept_terms ---- */
  if (input.action === "accept_terms") {
    const supabase = userClient(accessToken)

    // Fetch session
    const { data: session, error: fetchErr } = await supabase
      .from("sovereign_trade_sessions")
      .select("*")
      .eq("id", input.sessionId)
      .single()

    if (fetchErr) {
      return jsonResponse({ ok: false, error: fetchErr.message }, 400, rateLimit)
    }

    if (session.party_a !== userId && session.party_b !== userId) {
      return jsonResponse(
        { ok: false, error: "You are not a party to this negotiation session." },
        403,
        rateLimit,
      )
    }

    // Update session status to agreement_reached
    const { error: updateErr } = await supabase
      .from("sovereign_trade_sessions")
      .update({
        status: "agreement_reached",
        agreed_terms: input.agreedTerms,
      })
      .eq("id", input.sessionId)

    if (updateErr) {
      return jsonResponse({ ok: false, error: updateErr.message }, 400, rateLimit)
    }

    // Create escrow entries for both parties
    const { data: escrow, error: escrowErr } = await supabase
      .from("sovereign_trade_escrow")
      .insert([
        {
          session_id: input.sessionId,
          party_user_id: session.party_a,
          agreed_terms: input.agreedTerms,
          status: "held",
        },
        {
          session_id: input.sessionId,
          party_user_id: session.party_b,
          agreed_terms: input.agreedTerms,
          status: "held",
        },
      ])
      .select("*")

    if (escrowErr) {
      return jsonResponse({ ok: false, error: escrowErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, escrow },
      200,
      rateLimit,
    )
  }

  /* ---- execute_trade ---- */
  if (input.action === "execute_trade") {
    const supabase = userClient(accessToken)

    // Verify session is in agreement_reached
    const { data: session, error: fetchErr } = await supabase
      .from("sovereign_trade_sessions")
      .select("*")
      .eq("id", input.sessionId)
      .single()

    if (fetchErr) {
      return jsonResponse({ ok: false, error: fetchErr.message }, 400, rateLimit)
    }

    if (session.status !== "agreement_reached") {
      return jsonResponse(
        { ok: false, error: `Session status is '${session.status}', expected 'agreement_reached'.` },
        400,
        rateLimit,
      )
    }

    // Release escrow
    const { error: escrowErr } = await supabase
      .from("sovereign_trade_escrow")
      .update({ status: "released" })
      .eq("session_id", input.sessionId)

    if (escrowErr) {
      return jsonResponse({ ok: false, error: escrowErr.message }, 400, rateLimit)
    }

    // Update session status to ratified
    const { data: updated, error: updateErr } = await supabase
      .from("sovereign_trade_sessions")
      .update({ status: "ratified" })
      .eq("id", input.sessionId)
      .select("*")
      .single()

    if (updateErr) {
      return jsonResponse({ ok: false, error: updateErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, session: updated },
      200,
      rateLimit,
    )
  }

  return jsonResponse({ ok: false, error: "Unknown action." }, 400, rateLimit)
}
