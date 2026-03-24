import {
  listEmailDrafts,
  saveEmailDraft,
  SaveDraftPayloadSchema,
  toEmailErrorResponse,
} from "@/lib/email/email-data-server"
import {
  emailApiOptionsResponse,
  emailApiResponse,
  resolveEmailAuthOrResponse,
} from "@/lib/email/email-api-utils"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import { validateUuidParam } from "@/lib/shared/route-params"

export const runtime = "nodejs"
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("EMAIL_DRAFTS_MAX_BODY_BYTES", 8 * 1024 * 1024)

export async function GET(req: Request): Promise<Response> {
  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const url = new URL(req.url)
  const rawIntegrationId = url.searchParams.get("integrationId")
  let integrationId: string | undefined
  if (rawIntegrationId) {
    const integrationIdResult = validateUuidParam(rawIntegrationId, "integrationId")
    if (!integrationIdResult.ok) {
      return emailApiResponse({ error: integrationIdResult.error }, integrationIdResult.status)
    }
    integrationId = integrationIdResult.value
  }

  try {
    const drafts = await listEmailDrafts(authResult.auth, integrationId)
    return emailApiResponse({ ok: true, drafts })
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function POST(req: Request): Promise<Response> {
  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return emailApiResponse({ error: bodyResult.error }, bodyResult.status)
  }

  const parsed = SaveDraftPayloadSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return emailApiResponse(
      { error: "Invalid draft payload.", details: parsed.error.flatten() },
      400,
    )
  }

  try {
    const draft = await saveEmailDraft(authResult.auth, parsed.data)
    return emailApiResponse({ ok: true, ...draft }, 201)
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function OPTIONS(): Promise<Response> {
  return emailApiOptionsResponse()
}
