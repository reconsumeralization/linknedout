import type { ParsedProfile } from "@/lib/csv/csv-parser"
import { normalizeLinkedInUrl } from "@/lib/csv/import-session"

export type ExtractedPdfLine = {
  text: string
  x: number
  y: number
  fontSize: number
  page: number
}

export type ExtractedPdfAnnotation = {
  page: number
  url: string
}

export type LinkedInPdfDocument = {
  lines: ExtractedPdfLine[]
  annotations: ExtractedPdfAnnotation[]
}

export type LinkedInPdfParseResult = {
  profile: ParsedProfile
  warnings: string[]
}

const UNSUPPORTED_LINKEDIN_PDF_MESSAGE =
  "Unsupported PDF. v1 only supports text-based LinkedIn profile PDFs exported from LinkedIn."

const TOP_SKILLS_HEADER = "top skills"
const SUMMARY_HEADER = "summary"
const EXPERIENCE_HEADER = "experience"
const STOP_SECTION_HEADERS = new Set([
  "languages",
  "certifications",
  "honors-awards",
  "honors",
  "awards",
  "featured",
  "education",
  "projects",
  "publications",
  "organizations",
  "patents",
  "volunteer experience",
  "recommendations",
  "interests",
  "courses",
  "tests",
  "top skills",
  "summary",
  "experience",
])

type TextFragment = {
  text: string
  x: number
  y: number
  width: number
  fontSize: number
}

function normalizeLineText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeSectionText(value: string): string {
  return normalizeLineText(value).toLowerCase()
}

function isStopSectionHeader(value: string): boolean {
  return STOP_SECTION_HEADERS.has(normalizeSectionText(value))
}

function isPageFooterLine(value: string): boolean {
  const normalized = normalizeLineText(value)
  if (!normalized) {
    return true
  }
  return /^page\s+\d+\s+of\s+\d+$/i.test(normalized)
}

function isLikelyLocation(value: string): boolean {
  const normalized = normalizeLineText(value)
  if (!normalized || normalized.length > 90) {
    return false
  }
  if (isStopSectionHeader(normalized) || normalized.includes("@") || /https?:\/\//i.test(normalized)) {
    return false
  }

  if (/(area|united states|united kingdom|canada|australia|germany|france|india|remote)/i.test(normalized)) {
    return true
  }

  const segments = normalized.split(",").map((segment) => segment.trim()).filter(Boolean)
  return (
    segments.length >= 2 &&
    segments.length <= 4 &&
    segments.some((segment) => /\s/.test(segment)) &&
    segments.slice(1).some((segment) => !/^[A-Z]{2,10}$/.test(segment))
  )
}

function isLikelyDateRange(value: string): boolean {
  return /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(value)
    && /\s-\s/i.test(value)
}

function isLikelyDuration(value: string): boolean {
  return /\b\d+\s+(year|years|yr|yrs|month|months)\b/i.test(value)
}

function isLikelyHeadlineNoise(value: string): boolean {
  return /https?:\/\//i.test(value) || value.includes("@") || isStopSectionHeader(value) || isPageFooterLine(value)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function extractNameParts(value: string): { firstName: string; lastName: string; fullName: string } {
  const normalized = normalizeLineText(value)
  const baseName = normalized.split(",")[0]?.trim() || normalized
  const [firstName = "Unknown", ...lastNameParts] = baseName.split(/\s+/)
  return {
    firstName,
    lastName: lastNameParts.join(" "),
    fullName: baseName,
  }
}

function scoreNameCandidate(line: ExtractedPdfLine): number {
  const text = normalizeLineText(line.text)
  if (!text || isLikelyHeadlineNoise(text) || isLikelyLocation(text)) {
    return Number.NEGATIVE_INFINITY
  }

  const words = text.split(" ").filter(Boolean)
  if (words.length < 2 || words.length > 8) {
    return Number.NEGATIVE_INFINITY
  }
  if (/\d/.test(text)) {
    return Number.NEGATIVE_INFINITY
  }

  let score = line.fontSize * 12
  score += line.x >= 100 ? 15 : -10
  score -= line.y * 0.02
  if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)+(?:,\s*[A-Za-z. ]+)?$/.test(text)) {
    score += 20
  }
  if (text.includes(",")) {
    score += 3
  }
  return score
}

