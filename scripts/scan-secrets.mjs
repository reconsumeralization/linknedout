#!/usr/bin/env node
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

const FILE_EXCLUDES = [
  /^pnpm-lock\.yaml$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^skills-lock\.json$/,
]

const PATH_EXCLUDES = [
  /^\.next\//,
  /^node_modules\//,
  /^dist\//,
  /^build\//,
  /^coverage\//,
  /^supabase\/\.temp\//,
]

const SECRET_PATTERNS = [
  { name: "GitHub token", regex: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/g },
  { name: "Supabase secret key", regex: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g },
  { name: "Supabase personal token", regex: /\bsbp_[A-Za-z0-9_-]{16,}\b/g },
  // Prefer longer/key-shape patterns to reduce false positives in fixtures.
  { name: "OpenAI key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { name: "Literal migrate secret", regex: /x-migrate-secret:\s*["']?[A-Za-z0-9_-]{10,}/gi },
]

function shouldSkip(path) {
  if (FILE_EXCLUDES.some((re) => re.test(path))) return true
  if (PATH_EXCLUDES.some((re) => re.test(path))) return true
  return false
}

function getTrackedFiles() {
  const output = execSync("git ls-files", { encoding: "utf8" })
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => !shouldSkip(path))
}

function scanFile(path) {
  let content = ""
  try {
    content = readFileSync(path, "utf8")
  } catch {
    return []
  }

  const findings = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { name, regex } of SECRET_PATTERNS) {
      regex.lastIndex = 0
      if (regex.test(line)) {
        findings.push({ path, line: i + 1, name, snippet: line.trim().slice(0, 180) })
      }
    }
  }
  return findings
}

const files = getTrackedFiles()
const findings = files.flatMap(scanFile)

if (findings.length > 0) {
  console.error("Secret scan failed. Potential leaked secrets detected:\n")
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line} [${finding.name}]`)
    console.error(`  ${finding.snippet}`)
  }
  process.exit(1)
}

console.log(`Secret scan passed (${files.length} tracked files checked).`)

