type CriticalWorkflowVerifyMode = "off" | "warn" | "enforce"
type CriticalWorkflowClass = "none" | "destructive" | "egress"

type WorkflowToolName =
  | "deleteRapidFireDb"
  | "deleteRapidFireCollection"
  | "deleteRapidFireDocument"
  | "verifyRapidFireDbDeleted"
  | "verifyRapidFireCollectionDeleted"
  | "verifyRapidFireDocumentDeleted"

type WorkflowDefinition = {
  actionTool: "deleteRapidFireDb" | "deleteRapidFireCollection" | "deleteRapidFireDocument"
  verificationTool:
    | "verifyRapidFireDbDeleted"
    | "verifyRapidFireCollectionDeleted"
    | "verifyRapidFireDocumentDeleted"
  buildSubject: (args: unknown) => string | null
}

type CriticalWorkflowContext = {
  workflowClass: CriticalWorkflowClass
  isCriticalActionTool: boolean
  isVerificationTool: boolean
  actionToolName: string | null
  verificationToolName: string | null
  targetToolName: string | null
  subject: string | null
  verifyMode: CriticalWorkflowVerifyMode
  verifyWindowSeconds: number
  verificationRequired: boolean
}

const DEFAULT_VERIFY_MODE: CriticalWorkflowVerifyMode = "warn"
const DEFAULT_VERIFY_WINDOW_SECONDS = 120
const MAX_VERIFY_WINDOW_SECONDS = 86_400
const MIN_VERIFY_WINDOW_SECONDS = 30

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim()
  return normalized ? normalized : null
}

function normalizeToolName(value: string): string {
  return value.trim()
}

function parseVerifyMode(value: string | undefined): CriticalWorkflowVerifyMode {
  const normalized = (value || "").trim().toLowerCase()
  if (normalized === "off" || normalized === "warn" || normalized === "enforce") {
    return normalized
  }
  return DEFAULT_VERIFY_MODE
}

function parseVerifyWindowSeconds(value: string | undefined): number {
  const parsed = Number.parseInt((value || "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_VERIFY_WINDOW_SECONDS
  }
  return Math.min(Math.max(parsed, MIN_VERIFY_WINDOW_SECONDS), MAX_VERIFY_WINDOW_SECONDS)
}

function buildWorkspaceSubject(args: unknown): string | null {
  const value = asTrimmedString(asObject(args).workspaceId)
  if (!value) {
    return null
  }
  return `workspace:${value}`
}

function buildCollectionSubject(args: unknown): string | null {
  const record = asObject(args)
  const workspaceId = asTrimmedString(record.workspaceId)
  const collectionId = asTrimmedString(record.collectionId)
  if (!workspaceId || !collectionId) {
    return null
  }
  return `workspace:${workspaceId}|collection:${collectionId}`
}

function buildDocumentSubject(args: unknown): string | null {
  const record = asObject(args)
  const workspaceId = asTrimmedString(record.workspaceId)
  const collectionId = asTrimmedString(record.collectionId)
  const documentKey = asTrimmedString(record.documentKey)
  if (!workspaceId || !collectionId || !documentKey) {
    return null
  }
  return `workspace:${workspaceId}|collection:${collectionId}|document:${documentKey}`
}

const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    actionTool: "deleteRapidFireDb",
    verificationTool: "verifyRapidFireDbDeleted",
    buildSubject: buildWorkspaceSubject,
  },
  {
    actionTool: "deleteRapidFireCollection",
    verificationTool: "verifyRapidFireCollectionDeleted",
    buildSubject: buildCollectionSubject,
  },
  {
    actionTool: "deleteRapidFireDocument",
    verificationTool: "verifyRapidFireDocumentDeleted",
    buildSubject: buildDocumentSubject,
  },
]

const ACTION_TO_VERIFIER = new Map<string, WorkflowDefinition>(
  WORKFLOW_DEFINITIONS.map((definition) => [definition.actionTool, definition]),
)
const VERIFIER_TO_ACTION = new Map<string, WorkflowDefinition>(
  WORKFLOW_DEFINITIONS.map((definition) => [definition.verificationTool, definition]),
)

export function getCriticalWorkflowVerifyMode(): CriticalWorkflowVerifyMode {
  return parseVerifyMode(process.env.MCP_CRITICAL_WORKFLOW_VERIFY_MODE)
}

export function getCriticalWorkflowVerifyWindowSeconds(): number {
  return parseVerifyWindowSeconds(process.env.MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS)
}

export function isCriticalActionTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  return ACTION_TO_VERIFIER.has(normalized)
}

export function isVerificationTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  return VERIFIER_TO_ACTION.has(normalized)
}

export function getVerificationToolForAction(toolName: string): string | null {
  const normalized = normalizeToolName(toolName)
  const definition = ACTION_TO_VERIFIER.get(normalized)
  return definition?.verificationTool || null
}

export function getActionToolForVerification(toolName: string): string | null {
  const normalized = normalizeToolName(toolName)
  const definition = VERIFIER_TO_ACTION.get(normalized)
  return definition?.actionTool || null
}

export function resolveCriticalWorkflowContext(
  toolName: string,
  args: unknown,
): CriticalWorkflowContext {
  const normalizedToolName = normalizeToolName(toolName)
  const verifyMode = getCriticalWorkflowVerifyMode()
  const verifyWindowSeconds = getCriticalWorkflowVerifyWindowSeconds()
  const actionDefinition = ACTION_TO_VERIFIER.get(normalizedToolName)
  const verificationDefinition = VERIFIER_TO_ACTION.get(normalizedToolName)

  if (actionDefinition) {
    return {
      workflowClass: "destructive",
      isCriticalActionTool: true,
      isVerificationTool: false,
      actionToolName: actionDefinition.actionTool,
      verificationToolName: actionDefinition.verificationTool,
      targetToolName: actionDefinition.actionTool,
      subject: actionDefinition.buildSubject(args),
      verifyMode,
      verifyWindowSeconds,
      verificationRequired: verifyMode !== "off",
    }
  }

  if (verificationDefinition) {
    return {
      workflowClass: "destructive",
      isCriticalActionTool: false,
      isVerificationTool: true,
      actionToolName: verificationDefinition.actionTool,
      verificationToolName: verificationDefinition.verificationTool,
      targetToolName: verificationDefinition.actionTool,
      subject: verificationDefinition.buildSubject(args),
      verifyMode,
      verifyWindowSeconds,
      verificationRequired: false,
    }
  }

  return {
    workflowClass: "none",
    isCriticalActionTool: false,
    isVerificationTool: false,
    actionToolName: null,
    verificationToolName: null,
    targetToolName: null,
    subject: null,
    verifyMode,
    verifyWindowSeconds,
    verificationRequired: false,
  }
}

export type { CriticalWorkflowClass, CriticalWorkflowContext, CriticalWorkflowVerifyMode, WorkflowToolName }
