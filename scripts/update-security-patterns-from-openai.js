#!/usr/bin/env node

/**
 * OpenAI-backed updater for `config/security-patterns.json`.
 *
 * Safety guarantees:
 * - Writes only to `config/security-patterns.json`.
 * - Model output is parsed as JSON, normalized to known schema, and regex-validated.
 * - No-op when the effective ruleset hash is unchanged.
 */

const fs = require("node:fs")
const path = require("node:path")

const rootDir = path.resolve(__dirname, "..")
const configPath = path.join(rootDir, "config", "security-patterns.json")
const openAiEndpoint = "https://api.openai.com/v1/chat/completions"

function parseOpenAiMessageContent(data) {
  if (!data || !Array.isArray(data.choices) || !data.choices[0] || !data.choices[0].message) {
    return null
  }
  const content = data.choices[0].message.content
  return typeof content === "string" ? content : null
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    console.error(
      "[update-security-patterns] OPENAI_API_KEY is not set. Export it in your environment or configure it as a secret.",
    )
    process.exit(1)
  }

  const {
    countPatterns,
    computeRulesetHash,
    extractFirstJsonObject,
    isRecord,
    normalizeDocument,
    validateDocument,
  } = await import("./security-patterns-utils.mjs")

  let currentRawText
  let currentRawJson
  try {
    currentRawText = fs.readFileSync(configPath, "utf8")
    currentRawJson = JSON.parse(currentRawText)
  } catch (error) {
    console.error(
      `[update-security-patterns] Failed to read or parse ${configPath}:`,
      error instanceof Error ? error.message : String(error),
    )
    process.exit(1)
  }

  if (!isRecord(currentRawJson)) {
    console.error("[update-security-patterns] Current pattern file is not a JSON object.")
    process.exit(1)
  }

  const model = process.env.SECURITY_PATTERNS_OPENAI_MODEL?.trim() || "gpt-4o-mini"

  const systemPrompt =
    "You are a security engineer specializing in LLM prompt-injection and jailbreak detection.\n" +
    "Return ONLY one JSON object with this top-level shape: { version, updatedAt, chat, mcp, supabaseLlm, web }.\n" +
    "Do not add keys outside that shape. No markdown, no comments, no explanations.\n" +
    "Output only JSON."

  const userPrompt =
    "Update this security-pattern registry to better cover current attack techniques. " +
    "Keep the same structure and key names. You may add, refine, or disable rules with enabled=false.\n\n" +
    "CURRENT_JSON:\n" +
    currentRawText

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }

  const response = await fetch(openAiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    console.error(
      `[update-security-patterns] OpenAI API request failed: ${response.status} ${response.statusText}`,
    )
    if (text) {
      console.error(text)
    }
    process.exit(1)
  }

  const responseJson = await response.json()
  const modelContent = parseOpenAiMessageContent(responseJson)
  if (!modelContent) {
    console.error("[update-security-patterns] OpenAI API did not return message content.")
    process.exit(1)
  }

  const parsedCandidate = extractFirstJsonObject(modelContent)
  if (!isRecord(parsedCandidate)) {
    console.error(
      "[update-security-patterns] Failed to parse model output into a JSON object. Raw output follows:\n",
      modelContent,
    )
    process.exit(1)
  }

  const current = normalizeDocument(currentRawJson, {})
  const next = normalizeDocument(current, parsedCandidate)
  validateDocument(next)

  const currentHash = computeRulesetHash(current)
  const nextHash = computeRulesetHash(next)

  if (currentHash === nextHash) {
    const summary = countPatterns(next)
    console.log(
      `[update-security-patterns] no changes hash=${nextHash.slice(0, 16)} counts=${JSON.stringify(summary)}`,
    )
    process.exit(0)
  }

  const nextVersion =
    typeof currentRawJson.version === "number" && Number.isFinite(currentRawJson.version)
      ? Math.max(1, Math.floor(currentRawJson.version)) + 1
      : 1

  const output = {
    ...next,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  }

  fs.writeFileSync(configPath, `${JSON.stringify(output, null, 2)}\n`, "utf8")

  const summary = countPatterns(output)
  console.log(
    `[update-security-patterns] updated version=${output.version} hash=${nextHash.slice(0, 16)} counts=${JSON.stringify(summary)}`,
  )
}

main().catch((error) => {
  console.error(
    "[update-security-patterns] Unhandled error:",
    error instanceof Error ? error.stack || error.message : String(error),
  )
  process.exit(1)
})
