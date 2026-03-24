import {
  deleteEmailIntegration,
  toEmailErrorResponse,
  updateEmailIntegration,
} from "@/lib/email/email-data-server"
import {
  emailApiOptionsResponse,
  emailApiResponse,
  resolveEmailAuthOrResponse,
} from "@/lib/email/email-api-utils"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import { validateUuidParam } from "@/lib/shared/route-params"

export const runtime = "nodejs"
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("EMAIL_INTEGRATION_PATCH_MAX_BODY_BYTES", 256_000)

type RouteParams = {
  params: Promise<{
    integrationId: string
  }>
}

export async function PATCH(req: Request, context: RouteParams): Promise<Response> {
  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const { integrationId: rawId } = await context.params
  const idResult = validateUuidParam(rawId ?? "", "integrationId")
  if (!idResult.ok) {
    return emailApiResponse({ error: idResult.error }, idResult.status)
  }
  const integrationId = idResult.value

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return emailApiResponse({ error: bodyResult.error }, bodyResult.status)
  }

  try {
    const integration = await updateEmailIntegration(authResult.auth, integrationId, bodyResult.value)
    return emailApiResponse({ ok: true, integration })
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function DELETE(req: Request, context: RouteParams): Promise<Response> {
  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const { integrationId: rawId } = await context.params
  const idResult = validateUuidParam(rawId ?? "", "integrationId")
  if (!idResult.ok) {
    return emailApiResponse({ error: idResult.error }, idResult.status)
  }
  const integrationId = idResult.value

  try {
    await deleteEmailIntegration(authResult.auth, integrationId)
    return emailApiResponse({ ok: true })
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function OPTIONS(): Promise<Response> {
  return emailApiOptionsResponse()
}
