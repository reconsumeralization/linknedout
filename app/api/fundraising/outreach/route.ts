/**
 * GET /api/fundraising/outreach — list outreach campaigns (optional ?campaignId=)
 * POST /api/fundraising/outreach — create draft (body: fundraisingCampaignId, channel, name, subject?, bodyText, integrationId?)
 */

import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TABLES = {
  outreach: "fundraising_outreach_campaigns",
  campaigns: "fundraising_campaigns",
}

const CreateBodySchema = z.object({
  fundraisingCampaignId: z.string().uuid(),
  channel: z.enum(["email", "linkedin"]),
  name: z.string().min(1).max(300),
  subject: z.string().max(998).optional(),
  bodyText: z.string().max(50_000).optional(),
  integrationId: z.string().uuid().optional(),
})

const MAX_BODY = getMaxBodyBytesFromEnv("FUNDRAISING_OUTREACH_MAX_BODY_BYTES", 64_000)

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(headers || {}),
    },
  })
}

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireSupabaseAuth(req, { errorBody: { error: "unauthorized" } })
  if (!authResult.auth) return authResult.response

  const client = getSupabaseServerClient()
  if (!client) return jsonResponse({ error: "server_config" }, 500)

  const url = new URL(req.url)
  const campaignId = url.searchParams.get("campaignId")?.trim() || null

  let query = client
    .from(TABLES.outreach)
    .select("id, fundraising_campaign_id, channel, name, subject, body_text, status, scheduled_at, sent_at, linkedin_post_id, email_integration_id, created_at, updated_at")
    .eq("owner_user_id", authResult.auth.userId)
    .order("updated_at", { ascending: false })
    .limit(100)

  if (campaignId) {
    query = query.eq("fundraising_campaign_id", campaignId)
  }

  const { data, error } = await query

  if (error) {
    console.warn("[fundraising/outreach] list error:", error.message)
    return jsonResponse({ error: "list_failed", message: error.message }, 500)
  }

  const rows = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    fundraisingCampaignId: row.fundraising_campaign_id,
    channel: row.channel,
    name: row.name,
    subject: row.subject ?? null,
    bodyText: row.body_text ?? "",
    status: row.status,
    scheduledAt: row.scheduled_at ?? null,
    sentAt: row.sent_at ?? null,
    linkedinPostId: row.linkedin_post_id ?? null,
    emailIntegrationId: row.email_integration_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return jsonResponse({ ok: true, campaigns: rows })
}

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireSupabaseAuth(req, { errorBody: { error: "unauthorized" } })
  if (!authResult.auth) return authResult.response

  const client = getSupabaseServerClient()
  if (!client) return jsonResponse({ error: "server_config" }, 500)

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY)
  if (!bodyResult.ok) {
    return jsonResponse({ error: "invalid_body", message: bodyResult.error }, bodyResult.status)
  }

  const parsed = CreateBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "validation_error", details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  const { fundraisingCampaignId, channel, name, subject, bodyText, integrationId } = parsed.data

  const { data: campaignRow } = await client
    .from(TABLES.campaigns)
    .select("id")
    .eq("id", fundraisingCampaignId)
    .eq("owner_user_id", authResult.auth.userId)
    .maybeSingle()

  if (!campaignRow) {
    return jsonResponse({ error: "campaign_not_found" }, 404)
  }

  const insert: Record<string, unknown> = {
    owner_user_id: authResult.auth.userId,
    fundraising_campaign_id: fundraisingCampaignId,
    channel,
    name,
    body_text: bodyText ?? "",
    status: "draft",
    updated_at: new Date().toISOString(),
  }
  if (channel === "email") {
    insert.subject = subject ?? ""
    if (integrationId) insert.email_integration_id = integrationId
  }

  const { data: inserted, error } = await client
    .from(TABLES.outreach)
    .insert(insert)
    .select("id, fundraising_campaign_id, channel, name, subject, body_text, status, created_at, updated_at")
    .single()

  if (error) {
    console.warn("[fundraising/outreach] create error:", error.message)
    return jsonResponse({ error: "create_failed", message: error.message }, 500)
  }

  const row = inserted as Record<string, unknown>
  return jsonResponse(
    {
      ok: true,
      campaign: {
        id: row.id,
        fundraisingCampaignId: row.fundraising_campaign_id,
        channel: row.channel,
        name: row.name,
        subject: row.subject ?? null,
        bodyText: row.body_text ?? "",
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    },
    201,
  )
}
