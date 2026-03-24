/**
 * POST /api/fundraising/outreach/[id]/send — send email campaign (to all recipients) or post LinkedIn campaign.
 */

import {
  listEmailIntegrations,
  sendEmailMessage,
} from "@/lib/email/email-data-server"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { validateUuidParam } from "@/lib/shared/route-params"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TABLES = {
  outreach: "fundraising_outreach_campaigns",
  campaigns: "fundraising_campaigns",
  recipients: "fundraising_outreach_recipients",
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

function substituteTemplate(
  text: string,
  vars: { name?: string; firstName?: string; lastName?: string; campaignName?: string },
): string {
  let out = text
  out = out.replace(/\{\{name\}\}/g, vars.name ?? "")
  out = out.replace(/\{\{firstName\}\}/g, vars.firstName ?? "")
  out = out.replace(/\{\{lastName\}\}/g, vars.lastName ?? "")
  out = out.replace(/\{\{campaignName\}\}/g, vars.campaignName ?? "")
  return out
}

function splitName(name: string | null): { firstName: string; lastName: string } {
  if (!name || !name.trim()) return { firstName: "", lastName: "" }
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" }
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
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

  const { data: outreachRow } = await client
    .from(TABLES.outreach)
    .select("id, fundraising_campaign_id, channel, name, subject, body_text, status, email_integration_id")
    .eq("id", outreachId)
    .eq("owner_user_id", authResult.auth.userId)
    .maybeSingle()

  if (!outreachRow) return jsonResponse({ error: "outreach_not_found" }, 404)

  const outreach = outreachRow as Record<string, unknown>
  if (outreach.status !== "draft") {
    return jsonResponse({ error: "already_sent_or_sending", status: outreach.status }, 400)
  }

  const channel = outreach.channel as string
  const campaignRes = await client
    .from(TABLES.campaigns)
    .select("name")
    .eq("id", outreach.fundraising_campaign_id)
    .maybeSingle()
  const campaignName = (campaignRes.data as Record<string, unknown> | null)?.name as string ?? ""

  const nowIso = new Date().toISOString()

  if (channel === "linkedin") {
    const bodyText = (outreach.body_text as string) || ""
    if (!bodyText.trim()) return jsonResponse({ error: "missing_body_text" }, 400)

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("x-forwarded-proto") && req.headers.get("x-forwarded-host")
        ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("x-forwarded-host")}`
        : null) ||
      (typeof req.url === "string" ? new URL(req.url).origin : "")

    if (!baseUrl) return jsonResponse({ error: "cannot_resolve_app_url" }, 500)

    const authHeader = req.headers.get("Authorization") || ""
    const res = await fetch(`${baseUrl}/api/linkedin/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        text: bodyText.trim().slice(0, 3000),
        visibility: "PUBLIC",
      }),
    })

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ugcPostId?: string; error?: string; message?: string }

    if (!res.ok || !json.ok) {
      await client
        .from(TABLES.outreach)
        .update({
          status: "failed",
          updated_at: nowIso,
        })
        .eq("id", outreachId)
        .eq("owner_user_id", authResult.auth.userId)
      return jsonResponse(
        { ok: false, error: json.error || "linkedin_failed", message: json.message || "LinkedIn post failed" },
        res.status >= 400 ? res.status : 502,
      )
    }

    await client
      .from(TABLES.outreach)
      .update({
        status: "sent",
        sent_at: nowIso,
        linkedin_post_id: json.ugcPostId ?? null,
        updated_at: nowIso,
      })
      .eq("id", outreachId)
      .eq("owner_user_id", authResult.auth.userId)

    return jsonResponse({
      ok: true,
      channel: "linkedin",
      linkedinPostId: json.ugcPostId ?? null,
    })
  }

  if (channel === "email") {
    const { data: recipientRows } = await client
      .from(TABLES.recipients)
      .select("id, email, name")
      .eq("outreach_campaign_id", outreachId)
      .eq("status", "pending")

    const recipients = (recipientRows || []) as Array<Record<string, unknown>>
    if (recipients.length === 0) {
      return jsonResponse({ error: "no_recipients", message: "Add recipients before sending." }, 400)
    }

    let integrationId = outreach.email_integration_id as string | null
    if (!integrationId) {
      const integrations = await listEmailIntegrations(authResult.auth)
      const connected = integrations.filter((i) => i.status === "connected")
      if (connected.length === 0) {
        return jsonResponse({
          error: "no_email_integration",
          message: "Connect an email account in Settings first.",
        }, 400)
      }
      integrationId = connected[0].id
    }

    await client
      .from(TABLES.outreach)
      .update({ status: "sending", updated_at: nowIso })
      .eq("id", outreachId)
      .eq("owner_user_id", authResult.auth.userId)

    const subjectTemplate = (outreach.subject as string) || ""
    const bodyTemplate = (outreach.body_text as string) || ""
    let sent = 0
    let failed = 0

    for (const rec of recipients) {
      const email = String(rec.email ?? "").trim().toLowerCase()
      const name = (rec.name as string)?.trim() ?? ""
      const { firstName, lastName } = splitName(name || null)

      const subject = substituteTemplate(subjectTemplate, {
        name: name || email,
        firstName,
        lastName,
        campaignName,
      })
      const body = substituteTemplate(bodyTemplate, {
        name: name || email,
        firstName,
        lastName,
        campaignName,
      })

      try {
        await sendEmailMessage(authResult.auth, {
          integrationId,
          to: [{ email, name: name || undefined }],
          subject,
          body,
        })
        sent++
        await client
          .from(TABLES.recipients)
          .update({ status: "sent", sent_at: nowIso })
          .eq("id", rec.id)
      } catch (err) {
        failed++
        const errMsg = err instanceof Error ? err.message : "Send failed"
        await client
          .from(TABLES.recipients)
          .update({
            status: "failed",
            error_message: errMsg.slice(0, 500),
          })
          .eq("id", rec.id)
      }
    }

    const finalStatus = failed === recipients.length ? "failed" : "sent"
    await client
      .from(TABLES.outreach)
      .update({
        status: finalStatus,
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", outreachId)
      .eq("owner_user_id", authResult.auth.userId)

    return jsonResponse({
      ok: failed < recipients.length,
      channel: "email",
      sent,
      failed,
      total: recipients.length,
    })
  }

  return jsonResponse({ error: "invalid_channel" }, 400)
}
