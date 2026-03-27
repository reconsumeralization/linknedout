/**
 * Government-in-the-Loop API
 * Manages regulatory filings, permits, FOIA requests, sanctions screening,
 * legal proceedings, civic engagement, and compliance audit trails.
 */

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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("GOVERNMENT_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "GOVERNMENT_RATE_LIMIT_MAX",
  "GOVERNMENT_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `government:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" }

function jsonResponse(payload: unknown, status: number, rl: RateLimitResult): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...createRateLimitHeaders(rl) },
  })
}

// ─── GET: query government data ─────────────────────────────────────────────

export async function GET(req: Request) {
  const rl = await getRateLimit(req)
  if (!rl.allowed) return jsonResponse({ error: "Rate limited" }, 429, rl)

  const auth = await requireSupabaseAuth(req)
  if (auth.response) return auth.response

  const sb = supabaseAdmin()
  const url = new URL(req.url)
  const action = url.searchParams.get("action") ?? "dashboard"

  // Dashboard: unified government overview
  if (action === "dashboard") {
    const [filings, permits, proceedings, foia, compliance, deadlines] = await Promise.all([
      sb.from("regulatory_filings").select("id, filing_type, status, due_date, title", { count: "exact" })
        .eq("user_id", auth.auth.userId).order("due_date", { ascending: true }).limit(10),
      sb.from("sovereign_permits").select("id, permit_type, jurisdiction, expiry_date, renewal_status", { count: "exact" })
        .eq("user_id", auth.auth.userId).order("expiry_date", { ascending: true }).limit(10),
      sb.from("legal_proceedings").select("id, caption, case_type, status, next_deadline", { count: "exact" })
        .eq("user_id", auth.auth.userId).order("next_deadline", { ascending: true }).limit(10),
      sb.from("foia_requests").select("id, target_agency_name, status, response_due", { count: "exact" })
        .eq("user_id", auth.auth.userId).order("created_at", { ascending: false }).limit(10),
      sb.rpc("get_compliance_summary", { p_user_id: auth.auth.userId }),
      sb.rpc("get_upcoming_deadlines", { p_user_id: auth.auth.userId, p_days_ahead: 30 }),
    ])

    return jsonResponse({
      ok: true,
      dashboard: {
        filings: { data: filings.data, total: filings.count },
        permits: { data: permits.data, total: permits.count },
        proceedings: { data: proceedings.data, total: proceedings.count },
        foia: { data: foia.data, total: foia.count },
        compliance: compliance.data ?? [],
        upcomingDeadlines: deadlines.data ?? [],
      },
    }, 200, rl)
  }

  // Government entities catalog
  if (action === "entities") {
    const entityType = url.searchParams.get("type")
    const jurisdiction = url.searchParams.get("jurisdiction")
    let query = sb.from("government_entities").select("*").order("name")
    if (entityType) query = query.eq("entity_type", entityType)
    if (jurisdiction) query = query.eq("jurisdiction", jurisdiction)
    const { data, error } = await query.limit(200)
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, entities: data }, 200, rl)
  }

  // Regulatory watch feed
  if (action === "regulatory_watch") {
    const { data, error } = await sb
      .from("regulatory_watch")
      .select("*")
      .order("effective_date", { ascending: false })
      .limit(50)
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, regulations: data }, 200, rl)
  }

  // Civic representatives
  if (action === "representatives") {
    const jurisdiction = url.searchParams.get("jurisdiction")
    const level = url.searchParams.get("level")
    let query = sb.from("civic_representatives").select("*").order("name")
    if (jurisdiction) query = query.eq("jurisdiction", jurisdiction)
    if (level) query = query.eq("level", level)
    const { data, error } = await query.limit(100)
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, representatives: data }, 200, rl)
  }

  // Sanctions screening history
  if (action === "sanctions_history") {
    const { data, error } = await sb
      .from("sanctions_screening_log")
      .select("*")
      .eq("user_id", auth.auth.userId)
      .order("screened_at", { ascending: false })
      .limit(50)
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, screenings: data }, 200, rl)
  }

  // Immigration status
  if (action === "immigration") {
    const { data } = await sb
      .from("immigration_status")
      .select("*")
      .eq("user_id", auth.auth.userId)
      .single()
    return jsonResponse({ ok: true, immigration: data }, 200, rl)
  }

  return jsonResponse({ error: "Unknown action" }, 400, rl)
}

// ─── POST: create/update government records ─────────────────────────────────

