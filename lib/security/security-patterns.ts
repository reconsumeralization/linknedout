import { createHash } from "node:crypto"

import rawSecurityPatterns from "@/config/security-patterns.json"

type Severity = "critical" | "high" | "medium" | "low"

type PatternEntry = {
  pattern?: unknown
  flags?: unknown
  label?: unknown
  category?: unknown
  description?: unknown
  severity?: unknown
  enabled?: unknown
}

export type ChatJailbreakPattern = {
  pattern: RegExp
  label: string
  severity: Severity
}

export type WebPromptInjectionPattern = {
  pattern: RegExp
  category: string
  severity: Severity
  description: string
}

export type WebSuspiciousPattern = {
  pattern: RegExp
  category: string
  description: string
}

type CompiledPatterns = {
  chatJailbreak: readonly ChatJailbreakPattern[]
  mcpSuspiciousText: readonly RegExp[]
  mcpInjectionCategories: Readonly<Record<string, readonly RegExp[]>>
  mcpEgressDlp: readonly RegExp[]
  supabaseRagPoison: readonly RegExp[]
  supabaseQuerySensitive: readonly RegExp[]
  webPromptInjection: readonly WebPromptInjectionPattern[]
  webSuspicious: readonly WebSuspiciousPattern[]
}

export type SecurityPatternRegistryMeta = {
  version: number
  updatedAt: string | null
  hash: string
  counts: {
    chatJailbreak: number
    mcpSuspiciousText: number
    mcpInjectionCategories: number
    mcpEgressDlp: number
    supabaseRagPoison: number
    supabaseQuerySensitive: number
    webPromptInjection: number
    webSuspicious: number
  }
}

const VALID_REGEX_FLAGS = new Set(["d", "g", "i", "m", "s", "u", "v", "y"])
const loggedConsumers = new Set<string>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function getArray(value: unknown): PatternEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry) => isRecord(entry)) as PatternEntry[]
}

function getString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback
  }
  const normalized = value.trim()
  return normalized || fallback
}

function sanitizeFlags(value: unknown, fallbackFlags: string): string {
  if (typeof value !== "string") {
    return fallbackFlags
  }

  if (value.trim() === "") {
    return ""
  }

  let output = ""
  for (const char of value.trim()) {
    if (VALID_REGEX_FLAGS.has(char) && !output.includes(char)) {
      output += char
    }
  }

  if (!output) {
    return fallbackFlags
  }
  return output
}

function compileRegex(source: string, flags: string, context: string): RegExp | null {
  try {
    return new RegExp(source, flags)
  } catch {
    console.warn(`[security-patterns] Skipping invalid regex at ${context}`)
    return null
  }
}

function normalizeSeverity(value: unknown, fallback: Severity): Severity {
  if (typeof value !== "string") {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === "critical" || normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized
  }
  return fallback
}

function compileRegexList(entries: unknown, context: string, fallbackFlags: string): RegExp[] {
  const compiled: RegExp[] = []
  const list = getArray(entries)

  list.forEach((entry, index) => {
    if (entry.enabled === false) {
      return
    }
    const source = typeof entry.pattern === "string" ? entry.pattern.trim() : ""
    if (!source) {
      return
    }
    const flags = sanitizeFlags(entry.flags, fallbackFlags)
    const regex = compileRegex(source, flags, `${context}[${index}]`)
    if (regex) {
      compiled.push(regex)
    }
  })

  return compiled
}

function compileChatJailbreakPatterns(chatSection: Record<string, unknown>): ChatJailbreakPattern[] {
  const compiled: ChatJailbreakPattern[] = []

  getArray(chatSection.jailbreak).forEach((entry, index) => {
    if (entry.enabled === false) {
      return
    }

    const source = typeof entry.pattern === "string" ? entry.pattern.trim() : ""
    if (!source) {
      return
    }

    const regex = compileRegex(
      source,
      sanitizeFlags(entry.flags, "i"),
      `chat.jailbreak[${index}]`,
    )
    if (!regex) {
      return
    }

    compiled.push({
      pattern: regex,
      label: getString(entry.label, `chat.jailbreak.${index}`),
      severity: normalizeSeverity(entry.severity, "high"),
    })
  })

  return compiled
}

function compileMcpInjectionCategories(
  mcpSection: Record<string, unknown>,
): Readonly<Record<string, readonly RegExp[]>> {
  const rawCategories = isRecord(mcpSection.injectionCategories)
    ? (mcpSection.injectionCategories as Record<string, unknown>)
    : {}
  const compiled: Record<string, readonly RegExp[]> = {}

  for (const [category, entries] of Object.entries(rawCategories)) {
    const patterns = compileRegexList(entries, `mcp.injectionCategories.${category}`, "i")
    if (patterns.length > 0) {
      compiled[category] = Object.freeze(patterns)
    }
  }

  return Object.freeze(compiled)
}

function compileWebPromptInjectionPatterns(webSection: Record<string, unknown>): WebPromptInjectionPattern[] {
  const compiled: WebPromptInjectionPattern[] = []

  getArray(webSection.promptInjection).forEach((entry, index) => {
    if (entry.enabled === false) {
      return
    }

    const source = typeof entry.pattern === "string" ? entry.pattern.trim() : ""
    if (!source) {
      return
    }

    const regex = compileRegex(
      source,
      sanitizeFlags(entry.flags, "i"),
      `web.promptInjection[${index}]`,
    )
    if (!regex) {
      return
    }

    compiled.push({
      pattern: regex,
      category: getString(entry.category, "unknown"),
      severity: normalizeSeverity(entry.severity, "medium"),
      description: getString(entry.description, `web.promptInjection.${index}`),
    })
  })

  return compiled
}

