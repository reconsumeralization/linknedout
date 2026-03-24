/**
 * POST /api/fundraising/outreach/[id]/recipients — set recipients for an email outreach (donorIds and/or customEmails).
 */

import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import { validateUuidParam } from "@/lib/shared/route-params"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TABLES = {
  outreach: "fundraising_outreach_campaigns",
  donors: "fundraising_donors",
  recipients: "fundraising_outreach_recipients",
}

const RecipientsBodySchema = z.object({
  donorIds: z.array(z.string().uuid()).max(500).optional(),
  customEmails: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().max(200).optional(),
      }),
    )
    .max(500)
    .optional(),
})

const MAX_BODY = getMaxBodyBytesFromEnv("FUNDRAISING_OUTREACH_MAX_BODY_BYTES", 64_000)

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authResult = await requireSupabaseAuth(req, { errorBody: { error: "unauthorized" } })
  if (!authResult.auth) return authResult.response

  const { id: outreachId } = await params
  const idResult = validateUuidParam(outreachId, "id")
  if (!idResult.ok) return jsonResponse({ error: idResult.error }, idResult.status)

  const client = getSupabaseServerClient()
  if (!client) return jsonResponse({ error: "server_config" }, 500)

  const { data: outreach } = await client
    .from(TABLES.outreach)
    .select("id, channel, owner_user_id")
    .eq("id", outreachId)
    .eq("owner_user_id", authResult.auth.userId)
    .maybeSingle()

  if (!outreach) return jsonResponse({ error: "outreach_not_found" }, 404)
  if ((outreach as Record<string, unknown>).channel !== "email") {
    return jsonResponse({ error: "recipients_only_for_email" }, 400)
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY)
  if (!bodyResult.ok) {
    return jsonResponse({ error: "invalid_body", message: bodyResult.error }, bodyResult.status)
  }

  const parsed = RecipientsBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "validation_error", details: parsed.error.flatten().fieldErrors },
      400,
    )
  }

  const { donorIds = [], customEmails = [] } = parsed.data

  const recipients: Array<{ outreach_campaign_id: string; donor_id: string | null; email: string; name: string | null }> = []

  if (donorIds.length > 0) {
    const { data: donorRows } = await client
      .from(TABLES.donors)
      .select("id, email, name")
      .eq("owner_user_id", authResult.auth.userId)
      .in("id", donorIds)

    for (const d of donorRows || []) {
      const row = d as Record<string, unknown>
      const email = typeof row.email === "string" && row.email.trim() ? row.email.trim() : null
      if (!email) continue
      recipients.push({
        outreach_campaign_id: outreachId,
        donor_id: row.id as string,
        email,
        name: (row.name as string)?.trim() || null,
      })
    }
  }

  for (const { email, name } of customEmails) {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) continue
    if (recipients.some((r) => r.email.toLowerCase() === trimmed)) continue
    recipients.push({
      outreach_campaign_id: outreachId,
      donor_id: null,
      email: trimmed,
      name: name?.trim() || null,
    })
  }

  await client.from(TABLES.recipients).delete().eq("outreach_campaign_id", outreachId)

  if (recipients.length > 0) {
    const { error } = await client.from(TABLES.recipients).insert(
      recipients.map((r) => ({
        outreach_campaign_id: r.outreach_campaign_id,
        donor_id: r.donor_id,
        email: r.email,
        name: r.name,
        status: "pending",
      })),
    )
    if (error) {
      console.warn("[fundraising/outreach/recipients] insert error:", error.message)
      return jsonResponse({ error: "insert_failed", message: error.message }, 500)
    }
  }

  return jsonResponse({ ok: true, count: recipients.length })
}
