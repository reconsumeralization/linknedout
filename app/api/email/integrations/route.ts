import {
  createEmailIntegration,
  getEmailServiceStatus,
  listEmailIntegrations,
  toEmailErrorResponse,
} from "@/lib/email/email-data-server"
import {
  emailApiOptionsResponse,
  emailApiResponse,
  resolveEmailAuthOrResponse,
} from "@/lib/email/email-api-utils"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"

export const runtime = "nodejs"
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("EMAIL_INTEGRATIONS_MAX_BODY_BYTES", 256_000)

export async function GET(req: Request): Promise<Response> {
  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  try {
    const integrations = await listEmailIntegrations(authResult.auth)
    return emailApiResponse({
      ok: true,
      integrations,
      status: getEmailServiceStatus(),
    })
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

  try {
    const integration = await createEmailIntegration(authResult.auth, bodyResult.value)
    return emailApiResponse({ ok: true, integration }, 201)
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function OPTIONS(): Promise<Response> {
  return emailApiOptionsResponse()
}
