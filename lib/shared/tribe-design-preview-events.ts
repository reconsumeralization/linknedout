"use client"

const TRIBE_DESIGN_PREVIEW_EVENT = "linkedout:tribe-design-preview"
const DESIGN_TRIBE_TOOL_NAME = "designTribesForObjective"

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value === "true") return true
    if (value === "false") return false
  }
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
}

function toBoundedPositiveInt(value: unknown, fallback = 0): number {
  const n = asNumber(value)
  if (n === null) return fallback
  return Math.max(0, Math.floor(n))
}

function toMaybePercent(value: unknown, digits = 1): number | undefined {
  const n = asNumber(value)
  if (n === null) return undefined
  const bounded = Math.max(0, Math.min(100, n))
  return Number(bounded.toFixed(digits))
}

export type TribeDesignPreviewTribe = {
  tribeIndex: number
  suggestedName: string
  profileIds: string[]
  memberCount: number
  avgMatchScore?: number
  avgConnections?: number
  avgExperienceYears?: number
  topSkills: string[]
  requiredSkillCoveragePercent?: number
  networkSharePercent?: number
}

export type TribeDesignPreviewOutput = {
  objective: string
  designedTribes: TribeDesignPreviewTribe[]
  usedProfileCount?: number
  totalWorkspaceProfiles?: number
  profileWindowLimit?: number
  candidatePoolTruncated?: boolean
  networkCoveragePercent?: number
}

export type TribeDesignPreviewEventDetail = {
  sourceId: string
  output: TribeDesignPreviewOutput
}

function normalizeDesignedTribe(value: unknown, fallbackIndex: number): TribeDesignPreviewTribe | null {
  const row = asRecord(value)
  if (!row) return null

  const profileIds = asStringArray(row.profileIds)
  if (profileIds.length === 0) {
    return null
  }

  const suggestedName = asString(row.suggestedName) || `Designed Tribe ${fallbackIndex}`
  const memberCount = Math.max(
    profileIds.length,
    toBoundedPositiveInt(row.memberCount, profileIds.length),
  )

  return {
    tribeIndex: Math.max(1, toBoundedPositiveInt(row.tribeIndex, fallbackIndex)),
    suggestedName,
    profileIds,
    memberCount,
    avgMatchScore: asNumber(row.avgMatchScore) ?? undefined,
    avgConnections: asNumber(row.avgConnections) ?? undefined,
    avgExperienceYears: asNumber(row.avgExperienceYears) ?? undefined,
    topSkills: asStringArray(row.topSkills),
    requiredSkillCoveragePercent: toMaybePercent(row.requiredSkillCoveragePercent, 1),
    networkSharePercent: toMaybePercent(row.networkSharePercent, 2),
  }
}

function normalizeDesignOutput(value: unknown): TribeDesignPreviewOutput | null {
  const root = asRecord(value)
  if (!root) return null

  const designedTribesRaw = Array.isArray(root.designedTribes) ? root.designedTribes : []
  if (designedTribesRaw.length === 0) {
    return null
  }

  const designedTribes = designedTribesRaw
    .map((item, index) => normalizeDesignedTribe(item, index + 1))
    .filter((item): item is TribeDesignPreviewTribe => Boolean(item))

  if (designedTribes.length === 0) {
    return null
  }

  const objective = asString(root.objective) || "AI tribe design objective"
  const usedProfileCount = asNumber(root.usedProfileCount) ?? undefined
  const totalWorkspaceProfiles = asNumber(root.totalWorkspaceProfiles) ?? undefined
  const profileWindowLimit = asNumber(root.profileWindowLimit) ?? undefined
  const candidatePoolTruncated = asBoolean(root.candidatePoolTruncated) ?? undefined
  const networkCoveragePercent = toMaybePercent(root.networkCoveragePercent, 1)

  return {
    objective,
    designedTribes,
    usedProfileCount,
    totalWorkspaceProfiles,
    profileWindowLimit,
    candidatePoolTruncated,
    networkCoveragePercent,
  }
}

function extractSourceId(root: JsonRecord, fallbackPrefix: string): string {
  return (
    asString(root.callId) ||
    asString(root.call_id) ||
    asString(root.toolCallId) ||
    `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
}

export function extractTribeDesignPreviewEventDetail(
  rawPayload: unknown,
): TribeDesignPreviewEventDetail | null {
  const root = asRecord(rawPayload)
  if (!root) return null

  const toolInvocation = asRecord(root.toolInvocation)
  if (toolInvocation) {
    const toolName = asString(toolInvocation.toolName)
    if (toolName === DESIGN_TRIBE_TOOL_NAME) {
      const output = normalizeDesignOutput(toolInvocation.result ?? toolInvocation.output)
      if (!output) return null
      return {
        sourceId: extractSourceId(toolInvocation, "chat-tool"),
        output,
      }
    }
  }

  const topLevelToolName = asString(root.toolName) || asString(root.name)
  if (topLevelToolName === DESIGN_TRIBE_TOOL_NAME) {
    const output = normalizeDesignOutput(root.output ?? root.result)
    if (!output) return null
    return {
      sourceId: extractSourceId(root, "realtime-tool"),
      output,
    }
  }

  const directOutput = normalizeDesignOutput(root)
  if (!directOutput) return null
  return {
    sourceId: extractSourceId(root, "direct-tool"),
    output: directOutput,
  }
}

export function dispatchTribeDesignPreviewEvent(rawPayload: unknown): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const detail = extractTribeDesignPreviewEventDetail(rawPayload)
  if (!detail) {
    return false
  }

  const event = new CustomEvent<TribeDesignPreviewEventDetail>(TRIBE_DESIGN_PREVIEW_EVENT, {
    detail,
  })
  window.dispatchEvent(event)
  return true
}

export function addTribeDesignPreviewEventListener(
  handler: (detail: TribeDesignPreviewEventDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<TribeDesignPreviewEventDetail>
    if (customEvent.detail) {
      handler(customEvent.detail)
    }
  }

  window.addEventListener(TRIBE_DESIGN_PREVIEW_EVENT, listener as EventListener)
  return () => window.removeEventListener(TRIBE_DESIGN_PREVIEW_EVENT, listener as EventListener)
}

