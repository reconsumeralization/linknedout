import "server-only"

import {
  buildUgcPostBody,
  createUgcPost,
  createUgcPostWithRetry,
  introspectToken,
} from "@/lib/linkedin/linkedin-consumer"
import {
  getLinkedInAccessToken,
  getLinkedInIdentity,
} from "@/lib/linkedin/linkedin-identity-server"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"

type DbRow = Record<string, unknown>

export type LinkedinShareAuditVisibility = "public" | "connections" | "logged_in"

type LinkedinShareAuditInput = {
  userId: string
  linkedinSubject: string
  shareType?: string | null
  visibility?: LinkedinShareAuditVisibility | null
  requestText: string
  requestMediaUrl?: string | null
  requestMediaUrls?: string[] | null
  requestLinkUrl?: string | null
  requestTitle?: string | null
  requestDescription?: string | null
  responseStatus: number
  responseUgcPostId?: string | null
  responseShareId?: string | null
  responseErrorCode?: string | null
  responseErrorMessage?: string | null
  retryCount?: number | null
  scheduledAt?: string | null
  publishedAt?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
}

type PublishLinkedinTextShareInput = {
  userId: string
  text: string
  visibility?: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"
  retryOnRateLimit?: boolean
  audit?: {
    shareType?: string | null
    requestMediaUrl?: string | null
    requestMediaUrls?: string[] | null
    requestLinkUrl?: string | null
    requestTitle?: string | null
    requestDescription?: string | null
    metadata?: Record<string, unknown> | null
  }
}

type PublishLinkedinTextShareResult =
  | {
      ok: true
      ugcPostId: string
      auditId: string | null
      publishedAt: string
    }
  | {
      ok: false
      status: number
      error: string
      code: string
      retryAfter?: number
      auditId: string | null
    }

const LINKEDIN_SHARE_AUDIT_TABLE =
  process.env.SUPABASE_LINKEDIN_SHARE_AUDIT_TABLE || "linkedin_share_audit"

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}

function normalizeAuditVisibility(
  value: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN" | LinkedinShareAuditVisibility | null | undefined,
): LinkedinShareAuditVisibility {
  const normalized = asString(value, "connections").trim().toLowerCase()
  if (normalized === "public") return "public"
  if (normalized === "logged_in" || normalized === "loggedin") return "logged_in"
  return "connections"
}

function isMissingColumnError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && /column .* does not exist/i.test(error.message))
}

export async function recordLinkedinShareAudit(
  input: LinkedinShareAuditInput,
): Promise<{ auditId: string | null }> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { auditId: null }
  }

  const createdAt = input.createdAt || new Date().toISOString()
  const fullPayload = {
    user_id: input.userId,
    linkedin_subject: input.linkedinSubject,
    share_type: asString(input.shareType, "text").slice(0, 40) || "text",
    visibility: normalizeAuditVisibility(input.visibility),
    request_text: input.requestText.slice(0, 3000),
    request_media_url: input.requestMediaUrl || null,
    request_media_urls:
      input.requestMediaUrls && input.requestMediaUrls.length > 0
        ? input.requestMediaUrls.slice(0, 10)
        : null,
    request_link_url: input.requestLinkUrl || null,
    request_title: input.requestTitle || null,
    request_description: input.requestDescription || null,
    request_size_bytes: Buffer.byteLength(input.requestText, "utf8"),
    response_status: input.responseStatus,
    response_ugc_post_id: input.responseUgcPostId || null,
    response_share_id: input.responseShareId || null,
    response_error_code: input.responseErrorCode || null,
    response_error_message: input.responseErrorMessage
      ? input.responseErrorMessage.slice(0, 500)
      : null,
    retry_count: typeof input.retryCount === "number" ? input.retryCount : 0,
    scheduled_at: input.scheduledAt || null,
    published_at: input.publishedAt || null,
    metadata: input.metadata || {},
    created_at: createdAt,
  }

  let { data, error } = await client
    .from(LINKEDIN_SHARE_AUDIT_TABLE)
    .insert(fullPayload)
    .select("id")
    .single()

  if (error && isMissingColumnError(error)) {
    ;({ data, error } = await client
      .from(LINKEDIN_SHARE_AUDIT_TABLE)
      .insert({
        user_id: input.userId,
        linkedin_subject: input.linkedinSubject,
        request_text: input.requestText.slice(0, 3000),
        response_status: input.responseStatus,
        response_ugc_post_id: input.responseUgcPostId || null,
        created_at: createdAt,
      })
      .select("id")
      .single())
  }

  if (error) {
    console.warn("[linkedin-share] audit insert failed:", error.message)
    return { auditId: null }
  }

  return {
    auditId: asString((data as DbRow | null)?.id) || null,
  }
}

