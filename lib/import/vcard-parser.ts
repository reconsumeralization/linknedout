/**
 * VCF / vCard parser.
 *
 * Supports vCard 3.0 and 4.0 formats.
 * Parses: FN, N, ORG, TITLE, EMAIL, TEL, URL, NOTE, ADR fields.
 */

export interface VCardContact {
  fullName: string
  firstName: string
  lastName: string
  organization: string
  title: string
  emails: string[]
  phones: string[]
  urls: string[]
  note: string
  address: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Unfold continuation lines per RFC 6350 / RFC 2425.
 * Lines starting with a space or tab are continuations of the previous line.
 */
function unfold(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, "")
}

/**
 * Decode quoted-printable encoded value.
 */
function decodeQuotedPrintable(value: string): string {
  return value.replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  ).replace(/=\r?\n/g, "")
}

/**
 * Unescape vCard backslash-escaped characters.
 */
function unescapeValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}

/**
 * Parse a single property line into its name (uppercased) and decoded value.
 * Handles parameters like ENCODING=QUOTED-PRINTABLE, CHARSET, TYPE, etc.
 */
function parseLine(line: string): { name: string; value: string } | null {
  const colonIdx = line.indexOf(":")
  if (colonIdx < 0) return null

  const left = line.slice(0, colonIdx)
  let value = line.slice(colonIdx + 1)

  // Split left part into name and params
  const parts = left.split(";")
  const name = (parts[0] ?? "").toUpperCase().trim()
  if (!name) return null

  // Check for quoted-printable encoding
  const isQP = parts.some(
    (p) => /^ENCODING=QUOTED-PRINTABLE$/i.test(p.trim()),
  )
  if (isQP) {
    value = decodeQuotedPrintable(value)
  }

  return { name, value: unescapeValue(value.trim()) }
}

/**
 * Parse the N (structured name) field: LastName;FirstName;Middle;Prefix;Suffix
 */
function parseName(value: string): { firstName: string; lastName: string } {
  const parts = value.split(";").map((s) => s.trim())
  return {
    lastName: parts[0] ?? "",
    firstName: parts[1] ?? "",
  }
}

/**
 * Parse the ADR (address) field: PO Box;Extended;Street;City;Region;PostalCode;Country
 */
function parseAddress(value: string): string {
  const parts = value.split(";").map((s) => s.trim()).filter(Boolean)
  return parts.join(", ")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a VCF string into individual vCard blocks.
 */
function splitCards(vcf: string): string[] {
  const cards: string[] = []
  const re = /BEGIN:VCARD([\s\S]*?)END:VCARD/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(vcf)) !== null) {
    cards.push(match[1].trim())
  }
  return cards
}

/**
 * Parse a single vCard block into a VCardContact.
 */
function parseOneCard(block: string): VCardContact {
  const lines = unfold(block).split(/\r?\n/).filter(Boolean)

  let fullName = ""
  let firstName = ""
  let lastName = ""
  let organization = ""
  let title = ""
  const emails: string[] = []
  const phones: string[] = []
  const urls: string[] = []
  let note = ""
  let address = ""

  for (const raw of lines) {
    const parsed = parseLine(raw)
    if (!parsed) continue

    switch (parsed.name) {
      case "FN":
        fullName = parsed.value
        break
      case "N": {
        const n = parseName(parsed.value)
        firstName = n.firstName
        lastName = n.lastName
        break
      }
      case "ORG":
        // ORG can have multiple components separated by ;
        organization = parsed.value.split(";").map((s) => s.trim()).filter(Boolean).join(", ")
        break
      case "TITLE":
        title = parsed.value
        break
      case "EMAIL":
        if (parsed.value) emails.push(parsed.value)
        break
      case "TEL":
        if (parsed.value) phones.push(parsed.value)
        break
      case "URL":
        if (parsed.value) urls.push(parsed.value)
        break
      case "NOTE":
        note = parsed.value
        break
      case "ADR":
        address = parseAddress(parsed.value)
        break
      default:
        break
    }
  }

  // Fallback: derive first/last from FN if N was missing
  if (!firstName && !lastName && fullName) {
    const parts = fullName.split(/\s+/)
    firstName = parts[0] ?? ""
    lastName = parts.slice(1).join(" ")
  }

  // Fallback: build FN from N parts if FN was missing
  if (!fullName && (firstName || lastName)) {
    fullName = `${firstName} ${lastName}`.trim()
  }

  return {
    fullName,
    firstName,
    lastName,
    organization,
    title,
    emails,
    phones,
    urls,
    note,
    address,
  }
}

/**
 * Parse a VCF / vCard string (may contain multiple vCards) into an array of
 * VCardContact objects.
 */
export function parseVCards(vcfData: string): VCardContact[] {
  const blocks = splitCards(vcfData)
  return blocks.map(parseOneCard).filter((c) => c.fullName || c.firstName || c.lastName)
}
