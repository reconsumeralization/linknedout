#!/usr/bin/env npx tsx
/**
 * LinkedOut CLI — terminal interface for agents and power users.
 *
 * Usage:
 *   npx tsx cli/linkedout.ts <command> [options]
 *
 * Or add to package.json scripts:
 *   "cli": "tsx cli/linkedout.ts"
 * Then: pnpm cli status
 *
 * Or create a shell alias:
 *   alias linkedout="npx tsx /path/to/cli/linkedout.ts"
 *
 * Environment:
 *   LINKEDOUT_URL  — base URL of the running Next.js app (default: http://localhost:3000)
 */

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_DIR = join(homedir(), ".linkedout")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readConfig(): Record<string, string> {
  ensureConfigDir()
  if (!existsSync(CONFIG_FILE)) return {}
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"))
  } catch {
    return {}
  }
}

function writeConfig(config: Record<string, string>): void {
  ensureConfigDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n")
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.LINKEDOUT_URL ?? readConfig().url ?? "http://localhost:3000"

async function api<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown; timeout?: number },
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${BASE_URL}${path}`
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    opts?.timeout ?? 15_000,
  )
  try {
    const res = await fetch(url, {
      method: opts?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let data: T
    try {
      data = JSON.parse(text)
    } catch {
      data = text as unknown as T
    }
    return { ok: res.ok, status: res.status, data }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err)
    if (message.includes("abort")) {
      return {
        ok: false,
        status: 0,
        data: { error: "Request timed out" } as unknown as T,
      }
    }
    return {
      ok: false,
      status: 0,
      data: {
        error: `Connection failed: ${message}. Is the app running at ${BASE_URL}?`,
      } as unknown as T,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const CYAN = "\x1b[36m"
const BLUE = "\x1b[34m"

function heading(text: string): void {
  console.log(`\n${BOLD}${CYAN}${text}${RESET}`)
  console.log(`${DIM}${"─".repeat(text.length + 4)}${RESET}`)
}

function kvLine(key: string, value: string | number, color = ""): void {
  console.log(`  ${DIM}${key}:${RESET} ${color}${value}${RESET}`)
}

function stateColor(state: string): string {
  if (state === "closed" || state === "ok" || state === "healthy") return GREEN
  if (state === "warning") return YELLOW
  return RED
}

function errorOut(msg: string): void {
  console.error(`${RED}Error:${RESET} ${msg}`)
  process.exit(1)
}

function table(
  headers: string[],
  rows: string[][],
  widths?: number[],
): void {
  const colWidths =
    widths ??
    headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
    )
  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]))
    .join("  ")
  console.log(`  ${BOLD}${headerLine}${RESET}`)
  console.log(`  ${DIM}${colWidths.map((w) => "─".repeat(w)).join("──")}${RESET}`)
  for (const row of rows) {
    const line = row.map((c, i) => (c ?? "").padEnd(colWidths[i])).join("  ")
    console.log(`  ${line}`)
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdStatus(): Promise<void> {
  heading("LinkedOut Workspace Status")

  // Try multiple endpoints to gather status info
  const [profilesRes, healthRes] = await Promise.all([
    api<{ profiles?: unknown[]; count?: number }>("/api/linkedout/contacts?limit=0"),
    api<{ status?: string }>("/api/subagents/supabase/health"),
  ])

  kvLine("Server", BASE_URL, BLUE)

  if (healthRes.ok) {
    const hData = healthRes.data as Record<string, unknown>
    kvLine("Backend", String(hData.status ?? "connected"), stateColor("ok"))
  } else {
    kvLine("Backend", "unavailable", RED)
  }

  if (profilesRes.ok) {
    const pData = profilesRes.data as Record<string, unknown>
    const count =
      typeof pData.count === "number"
        ? pData.count
        : Array.isArray(pData.profiles)
          ? pData.profiles.length
          : Array.isArray(pData)
            ? pData.length
            : "unknown"
    kvLine("Profiles", count)
  } else {
    kvLine("Profiles", "could not retrieve", DIM)
  }

  // Circuit breaker status — attempt sentinel
  const sentinelRes = await api<Record<string, unknown>>("/api/sentinel?action=snapshot")
  if (sentinelRes.ok && sentinelRes.data) {
    kvLine("Sentinel", "active", GREEN)
  } else {
    kvLine("Sentinel", "not available", DIM)
  }

  kvLine("Config dir", CONFIG_DIR, DIM)
  console.log()
}

async function cmdProfilesList(limit: number): Promise<void> {
  heading("Profiles")

  const res = await api<unknown[]>(`/api/linkedout/contacts?limit=${limit}`)
  if (!res.ok) {
    // Fallback: try profiles import endpoint or direct supabase
    const d = res.data as unknown as Record<string, unknown>
    errorOut(String(d.error ?? `HTTP ${res.status}`))
  }

  const profiles = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as Record<string, unknown>).profiles)
      ? (res.data as Record<string, unknown>).profiles as unknown[]
      : Array.isArray((res.data as Record<string, unknown>).data)
        ? (res.data as Record<string, unknown>).data as unknown[]
        : []

  if (profiles.length === 0) {
    console.log(`  ${DIM}No profiles found.${RESET}`)
    console.log()
    return
  }

  const headers = ["Name", "Headline", "Company", "Score"]
  const rows = (profiles as Record<string, unknown>[]).slice(0, limit).map((p) => [
    String(
      p.first_name || p.firstName
        ? `${p.first_name ?? p.firstName ?? ""} ${p.last_name ?? p.lastName ?? ""}`.trim()
        : p.name ?? "—",
    ),
    truncate(String(p.headline ?? "—"), 40),
    truncate(String(p.company ?? "—"), 20),
    p.score != null || p.matchScore != null
      ? String(p.score ?? p.matchScore)
      : "—",
  ])

  table(headers, rows, [24, 42, 22, 6])
  console.log(`\n  ${DIM}Showing ${rows.length} of ${profiles.length} profiles${RESET}\n`)
}

async function cmdTribesList(): Promise<void> {
  heading("Tribes")

  const res = await api<unknown>("/api/linkedout/contacts?groupBy=tribe")
  if (!res.ok) {
    const d = res.data as Record<string, unknown>
    // If the endpoint doesn't support groupBy, show a message
    console.log(`  ${DIM}Tribes endpoint returned: ${d.error ?? `HTTP ${res.status}`}${RESET}`)
    console.log(`  ${DIM}Ensure the app is running and tribes are configured.${RESET}`)
    console.log()
    return
  }

  const data = res.data as Record<string, unknown>
  const tribes = Array.isArray(data.tribes)
    ? data.tribes
    : Array.isArray(data)
      ? data
      : []

  if (tribes.length === 0) {
    console.log(`  ${DIM}No tribes found.${RESET}`)
    console.log()
    return
  }

  const headers = ["Tribe", "Members", "Avg Score"]
  const rows = (tribes as Record<string, unknown>[]).map((t) => [
    truncate(String(t.name ?? t.tribe ?? "—"), 30),
    String(t.memberCount ?? t.members ?? "—"),
    t.avgScore != null ? String(Math.round(Number(t.avgScore))) : "—",
  ])

  table(headers, rows, [32, 10, 10])
  console.log()
}

async function cmdImport(filePath: string): Promise<void> {
  heading("Import")

  if (!existsSync(filePath)) {
    errorOut(`File not found: ${filePath}`)
  }

  const raw = readFileSync(filePath, "utf-8")
  const ext = filePath.split(".").pop()?.toLowerCase()

  let profiles: Record<string, unknown>[] = []

  if (ext === "json") {
    const parsed = JSON.parse(raw)
    profiles = Array.isArray(parsed) ? parsed : parsed.profiles ?? [parsed]
  } else if (ext === "csv") {
    profiles = parseCsv(raw)
  } else if (ext === "vcf") {
    profiles = parseVcf(raw)
  } else {
    errorOut(`Unsupported file type: .${ext} (supported: .csv, .json, .vcf)`)
  }

  console.log(`  Parsed ${BOLD}${profiles.length}${RESET} profiles from ${filePath}`)

  if (profiles.length === 0) {
    console.log(`  ${YELLOW}No profiles to import.${RESET}`)
    console.log()
    return
  }

  // Send in batches of 50
  const batchSize = 50
  let imported = 0
  let failed = 0

  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize).map((p) => ({
      sessionId: `cli-import-${Date.now()}`,
      firstName: String(p.firstName ?? p.first_name ?? p["First Name"] ?? "Unknown"),
      lastName: String(p.lastName ?? p.last_name ?? p["Last Name"] ?? ""),
      headline: String(p.headline ?? p.Headline ?? p.title ?? p.Title ?? "Imported via CLI"),
      company: p.company ?? p.Company ?? p["Company Name"] ?? undefined,
      location: p.location ?? p.Location ?? undefined,
      industry: p.industry ?? p.Industry ?? undefined,
      skills: Array.isArray(p.skills)
        ? p.skills
        : typeof p.skills === "string"
          ? p.skills.split(",").map((s: string) => s.trim())
          : typeof p.Skills === "string"
            ? p.Skills.split(",").map((s: string) => s.trim())
            : [],
      linkedinUrl: p.linkedinUrl ?? p.linkedin_url ?? p["LinkedIn URL"] ?? undefined,
    }))

    const res = await api("/api/profiles/import", {
      method: "POST",
      body: { profiles: batch },
    })

    if (res.ok) {
      imported += batch.length
    } else {
      failed += batch.length
      const d = res.data as Record<string, unknown>
      console.log(`  ${RED}Batch failed: ${d.error ?? `HTTP ${res.status}`}${RESET}`)
    }
  }

  console.log(
    `  ${GREEN}Imported: ${imported}${RESET}` +
      (failed > 0 ? `  ${RED}Failed: ${failed}${RESET}` : ""),
  )
  console.log()
}

async function cmdSafetyStatus(): Promise<void> {
  heading("Safety Status")

  const sentinelRes = await api<Record<string, unknown>>("/api/sentinel?action=snapshot")
  if (sentinelRes.ok && sentinelRes.data) {
    const snap = sentinelRes.data
    kvLine("Sentinel", "active", GREEN)
    if (snap.threats != null) {
      kvLine("Active threats", String((snap.threats as unknown[]).length ?? 0))
    }
    if (snap.incidents != null) {
      kvLine("Incidents", String((snap.incidents as unknown[]).length ?? 0))
    }
  } else {
    kvLine("Sentinel", "not reachable", RED)
  }

  // Circuit breaker info (client-side concept, show what we can infer)
  kvLine("Circuit breaker", "client-side (check UI transparency panel)", DIM)
  kvLine(
    "Note",
    "Circuit breaker state lives in the browser. Use `linkedout safety reset` to request reset via API.",
    DIM,
  )
  console.log()
}

async function cmdSafetyReset(): Promise<void> {
  heading("Safety Reset")

  const res = await api<Record<string, unknown>>("/api/sentinel", {
    method: "POST",
    body: { action: "reset" },
  })

  if (res.ok) {
    console.log(`  ${GREEN}Safety systems reset request sent.${RESET}`)
  } else {
    const d = res.data as Record<string, unknown>
    console.log(`  ${YELLOW}Reset response: ${d.error ?? `HTTP ${res.status}`}${RESET}`)
    console.log(`  ${DIM}Circuit breaker state is client-side. Refresh the browser to reset.${RESET}`)
  }
  console.log()
}

async function cmdChat(message: string, persona: string): Promise<void> {
  heading("Chat")
  console.log(`  ${DIM}Persona: ${persona}${RESET}`)
  console.log(`  ${DIM}Message: ${message}${RESET}`)
  console.log()

  const res = await api<unknown>("/api/chat", {
    method: "POST",
    body: {
      messages: [{ role: "user", content: message }],
      persona,
    },
    timeout: 60_000,
  })

  if (!res.ok) {
    const d = res.data as Record<string, unknown>
    // Chat endpoint streams — we may get partial text
    if (typeof res.data === "string" && (res.data as string).length > 0) {
      console.log(`  ${BOLD}AI:${RESET}`)
      printWrapped(res.data as string)
    } else {
      errorOut(String(d.error ?? `HTTP ${res.status}`))
    }
    console.log()
    return
  }

  // The chat endpoint uses streamText, so the response may be streaming text
  const data = res.data
  if (typeof data === "string") {
    console.log(`  ${BOLD}AI:${RESET}`)
    printWrapped(data)
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>
    const content =
      obj.text ??
      obj.content ??
      obj.message ??
      (Array.isArray(obj.messages)
        ? (obj.messages as Record<string, unknown>[]).pop()?.content
        : null)
    if (content) {
      console.log(`  ${BOLD}AI:${RESET}`)
      printWrapped(String(content))
    } else {
      console.log(`  ${DIM}Response received (streaming endpoint — use browser for full experience)${RESET}`)
    }
  }
  console.log()
}

function cmdConfigSet(key: string, value: string): void {
  heading("Config Set")
  const config = readConfig()
  config[key] = value
  writeConfig(config)
  kvLine(key, value, GREEN)
  console.log(`  ${DIM}Saved to ${CONFIG_FILE}${RESET}`)
  console.log()
}

function cmdConfigGet(key: string): void {
  const config = readConfig()
  if (key in config) {
    console.log(config[key])
  } else {
    const envKey = `LINKEDOUT_${key.toUpperCase().replace(/-/g, "_")}`
    const envVal = process.env[envKey]
    if (envVal) {
      console.log(envVal)
    } else {
      errorOut(`Key "${key}" not found in config or environment`)
    }
  }
}

async function cmdTransparencyExport(outFile: string): Promise<void> {
  heading("Transparency Export")

  // Attempt to get transparency data from sentinel or governance endpoint
  const res = await api<Record<string, unknown>>("/api/sentinel?action=snapshot")

  const exportData: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    source: BASE_URL,
    note: "Transparency log is primarily stored client-side in the browser. This export contains server-side sentinel data.",
  }

  if (res.ok && res.data) {
    exportData.sentinel = res.data
  }

  // Also try governance endpoint
  const govRes = await api<Record<string, unknown>>("/api/governance")
  if (govRes.ok && govRes.data) {
    exportData.governance = govRes.data
  }

  writeFileSync(outFile, JSON.stringify(exportData, null, 2) + "\n")
  console.log(`  ${GREEN}Exported to ${outFile}${RESET}`)
  kvLine("Size", `${(JSON.stringify(exportData).length / 1024).toFixed(1)} KB`)
  console.log()
}

// ---------------------------------------------------------------------------
// Parsers (self-contained, no external deps)
// ---------------------------------------------------------------------------

function parseCsv(raw: string): Record<string, unknown>[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim() ?? ""
    })
    return obj
  })
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseVcf(raw: string): Record<string, unknown>[] {
  const cards = raw.split("BEGIN:VCARD").filter((c) => c.includes("END:VCARD"))
  return cards.map((card) => {
    const lines = card.split(/\r?\n/)
    const obj: Record<string, unknown> = {}

    for (const line of lines) {
      if (line.startsWith("FN:") || line.startsWith("FN;")) {
        const fullName = line.split(":").slice(1).join(":")
        const parts = fullName.trim().split(/\s+/)
        obj.firstName = parts[0] ?? ""
        obj.lastName = parts.slice(1).join(" ")
      } else if (line.startsWith("N:") || line.startsWith("N;")) {
        // N:Last;First;Middle;Prefix;Suffix
        if (!obj.firstName) {
          const nParts = line.split(":").slice(1).join(":").split(";")
          obj.lastName = nParts[0]?.trim() ?? ""
          obj.firstName = nParts[1]?.trim() ?? ""
        }
      } else if (line.startsWith("TITLE:")) {
        obj.headline = line.slice(6).trim()
      } else if (line.startsWith("ORG:")) {
        obj.company = line.slice(4).trim().replace(/;/g, ", ")
      } else if (line.startsWith("URL:") && line.toLowerCase().includes("linkedin")) {
        obj.linkedinUrl = line.split(":").slice(1).join(":")
      }
    }

    if (!obj.headline) obj.headline = obj.company ? `at ${obj.company}` : "Imported from VCF"
    return obj
  })
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str
}

function printWrapped(text: string, indent = 4, width = 80): void {
  const prefix = " ".repeat(indent)
  const words = text.split(/\s+/)
  let line = prefix

  for (const word of words) {
    if (line.length + word.length + 1 > width && line.trim().length > 0) {
      console.log(line)
      line = prefix + word
    } else {
      line += (line.trim().length > 0 ? " " : "") + word
    }
  }
  if (line.trim().length > 0) console.log(line)
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
${BOLD}linkedout${RESET} — CLI for LinkedOut CRM & Tribe Intelligence

${BOLD}USAGE${RESET}
  npx tsx cli/linkedout.ts <command> [options]

${BOLD}COMMANDS${RESET}
  ${CYAN}status${RESET}                                  Show workspace status
  ${CYAN}profiles list${RESET} [--limit N]               List profiles (default limit: 20)
  ${CYAN}tribes list${RESET}                              List tribes
  ${CYAN}import${RESET} <file>                            Import CSV, JSON, or VCF file
  ${CYAN}safety status${RESET}                            Show circuit breaker & sentinel state
  ${CYAN}safety reset${RESET}                             Reset circuit breaker
  ${CYAN}chat${RESET} "<message>" [--persona <name>]      Send message to AI
  ${CYAN}config set${RESET} <key> <value>                 Set a config value
  ${CYAN}config get${RESET} <key>                         Get a config value
  ${CYAN}transparency export${RESET} [--file output.json] Export transparency log

${BOLD}PERSONAS${RESET} (for chat command)
  hr-director, talent-scout, team-builder, culture-analyst

${BOLD}ENVIRONMENT${RESET}
  LINKEDOUT_URL    Base URL of the running Next.js app (default: http://localhost:3000)

${BOLD}CONFIG${RESET}
  Config is stored in ~/.linkedout/config.json
  Common keys: url, apiKey

${BOLD}EXAMPLES${RESET}
  ${DIM}# Check workspace status${RESET}
  linkedout status

  ${DIM}# List first 10 profiles${RESET}
  linkedout profiles list --limit 10

  ${DIM}# Import a LinkedIn CSV export${RESET}
  linkedout import connections.csv

  ${DIM}# Ask the AI a question as talent scout${RESET}
  linkedout chat "Who are the top engineers in my network?" --persona talent-scout

  ${DIM}# Set a custom server URL${RESET}
  linkedout config set url http://localhost:4000

  ${DIM}# Export transparency data${RESET}
  linkedout transparency export --file audit.json
`

