import {
  type LinkedInPdfDocument,
  UNSUPPORTED_LINKEDIN_PDF_MESSAGE,
  parseLinkedInPdfDocument,
} from "@/lib/linkedin/linkedin-pdf-parser"
import { describe, expect, it } from "vitest"

function buildLinkedInPdfFixture(): LinkedInPdfDocument {
  return {
    annotations: [
      { page: 1, url: "mailto:brian.thomas@coruzant.com" },
      { page: 1, url: "https://www.linkedin.com/in/brianethomas1?trk=public" },
    ],
    lines: [
      { page: 1, text: "Contact", x: 20, y: 20, fontSize: 13 },
      { page: 1, text: "brian.thomas@coruzant.com", x: 20, y: 36, fontSize: 10.5 },
      { page: 1, text: "Top Skills", x: 20, y: 72, fontSize: 13 },
      { page: 1, text: "Lean Transformation", x: 20, y: 88, fontSize: 10.5 },
      { page: 1, text: "IT Transformation", x: 20, y: 104, fontSize: 10.5 },
      { page: 1, text: "Digital Strategy", x: 20, y: 120, fontSize: 10.5 },
      { page: 1, text: "Languages", x: 20, y: 136, fontSize: 13 },
      { page: 1, text: "Brian Thomas, MBA, FACHT", x: 220, y: 20, fontSize: 16 },
      { page: 1, text: "Technology Executive | Influencer in 3 Industries | Helping", x: 220, y: 38, fontSize: 11.5 },
      { page: 1, text: "Executives Build & Grow their Brands", x: 220, y: 52, fontSize: 11.5 },
      { page: 1, text: "Kansas City, Missouri, United States", x: 220, y: 66, fontSize: 10.5 },
      { page: 1, text: "Summary", x: 220, y: 88, fontSize: 13 },
      { page: 1, text: "Experience", x: 220, y: 150, fontSize: 13 },
      { page: 1, text: "City of Lawrence, KS", x: 220, y: 168, fontSize: 10.5 },
      { page: 1, text: "Chief Information Officer", x: 220, y: 184, fontSize: 10.5 },
      { page: 1, text: "May 2023 - Present", x: 220, y: 200, fontSize: 10.5 },
      { page: 1, text: "Page 1 of 6", x: 260, y: 700, fontSize: 9 },
    ],
  }
}

describe("linkedin-pdf-parser", () => {
  it("parses a LinkedIn-style extracted document into one profile", () => {
    const result = parseLinkedInPdfDocument(buildLinkedInPdfFixture(), "Brian Thomas - LinkedIn Profile.pdf")

    expect(result.profile.firstName).toBe("Brian")
    expect(result.profile.lastName).toBe("Thomas")
    expect(result.profile.headline).toBe(
      "Technology Executive | Influencer in 3 Industries | Helping Executives Build & Grow their Brands",
    )
    expect(result.profile.location).toBe("Kansas City, Missouri, United States")
    expect(result.profile.linkedinUrl).toBe("https://www.linkedin.com/in/brianethomas1")
    expect(result.profile.email).toBe("brian.thomas@coruzant.com")
    expect(result.profile.skills).toEqual(["Lean Transformation", "IT Transformation", "Digital Strategy"])
    expect(result.profile.company).toBe("City of Lawrence, KS")
    expect(result.profile.id).toMatch(/^pdf-brian-thomas-\d+$/)
  })

  it("rejects unsupported PDFs when LinkedIn markers are missing", () => {
    const unsupportedDoc: LinkedInPdfDocument = {
      annotations: [],
      lines: [{ page: 1, text: "Resume", x: 20, y: 20, fontSize: 16 }],
    }

    expect(() => parseLinkedInPdfDocument(unsupportedDoc, "resume.pdf")).toThrow(
      UNSUPPORTED_LINKEDIN_PDF_MESSAGE,
    )
  })

  it("tolerates multiline headlines and ignores footer lines", () => {
    const doc = buildLinkedInPdfFixture()
    const result = parseLinkedInPdfDocument(doc, "Brian Thomas - LinkedIn Profile.pdf")

    expect(result.profile.headline).not.toContain("Page 1 of 6")
    expect(result.profile.headline).toContain("Executives Build & Grow their Brands")
  })
})