function sortLinesForReading(lines: ExtractedPdfLine[]): ExtractedPdfLine[] {
  return [...lines].sort((left, right) => {
    if (left.page !== right.page) return left.page - right.page
    if (Math.abs(left.y - right.y) > 2) return left.y - right.y
    return left.x - right.x
  })
}

function joinFragments(fragments: TextFragment[]): ExtractedPdfLine | null {
  if (fragments.length === 0) {
    return null
  }

  const ordered = [...fragments].sort((left, right) => left.x - right.x)
  let text = ""
  let previousRightEdge: number | null = null

  for (const fragment of ordered) {
    if (!fragment.text) continue
    const needsSpace =
      previousRightEdge !== null &&
      fragment.x - previousRightEdge > Math.max(2, fragment.fontSize * 0.18) &&
      !text.endsWith(" ") &&
      !fragment.text.startsWith(" ")

    if (needsSpace) {
      text += " "
    }
    text += fragment.text
    previousRightEdge = fragment.x + fragment.width
  }

  const normalizedText = normalizeLineText(text)
  if (!normalizedText) {
    return null
  }

  const first = ordered[0]
  return {
    text: normalizedText,
    x: Math.min(...ordered.map((fragment) => fragment.x)),
    y: ordered.reduce((sum, fragment) => sum + fragment.y, 0) / ordered.length,
    fontSize: Math.max(...ordered.map((fragment) => fragment.fontSize)),
    page: 0,
  }
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString()
  }
  return pdfjs
}

export async function extractLinkedInPdfDocument(file: File): Promise<LinkedInPdfDocument> {
  const pdfjs = await loadPdfJs()
  const pdfBytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data: pdfBytes })
  const pdf = await loadingTask.promise
  const lines: ExtractedPdfLine[] = []
  const annotations: ExtractedPdfAnnotation[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent()
      const groupedLines = new Map<string, TextFragment[]>()

      for (const item of textContent.items) {
        if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) {
          continue
        }

        const [, , , textScaleY, x, y] = item.transform
        const top = viewport.height - y
        const fontSize = Math.max(Math.abs(textScaleY), Math.abs(item.height ?? 0), 1)
        const bucket = Math.round(top / Math.max(2, fontSize * 0.35))
        const key = `${pageNumber}:${bucket}`
        const group = groupedLines.get(key) ?? []

        group.push({
          text: item.str,
          x,
          y: top,
          width: Math.abs(item.width ?? 0),
          fontSize,
        })
        groupedLines.set(key, group)
      }

      for (const fragments of groupedLines.values()) {
        const line = joinFragments(fragments)
        if (!line) continue
        lines.push({
          ...line,
          page: pageNumber,
        })
      }

      const pageAnnotations = await page.getAnnotations()
      for (const annotation of pageAnnotations) {
        const url =
          (typeof annotation.url === "string" && annotation.url) ||
          (typeof annotation.unsafeUrl === "string" && annotation.unsafeUrl) ||
          null

        if (!url) continue
        annotations.push({ page: pageNumber, url })
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  return {
    lines: sortLinesForReading(lines),
    annotations,
  }
}