// ---------------------------------------------------------------------------
// Argument parsing & routing
// ---------------------------------------------------------------------------

function parseArgs(): { command: string; args: string[]; flags: Record<string, string> } {
  const raw = process.argv.slice(2)
  const flags: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      // Check if next arg is the value (not another flag)
      if (i + 1 < raw.length && !raw[i + 1].startsWith("--")) {
        flags[key] = raw[i + 1]
        i++
      } else {
        flags[key] = "true"
      }
    } else {
      positional.push(arg)
    }
  }

  return {
    command: positional[0] ?? "",
    args: positional.slice(1),
    flags,
  }
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs()

  if (!command || command === "help" || flags.help === "true") {
    console.log(HELP)
    return
  }

  switch (command) {
    case "status":
      await cmdStatus()
      break

    case "profiles":
      if (args[0] === "list") {
        const limit = parseInt(flags.limit ?? "20", 10)
        await cmdProfilesList(limit)
      } else {
        console.log(`  Unknown profiles subcommand: ${args[0] ?? "(none)"}`)
        console.log(`  Usage: linkedout profiles list [--limit N]`)
      }
      break

    case "tribes":
      if (args[0] === "list") {
        await cmdTribesList()
      } else {
        console.log(`  Unknown tribes subcommand: ${args[0] ?? "(none)"}`)
        console.log(`  Usage: linkedout tribes list`)
      }
      break

    case "import":
      if (!args[0]) {
        errorOut("Missing file path. Usage: linkedout import <file>")
      }
      await cmdImport(args[0])
      break

    case "safety":
      if (args[0] === "status") {
        await cmdSafetyStatus()
      } else if (args[0] === "reset") {
        await cmdSafetyReset()
      } else {
        console.log(`  Unknown safety subcommand: ${args[0] ?? "(none)"}`)
        console.log(`  Usage: linkedout safety status|reset`)
      }
      break

    case "chat": {
      const message = args[0]
      if (!message) {
        errorOut('Missing message. Usage: linkedout chat "<message>" [--persona name]')
      }
      const persona = flags.persona ?? "team-builder"
      const validPersonas = ["hr-director", "talent-scout", "team-builder", "culture-analyst"]
      if (!validPersonas.includes(persona)) {
        errorOut(`Invalid persona "${persona}". Choose from: ${validPersonas.join(", ")}`)
      }
      await cmdChat(message, persona)
      break
    }

    case "config":
      if (args[0] === "set") {
        if (!args[1] || !args[2]) {
          errorOut("Usage: linkedout config set <key> <value>")
        }
        cmdConfigSet(args[1], args[2])
      } else if (args[0] === "get") {
        if (!args[1]) {
          errorOut("Usage: linkedout config get <key>")
        }
        cmdConfigGet(args[1])
      } else {
        console.log(`  Unknown config subcommand: ${args[0] ?? "(none)"}`)
        console.log(`  Usage: linkedout config set|get <key> [value]`)
      }
      break

    case "transparency":
      if (args[0] === "export") {
        const outFile = flags.file ?? "transparency-export.json"
        await cmdTransparencyExport(outFile)
      } else {
        console.log(`  Unknown transparency subcommand: ${args[0] ?? "(none)"}`)
        console.log(`  Usage: linkedout transparency export [--file output.json]`)
      }
      break

    default:
      console.log(`  ${RED}Unknown command: ${command}${RESET}`)
      console.log(`  Run ${CYAN}linkedout help${RESET} for available commands.`)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal:${RESET} ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
