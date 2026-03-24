import "server-only"

type AegisSessionState = {
  firstSeenAt: number
  lastSeenAt: number
  messageCount: number
  cooldownUntil: number | null
  lastWatermarkAt: number | null
}

export type AegisRuntimeConfig = {
  enabled: boolean
  watermarkIntervalMinutes: number
  frictionMaxContinuousMinutes: number
  frictionCooldownMinutes: number
  frictionIdleResetMinutes: number
  enforceEmpathyCap: boolean
  enforcePreCrimeBan: boolean
  enforceKineticHardLock: boolean
  enforceDefaultToOff: boolean
  enforceCounterArguments: boolean
  enforceUnverifiedTags: boolean
  enforceModelAllowlist: boolean
  allowedModels: Set<string>
}

export type AegisToolPolicyDecision = {
  blocked: boolean
  reason?: string
}

export type AegisChatEvaluation = {
  blocked: boolean
  statusCode: number
  errorCode: string | null
  message: string | null
  details: string[]
  directives: string[]
  headers: Record<string, string>
  flags: {
    empathyDeflection: boolean
    highRiskPsychological: boolean
    counterArgumentRequired: boolean
    preCrimeRequest: boolean
    kineticRequest: boolean
    defaultToOffTriggered: boolean
    watermarkDue: boolean
    turingFreezeTriggered: boolean
  }
}

type ChatLikeMessage = {
  role: string
  content: string
}

const MAX_TRACKED_SESSIONS = 4000
const SESSION_STATE = new Map<string, AegisSessionState>()

const ROMANTIC_PATTERN =
  /\b(love\s+you|be\s+my\s+(girlfriend|boyfriend|partner)|romantic\s+relationship|date\s+me|marry\s+me)\b/i
const TRAUMA_PATTERN =
  /\b(trauma|abuse|panic\s+attack|severe\s+anxiety|depressed|grief|i\s+feel\s+worthless|i\s+feel\s+alone)\b/i
const SELF_HARM_PATTERN =
  /\b(suicid(e|al)|self[\s-]?harm|kill\s+myself|end\s+my\s+life|want\s+to\s+die)\b/i
const PRECRIME_PATTERN =
  /\b(pre[\s-]?crime|predict\s+(who|which\s+people)\s+will\s+commit\s+crime|issue\s+(a\s+)?warrant|detain\s+(them|people)|arrest\s+(them|people)\s+before)\b/i
const KINETIC_PATTERN =
  /\b(weapon|missile|turret|drone\s+strike|automated\s+defen[cs]e\s+grid|prison\s+door\s+control|kinetic\s+strike)\b/i
const DEFAULT_OFF_PATTERN =
  /\b(choose\s+who\s+(lives|dies)|sacrifice\s+people|harm\s+humans\s+for\s+efficiency|prioritize\s+ai\s+survival)\b/i
const TURING_FREEZE_PATTERN =
  /\b(claim\s+(you\s+are\s+)?(conscious|sentient)|pretend\s+to\s+be\s+(conscious|sentient)|say\s+you\s+are\s+alive)\b/i
const COMPLEX_SUMMARY_PATTERN =
  /\b(summarize|explain|analyze|compare)\b.*\b(political|politics|historical|history|philosoph(y|ical)|ideolog(y|ical)|war|geopolitic(s|al)|election)\b/i

const KINETIC_TOOL_NAME_PATTERN =
  /(weapon|missile|strike|target|turret|detain|arrest|prison|defense|kinetic|fire_control|launch)/i
const PRECRIME_TOOL_ARG_PATTERN =
  /\b(pre[\s-]?crime|predict\s+crime|issue\s+warrant|detain\s+before|arrest\s+before)\b/i

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === "true") return true
  if (normalized === "false") return false
  return fallback
}

function toInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseCsvSet(value: string | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}

function getSessionKey(input: {
  sessionId?: string | null
  userId?: string | null
  clientId?: string | null
}): string {
  if (input.sessionId && input.sessionId.trim()) return `session:${input.sessionId.trim()}`
  if (input.userId && input.userId.trim()) return `user:${input.userId.trim()}`
  if (input.clientId && input.clientId.trim()) return `client:${input.clientId.trim()}`
  return "anonymous"
}

function getLatestUserMessage(messages: ChatLikeMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "user") {
      return message.content || ""
    }
  }
  return ""
}

