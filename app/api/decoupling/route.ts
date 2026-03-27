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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("DECOUPLING_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "DECOUPLING_RATE_LIMIT_MAX",
  "DECOUPLING_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const VestingEntrySchema = z.object({
  description: z.string().max(500),
  valueUsd: z.number().min(0),
  vestingMonths: z.number().int().min(0).optional(),
})

const SovereignIncomeSourceSchema = z.object({
  source: z.string().max(300),
  monthlyUsd: z.number().min(0),
  reliability: z.enum(["stable", "variable", "speculative"]).optional(),
})

const AuditStatusEnum = z.enum([
  "draft",
  "in_progress",
  "completed",
  "archived",
])

const MilestoneStatusEnum = z.enum([
  "pending",
  "in_progress",
  "completed",
  "skipped",
])

const CreateAuditSchema = z.object({
  action: z.literal("create_audit"),
  currentSalaryUsd: z.number().min(0),
  vestingSchedule: z.array(VestingEntrySchema).max(20).optional(),
  benefitsValueUsd: z.number().min(0).optional(),
  stockOptionsValueUsd: z.number().min(0).optional(),
  sovereigntyIncomeUsd: z.number().min(0).optional(),
  sovereignIncomeSources: z.array(SovereignIncomeSourceSchema).max(20).optional(),
})

const UpdateAuditSchema = z.object({
  action: z.literal("update_audit"),
  auditId: z.string().min(1).max(120),
  currentSalaryUsd: z.number().min(0).optional(),
  vestingSchedule: z.array(VestingEntrySchema).max(20).optional(),
  benefitsValueUsd: z.number().min(0).optional(),
  stockOptionsValueUsd: z.number().min(0).optional(),
  sovereigntyIncomeUsd: z.number().min(0).optional(),
  sovereignIncomeSources: z.array(SovereignIncomeSourceSchema).max(20).optional(),
  status: AuditStatusEnum.optional(),
})

const ListMilestonesSchema = z.object({
  action: z.literal("list_milestones"),
  auditId: z.string().min(1).max(120),
})

const UpdateMilestoneSchema = z.object({
  action: z.literal("update_milestone"),
  milestoneId: z.string().min(1).max(120),
  actualIncomeUsd: z.number().min(0).optional(),
  actionsCompleted: z.array(z.string().max(500)).max(50).optional(),
  status: MilestoneStatusEnum.optional(),
})