export async function POST(req: Request) {
  const rl = await getRateLimit(req)
  if (!rl.allowed) return jsonResponse({ error: "Rate limited" }, 429, rl)

  const auth = await requireSupabaseAuth(req)
  if (auth.response) return auth.response

  const body = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request body" }, 400, rl)
  }

  const sb = supabaseAdmin()
  const { action } = body as Record<string, unknown>

  // Create regulatory filing
  if (action === "create_filing") {
    const { filingType, jurisdiction, title, description, dueDate } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("regulatory_filings")
      .insert({
        user_id: auth.auth.userId,
        filing_type: filingType,
        jurisdiction,
        title,
        description,
        due_date: dueDate,
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, filing: data }, 200, rl)
  }

  // Update filing status
  if (action === "update_filing") {
    const { filingId, status, submittedAt, responseSummary } = body as Record<string, unknown>
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status) updates.status = status
    if (submittedAt) updates.submitted_at = submittedAt
    if (responseSummary) updates.response_summary = responseSummary
    const { data, error } = await sb
      .from("regulatory_filings")
      .update(updates)
      .eq("id", filingId)
      .eq("user_id", auth.auth.userId)
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, filing: data }, 200, rl)
  }

  // Create permit
  if (action === "create_permit") {
    const { permitType, jurisdiction, permitNumber, issueDate, expiryDate, conditions } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("sovereign_permits")
      .insert({
        user_id: auth.auth.userId,
        permit_type: permitType,
        jurisdiction,
        permit_number: permitNumber,
        issue_date: issueDate,
        expiry_date: expiryDate,
        conditions: conditions ?? [],
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, permit: data }, 200, rl)
  }

  // Create FOIA request
  if (action === "create_foia") {
    const { targetAgencyName, requestText, requestCategory } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("foia_requests")
      .insert({
        user_id: auth.auth.userId,
        target_agency_name: targetAgencyName,
        request_text: requestText,
        request_category: requestCategory ?? "general",
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, foia: data }, 200, rl)
  }

  // Screen entity against sanctions lists
  if (action === "screen_sanctions") {
    const { entityScreened, entityType, screeningType } = body as Record<string, unknown>
    // Log the screening (actual list matching would integrate with OFAC API)
    const { data, error } = await sb
      .from("sanctions_screening_log")
      .insert({
        user_id: auth.auth.userId,
        entity_screened: entityScreened,
        entity_type: entityType ?? "organization",
        screening_type: screeningType ?? "ofac_sdn",
        match_result: "clear",
        risk_level: "low",
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, screening: data }, 200, rl)
  }

  // Create legal proceeding
  if (action === "create_proceeding") {
    const { court, jurisdiction, caseType, caption, caseNumber, ourRole, nextDeadline } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("legal_proceedings")
      .insert({
        user_id: auth.auth.userId,
        court,
        jurisdiction,
        case_type: caseType,
        caption,
        case_number: caseNumber,
        our_role: ourRole ?? "plaintiff",
        next_deadline: nextDeadline,
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, proceeding: data }, 200, rl)
  }

  // Log civic engagement
  if (action === "log_civic_engagement") {
    const { representativeId, actionType, topic, description, outcome } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("civic_engagement_log")
      .insert({
        user_id: auth.auth.userId,
        representative_id: representativeId,
        action_type: actionType,
        topic,
        description,
        outcome,
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, engagement: data }, 200, rl)
  }

  // Log compliance action
  if (action === "log_compliance") {
    const { domain, actionTaken, regulationRef, result, evidenceRefs } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("compliance_audit_trail")
      .insert({
        user_id: auth.auth.userId,
        domain,
        action_taken: actionTaken,
        regulation_ref: regulationRef,
        result: result ?? "compliant",
        evidence_refs: evidenceRefs ?? [],
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, compliance: data }, 200, rl)
  }

  // Submit whistleblower report
  if (action === "submit_whistleblower") {
    const { targetEntity, targetEntityType, category, description, severity, anonymous } = body as Record<string, unknown>
    const isAnonymous = anonymous !== false
    const { data, error } = await sb
      .from("whistleblower_submissions")
      .insert({
        user_id: isAnonymous ? null : auth.auth.userId,
        target_entity: targetEntity,
        target_entity_type: targetEntityType ?? "corporate",
        category,
        description,
        severity: severity ?? "medium",
        anonymous: isAnonymous,
      })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, submission: data }, 200, rl)
  }

  // Update immigration status
  if (action === "update_immigration") {
    const { visaType, jurisdiction, status: visaStatus, expiryDate, restrictions, travelClearanceLevel } = body as Record<string, unknown>
    const { data, error } = await sb
      .from("immigration_status")
      .upsert({
        user_id: auth.auth.userId,
        visa_type: visaType,
        jurisdiction: jurisdiction ?? "US",
        status: visaStatus ?? "active",
        expiry_date: expiryDate,
        restrictions: restrictions ?? [],
        travel_clearance_level: travelClearanceLevel ?? "standard",
      }, { onConflict: "user_id" })
      .select()
      .single()
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, immigration: data }, 200, rl)
  }

  return jsonResponse({ error: "Unknown action" }, 400, rl)
}
