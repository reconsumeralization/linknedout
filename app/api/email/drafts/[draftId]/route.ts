import { deleteEmailDraft, toEmailErrorResponse } from "@/lib/email/email-data-server"
import {
  emailApiOptionsResponse,
  emailApiResponse,
  resolveEmailAuthOrResponse,
} from "@/lib/email/email-api-utils"
import { validateUuidParam } from "@/lib/shared/route-params"

export const runtime = "nodejs"

type RouteParams = {
  params: Promise<{
    draftId: string
  }>
}

export async function DELETE(req: Request, context: RouteParams): Promise<Response> {
  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const { draftId: rawId } = await context.params
  const idResult = validateUuidParam(rawId ?? "", "draftId")
  if (!idResult.ok) {
    return emailApiResponse({ error: idResult.error }, idResult.status)
  }
  const draftId = idResult.value

  try {
    await deleteEmailDraft(authResult.auth, draftId)
    return emailApiResponse({ ok: true })
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return emailApiResponse(failure.payload, failure.status)
  }
}

export async function OPTIONS(): Promise<Response> {
  return emailApiOptionsResponse()
}
