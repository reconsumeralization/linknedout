import type { ParsedProfile } from "@/lib/csv/csv-parser"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"
import { serializeProfilesToCanonicalCsv } from "@/lib/csv/import-session"

export type LinkedInExportArtifactKey =
  | "connections"
  | "self_emails"
  | "self_phones"
  | "self_positions"
  | "self_profile"
  | "self_profile_summary"
  | "certifications"
  | "company_follows"
  | "events"
  | "invitations"
  | "recommendations_given"
  | "recommendations_received"
  | "rich_media"
  | "saved_job_alerts"
  | "ad_targeting"
  | "jobs_job_seeker_preferences"
  | "learning"
  | "messages"
  | "learning_coach_messages"
  | "learning_role_play_messages"
  | "guide_messages"
  | "articles_html"
  | "unknown_files"

export interface LinkedInExportImportResult {
  profiles: ParsedProfile[]
  canonicalCsv: string | null
  warnings: string[]
  errors: string[]
  artifactCounts: Partial<Record<LinkedInExportArtifactKey, number>>
}

function normalizeBaseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.trim().toLowerCase()
}

function looksLikeLinkedInExportBundle(files: File[]): boolean {
  const names = new Set(files.map((f) => normalizeBaseName(f.name)))
  return (
    names.has("connections.csv") ||
    names.has("profile.csv") ||
    names.has("profile summary.csv") ||
    names.has("positions.csv")
  )
}

async function readText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."))
    reader.readAsText(file)
  })
}

function countCsvRecords(text: string): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length <= 1) return 0
  // Some LinkedIn CSVs start with a Notes block before the header. Find the first header-looking line.
  const headerIdx = lines.findIndex((l) => /,/.test(l) && !/^notes:/i.test(l.trim()))
  if (headerIdx < 0) return 0
  return Math.max(0, lines.length - headerIdx - 1)
}

function keyForFile(fileName: string): LinkedInExportArtifactKey {
  const name = normalizeBaseName(fileName)

  if (name === "connections.csv") return "connections"
  if (name === "email addresses.csv") return "self_emails"
  if (name === "phonenumbers.csv" || name === "phone numbers.csv") return "self_phones"
  if (name === "positions.csv") return "self_positions"
  if (name === "profile.csv") return "self_profile"
  if (name === "profile summary.csv") return "self_profile_summary"
  if (name === "certifications.csv") return "certifications"
  if (name === "company follows.csv") return "company_follows"
  if (name === "events.csv") return "events"
  if (name === "invitations.csv") return "invitations"
  if (name === "recommendations_given.csv") return "recommendations_given"
  if (name === "recommendations_received.csv") return "recommendations_received"
  if (name === "rich_media.csv") return "rich_media"
  if (name === "savedjobalerts.csv") return "saved_job_alerts"
  if (name === "ad_targeting.csv") return "ad_targeting"
  if (name === "job seeker preferences.csv" || name === "jobs\\job seeker preferences.csv") {
    return "jobs_job_seeker_preferences"
  }
  if (name === "learning.csv") return "learning"
  if (name === "messages.csv") return "messages"
  if (name === "learning_coach_messages.csv") return "learning_coach_messages"
  if (name === "learning_role_play_messages.csv") return "learning_role_play_messages"
  if (name === "guide_messages.csv") return "guide_messages"
  if (name.endsWith(".html")) return "articles_html"

  return "unknown_files"
}

export async function importLinkedInDataExport(files: File[]): Promise<LinkedInExportImportResult> {
  const warnings: string[] = []
  const errors: string[] = []
  const artifactCounts: Partial<Record<LinkedInExportArtifactKey, number>> = {}

  if (files.length === 0) {
    return { profiles: [], canonicalCsv: null, warnings: [], errors: ["No files provided."], artifactCounts: {} }
  }

  if (!looksLikeLinkedInExportBundle(files)) {
    warnings.push("This does not look like a standard LinkedIn data export bundle. Attempting best-effort import.")
  }

  const byName = new Map<string, File>()
  for (const file of files) {
    byName.set(normalizeBaseName(file.name), file)
  }

  let profiles: ParsedProfile[] = []

  // Connections.csv -> core contact list.
  const connectionsFile = byName.get("connections.csv")
  if (connectionsFile) {
    try {
      const text = await readText(connectionsFile)
      profiles = parseLinkedInCsv(text)
      artifactCounts.connections = profiles.length
      if (profiles.length === 0) {
        errors.push("Connections.csv was found but contained no importable profiles.")
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Unable to read Connections.csv")
    }
  } else {
    errors.push("Missing Connections.csv. Please include the whole LinkedIn export folder (or at least Connections.csv).")
  }

  // Count the remaining artifacts so we can confirm we “handled” them (even if
  // the rest of the app currently only uses connections as ParsedProfile[]).
  for (const file of files) {
    const key = keyForFile(file.name)
    if (key === "connections") continue

    try {
      if (key === "articles_html") {
        artifactCounts.articles_html = (artifactCounts.articles_html ?? 0) + 1
        continue
      }

      if (normalizeBaseName(file.name).endsWith(".csv")) {
        const text = await readText(file)
        const count = countCsvRecords(text)
        artifactCounts[key] = (artifactCounts[key] ?? 0) + count
        continue
      }

      artifactCounts.unknown_files = (artifactCounts.unknown_files ?? 0) + 1
    } catch (err) {
      warnings.push(`${file.name}: unable to read (${err instanceof Error ? err.message : "unknown error"}).`)
    }
  }

  const canonicalCsv = profiles.length > 0 ? serializeProfilesToCanonicalCsv(profiles) : null

  const handledKeys = Object.entries(artifactCounts)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")

  if (handledKeys) {
    warnings.push(`LinkedIn export artifacts detected: ${handledKeys}.`)
  }

  return { profiles, canonicalCsv, warnings, errors, artifactCounts }
}

