/**
 * Parser for FileFlex-style audit / activity CSV exports (wide schema with Activity ID, Type, Date, …).
 */

import type { ParsedProfile } from "@/lib/csv/csv-parser"
import { parseCsvRow } from "@/lib/csv/csv-parser"

export type ParsedActivity = {
  activityId: string
  type: string
  dateIso: string
  actorName: string
  email: string
  uid: string
  providerName: string
  scheme: string
  groupName: string
  resourceLabel: string
  os: string
  clientType: string
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"')
  return t
}

function headerIndexMap(headerRow: string[]): Map<string, number> {
  const m = new Map<string, number>()
  headerRow.forEach((raw, i) => {
    m.set(stripQuotes(raw), i)
  })
  return m
}

function cell(cells: string[], m: Map<string, number>, col: string): string {
  const i = m.get(col)
  if (i === undefined) return ""
  return stripQuotes(cells[i] ?? "")
}

/** Detect FileFlex / enterprise activity export from header row. */
export function isActivityAuditCsv(csvData: string): boolean {
  const line = csvData.trim().split(/\r?\n/).find((l) => l.trim().length > 0)
  if (!line) return false
  const h = parseCsvRow(line).map(stripQuotes)
  return h.includes("Activity ID") && h.includes("Type") && h.includes("Date")
}

export function parseActivityCsv(csvData: string): ParsedActivity[] {
  const lines = csvData.trim().split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0])
  const m = headerIndexMap(headers)
  if (!m.has("Activity ID") || !m.has("Type")) return []

  const out: ParsedActivity[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.every((c) => !stripQuotes(c))) continue

    const activityId = cell(cells, m, "Activity ID")
    if (!activityId) continue

    const resourceLabel =
      cell(cells, m, "NameVirtualDisplay") ||
      cell(cells, m, "PathActualDisplay") ||
      cell(cells, m, "ResourceNameOld") ||
      ""

    out.push({
      activityId,
      type: cell(cells, m, "Type"),
      dateIso: cell(cells, m, "Date"),
      actorName: cell(cells, m, "Name"),
      email: cell(cells, m, "Email").toLowerCase(),
      uid: cell(cells, m, "Uid"),
      providerName: cell(cells, m, "ProviderName"),
      scheme: cell(cells, m, "Scheme"),
      groupName: cell(cells, m, "GroupName"),
      resourceLabel,
      os: cell(cells, m, "OS"),
      clientType: cell(cells, m, "Client ID"),
    })
  }

  return out
}

function splitActorName(name: string): { firstName: string; lastName: string } {
  const t = name.trim()
  if (!t) return { firstName: "Unknown", lastName: "" }
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

function actorKey(a: ParsedActivity): string {
  if (a.email) return `email:${a.email}`
  if (a.uid) return `uid:${a.uid}`
  return `name:${a.actorName}`
}

/**
 * Collapse activity rows into synthetic ParsedProfile rows so Profiles / Tribes / skills charts get useful grouping.
 */
export function deriveActorProfilesFromActivities(activities: ParsedActivity[]): ParsedProfile[] {
  if (activities.length === 0) return []

  const byKey = new Map<
    string,
    { events: ParsedActivity[]; email: string; name: string }
  >()

  for (const a of activities) {
    const key = actorKey(a)
    let g = byKey.get(key)
    if (!g) {
      g = { events: [], email: a.email, name: a.actorName || a.uid || key }
      byKey.set(key, g)
    }
    g.events.push(a)
    if (a.email) g.email = a.email
    if (a.actorName) g.name = a.actorName
  }

  const profiles: ParsedProfile[] = []

  for (const [key, g] of byKey) {
    const sorted = [...g.events].sort((x, y) => (x.dateIso < y.dateIso ? 1 : x.dateIso > y.dateIso ? -1 : 0))
    const types = sorted.map((e) => e.type).filter(Boolean)
    const uniqueTypes = [...new Set(types)]
    const { firstName, lastName } = splitActorName(g.name)
    const id = `audit-${key.replace(/[^a-z0-9]+/gi, "-").slice(0, 72)}`

    const providers = [...new Set(sorted.map((e) => e.providerName).filter(Boolean))].slice(0, 3)

    profiles.push({
      id,
      firstName,
      lastName,
      headline: `${sorted.length} audit events · ${uniqueTypes.slice(0, 2).join(", ") || "Activity"}`,
      company: providers.length > 0 ? providers.join(" · ") : "Activity export",
      location: sorted[0]?.os ?? "",
      industry: "Audit & access",
      connections: 0,
      skills: uniqueTypes.slice(0, 12),
      matchScore: Math.min(88, 55 + Math.min(20, sorted.length)),
      seniority: "Mid",
      tribe: uniqueTypes[0]?.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "") || "Audit",
      email: g.email || undefined,
      linkedinUrl: undefined,
      connectedOn: sorted[0]?.dateIso,
    })
  }

  return profiles
}

export function summarizeActivityTypes(activities: ParsedActivity[], limit = 12): { type: string; count: number }[] {
  const freq: Record<string, number> = {}
  for (const a of activities) {
    const t = a.type || "Unknown"
    freq[t] = (freq[t] ?? 0) + 1
  }
  return Object.entries(freq)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
