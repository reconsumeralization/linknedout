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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("GOVERNANCE_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "GOVERNANCE_RATE_LIMIT_MAX",
  "GOVERNANCE_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                        */
/* ------------------------------------------------------------------ */

const ProposalTypeSchema = z.enum([
  "policy_change",
  "resource_allocation",
  "member_admission",
  "member_removal",
  "parameter_update",
  "custom",
])

const ProposeSchema = z.object({
  action: z.literal("propose"),
  tribeId: z.string().min(1).max(120),
  proposalType: ProposalTypeSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  evidenceIds: z.array(z.string().min(1).max(120)).max(20).optional(),
  quorumThreshold: z.number().min(0).max(1).optional().default(0.5),
  approvalThreshold: z.number().min(0).max(1).optional().default(0.6),
  expiresAt: z.string().datetime().optional(),
  executionPayload: z.record(z.unknown()).optional(),
})

const VoteSchema = z.object({
  action: z.literal("vote"),
  proposalId: z.string().min(1).max(120),
  vote: z.enum(["approve", "reject", "abstain"]),
  reasoning: z.string().max(2000).optional(),
})

const DelegateSchema = z.object({
  action: z.literal("delegate"),
  delegateUserId: z.string().min(1).max(120),
  tribeId: z.string().min(1).max(120),
  domain: z.enum(["all", "technical", "financial", "operational"]),
  revoke: z.boolean().optional(),
})

const ExecuteSchema = z.object({
  action: z.literal("execute"),
  proposalId: z.string().min(1).max(120),
})

const ListProposalsSchema = z.object({
  action: z.literal("list_proposals"),
  tribeId: z.string().min(1).max(120),
  status: z.string().min(1).max(60).optional(),
})

const GetProposalSchema = z.object({
  action: z.literal("get_proposal"),
  proposalId: z.string().min(1).max(120),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  ProposeSchema,
  VoteSchema,
  DelegateSchema,
  ExecuteSchema,
  ListProposalsSchema,
  GetProposalSchema,
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
    key: `governance:${clientAddress}`,
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

  /* ---- propose ---- */
  if (input.action === "propose") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("governance_proposals")
      .insert({
        tribe_id: input.tribeId,
        proposer_user_id: userId,
        proposal_type: input.proposalType,
        title: input.title,
        description: input.description,
        evidence_ids: input.evidenceIds ?? [],
        quorum_threshold: input.quorumThreshold,
        approval_threshold: input.approvalThreshold,
        expires_at: input.expiresAt ?? null,
        execution_payload: input.executionPayload ?? null,
        status: "open",
        vote_summary: { approve: 0, reject: 0, abstain: 0, total_weight: 0 },
      })
      .select("*")
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, proposal: data },
      200,
      rateLimit,
    )
  }

  /* ---- vote ---- */
  if (input.action === "vote") {
    const supabase = userClient(accessToken)
    const svc = serviceClient()

    // Compute voting power
    const { data: votingPower, error: vpError } = await svc.rpc("compute_voting_power", {
      p_user_id: userId,
      p_proposal_id: input.proposalId,
    })
    if (vpError) {
      return jsonResponse({ ok: false, error: vpError.message }, 400, rateLimit)
    }

    // Check for delegation
    const { data: delegationChain, error: delError } = await svc.rpc("resolve_delegation_chain", {
      p_user_id: userId,
      p_proposal_id: input.proposalId,
    })
    if (delError) {
      return jsonResponse({ ok: false, error: delError.message }, 400, rateLimit)
    }

    // Insert vote
    const { data: voteData, error: voteError } = await supabase
      .from("governance_votes")
      .insert({
        proposal_id: input.proposalId,
        voter_user_id: userId,
        vote: input.vote,
        reasoning: input.reasoning ?? null,
        voting_power: votingPower ?? 1,
        delegation_chain: delegationChain ?? null,
      })
      .select("*")
      .single()

    if (voteError) {
      return jsonResponse({ ok: false, error: voteError.message }, 400, rateLimit)
    }

    // Update vote summary on the proposal (aggregate all votes)
    const { data: allVotes, error: aggError } = await supabase
      .from("governance_votes")
      .select("vote, voting_power")
      .eq("proposal_id", input.proposalId)

    if (!aggError && allVotes) {
      const summary = { approve: 0, reject: 0, abstain: 0, total_weight: 0 }
      for (const v of allVotes) {
        const weight = typeof v.voting_power === "number" ? v.voting_power : 1
        summary.total_weight += weight
        if (v.vote === "approve") summary.approve += weight
        else if (v.vote === "reject") summary.reject += weight
        else if (v.vote === "abstain") summary.abstain += weight
      }
      await supabase
        .from("governance_proposals")
        .update({ vote_summary: summary })
        .eq("id", input.proposalId)
    }

    return jsonResponse(
      { ok: true, action: input.action, vote: voteData },
      200,
      rateLimit,
    )
  }

  /* ---- delegate ---- */
  if (input.action === "delegate") {
    const supabase = userClient(accessToken)

    if (input.revoke) {
      const { data, error } = await supabase
        .from("governance_delegations")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("delegator_user_id", userId)
        .eq("delegate_user_id", input.delegateUserId)
        .eq("tribe_id", input.tribeId)
        .eq("domain", input.domain)
        .select("*")
        .single()

      if (error) {
        return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
      }
      return jsonResponse(
        { ok: true, action: input.action, delegation: data },
        200,
        rateLimit,
      )
    }

    const { data, error } = await supabase
      .from("governance_delegations")
      .upsert(
        {
          delegator_user_id: userId,
          delegate_user_id: input.delegateUserId,
          tribe_id: input.tribeId,
          domain: input.domain,
          is_active: true,
          revoked_at: null,
        },
        { onConflict: "delegator_user_id,delegate_user_id,tribe_id,domain" },
      )
      .select("*")
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }
    return jsonResponse(
      { ok: true, action: input.action, delegation: data },
      200,
      rateLimit,
    )
  }

  /* ---- execute ---- */
  if (input.action === "execute") {
    const supabase = userClient(accessToken)

    // Verify proposal status is 'passed'
    const { data: proposal, error: fetchErr } = await supabase
      .from("governance_proposals")
      .select("*")
      .eq("id", input.proposalId)
      .single()

    if (fetchErr) {
      return jsonResponse({ ok: false, error: fetchErr.message }, 400, rateLimit)
    }
    if (proposal.status !== "passed") {
      return jsonResponse(
        { ok: false, error: `Proposal status is '${proposal.status}', expected 'passed'.` },
        400,
        rateLimit,
      )
    }

    // Update status to 'executed'
    const { error: updateErr } = await supabase
      .from("governance_proposals")
      .update({ status: "executed" })
      .eq("id", input.proposalId)

    if (updateErr) {
      return jsonResponse({ ok: false, error: updateErr.message }, 400, rateLimit)
    }

    // Insert execution log entry
    const { data: logEntry, error: logErr } = await supabase
      .from("governance_execution_log")
      .insert({
        proposal_id: input.proposalId,
        executed_by_user_id: userId,
        execution_payload: proposal.execution_payload ?? null,
        status: "completed",
      })
      .select("*")
      .single()

    if (logErr) {
      return jsonResponse({ ok: false, error: logErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, executionLog: logEntry },
      200,
      rateLimit,
    )
  }

  /* ---- list_proposals ---- */
  if (input.action === "list_proposals") {
    const supabase = userClient(accessToken)

    let query = supabase
      .from("governance_proposals")
      .select("*")
      .eq("tribe_id", input.tribeId)
      .order("created_at", { ascending: false })

    if (input.status) {
      query = query.eq("status", input.status)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, proposals: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_proposal ---- */
  if (input.action === "get_proposal") {
    const supabase = userClient(accessToken)

    const { data: proposal, error: propErr } = await supabase
      .from("governance_proposals")
      .select("*")
      .eq("id", input.proposalId)
      .single()

    if (propErr) {
      return jsonResponse({ ok: false, error: propErr.message }, 400, rateLimit)
    }

    const { data: votes, error: votesErr } = await supabase
      .from("governance_votes")
      .select("*")
      .eq("proposal_id", input.proposalId)
      .order("created_at", { ascending: true })

    if (votesErr) {
      return jsonResponse({ ok: false, error: votesErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, proposal: { ...proposal, votes: votes ?? [] } },
      200,
      rateLimit,
    )
  }

  return jsonResponse({ ok: false, error: "Unknown action." }, 400, rateLimit)
}