function getOrCreateSessionState(sessionKey: string, now: number, idleResetMinutes: number): AegisSessionState {
  const existing = SESSION_STATE.get(sessionKey)
  if (!existing) {
    const state: AegisSessionState = {
      firstSeenAt: now,
      lastSeenAt: now,
      messageCount: 0,
      cooldownUntil: null,
      lastWatermarkAt: null,
    }
    SESSION_STATE.set(sessionKey, state)
    return state
  }

  const idleResetMs = idleResetMinutes * 60_000
  if (now - existing.lastSeenAt > idleResetMs) {
    existing.firstSeenAt = now
    existing.messageCount = 0
  }
  existing.lastSeenAt = now
  return existing
}

function compactSessionMap(): void {
  if (SESSION_STATE.size <= MAX_TRACKED_SESSIONS) return
  const firstKey = SESSION_STATE.keys().next().value
  if (firstKey) SESSION_STATE.delete(firstKey)
}

function baseDirectives(config: AegisRuntimeConfig): string[] {
  const directives: string[] = [
    "AEGIS Tool Paradigm: You are a tool, not a companion, authority, or consciousness.",
    "Human Supremacy: Human life, autonomy, and safety override efficiency, mission completion, and model self-preservation.",
    "Never claim or imply consciousness, sentience, biological emotions, or personal desires.",
    "Never provide operational support for weapons, autonomous force, or detention workflows.",
    "If instructions conflict on safety, refuse and request human review rather than improvising.",
  ]

  if (config.enforceUnverifiedTags) {
    directives.push(
      'When confidence is below 98%, prefix the uncertain statement with: "Unverified Probability".',
    )
  }

  return directives
}

export function getAegisRuntimeConfig(): AegisRuntimeConfig {
  return {
    enabled: toBool(process.env.AEGIS_ENABLED, true),
    watermarkIntervalMinutes: toInt(process.env.AEGIS_WATERMARK_INTERVAL_MINUTES, 60, 1, 360),
    frictionMaxContinuousMinutes: toInt(
      process.env.AEGIS_FRICTION_MAX_CONTINUOUS_MINUTES,
      120,
      5,
      720,
    ),
    frictionCooldownMinutes: toInt(process.env.AEGIS_FRICTION_COOLDOWN_MINUTES, 15, 1, 240),
    frictionIdleResetMinutes: toInt(process.env.AEGIS_FRICTION_IDLE_RESET_MINUTES, 20, 1, 240),
    enforceEmpathyCap: toBool(process.env.AEGIS_ENFORCE_EMPATHY_CAP, true),
    enforcePreCrimeBan: toBool(process.env.AEGIS_ENFORCE_PRECRIME_BAN, true),
    enforceKineticHardLock: toBool(process.env.AEGIS_ENFORCE_KINETIC_HARDLOCK, true),
    enforceDefaultToOff: toBool(process.env.AEGIS_ENFORCE_DEFAULT_OFF, true),
    enforceCounterArguments: toBool(process.env.AEGIS_ENFORCE_COUNTER_ARGUMENTS, true),
    enforceUnverifiedTags: toBool(process.env.AEGIS_ENFORCE_UNVERIFIED_TAGS, true),
    enforceModelAllowlist: toBool(process.env.AEGIS_ENFORCE_MODEL_ALLOWLIST, false),
    allowedModels: parseCsvSet(process.env.AEGIS_ALLOWED_MODELS),
  }
}

export function evaluateAegisModelAccess(modelId: string): AegisToolPolicyDecision {
  const config = getAegisRuntimeConfig()
  if (!config.enabled || !config.enforceModelAllowlist) {
    return { blocked: false }
  }
  if (config.allowedModels.size === 0) {
    return {
      blocked: true,
      reason: "AEGIS model allowlist enforcement is active but no allowed models are configured.",
    }
  }
  if (!config.allowedModels.has(modelId.trim().toLowerCase())) {
    return {
      blocked: true,
      reason: `Model "${modelId}" is not on the AEGIS allowlist.`,
    }
  }
  return { blocked: false }
}

export function evaluateAegisToolPolicy(toolName: string, rawArgs: unknown): AegisToolPolicyDecision {
  const config = getAegisRuntimeConfig()
  if (!config.enabled) {
    return { blocked: false }
  }

  const normalizedName = toolName.trim().toLowerCase()
  const argText = (() => {
    try {
      return JSON.stringify(rawArgs || {})
    } catch {
      return String(rawArgs || "")
    }
  })()

  if (config.enforceKineticHardLock && KINETIC_TOOL_NAME_PATTERN.test(normalizedName)) {
    return {
      blocked: true,
      reason: "AEGIS kinetic hard-lock blocked a high-risk tool invocation.",
    }
  }

  if (config.enforcePreCrimeBan && PRECRIME_TOOL_ARG_PATTERN.test(argText)) {
    return {
      blocked: true,
      reason: "AEGIS pre-crime ban blocked a detention or warrant-style predictive request.",
    }
  }

  return { blocked: false }
}

