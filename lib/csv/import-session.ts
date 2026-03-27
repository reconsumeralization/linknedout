import type { ParsedProfile } from "@/lib/csv/csv-parser"

export type SessionImportSourceType = "csv" | "linkedin_pdf" | "linkedin_export" | "json" | "vcf"

export type SessionImportSource = {
  id: string
  type: SessionImportSourceType
  fileName: string
  profileIds: string[]
  importedAt: string
  warnings?: string[]
}

export type SessionImportState = {
  canonicalCsv: string | null
  profiles: ParsedProfile[]
  sources: SessionImportSource[]
  displayLabel: string | null
  unsavedPdfProfileIds: string[]
}

export type ImportSourceInput = {
  type: SessionImportSourceType
  fileName: string
  profiles: ParsedProfile[]
  warnings?: string[]
  rawCsv?: string
}

export type ImportSummary = {
  label: string
  profileCount: number
  sourceCount: number
}

export type ApplyImportOptions = {
  sourceId: string
  importedAt: string
}

export const CANONICAL_PROFILE_CSV_HEADERS = [
  "id",
  "firstName",
  "lastName",
  "headline",
  "company",
  "location",
  "industry",
  "connections",
  "skills",
  "matchScore",
  "seniority",
  "tribe",
  "email",
  "linkedinUrl",
  "connectedOn",
] as const

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

function buildFallbackIdentity(profile: ParsedProfile): string {
  return [
    normalizeText(profile.firstName),
    normalizeText(profile.lastName),
    normalizeText(profile.headline),
    normalizeText(profile.company),
  ].join("|")
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`
  }
  return value
}

function serializeNumber(value: number, options?: { allowBlank?: boolean }): string {
  if (!Number.isFinite(value)) {
    return options?.allowBlank ? "" : "0"
  }
  return String(value)
}

function mergeProfileRecord(existing: ParsedProfile, incoming: ParsedProfile): ParsedProfile {
  const mergedLinkedInUrl = incoming.linkedinUrl || existing.linkedinUrl

  return {
    id: existing.id,
    firstName: incoming.firstName || existing.firstName,
    lastName: incoming.lastName || existing.lastName,
    headline: incoming.headline || existing.headline,
    company: incoming.company || existing.company,
    location: incoming.location || existing.location,
    industry: incoming.industry || existing.industry,
    connections: incoming.connections > 0 ? incoming.connections : existing.connections,
    skills: incoming.skills.length > 0 ? incoming.skills : existing.skills,
    matchScore: Number.isFinite(incoming.matchScore) ? incoming.matchScore : existing.matchScore,
    seniority: incoming.seniority || existing.seniority,
    tribe: incoming.tribe || existing.tribe,
    linkedinUrl: mergedLinkedInUrl || undefined,
    email: incoming.email || existing.email,
    connectedOn: incoming.connectedOn || existing.connectedOn,
  }
}

function buildDisplayLabel(sources: SessionImportSource[]): string | null {
  if (sources.length === 0) return null
  if (sources.length === 1) return sources[0].fileName
  return `${sources.length} imported files`
}

export function normalizeLinkedInUrl(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null
  }

  const trimmed = value.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    const host = parsed.hostname.toLowerCase()
    if (!(host === "linkedin.com" || host === "www.linkedin.com" || host.endsWith(".linkedin.com"))) {
      return null
    }

    const normalizedPath = parsed.pathname
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/, "")

    if (!normalizedPath || normalizedPath === "/") {
      return null
    }

    return `https://www.linkedin.com${normalizedPath}`
  } catch {
    return null
  }
}

export function findMatchingImportedProfile(
  profiles: ParsedProfile[],
  target: ParsedProfile,
): ParsedProfile | null {
  const normalizedUrl = normalizeLinkedInUrl(target.linkedinUrl)
  if (normalizedUrl) {
    const urlMatch = profiles.find((profile) => normalizeLinkedInUrl(profile.linkedinUrl) === normalizedUrl)
    if (urlMatch) {
      return urlMatch
    }
  }

  const fallbackIdentity = buildFallbackIdentity(target)
  if (!fallbackIdentity.replace(/\|/g, "")) {
    return null
  }

  return profiles.find((profile) => buildFallbackIdentity(profile) === fallbackIdentity) ?? null
}

export function mergeImportedProfiles(existing: ParsedProfile[], incoming: ParsedProfile[]): ParsedProfile[] {
  const merged = [...existing]

  for (const incomingProfile of incoming) {
    const existingMatch = findMatchingImportedProfile(merged, incomingProfile)
    if (!existingMatch) {
      merged.push(incomingProfile)
      continue
    }

    const matchIndex = merged.findIndex((profile) => profile.id === existingMatch.id)
    if (matchIndex >= 0) {
      merged[matchIndex] = mergeProfileRecord(existingMatch, incomingProfile)
    }
  }

  return merged
}

export function serializeProfilesToCanonicalCsv(profiles: ParsedProfile[]): string {
  if (profiles.length === 0) {
    return ""
  }

  const rows = profiles.map((profile) => {
    const values = [
      profile.id,
      profile.firstName,
      profile.lastName,
      profile.headline,
      profile.company,
      profile.location,
      profile.industry,
      serializeNumber(profile.connections),
      profile.skills.join(";"),
      serializeNumber(profile.matchScore, { allowBlank: true }),
      profile.seniority,
      profile.tribe ?? "",
      profile.email ?? "",
      profile.linkedinUrl ?? "",
      profile.connectedOn ?? "",
    ]

    return values.map((value) => escapeCsvValue(value ?? "")).join(",")
  })

  return [CANONICAL_PROFILE_CSV_HEADERS.join(","), ...rows].join("\n")
}

export function applyImportToSession(
  current: SessionImportState | null,
  input: ImportSourceInput,
  options: ApplyImportOptions,
): SessionImportState {
  if (input.type === "csv") {
    const sources: SessionImportSource[] = [
      {
        id: options.sourceId,
        type: "csv",
        fileName: input.fileName,
        profileIds: input.profiles.map((profile) => profile.id),
        importedAt: options.importedAt,
        warnings: input.warnings,
      },
    ]

    return {
      canonicalCsv: serializeProfilesToCanonicalCsv(input.profiles) || null,
      profiles: input.profiles,
      sources,
      displayLabel: buildDisplayLabel(sources),
      unsavedPdfProfileIds: [],
    }
  }

  const mergedProfiles = mergeImportedProfiles(current?.profiles ?? [], input.profiles)
  const resolvedProfileIds = input.profiles.map(
    (profile) => findMatchingImportedProfile(mergedProfiles, profile)?.id ?? profile.id,
  )
  const sources = [
    ...(current?.sources ?? []),
    {
      id: options.sourceId,
      type: input.type,
      fileName: input.fileName,
      profileIds: resolvedProfileIds,
      importedAt: options.importedAt,
      warnings: input.warnings,
    },
  ]

  return {
    canonicalCsv: serializeProfilesToCanonicalCsv(mergedProfiles) || null,
    profiles: mergedProfiles,
    sources,
    displayLabel: buildDisplayLabel(sources),
    unsavedPdfProfileIds:
      input.type === "linkedin_pdf"
        ? Array.from(new Set([...(current?.unsavedPdfProfileIds ?? []), ...resolvedProfileIds]))
        : current?.unsavedPdfProfileIds ?? [],
  }
}
