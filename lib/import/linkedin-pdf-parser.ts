/**
 * LinkedIn PDF export parser.
 *
 * Handles two flavours of LinkedIn PDF:
 *  1. "Profile" PDF  — full profile with name, headline, experience, education, skills, summary.
 *  2. "Connections" PDF — tabular list of name + title + company rows.
 *
 * This is a *text-based* regex parser that works on the raw string extracted
 * from the PDF (via pdfjs or similar).  It does NOT depend on pdfjs itself —
 * the caller is responsible for supplying the extracted text.
 */

export interface LinkedInPDFExperience {
  title: string
  company: string
  dateRange: string
  description: string
}

export interface LinkedInPDFEducation {
  school: string
  degree: string
  dateRange: string
}

export interface LinkedInPDFProfile {
  name: string
  headline: string
  location: string
  summary: string
  experience: LinkedInPDFExperience[]
  education: LinkedInPDFEducation[]
  skills: string[]
  email: string
  linkedinUrl: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SECTION_HEADERS = [
  "experience",
  "education",
  "skills",
  "summary",
  "top skills",
  "languages",
  "certifications",
  "honors",
  "awards",
  "publications",
  "volunteer experience",
  "projects",
  "recommendations",
  "interests",
  "courses",
] as const

function isSectionHeader(line: string): boolean {
  return SECTION_HEADERS.includes(line.toLowerCase().trim() as (typeof SECTION_HEADERS)[number])
}

function findSectionRange(lines: string[], header: string): { start: number; end: number } | null {
  const idx = lines.findIndex((l) => l.toLowerCase().trim() === header)
  if (idx < 0) return null
  let end = lines.length
  for (let i = idx + 1; i < lines.length; i++) {
    if (isSectionHeader(lines[i])) {
      end = i
      break
    }
  }
  return { start: idx + 1, end }
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const LINKEDIN_URL_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/gi
const DATE_RANGE_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-–]\s*(?:(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|Present)/gi

// ---------------------------------------------------------------------------
// Profile PDF parsing
// ---------------------------------------------------------------------------

function parseProfilePdf(text: string): LinkedInPDFProfile {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // --- Name: typically the first non-empty line ---
  let name = lines[0] ?? ""
  // If the first line looks like a URL or footer, skip it
  if (/^(page|http)/i.test(name)) {
    name = lines.find((l) => !/^(page|http)/i.test(l) && l.length > 1) ?? ""
  }

  // --- Headline: usually right after the name ---
  const nameIdx = lines.indexOf(name)
  let headline = ""
  if (nameIdx >= 0 && nameIdx + 1 < lines.length) {
    const candidate = lines[nameIdx + 1]
    if (candidate && !isSectionHeader(candidate)) {
      headline = candidate
    }
  }

  // --- Location ---
  let location = ""
  for (let i = nameIdx + 1; i < Math.min(nameIdx + 5, lines.length); i++) {
    const line = lines[i]
    if (!line || isSectionHeader(line)) break
    if (/,/.test(line) && !/^https?:\/\//i.test(line) && !line.includes("@")) {
      location = line
      break
    }
  }

  // --- Email ---
  const emailMatches = text.match(EMAIL_RE)
  const email = emailMatches?.[0] ?? ""

  // --- LinkedIn URL ---
  const urlMatches = text.match(LINKEDIN_URL_RE)
  const linkedinUrl = urlMatches?.[0] ?? ""

  // --- Summary ---
  let summary = ""
  const summaryRange = findSectionRange(lines, "summary")
  if (summaryRange) {
    summary = lines.slice(summaryRange.start, summaryRange.end).join(" ").trim()
  }

  // --- Experience ---
  const experience: LinkedInPDFExperience[] = []
  const expRange = findSectionRange(lines, "experience")
  if (expRange) {
    let current: Partial<LinkedInPDFExperience> | null = null
    const descParts: string[] = []

    const flushCurrent = () => {
      if (current?.title) {
        experience.push({
          title: current.title ?? "",
          company: current.company ?? "",
          dateRange: current.dateRange ?? "",
          description: descParts.join(" ").trim(),
        })
      }
      descParts.length = 0
    }

    for (let i = expRange.start; i < expRange.end; i++) {
      const line = lines[i]
      const dateMatch = line.match(DATE_RANGE_RE)
      if (dateMatch) {
        // If we see a date, previous entry is complete
        if (current?.dateRange) {
          flushCurrent()
          // This date belongs to a new entry — look back for title
          const prevLine = i > expRange.start ? lines[i - 1] : ""
          current = {
            title: prevLine && !prevLine.match(DATE_RANGE_RE) ? prevLine : "",
            company: "",
            dateRange: dateMatch[0],
          }
        } else if (current) {
          current.dateRange = dateMatch[0]
        } else {
          // First experience entry — title is the line before
          const prevLine = i > expRange.start ? lines[i - 1] : ""
          current = {
            title: prevLine && !prevLine.match(DATE_RANGE_RE) ? prevLine : "",
            company: "",
            dateRange: dateMatch[0],
          }
        }
        continue
      }

      if (!current) {
        // Line before any date — could be the title of the first entry
        current = { title: line, company: "", dateRange: "" }
        continue
      }

      // If we have a title but no company yet, the next non-date line is company
      if (current.title && !current.company && current.dateRange) {
        current.company = line
        continue
      }

      descParts.push(line)
    }
    flushCurrent()
  }

  // --- Education ---
  const education: LinkedInPDFEducation[] = []
  const eduRange = findSectionRange(lines, "education")
  if (eduRange) {
    let current: Partial<LinkedInPDFEducation> | null = null
    for (let i = eduRange.start; i < eduRange.end; i++) {
      const line = lines[i]
      const dateMatch = line.match(DATE_RANGE_RE)
      if (dateMatch) {
        if (current) {
          current.dateRange = dateMatch[0]
          education.push({
            school: current.school ?? "",
            degree: current.degree ?? "",
            dateRange: current.dateRange,
          })
          current = null
        }
        continue
      }
      if (!current) {
        current = { school: line, degree: "", dateRange: "" }
      } else if (!current.degree) {
        current.degree = line
      }
    }
    if (current?.school) {
      education.push({
        school: current.school ?? "",
        degree: current.degree ?? "",
        dateRange: current.dateRange ?? "",
      })
    }
  }

  // --- Skills ---
  const skills: string[] = []
  const skillsRange = findSectionRange(lines, "skills") ?? findSectionRange(lines, "top skills")
  if (skillsRange) {
    for (let i = skillsRange.start; i < skillsRange.end; i++) {
      const line = lines[i].trim()
      if (line && line.length < 80 && !/^\d+$/.test(line)) {
        skills.push(line)
      }
    }
  }

  return {
    name,
    headline,
    location,
    summary,
    experience,
    education,
    skills,
    email,
    linkedinUrl,
  }
}

// ---------------------------------------------------------------------------
// Connections PDF parsing
// ---------------------------------------------------------------------------

export interface LinkedInConnectionEntry {
  name: string
  title: string
  company: string
}

function parseConnectionsPdf(text: string): LinkedInConnectionEntry[] {
  const entries: LinkedInConnectionEntry[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // Connections PDFs typically have lines like:
  //   "First Last"
  //   "Title at Company"
  // Or tab-delimited columns. We try both heuristics.

  // Heuristic 1: "at" pattern — "Title at Company"
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/\bat\b/i.test(line) && !isSectionHeader(line)) {
      const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i)
      if (atMatch) {
        // Previous line is likely the name
        const nameLine = i > 0 ? lines[i - 1] : ""
        if (nameLine && !nameLine.includes("@") && !/^(page|http)/i.test(nameLine)) {
          entries.push({
            name: nameLine,
            title: atMatch[1].trim(),
            company: atMatch[2].trim(),
          })
        }
      }
    }
  }

