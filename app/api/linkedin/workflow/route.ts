import { resolveSupabaseClientFromRequest } from "@/lib/shared/resolve-request-keys"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"
import { createLinkedinWorkflowTools } from "@/lib/linkedin/linkedin-workflow-tools"
import { NextResponse } from "next/server"

export const maxDuration = 120

const VALID_ACTIONS = [
  "cull_invitations",
  "analyze_unaccepted",
  "enrich_connections",
  "cherry_pick_second_level",
  "find_email",
  "compose_welcome",
  "analyze_feed",
  "curate_repost",
  "evaluate_author",
  "analyze_notifications",
  "map_connection_graph",
  "score_alignment",
  "search_extended",
  "identify_low_value",
  "import_external_list",
  "prioritize_dms",
  "detect_bots",
] as const

type WorkflowAction = (typeof VALID_ACTIONS)[number]

const ACTION_TO_TOOL: Record<WorkflowAction, string> = {
  cull_invitations: "cullStaleInvitations",
  analyze_unaccepted: "analyzeUnacceptedInvitations",
  enrich_connections: "enrichNewConnections",
  cherry_pick_second_level: "cherryPickSecondLevel",
  find_email: "findContactEmail",
  compose_welcome: "composeWelcomeMessage",
  analyze_feed: "analyzeNewsFeed",
  curate_repost: "curateAndRepost",
  evaluate_author: "evaluatePostAuthor",
  analyze_notifications: "analyzeNotifications",
  map_connection_graph: "mapConnectionGraph",
  score_alignment: "scoreAlignmentTrajectory",
  search_extended: "searchExtendedNetwork",
  identify_low_value: "identifyLowValueConnections",
  import_external_list: "importExternalContactList",
  prioritize_dms: "prioritizeDmResponses",
  detect_bots: "detectBotConnections",
}

export async function POST(req: Request) {
  try {
    const authContext = await resolveSupabaseAuthContextFromRequest(req)
    if (!authContext?.userId) {
      return NextResponse.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      )
    }

    const client = resolveSupabaseClientFromRequest(req)
    if (!client) {
      return NextResponse.json(
        { ok: false, error: "Supabase not configured." },
        { status: 503 },
      )
    }

    const body = await req.json()
    const action = body.action as WorkflowAction
    const params = body.params ?? {}

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { ok: false, error: `Invalid action. Valid: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 },
      )
    }

    const tools = createLinkedinWorkflowTools(client, authContext.userId)
    const toolName = ACTION_TO_TOOL[action] as keyof typeof tools
    const toolDef = tools[toolName]

    if (!toolDef) {
      return NextResponse.json(
        { ok: false, error: `Tool not found for action: ${action}` },
        { status: 404 },
      )
    }

    // Execute the tool
    const result = await (toolDef as unknown as { execute: (input: Record<string, unknown>) => Promise<unknown> }).execute(params)

    return NextResponse.json({ ok: true, action, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    actions: VALID_ACTIONS,
    description: "LinkedIn Workflow Automation API. POST with { action, params }.",
  })
}
