/**
 * LinkedIn CSV export parser.
 * Handles both the standard LinkedIn Connections CSV format and custom formats.
 */

export interface ParsedProfile {
  id: string
  firstName: string
  lastName: string
  headline: string
  company: string
  location: string
  industry: string
  connections: number
  skills: string[]
  matchScore: number
  seniority: string
  tribe?: string
  linkedinUrl?: string
  email?: string
  connectedOn?: string
}

/** Seniority keywords — order matters (most senior first) */
const SENIORITY_KEYWORDS: Array<{ level: string; keywords: string[] }> = [
  { level: "CXO", keywords: ["chief", "ceo", "cto", "coo", "cfo", "cpo", "ciso"] },
  { level: "VP", keywords: ["vp", "vice president"] },
  { level: "Director", keywords: ["director"] },
  { level: "Principal", keywords: ["principal"] },
  { level: "Staff", keywords: ["staff"] },
  { level: "Manager", keywords: ["manager", "head of", "lead of"] },
  { level: "Lead", keywords: ["lead", "tech lead", "team lead"] },
  { level: "Senior", keywords: ["senior", "sr."] },
]

function inferSeniority(title: string): string {
  const lower = title.toLowerCase()
  for (const { level, keywords } of SENIORITY_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return level
  }
  return "Mid"
}

/** Derive skills from position/headline keywords */
function inferSkills(headline: string, company: string): string[] {
  const text = `${headline} ${company}`.toLowerCase()
  const skillMap: Array<{ skill: string; keywords: string[] }> = [
    { skill: "Python", keywords: ["python"] },
    { skill: "TypeScript", keywords: ["typescript", "ts"] },
    { skill: "React", keywords: ["react"] },
    { skill: "Node.js", keywords: ["node", "nodejs"] },
    { skill: "AWS", keywords: ["aws", "amazon web"] },
    { skill: "Machine Learning", keywords: ["ml ", "machine learning", "ai ", "artificial intel"] },
    { skill: "Data Science", keywords: ["data sci", "data analyst", "analytics"] },
    { skill: "Product Management", keywords: ["product manager", "product lead", "product strategy"] },
    { skill: "Leadership", keywords: ["lead", "manager", "director", "head of", "vp", "chief"] },
    { skill: "System Design", keywords: ["architect", "architecture", "system design"] },
    { skill: "DevOps", keywords: ["devops", "sre", "platform eng"] },
    { skill: "SQL", keywords: ["sql", "database", "postgres", "mysql"] },
    { skill: "UX Design", keywords: ["ux", "ui ", "design", "figma"] },
    { skill: "Marketing", keywords: ["marketing", "growth", "seo", "content"] },
  ]
  return skillMap.filter(({ keywords }) => keywords.some(k => text.includes(k))).map(({ skill }) => skill)
}