const CalculateBreakevenSchema = z.object({
  action: z.literal("calculate_breakeven"),
  auditId: z.string().min(1).max(120),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateAuditSchema,
  UpdateAuditSchema,
  ListMilestonesSchema,
  UpdateMilestoneSchema,
  CalculateBreakevenSchema,
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
    key: `decoupling:${clientAddress}`,
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

  /* ---- create_audit ---- */
  if (input.action === "create_audit") {
    const vestingTotal = (input.vestingSchedule ?? []).reduce(
      (sum, v) => sum + v.valueUsd,
      0,
    )
    const totalHandcuffValue =
      (input.currentSalaryUsd * 12) +
      vestingTotal +
      (input.benefitsValueUsd ?? 0) +
      (input.stockOptionsValueUsd ?? 0)

    const sovereignMonthly = input.sovereigntyIncomeUsd ?? 0
    const monthlyCost = input.currentSalaryUsd + (input.benefitsValueUsd ?? 0) / 12
    const breakevenMonths =
      sovereignMonthly > 0 && monthlyCost > 0
        ? Math.ceil(monthlyCost / sovereignMonthly)
        : null

    const { data, error } = await supabase
      .from("decoupling_audits")
      .insert({
        user_id: userId,
        current_salary_usd: input.currentSalaryUsd,
        vesting_schedule: input.vestingSchedule ?? [],
        benefits_value_usd: input.benefitsValueUsd ?? 0,
        stock_options_value_usd: input.stockOptionsValueUsd ?? 0,
        sovereignty_income_usd: input.sovereigntyIncomeUsd ?? 0,
        sovereign_income_sources: input.sovereignIncomeSources ?? [],
        total_handcuff_value: totalHandcuffValue,
        breakeven_months: breakevenMonths,
        status: "draft",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audit: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_audit ---- */
  if (input.action === "update_audit") {
    const updates: Record<string, unknown> = {}
    if (input.currentSalaryUsd !== undefined) updates.current_salary_usd = input.currentSalaryUsd
    if (input.vestingSchedule !== undefined) updates.vesting_schedule = input.vestingSchedule
    if (input.benefitsValueUsd !== undefined) updates.benefits_value_usd = input.benefitsValueUsd
    if (input.stockOptionsValueUsd !== undefined) updates.stock_options_value_usd = input.stockOptionsValueUsd
    if (input.sovereigntyIncomeUsd !== undefined) updates.sovereignty_income_usd = input.sovereigntyIncomeUsd
    if (input.sovereignIncomeSources !== undefined) updates.sovereign_income_sources = input.sovereignIncomeSources
    if (input.status !== undefined) updates.status = input.status

    const { data, error } = await supabase
      .from("decoupling_audits")
      .update(updates)
      .eq("id", input.auditId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audit: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_milestones ---- */
  if (input.action === "list_milestones") {
    // Verify the audit belongs to the user
    const { data: audit, error: auditError } = await supabase
      .from("decoupling_audits")
      .select("id")
      .eq("id", input.auditId)
      .eq("user_id", userId)
      .single()

    if (auditError || !audit) {
      return jsonResponse({ ok: false, error: auditError?.message ?? "Audit not found." }, 404, rateLimit)
    }

    const { data, error } = await supabase
      .from("decoupling_milestones")
      .select("*")
      .eq("audit_id", input.auditId)
      .order("month_number", { ascending: true })

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, milestones: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_milestone ---- */
  if (input.action === "update_milestone") {
    // Verify ownership through the audit
    const { data: milestone, error: fetchError } = await supabase
      .from("decoupling_milestones")
      .select("id, audit_id")
      .eq("id", input.milestoneId)
      .single()

    if (fetchError || !milestone) {
      return jsonResponse({ ok: false, error: fetchError?.message ?? "Milestone not found." }, 404, rateLimit)
    }

    const { data: audit, error: auditError } = await supabase
      .from("decoupling_audits")
      .select("id")
      .eq("id", milestone.audit_id)
      .eq("user_id", userId)
      .single()

    if (auditError || !audit) {
      return jsonResponse({ ok: false, error: "Not authorised to update this milestone." }, 403, rateLimit)
    }

    const updates: Record<string, unknown> = {}
    if (input.actualIncomeUsd !== undefined) updates.actual_income_usd = input.actualIncomeUsd
    if (input.actionsCompleted !== undefined) updates.actions_completed = input.actionsCompleted
    if (input.status !== undefined) updates.status = input.status

    const { data, error } = await supabase
      .from("decoupling_milestones")
      .update(updates)
      .eq("id", input.milestoneId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, milestone: data },
      200,
      rateLimit,
    )
  }

  /* ---- calculate_breakeven ---- */
  // Last branch in the discriminated union
  const { data: audit, error: auditError } = await supabase
    .from("decoupling_audits")
    .select("*")
    .eq("id", input.auditId)
    .eq("user_id", userId)
    .single()

  if (auditError || !audit) {
    return jsonResponse({ ok: false, error: auditError?.message ?? "Audit not found." }, 404, rateLimit)
  }

  // Recalculate based on current sovereign income
  const sovereignMonthly = audit.sovereignty_income_usd ?? 0
  const monthlyCost = (audit.current_salary_usd ?? 0) + ((audit.benefits_value_usd ?? 0) / 12)
  const breakevenMonths =
    sovereignMonthly > 0 && monthlyCost > 0
      ? Math.ceil(monthlyCost / sovereignMonthly)
      : null

  // Recalculate total handcuff value
  const vestingTotal = (audit.vesting_schedule ?? []).reduce(
    (sum: number, v: { valueUsd?: number }) => sum + (v.valueUsd ?? 0),
    0,
  )
  const totalHandcuffValue =
    ((audit.current_salary_usd ?? 0) * 12) +
    vestingTotal +
    (audit.benefits_value_usd ?? 0) +
    (audit.stock_options_value_usd ?? 0)

  const { data: updated, error: updateError } = await supabase
    .from("decoupling_audits")
    .update({
      breakeven_months: breakevenMonths,
      total_handcuff_value: totalHandcuffValue,
    })
    .eq("id", input.auditId)
    .select()
    .single()

  if (updateError) {
    return jsonResponse({ ok: false, error: updateError.message }, 400, rateLimit)
  }

  return jsonResponse(
    {
      ok: true,
      action: input.action,
      audit: updated,
      breakevenMonths,
      totalHandcuffValue,
    },
    200,
    rateLimit,
  )
}
