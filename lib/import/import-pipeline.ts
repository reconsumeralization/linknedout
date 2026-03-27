/**
 * Unified import pipeline.
 *
 * Auto-detects CSV, PDF, JSON, and VCF (vCard) files and normalises them into
 * a common `ImportResult` containing `ParsedProfile[]` objects compatible with
 * the rest of the LinkedOut app.
 */

import { parseLinkedInCsv, type ParsedProfile } from "@/lib/csv/csv-parser"
import { parseLinkedInPdf, extractTextFromPdf, type LinkedInPDFProfile } from "@/lib/import/linkedin-pdf-parser"
import { parseVCards, type VCardContact } from "@/lib/import/vcard-parser"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImportFileFormat = "csv" | "pdf" | "json" | "vcf" | "unknown"

export interface ImportStats {
  format: ImportFileFormat
  totalRecords: number
  importedProfiles: number
  skipped: number
  durationMs: number
}

export interface ImportResult {
  profiles: ParsedProfile[]
  errors: string[]
  warnings: string[]
  stats: ImportStats
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(file: File): ImportFileFormat {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()

  if (name.endsWith(".csv") || type.includes("csv")) return "csv"
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf"
  if (name.endsWith(".json") || type === "application/json") return "json"
  if (name.endsWith(".vcf") || name.endsWith(".vcard") || type.includes("vcard")) return "vcf"

  return "unknown"
}

// ---------------------------------------------------------------------------
// Helpers to read file text
// ---------------------------------------------------------------------------

async function readAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."))
    reader.readAsText(file)
  })
}

// ---------------------------------------------------------------------------
// Profile ID helpers
// ---------------------------------------------------------------------------

let seqId = 0
function nextId(prefix: string, hint: string): string {
  seqId += 1
  const slug = hint
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return `${prefix}-${slug || "item"}-${Date.now()}-${seqId}`
}

// ---------------------------------------------------------------------------
// Converters — normalise each format into ParsedProfile[]
// ---------------------------------------------------------------------------

function linkedInPdfProfileToParsed(p: LinkedInPDFProfile): ParsedProfile {
  const nameParts = p.name.split(/\s+/)
  const firstName = nameParts[0] ?? "Unknown"
  const lastName = nameParts.slice(1).join(" ")
  const company = p.experience[0]?.company ?? ""

  return {
    id: nextId("pdf", p.name),
    firstName,
    lastName,
    headline: p.headline || (p.experience[0]?.title ? `${p.experience[0].title} at ${company}` : "Professional"),
    company,
    location: p.location,
    industry: "",
    connections: 0,
    skills: p.skills,
    matchScore: 0,
    seniority: "",
    linkedinUrl: p.linkedinUrl || undefined,
    email: p.email || undefined,
    connectedOn: undefined,
  }
}

function vcardToParsed(c: VCardContact): ParsedProfile {
  return {
    id: nextId("vcf", c.fullName),
    firstName: c.firstName || "Unknown",
    lastName: c.lastName,
    headline: c.title || (c.organization ? `at ${c.organization}` : "Contact"),
    company: c.organization,
    location: c.address,
    industry: "",
    connections: 0,
    skills: [],
    matchScore: 0,
    seniority: "",
    linkedinUrl: c.urls.find((u) => /linkedin\.com/i.test(u)) || undefined,
    email: c.emails[0] || undefined,
    connectedOn: undefined,
  }
}

// ---------------------------------------------------------------------------
// JSON format — LinkedIn data export
// ---------------------------------------------------------------------------

interface LinkedInJsonConnection {
  FirstName?: string
  firstName?: string
  first_name?: string
  LastName?: string
  lastName?: string
  last_name?: string
  EmailAddress?: string
  emailAddress?: string
  email?: string
  Company?: string
  company?: string
  Position?: string
  position?: string
  Title?: string
  title?: string
  headline?: string
  ConnectedOn?: string
  connectedOn?: string
  connected_on?: string
  Location?: string
  location?: string
  URL?: string
  url?: string
  linkedinUrl?: string
  Industry?: string
  industry?: string
  Skills?: string | string[]
  skills?: string | string[]
}