export async function publishLinkedinTextShareForUser(
  input: PublishLinkedinTextShareInput,
): Promise<PublishLinkedinTextShareResult> {
  const text = input.text.trim()
  if (!text) {
    return {
      ok: false,
      status: 400,
      code: "missing_text",
      error: "Body must include text.",
      auditId: null,
    }
  }

  const creds = await getLinkedInAccessToken(input.userId)
  if (!creds) {
    return {
      ok: false,
      status: 401,
      code: "not_connected",
      error: "Connect LinkedIn in Settings first",
      auditId: null,
    }
  }

  const identity = await getLinkedInIdentity(input.userId)
  if (!identity?.has_share_scope) {
    return {
      ok: false,
      status: 403,
      code: "no_share_scope",
      error: "Re-connect LinkedIn and grant Share permission",
      auditId: null,
    }
  }

  const intro = await introspectToken(creds.accessToken)
  if (intro && !intro.active) {
    return {
      ok: false,
      status: 401,
      code: "token_inactive",
      error: "Re-connect LinkedIn in Settings",
      auditId: null,
    }
  }

  const payload = buildUgcPostBody(creds.linkedinSubject, text, input.visibility || "PUBLIC")
  const publishResult = input.retryOnRateLimit
    ? await createUgcPostWithRetry(creds.accessToken, payload)
    : await createUgcPost(creds.accessToken, payload)

  if (publishResult.ok) {
    const publishedAt = new Date().toISOString()
    const audit = await recordLinkedinShareAudit({
      userId: input.userId,
      linkedinSubject: creds.linkedinSubject,
      shareType: input.audit?.shareType || "text",
      visibility: normalizeAuditVisibility(input.visibility),
      requestText: text,
      requestMediaUrl: input.audit?.requestMediaUrl,
      requestMediaUrls: input.audit?.requestMediaUrls,
      requestLinkUrl: input.audit?.requestLinkUrl,
      requestTitle: input.audit?.requestTitle,
      requestDescription: input.audit?.requestDescription,
      responseStatus: 201,
      responseUgcPostId: publishResult.ugcPostId,
      publishedAt,
      metadata: input.audit?.metadata || {},
    })

    return {
      ok: true,
      ugcPostId: publishResult.ugcPostId,
      auditId: audit.auditId,
      publishedAt,
    }
  }

  const audit = await recordLinkedinShareAudit({
    userId: input.userId,
    linkedinSubject: creds.linkedinSubject,
    shareType: input.audit?.shareType || "text",
    visibility: normalizeAuditVisibility(input.visibility),
    requestText: text,
    requestMediaUrl: input.audit?.requestMediaUrl,
    requestMediaUrls: input.audit?.requestMediaUrls,
    requestLinkUrl: input.audit?.requestLinkUrl,
    requestTitle: input.audit?.requestTitle,
    requestDescription: input.audit?.requestDescription,
    responseStatus: publishResult.status,
    responseErrorCode: publishResult.status === 429 ? "rate_limit" : "post_failed",
    responseErrorMessage: publishResult.error,
    retryCount: publishResult.status === 429 && input.retryOnRateLimit ? 1 : 0,
    metadata: input.audit?.metadata || {},
  })

  return {
    ok: false,
    status: publishResult.status,
    code: publishResult.status === 429 ? "rate_limit" : "post_failed",
    error: publishResult.error,
    retryAfter: publishResult.retryAfter,
    auditId: audit.auditId,
  }
}