export function parseLinkedInPdfDocument(doc: LinkedInPdfDocument, fileName: string): LinkedInPdfParseResult {
  const pageOneLines = sortLinesForReading(doc.lines.filter((line) => line.page === 1))
    .filter((line) => !isPageFooterLine(line.text))

  const linkedInAnnotation = doc.annotations.find((annotation) => /linkedin\.com\/in\//i.test(annotation.url))
  const markerCount = [SUMMARY_HEADER, EXPERIENCE_HEADER, TOP_SKILLS_HEADER].filter((header) =>
    pageOneLines.some((line) => normalizeSectionText(line.text) === header),
  ).length

  const nameLine = [...pageOneLines]
    .sort((left, right) => scoreNameCandidate(right) - scoreNameCandidate(left))
    .find((line) => Number.isFinite(scoreNameCandidate(line)))

  if (!linkedInAnnotation || markerCount < 2 || !nameLine) {
    throw new Error(UNSUPPORTED_LINKEDIN_PDF_MESSAGE)
  }

  const mainColumnMinX = Math.max(0, nameLine.x - 24)
  const mainLines = pageOneLines.filter((line) => line.x >= mainColumnMinX)
  const sidebarLines = pageOneLines.filter((line) => line.x < mainColumnMinX)

  const nameIndex = mainLines.findIndex(
    (line) => line.text === nameLine.text && Math.abs(line.x - nameLine.x) < 1 && Math.abs(line.y - nameLine.y) < 1,
  )

  if (nameIndex < 0) {
    throw new Error(UNSUPPORTED_LINKEDIN_PDF_MESSAGE)
  }

  const headlineParts: string[] = []
  let location = ""
  for (let index = nameIndex + 1; index < mainLines.length; index++) {
    const line = mainLines[index]
    if (isStopSectionHeader(line.text)) {
      break
    }
    if (!location && isLikelyLocation(line.text)) {
      location = normalizeLineText(line.text)
      break
    }
    if (!isLikelyHeadlineNoise(line.text)) {
      headlineParts.push(normalizeLineText(line.text))
    }
  }

  const experienceIndex = mainLines.findIndex((line) => normalizeSectionText(line.text) === EXPERIENCE_HEADER)
  let company = ""
  if (experienceIndex >= 0) {
    for (let index = experienceIndex + 1; index < mainLines.length; index++) {
      const text = normalizeLineText(mainLines[index].text)
      if (!text || isStopSectionHeader(text) || isPageFooterLine(text)) {
        if (isStopSectionHeader(text)) break
        continue
      }
      if (isLikelyDateRange(text) || isLikelyDuration(text)) {
        continue
      }
      company = text
      break
    }
  }

  const skills: string[] = []
  const skillsIndex = sidebarLines.findIndex((line) => normalizeSectionText(line.text) === TOP_SKILLS_HEADER)
  if (skillsIndex >= 0) {
    for (let index = skillsIndex + 1; index < sidebarLines.length; index++) {
      const text = normalizeLineText(sidebarLines[index].text)
      if (!text || isPageFooterLine(text)) {
        continue
      }
      if (index > skillsIndex + 1 && isStopSectionHeader(text)) {
        break
      }
      if (!isStopSectionHeader(text)) {
        skills.push(text)
      }
    }
  }

  const { firstName, lastName, fullName } = extractNameParts(nameLine.text)
  const warnings: string[] = []
  if (!location) warnings.push("Location could not be inferred from the PDF.")
  if (!company) warnings.push("Current company could not be inferred from the Experience section.")
  if (skills.length === 0) warnings.push("No Top Skills section was detected.")

  const normalizedProfileUrl = normalizeLinkedInUrl(linkedInAnnotation.url) ?? linkedInAnnotation.url
  const email = doc.annotations.find((annotation) => annotation.url.toLowerCase().startsWith("mailto:"))

  const headline = headlineParts.join(" ").trim()
  if (!headline) {
    throw new Error(UNSUPPORTED_LINKEDIN_PDF_MESSAGE)
  }

  return {
    profile: {
      id: `pdf-${slugify(fullName || fileName.replace(/\.pdf$/i, "")) || "profile"}-${Date.now()}`,
      firstName,
      lastName,
      headline,
      company,
      location,
      industry: "",
      connections: 0,
      skills,
      matchScore: Number.NaN,
      seniority: "",
      tribe: undefined,
      linkedinUrl: normalizedProfileUrl,
      email: email ? email.url.replace(/^mailto:/i, "") : undefined,
      connectedOn: undefined,
    },
    warnings,
  }
}

export async function importLinkedInPdf(file: File): Promise<LinkedInPdfParseResult> {
  const doc = await extractLinkedInPdfDocument(file)
  return parseLinkedInPdfDocument(doc, file.name)
}

export { UNSUPPORTED_LINKEDIN_PDF_MESSAGE }