function pick<T>(obj: T, ...keys: (keyof T)[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

function jsonConnectionToParsed(raw: LinkedInJsonConnection, index: number): ParsedProfile | null {
  const firstName =
    pick(raw, "FirstName", "firstName", "first_name") || "Unknown"
  const lastName =
    pick(raw, "LastName", "lastName", "last_name")
  const company =
    pick(raw, "Company", "company")
  const headline =
    pick(raw, "Position", "position", "Title", "title", "headline") || company || "Professional"
  const email =
    pick(raw, "EmailAddress", "emailAddress", "email") || undefined
  const location =
    pick(raw, "Location", "location")
  const linkedinUrl =
    pick(raw, "URL", "url", "linkedinUrl") || undefined
  const connectedOn =
    pick(raw, "ConnectedOn", "connectedOn", "connected_on") || undefined
  const industry =
    pick(raw, "Industry", "industry")
  const rawSkills = raw.Skills ?? raw.skills
  const skills: string[] = Array.isArray(rawSkills)
    ? rawSkills
    : typeof rawSkills === "string"
      ? rawSkills.split(/[;|,]/).map((s) => s.trim()).filter(Boolean)
      : []

  if (firstName === "Unknown" && !lastName && !company) return null

  return {
    id: nextId("json", `${firstName}-${lastName}`),
    firstName,
    lastName,
    headline,
    company,
    location,
    industry,
    connections: 0,
    skills,
    matchScore: 0,
    seniority: "",
    linkedinUrl,
    email,
    connectedOn,
  }
}

function parseJsonExport(text: string): { profiles: ParsedProfile[]; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { profiles: [], errors: ["Invalid JSON file."], warnings: [] }
  }

  // Accept an array at the top level, or an object with a known key like
  // "connections", "Connections", "profiles", "contacts", etc.
  let items: unknown[] = []
  if (Array.isArray(data)) {
    items = data
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    const key = ["connections", "Connections", "profiles", "Profiles", "contacts", "Contacts", "data", "values"].find(
      (k) => Array.isArray(obj[k]),
    )
    if (key) {
      items = obj[key] as unknown[]
    } else {
      // Single-object export
      items = [data]
    }
  }

  if (items.length === 0) {
    errors.push("JSON file contains no importable records.")
    return { profiles: [], errors, warnings }
  }

  const profiles: ParsedProfile[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || typeof item !== "object") {
      warnings.push(`Row ${i + 1}: skipped (not an object).`)
      continue
    }
    const profile = jsonConnectionToParsed(item as LinkedInJsonConnection, i)
    if (profile) {
      profiles.push(profile)
    } else {
      warnings.push(`Row ${i + 1}: skipped (insufficient data).`)
    }
  }

  return { profiles, errors, warnings }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Import a file of any supported format and return normalised profiles.
 *
 * Supported formats: CSV, PDF (LinkedIn export), JSON (LinkedIn data export),
 * VCF/vCard (contacts export).
 */
export async function importFile(file: File): Promise<ImportResult> {
  const start = performance.now()
  const format = detectFormat(file)
  const errors: string[] = []
  const warnings: string[] = []
  let profiles: ParsedProfile[] = []
  let totalRecords = 0

  try {
    switch (format) {
      case "csv": {
        const text = await readAsText(file)
        profiles = parseLinkedInCsv(text)
        totalRecords = text.split(/\r?\n/).filter(Boolean).length - 1 // minus header
        if (profiles.length === 0) {
          errors.push("No profiles found in CSV file.")
        }
        break
      }

      case "pdf": {
        const text = await extractTextFromPdf(file)
        if (!text.trim()) {
          errors.push("Could not extract text from PDF. The file may be image-based.")
          break
        }
        const result = parseLinkedInPdf(text)
        totalRecords = result.type === "connections" ? result.connections.length : result.profiles.length
        profiles = result.profiles.map(linkedInPdfProfileToParsed)
        if (profiles.length === 0) {
          warnings.push("PDF parsed but no structured profile data was found.")
        }
        if (result.type === "connections") {
          warnings.push(`Detected connections-list PDF format (${result.connections.length} entries).`)
        }
        break
      }

      case "json": {
        const text = await readAsText(file)
        const result = parseJsonExport(text)
        profiles = result.profiles
        errors.push(...result.errors)
        warnings.push(...result.warnings)
        totalRecords = profiles.length + result.warnings.filter((w) => w.includes("skipped")).length
        break
      }

      case "vcf": {
        const text = await readAsText(file)
        const contacts = parseVCards(text)
        totalRecords = contacts.length
        profiles = contacts.map(vcardToParsed)
        if (profiles.length === 0) {
          errors.push("No contacts found in VCF file.")
        }
        break
      }

      default:
        errors.push(
          `Unsupported file format. Please upload a CSV, PDF, JSON, or VCF file. Received: "${file.name}"`,
        )
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown import error."
    errors.push(message)
  }

  const durationMs = Math.round(performance.now() - start)
  const skipped = Math.max(0, totalRecords - profiles.length)

  return {
    profiles,
    errors,
    warnings,
    stats: {
      format,
      totalRecords,
      importedProfiles: profiles.length,
      skipped,
      durationMs,
    },
  }
}
