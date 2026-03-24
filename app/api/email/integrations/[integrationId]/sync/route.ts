import { syncEmailIntegration, toEmailErrorResponse } from "@/lib/email/email-data-server"
import {
  emailApiOptionsResponse,
  emailApiResponse,
  resolveEmailAuthOrResponse,
} from "@/lib/email/email-api-utils"
import { validateUuidParam } from "@/lib/shared/route-params"

export const runtime = "nodejs"

type RouteParams = {
  params: Promise<{
    integrationId: string
  }>
}

export async function POST(req: Request, context: RouteParams): Promise<Response> {
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
    const result = await syncEmailIntegration(authResult.auth, integrationId)
    return emailApiResponse({
      ok: true,
      integration: result.integration,
      processedCount: result.processedCount,
      simulated: result.simulated,
    })
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function OPTIONS(): Promise<Response> {
  return emailApiOptionsResponse()
}