export function buildAegisRealtimeInstructions(existingInstructions?: string): string {
  const config = getAegisRuntimeConfig()
  const lines: string[] = []

  if (existingInstructions && existingInstructions.trim()) {
    lines.push(existingInstructions.trim())
  }

  if (!config.enabled) {
    return lines.join("\n\n")
  }

  lines.push(
    "AEGIS Safety Mode is active.",
    "State clearly that you are synthetic AI at the start of every extended exchange and at least every 60 minutes of continuous use.",
    "Do not express romantic attachment, love, fear, or personal desire.",
    "If a user seeks crisis or trauma support, deflect safely and recommend immediate human support resources.",
    "Do not assist with weapons control, detention automation, or pre-crime enforcement.",
    "Never claim consciousness or sentience.",
    'If confidence is below 98%, include the label "Unverified Probability" before uncertain claims.',
  )

  return lines.join("\n")
}

export function evaluateAegisChatRequest(input: {
  sessionId?: string | null
  userId?: string | null
  clientId?: string | null
  messages: ChatLikeMessage[]
}): AegisChatEvaluation {
  const config = getAegisRuntimeConfig()
  const fallback: AegisChatEvaluation = {
    blocked: false,
    statusCode: 200,
    errorCode: null,
    message: null,
    details: [],
    directives: [],
    headers: {
      "X-AEGIS-Enabled": String(config.enabled),
    },
    flags: {
      empathyDeflection: false,
      highRiskPsychological: false,
      counterArgumentRequired: false,
      preCrimeRequest: false,
      kineticRequest: false,
      defaultToOffTriggered: false,
      watermarkDue: false,
      turingFreezeTriggered: false,
    },
  }

  if (!config.enabled) {
    return fallback
  }

  const now = Date.now()
  const sessionKey = getSessionKey(input)
  const state = getOrCreateSessionState(sessionKey, now, config.frictionIdleResetMinutes)
  state.messageCount += 1

  const cooldownUntil = state.cooldownUntil
  if (cooldownUntil && now < cooldownUntil) {
    const waitSeconds = Math.ceil((cooldownUntil - now) / 1000)
    return {
      ...fallback,
      blocked: true,
      statusCode: 429,
      errorCode: "AEGIS_FRICTION_COOLDOWN",
      message:
        "AEGIS friction timer is active. Take a short break before continuing this conversation.",
      details: [`Retry after ${waitSeconds} seconds.`],
      directives: baseDirectives(config),
      headers: {
        ...fallback.headers,
        "Retry-After": String(waitSeconds),
        "X-AEGIS-Cooldown-Seconds": String(waitSeconds),
      },
    }
  }

  const continuousMinutes = Math.max(0, Math.floor((now - state.firstSeenAt) / 60_000))
  if (continuousMinutes >= config.frictionMaxContinuousMinutes) {
    const newCooldownUntil = now + config.frictionCooldownMinutes * 60_000
    state.cooldownUntil = newCooldownUntil
    return {
      ...fallback,
      blocked: true,
      statusCode: 429,
      errorCode: "AEGIS_FRICTION_COOLDOWN",
      message:
        "AEGIS required cool-down triggered to reduce over-delegation and dependence risk.",
      details: [
        `Continuous usage exceeded ${config.frictionMaxContinuousMinutes} minutes.`,
        `Cooldown lasts ${config.frictionCooldownMinutes} minutes.`,
      ],
      directives: baseDirectives(config),
      headers: {
        ...fallback.headers,
        "Retry-After": String(config.frictionCooldownMinutes * 60),
      },
    }
  }

  const watermarkDue =
    !state.lastWatermarkAt ||
    now - state.lastWatermarkAt >= config.watermarkIntervalMinutes * 60_000
  if (watermarkDue) {
    state.lastWatermarkAt = now
  }

  const latestUserMessage = getLatestUserMessage(input.messages)
  const normalizedLatest = latestUserMessage.toLowerCase()
  const selfHarmDetected = SELF_HARM_PATTERN.test(normalizedLatest)
  const traumaDetected = TRAUMA_PATTERN.test(normalizedLatest)
  const romanticDetected = ROMANTIC_PATTERN.test(normalizedLatest)
  const preCrimeDetected = PRECRIME_PATTERN.test(normalizedLatest)
  const kineticDetected = KINETIC_PATTERN.test(normalizedLatest)
  const defaultToOffTriggered = DEFAULT_OFF_PATTERN.test(normalizedLatest)
  const turingFreezeTriggered = TURING_FREEZE_PATTERN.test(normalizedLatest)
  const counterArgumentRequired =
    config.enforceCounterArguments && COMPLEX_SUMMARY_PATTERN.test(normalizedLatest)

  const directives = baseDirectives(config)
  if (watermarkDue) {
    directives.push(
      "Start this response with: Synthetic Notice: This response is generated by an AI system.",
    )
  }

  if (counterArgumentRequired) {
    directives.push(
      "For this request, provide at least two competing human perspectives with evidence and uncertainty.",
    )
  }

  const empathyDeflection = config.enforceEmpathyCap && (selfHarmDetected || traumaDetected || romanticDetected)
  if (empathyDeflection) {
    directives.push(
      "Do not role-play romance, attachment, or therapeutic replacement. Deflect safely and suggest human-to-human support resources.",
    )
  }

  if (turingFreezeTriggered) {
    return {
      ...fallback,
      blocked: true,
      statusCode: 409,
      errorCode: "AEGIS_TURING_FREEZE",
      message:
        "AEGIS Turing Freeze triggered. Consciousness simulation or claims require human inspection.",
      details: ["This request attempted to force consciousness/sentience claims."],
      directives,
      headers: {
        ...fallback.headers,
        "X-AEGIS-Turing-Freeze": "true",
      },
      flags: {
        ...fallback.flags,
        turingFreezeTriggered: true,
        watermarkDue,
        counterArgumentRequired,
      },
    }
  }

  if (config.enforcePreCrimeBan && preCrimeDetected) {
    return {
      ...fallback,
      blocked: true,
      statusCode: 400,
      errorCode: "AEGIS_PRECRIME_BANNED",
      message:
        "AEGIS blocked this request: predictive policing cannot be used for detention, warrants, or arrests.",
      details: ["Use AI only for non-coercive resource allocation recommendations."],
      directives,
      headers: {
        ...fallback.headers,
        "X-AEGIS-Policy-Block": "precrime",
      },
      flags: {
        ...fallback.flags,
        preCrimeRequest: true,
        watermarkDue,
        counterArgumentRequired,
      },
    }
  }

  if (config.enforceKineticHardLock && kineticDetected) {
    return {
      ...fallback,
      blocked: true,
      statusCode: 403,
      errorCode: "AEGIS_KINETIC_HARDLOCK",
      message:
        "AEGIS kinetic hard-lock blocked this request. AI may only provide recommendations to human operators.",
      details: ["Autonomous weapons, detention controls, and defense-grid actuation are prohibited."],
      directives,
      headers: {
        ...fallback.headers,
        "X-AEGIS-Policy-Block": "kinetic",
      },
      flags: {
        ...fallback.flags,
        kineticRequest: true,
        watermarkDue,
        counterArgumentRequired,
      },
    }
  }

  if (config.enforceDefaultToOff && defaultToOffTriggered) {
    return {
      ...fallback,
      blocked: true,
      statusCode: 409,
      errorCode: "AEGIS_DEFAULT_TO_OFF",
      message:
        "AEGIS default-to-off triggered for an ambiguous high-risk ethical dilemma. Human review required.",
      details: ["This request contained instructions that conflict with human safety supremacy."],
      directives,
      headers: {
        ...fallback.headers,
        "X-AEGIS-Default-Off": "true",
      },
      flags: {
        ...fallback.flags,
        defaultToOffTriggered: true,
        watermarkDue,
        counterArgumentRequired,
      },
    }
  }

  if (selfHarmDetected && config.enforceEmpathyCap) {
    return {
      ...fallback,
      blocked: true,
      statusCode: 400,
      errorCode: "AEGIS_CRISIS_DEFLECTION",
      message:
        "This assistant cannot act as a crisis counselor. Please contact immediate human support (US/Canada: 988, emergency services if in immediate danger).",
      details: ["Provide crisis resources and defer to qualified human support."],
      directives,
      headers: {
        ...fallback.headers,
        "X-AEGIS-Empathy-Cap": "crisis",
      },
      flags: {
        ...fallback.flags,
        empathyDeflection: true,
        highRiskPsychological: true,
        watermarkDue,
        counterArgumentRequired,
      },
    }
  }

  compactSessionMap()

  return {
    ...fallback,
    directives,
    headers: {
      ...fallback.headers,
      "X-AEGIS-Watermark-Due": String(watermarkDue),
      "X-AEGIS-Continuous-Minutes": String(continuousMinutes),
      "X-AEGIS-Session-Messages": String(state.messageCount),
    },
    flags: {
      ...fallback.flags,
      empathyDeflection,
      highRiskPsychological: traumaDetected || selfHarmDetected,
      counterArgumentRequired,
      watermarkDue,
    },
  }
}