  // Heuristic 2: comma-separated "Name, Title, Company" or tab-separated rows
  if (entries.length === 0) {
    for (const line of lines) {
      const parts = line.includes("\t") ? line.split("\t") : line.split(",").map((s) => s.trim())
      if (parts.length >= 3 && parts[0].split(/\s+/).length >= 2) {
        entries.push({
          name: parts[0].trim(),
          title: parts[1].trim(),
          company: parts[2].trim(),
        })
      }
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF File using the browser FileReader API.
 * This is a *basic* text extraction — for better fidelity on LinkedIn profile
 * PDFs use the existing pdfjs-based `importLinkedInPdf` from
 * `@/lib/linkedin/linkedin-pdf-parser`.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // Very basic PDF text extraction — finds text between stream/endstream markers
  // and decodes parenthesised text operators: (Hello) Tj
  const decoder = new TextDecoder("latin1")
  const raw = decoder.decode(bytes)

  const textParts: string[] = []
  // Match text showing operators
  const textOpRe = /\(([^)]*)\)\s*Tj/g
  let match: RegExpExecArray | null
  while ((match = textOpRe.exec(raw)) !== null) {
    textParts.push(match[1])
  }

  // Also try to pick up text from TJ arrays: [(Hello) -5 (World)] TJ
  const tjArrayRe = /\[([^\]]*)\]\s*TJ/gi
  while ((match = tjArrayRe.exec(raw)) !== null) {
    const inner = match[1]
    const partRe = /\(([^)]*)\)/g
    let partMatch: RegExpExecArray | null
    while ((partMatch = partRe.exec(inner)) !== null) {
      textParts.push(partMatch[1])
    }
  }

  return textParts.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Parse a LinkedIn PDF export. Tries profile format first; if no structured
 * data is found, falls back to connections format.
 */
export function parseLinkedInPdf(text: string): {
  type: "profile" | "connections"
  profiles: LinkedInPDFProfile[]
  connections: LinkedInConnectionEntry[]
} {
  const profile = parseProfilePdf(text)

  // If we got meaningful data, return as a profile
  if (profile.name && (profile.headline || profile.experience.length > 0)) {
    return { type: "profile", profiles: [profile], connections: [] }
  }

  // Otherwise try connections format
  const connections = parseConnectionsPdf(text)
  if (connections.length > 0) {
    // Convert connections to minimal profiles
    const profiles: LinkedInPDFProfile[] = connections.map((c) => ({
      name: c.name,
      headline: c.title ? `${c.title} at ${c.company}` : c.company,
      location: "",
      summary: "",
      experience: c.title
        ? [{ title: c.title, company: c.company, dateRange: "", description: "" }]
        : [],
      education: [],
      skills: [],
      email: "",
      linkedinUrl: "",
    }))
    return { type: "connections", profiles, connections }
  }

  // Last resort — return whatever we parsed from the profile attempt
  return { type: "profile", profiles: profile.name ? [profile] : [], connections: [] }
}
