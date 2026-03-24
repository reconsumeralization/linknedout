import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import {
  countPatterns,
  computeRulesetHash,
  isRecord,
  normalizeDocument,
  validateDocument,
} from "./security-patterns-utils.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const patternsPath = path.join(repoRoot, "config", "security-patterns.json")

async function loadExternalFeed() {
  const url = process.env.SECURITY_PATTERNS_FEED_URL?.trim()
  if (!url) {
    return {}
  }

  const headers = {}
  const token = process.env.SECURITY_PATTERNS_FEED_BEARER?.trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch SECURITY_PATTERNS_FEED_URL (${response.status})`)
  }

  const payload = await response.json()
  if (!isRecord(payload)) {
    throw new Error("SECURITY_PATTERNS_FEED_URL returned non-object JSON")
  }
  return payload
}

const currentRaw = JSON.parse(await readFile(patternsPath, "utf8"))
const feedRaw = await loadExternalFeed()

const current = normalizeDocument(currentRaw, {})
const next = normalizeDocument(current, feedRaw)
validateDocument(next)

const currentHash = computeRulesetHash(current)
const nextHash = computeRulesetHash(next)

if (currentHash === nextHash) {
  const summary = countPatterns(next)
  console.log(
    `[security-patterns] no changes hash=${nextHash.slice(0, 16)} counts=${JSON.stringify(summary)}`,
  )
  process.exit(0)
}

const nextVersion =
  typeof currentRaw.version === "number" && Number.isFinite(currentRaw.version)
    ? Math.max(1, Math.floor(currentRaw.version)) + 1
    : 1

const output = {
  ...next,
  version: nextVersion,
  updatedAt: new Date().toISOString(),
}

await writeFile(patternsPath, `${JSON.stringify(output, null, 2)}\n`, "utf8")

const summary = countPatterns(output)
console.log(
  `[security-patterns] updated version=${output.version} hash=${nextHash.slice(0, 16)} counts=${JSON.stringify(summary)}`,
)