function compileWebSuspiciousPatterns(webSection: Record<string, unknown>): WebSuspiciousPattern[] {
  const compiled: WebSuspiciousPattern[] = []

  getArray(webSection.suspicious).forEach((entry, index) => {
    if (entry.enabled === false) {
      return
    }

    const source = typeof entry.pattern === "string" ? entry.pattern.trim() : ""
    if (!source) {
      return
    }

    const regex = compileRegex(
      source,
      sanitizeFlags(entry.flags, "i"),
      `web.suspicious[${index}]`,
    )
    if (!regex) {
      return
    }

    compiled.push({
      pattern: regex,
      category: getString(entry.category, "unknown"),
      description: getString(entry.description, `web.suspicious.${index}`),
    })
  })

  return compiled
}

function countCategoryPatterns(input: Readonly<Record<string, readonly RegExp[]>>): number {
  return Object.values(input).reduce((count, values) => count + values.length, 0)
}

function buildPatternsRegistry(): {
  compiled: CompiledPatterns
  meta: SecurityPatternRegistryMeta
} {
  const root: Record<string, unknown> = isRecord(rawSecurityPatterns)
    ? (rawSecurityPatterns as Record<string, unknown>)
    : {}
  const chat = isRecord(root.chat) ? (root.chat as Record<string, unknown>) : {}
  const mcp = isRecord(root.mcp) ? (root.mcp as Record<string, unknown>) : {}
  const supabaseLlm = isRecord(root.supabaseLlm)
    ? (root.supabaseLlm as Record<string, unknown>)
    : {}
  const web = isRecord(root.web) ? (root.web as Record<string, unknown>) : {}

  const chatJailbreak = Object.freeze(compileChatJailbreakPatterns(chat))
  const mcpSuspiciousText = Object.freeze(
    compileRegexList(mcp.suspiciousText, "mcp.suspiciousText", "i"),
  )
  const mcpInjectionCategories = compileMcpInjectionCategories(mcp)
  const mcpEgressDlp = Object.freeze(compileRegexList(mcp.egressDlp, "mcp.egressDlp", ""))
  const supabaseRagPoison = Object.freeze(
    compileRegexList(supabaseLlm.ragPoison, "supabaseLlm.ragPoison", "i"),
  )
  const supabaseQuerySensitive = Object.freeze(
    compileRegexList(supabaseLlm.querySensitive, "supabaseLlm.querySensitive", ""),
  )
  const webPromptInjection = Object.freeze(compileWebPromptInjectionPatterns(web))
  const webSuspicious = Object.freeze(compileWebSuspiciousPatterns(web))

  const version = typeof root.version === "number" && Number.isFinite(root.version) ? root.version : 1
  const updatedAt = typeof root.updatedAt === "string" ? root.updatedAt : null
  const hash = createHash("sha256")
    .update(JSON.stringify(rawSecurityPatterns), "utf8")
    .digest("hex")
    .slice(0, 16)

  const compiled: CompiledPatterns = {
    chatJailbreak,
    mcpSuspiciousText,
    mcpInjectionCategories,
    mcpEgressDlp,
    supabaseRagPoison,
    supabaseQuerySensitive,
    webPromptInjection,
    webSuspicious,
  }

  const meta: SecurityPatternRegistryMeta = {
    version,
    updatedAt,
    hash,
    counts: {
      chatJailbreak: chatJailbreak.length,
      mcpSuspiciousText: mcpSuspiciousText.length,
      mcpInjectionCategories: countCategoryPatterns(mcpInjectionCategories),
      mcpEgressDlp: mcpEgressDlp.length,
      supabaseRagPoison: supabaseRagPoison.length,
      supabaseQuerySensitive: supabaseQuerySensitive.length,
      webPromptInjection: webPromptInjection.length,
      webSuspicious: webSuspicious.length,
    },
  }

  return { compiled, meta }
}

const registry = buildPatternsRegistry()

export function getChatJailbreakPatterns(): readonly ChatJailbreakPattern[] {
  return registry.compiled.chatJailbreak
}

export function getMcpSuspiciousTextPatterns(): readonly RegExp[] {
  return registry.compiled.mcpSuspiciousText
}

export function getMcpInjectionCategoryPatterns(): Readonly<Record<string, readonly RegExp[]>> {
  return registry.compiled.mcpInjectionCategories
}

export function getMcpEgressDlpPatterns(): readonly RegExp[] {
  return registry.compiled.mcpEgressDlp
}

export function getSupabaseRagPoisonPatterns(): readonly RegExp[] {
  return registry.compiled.supabaseRagPoison
}

export function getSupabaseQuerySensitivePatterns(): readonly RegExp[] {
  return registry.compiled.supabaseQuerySensitive
}

export function getWebPromptInjectionPatterns(): readonly WebPromptInjectionPattern[] {
  return registry.compiled.webPromptInjection
}

export function getWebSuspiciousPatterns(): readonly WebSuspiciousPattern[] {
  return registry.compiled.webSuspicious
}

export function getSecurityPatternRegistryMeta(): SecurityPatternRegistryMeta {
  return registry.meta
}

export function logSecurityPatternRegistryLoad(consumer: string): void {
  const normalizedConsumer = consumer.trim() || "unknown-consumer"
  if (loggedConsumers.has(normalizedConsumer)) {
    return
  }
  loggedConsumers.add(normalizedConsumer)

  const meta = getSecurityPatternRegistryMeta()
  const countsSummary = Object.entries(meta.counts)
    .map(([section, count]) => `${section}=${count}`)
    .join(", ")

  console.info(
    `[security-patterns] consumer=${normalizedConsumer} version=${meta.version} hash=${meta.hash} counts=${countsSummary}`,
  )
}