const SENIORITY_SCORE_BONUS: Record<string, number> = {
  Mid: 6,
  Senior: 8,
  Lead: 10,
  Manager: 10,
  Staff: 12,
  Principal: 13,
  Director: 14,
  VP: 16,
  CXO: 18,
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function parseOptionalNumber(value: string): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getConnectionsScoreBonus(connections: number): number {
  if (connections >= 1000) return 12
  if (connections >= 500) return 10
  if (connections >= 250) return 8
  if (connections >= 100) return 6
  if (connections >= 50) return 4
  if (connections > 0) return 2
  return 0
}

function inferMatchScore(input: {
  headline: string
  company: string
  location: string
  industry: string
  connections: number
  skills: string[]
  seniority: string
  linkedinUrl?: string
  email?: string
  connectedOn?: string
}): number {
  const completenessSignals = [
    input.headline,
    input.company,
    input.location,
    input.industry,
    input.linkedinUrl ?? "",
    input.email ?? "",
    input.connectedOn ?? "",
  ].filter((value) => value.trim().length > 0).length

  const seniorityBonus = SENIORITY_SCORE_BONUS[input.seniority] ?? 4
  const skillsBonus = Math.min(15, input.skills.length * 4)
  const connectionsBonus = getConnectionsScoreBonus(input.connections)

  return Math.round(clampNumber(44 + seniorityBonus + skillsBonus + connectionsBonus + completenessSignals * 2, 55, 98))
}

/** Flexible CSV row parser that handles quoted fields */
export function parseCsvRow(row: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/** Map common LinkedIn CSV column name variants to canonical names */
const COLUMN_ALIASES: Record<string, string> = {
  "id": "id",
  "profile id": "id",
  "profile_id": "id",
  "first name": "firstName",
  "firstname": "firstName",
  "last name": "lastName",
  "lastname": "lastName",
  "email address": "email",
  "email": "email",
  "position": "headline",
  "title": "headline",
  "headline": "headline",
  "company": "company",
  "organization": "company",
  "connected on": "connectedOn",
  "connected_on": "connectedOn",
  "connectedon": "connectedOn",
  "url": "linkedinUrl",
  "profile url": "linkedinUrl",
  "linkedin url": "linkedinUrl",
  "linkedinurl": "linkedinUrl",
  "location": "location",
  "industry": "industry",
  "connections": "connections",
  "skills": "skills",
  "tribe": "tribe",
  "seniority": "seniority",
  "match score": "matchScore",
  "matchscore": "matchScore",
}

function normalizeHeader(h: string): string {
  return COLUMN_ALIASES[h.toLowerCase().trim()] ?? h.toLowerCase().trim()
}

/**
 * Parse a LinkedIn CSV export string into an array of ParsedProfile objects.
 */
export function parseLinkedInCsv(csvData: string): ParsedProfile[] {
  const lines = csvData.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0]).map(normalizeHeader)

  const get = (cells: string[], key: string): string => {
    const idx = headers.indexOf(key)
    return idx >= 0 ? (cells[idx] ?? "").trim() : ""
  }

  const profiles: ParsedProfile[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i])
    if (cells.every(c => !c)) continue

    const firstName = get(cells, "firstName")
    const lastName = get(cells, "lastName")
    const rawId = get(cells, "id")
    const headline = get(cells, "headline") || get(cells, "position") || get(cells, "title")
    const company = get(cells, "company")
    const location = get(cells, "location")
    const industry = get(cells, "industry")
    const email = get(cells, "email")
    const linkedinUrl = get(cells, "linkedinUrl")
    const connectedOn = get(cells, "connectedOn")
    const tribe = get(cells, "tribe") || undefined

    const rawSkills = get(cells, "skills")
    const explicitSkills = rawSkills
      ? rawSkills.split(/[;|]/).map(s => s.trim()).filter(Boolean)
      : []
    const inferredSkills = inferSkills(headline, company)
    const skills = explicitSkills.length > 0 ? explicitSkills : inferredSkills

    const rawSeniority = get(cells, "seniority")
    const seniority = rawSeniority || inferSeniority(headline)

    const rawConnections = get(cells, "connections")
    const connections = parseOptionalNumber(rawConnections) ?? 0

    const rawScore = get(cells, "matchScore")
    const explicitMatchScore = parseOptionalNumber(rawScore)
    const matchScore =
      explicitMatchScore !== null
        ? clampNumber(explicitMatchScore, 0, 100)
        : inferMatchScore({
            headline,
            company,
            location,
            industry: industry || inferIndustry(headline, company),
            connections,
            skills,
            seniority,
            linkedinUrl: linkedinUrl || undefined,
            email: email || undefined,
            connectedOn: connectedOn || undefined,
          })

    if (!firstName && !lastName && !company) continue

    profiles.push({
      id: rawId.trim() || `csv-${i}-${firstName}-${lastName}`.replace(/\s+/g, "-").toLowerCase(),
      firstName: firstName || "Unknown",
      lastName: lastName || "",
      headline: headline || company || "Professional",
      company: company || "",
      location: location || "",
      industry: industry || inferIndustry(headline, company),
      connections,
      skills,
      matchScore,
      seniority,
      tribe: tribe || undefined,
      linkedinUrl: linkedinUrl || undefined,
      email: email || undefined,
      connectedOn: connectedOn || undefined,
    })
  }

  return profiles
}

function inferIndustry(headline: string, company: string): string {
  const text = `${headline} ${company}`.toLowerCase()
  if (text.includes("software") || text.includes("engineer") || text.includes("tech")) return "Technology"
  if (text.includes("financ") || text.includes("bank") || text.includes("invest")) return "Finance"
  if (text.includes("health") || text.includes("medical") || text.includes("pharma")) return "Healthcare"
  if (text.includes("design") || text.includes("ux") || text.includes("creative")) return "Design"
  if (text.includes("market") || text.includes("sales") || text.includes("growth")) return "Marketing"
  if (text.includes("data") || text.includes("analyt")) return "Data & Analytics"
  return "Other"
}

/** Build basic skill frequency counts from a list of profiles */
export function buildSkillFrequency(profiles: ParsedProfile[]): Array<{ skill: string; count: number }> {
  const freq: Record<string, number> = {}
  for (const p of profiles) {
    for (const s of p.skills) {
      freq[s] = (freq[s] ?? 0) + 1
    }
  }
  return Object.entries(freq)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

/** Auto-group profiles into tribes based on their top skill */
export function autoGroupTribes(profiles: ParsedProfile[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const p of profiles) {
    const key = p.skills[0] ?? "General"
    if (!groups[key]) groups[key] = []
    groups[key].push(`${p.firstName} ${p.lastName}`.trim())
  }
  // Merge tiny groups
  const merged: Record<string, string[]> = {}
  let other: string[] = []
  for (const [key, names] of Object.entries(groups)) {
    if (names.length >= 2) {
      merged[key] = names
    } else {
      other = other.concat(names)
    }
  }
  if (other.length > 0) merged["General"] = other
  return merged
}
