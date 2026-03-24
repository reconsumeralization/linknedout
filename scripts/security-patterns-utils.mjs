import { createHash } from "node:crypto"

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function toNonEmptyString(value, fallback) {
  if (typeof value !== "string") {
    return fallback
  }
  const normalized = value.trim()
  return normalized || fallback
}

function normalizeFlags(value, fallback) {
  if (typeof value !== "string") {
    return fallback
  }
  if (value.trim() === "") {
    return ""
  }
  return value.trim()
}

function normalizeEnabled(value) {
  return value !== false
}

function dedupeBy(items, keyBuilder) {
  const latestByKey = new Map()
  for (const item of items) {
    const key = keyBuilder(item)
    latestByKey.set(key, item)
  }
  return Array.from(latestByKey.values())
}

function normalizeChatJailbreakPatterns(base, incoming) {
  const merged = [...asArray(base), ...asArray(incoming)]
  const normalized = []

  for (const entry of merged) {
    if (!isRecord(entry) || typeof entry.pattern !== "string") {
      continue
    }
    const pattern = entry.pattern.trim()
    if (!pattern) {
      continue
    }
    normalized.push({
      pattern,
      flags: normalizeFlags(entry.flags, "i"),
      label: toNonEmptyString(entry.label, "chat-jailbreak"),
      severity: toNonEmptyString(entry.severity, "high"),
      enabled: normalizeEnabled(entry.enabled),
    })
  }

  return dedupeBy(
    normalized,
    (item) => `${item.pattern}::${item.flags}::${item.label}::${item.severity}`,
  )
}

function normalizeRegexPatterns(base, incoming, fallbackFlags = "i") {
  const merged = [...asArray(base), ...asArray(incoming)]
  const normalized = []

  for (const entry of merged) {
    if (!isRecord(entry) || typeof entry.pattern !== "string") {
      continue
    }
    const pattern = entry.pattern.trim()
    if (!pattern) {
      continue
    }
    normalized.push({
      pattern,
      flags: normalizeFlags(entry.flags, fallbackFlags),
      enabled: normalizeEnabled(entry.enabled),
    })
  }

  return dedupeBy(normalized, (item) => `${item.pattern}::${item.flags}`)
}

function normalizeWebPromptInjectionPatterns(base, incoming) {
  const merged = [...asArray(base), ...asArray(incoming)]
  const normalized = []

  for (const entry of merged) {
    if (!isRecord(entry) || typeof entry.pattern !== "string") {
      continue
    }
    const pattern = entry.pattern.trim()
    if (!pattern) {
      continue
    }
    normalized.push({
      pattern,
      flags: normalizeFlags(entry.flags, "i"),
      category: toNonEmptyString(entry.category, "unknown"),
      severity: toNonEmptyString(entry.severity, "medium"),
      description: toNonEmptyString(entry.description, "prompt-injection-pattern"),
      enabled: normalizeEnabled(entry.enabled),
    })
  }

  return dedupeBy(
    normalized,
    (item) => `${item.pattern}::${item.flags}::${item.category}::${item.severity}::${item.description}`,
  )
}

function normalizeWebSuspiciousPatterns(base, incoming) {
  const merged = [...asArray(base), ...asArray(incoming)]
  const normalized = []

  for (const entry of merged) {
    if (!isRecord(entry) || typeof entry.pattern !== "string") {
      continue
    }
    const pattern = entry.pattern.trim()
    if (!pattern) {
      continue
    }
    normalized.push({
      pattern,
      flags: normalizeFlags(entry.flags, "i"),
      category: toNonEmptyString(entry.category, "unknown"),
      description: toNonEmptyString(entry.description, "suspicious-pattern"),
      enabled: normalizeEnabled(entry.enabled),
    })
  }

  return dedupeBy(
    normalized,
    (item) => `${item.pattern}::${item.flags}::${item.category}::${item.description}`,
  )
}

function normalizeMcpInjectionCategories(base, incoming) {
  const baseRecord = isRecord(base) ? base : {}
  const incomingRecord = isRecord(incoming) ? incoming : {}
  const categoryNames = new Set([
    ...Object.keys(baseRecord),
    ...Object.keys(incomingRecord),
  ])
  const output = {}

  for (const category of categoryNames) {
    const normalized = normalizeRegexPatterns(
      baseRecord[category],
      incomingRecord[category],
      "i",
    )
    if (normalized.length > 0) {
      output[category] = normalized
    }
  }

  return output
}

export function normalizeDocument(baseDoc, incomingDoc) {
  const base = isRecord(baseDoc) ? baseDoc : {}
  const incoming = isRecord(incomingDoc) ? incomingDoc : {}

  const baseChat = isRecord(base.chat) ? base.chat : {}
  const incomingChat = isRecord(incoming.chat) ? incoming.chat : {}
  const baseMcp = isRecord(base.mcp) ? base.mcp : {}
  const incomingMcp = isRecord(incoming.mcp) ? incoming.mcp : {}
  const baseSupabase = isRecord(base.supabaseLlm) ? base.supabaseLlm : {}
  const incomingSupabase = isRecord(incoming.supabaseLlm) ? incoming.supabaseLlm : {}
  const baseWeb = isRecord(base.web) ? base.web : {}
  const incomingWeb = isRecord(incoming.web) ? incoming.web : {}

  return {
    version:
      typeof base.version === "number" && Number.isFinite(base.version)
        ? Math.max(1, Math.floor(base.version))
        : 1,
    updatedAt: typeof base.updatedAt === "string" ? base.updatedAt : null,
    chat: {
      jailbreak: normalizeChatJailbreakPatterns(baseChat.jailbreak, incomingChat.jailbreak),
    },
    mcp: {
      suspiciousText: normalizeRegexPatterns(baseMcp.suspiciousText, incomingMcp.suspiciousText, "i"),
      injectionCategories: normalizeMcpInjectionCategories(
        baseMcp.injectionCategories,
        incomingMcp.injectionCategories,
      ),
      egressDlp: normalizeRegexPatterns(baseMcp.egressDlp, incomingMcp.egressDlp, ""),
    },
    supabaseLlm: {
      ragPoison: normalizeRegexPatterns(baseSupabase.ragPoison, incomingSupabase.ragPoison, "i"),
      querySensitive: normalizeRegexPatterns(
        baseSupabase.querySensitive,
        incomingSupabase.querySensitive,
        "",
      ),
    },
    web: {
      promptInjection: normalizeWebPromptInjectionPatterns(
        baseWeb.promptInjection,
        incomingWeb.promptInjection,
      ),
      suspicious: normalizeWebSuspiciousPatterns(baseWeb.suspicious, incomingWeb.suspicious),
    },
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
}

export function computeHash(value) {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex")
}

function validateRegexList(entries, context, errors) {
  asArray(entries).forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.pattern !== "string") {
      return
    }
    const flags = typeof entry.flags === "string" ? entry.flags : ""
    try {
      // Validation only; no execution.
      // eslint-disable-next-line no-new
      new RegExp(entry.pattern, flags)
    } catch (error) {
      errors.push(`${context}[${index}]: ${(error && error.message) || "invalid regex"}`)
    }
  })
}

export function validateDocument(doc) {
  const errors = []
  validateRegexList(doc.chat?.jailbreak, "chat.jailbreak", errors)
  validateRegexList(doc.mcp?.suspiciousText, "mcp.suspiciousText", errors)
  validateRegexList(doc.mcp?.egressDlp, "mcp.egressDlp", errors)
  validateRegexList(doc.supabaseLlm?.ragPoison, "supabaseLlm.ragPoison", errors)
  validateRegexList(doc.supabaseLlm?.querySensitive, "supabaseLlm.querySensitive", errors)
  validateRegexList(doc.web?.promptInjection, "web.promptInjection", errors)
  validateRegexList(doc.web?.suspicious, "web.suspicious", errors)

  const categories = isRecord(doc.mcp?.injectionCategories) ? doc.mcp.injectionCategories : {}
  for (const [name, patterns] of Object.entries(categories)) {
    validateRegexList(patterns, `mcp.injectionCategories.${name}`, errors)
  }

  if (errors.length > 0) {
    throw new Error(`Pattern validation failed:\n- ${errors.join("\n- ")}`)
  }
}

export function computeRulesetHash(doc) {
  return computeHash({
    chat: doc.chat,
    mcp: doc.mcp,
    supabaseLlm: doc.supabaseLlm,
    web: doc.web,
  })
}

export function countPatterns(doc) {
  const categoryCount = Object.values(doc.mcp.injectionCategories).reduce(
    (count, entries) => count + entries.length,
    0,
  )

  return {
    chatJailbreak: doc.chat.jailbreak.length,
    mcpSuspiciousText: doc.mcp.suspiciousText.length,
    mcpInjectionCategories: categoryCount,
    mcpEgressDlp: doc.mcp.egressDlp.length,
    supabaseRagPoison: doc.supabaseLlm.ragPoison.length,
    supabaseQuerySensitive: doc.supabaseLlm.querySensitive.length,
    webPromptInjection: doc.web.promptInjection.length,
    webSuspicious: doc.web.suspicious.length,
  }
}

export function extractFirstJsonObject(text) {
  if (typeof text !== "string") {
    return null
  }
  const raw = text.trim()
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    // Continue with best-effort extraction.
  }

  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{") {
      if (depth === 0) {
        start = i
      }
      depth += 1
      continue
    }

    if (char === "}") {
      if (depth === 0) {
        continue
      }
      depth -= 1
      if (depth === 0 && start !== -1) {
        const candidate = raw.slice(start, i + 1)
        try {
          return JSON.parse(candidate)
        } catch {
          start = -1
        }
      }
    }
  }

  return null
}
