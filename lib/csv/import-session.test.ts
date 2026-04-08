import type { ParsedActivity } from "@/lib/csv/activity-csv-parser"
import type { ParsedProfile } from "@/lib/csv/csv-parser"
import {
  applyImportToSession,
  mergeImportedProfiles,
  serializeProfilesToCanonicalCsv,
} from "@/lib/csv/import-session"
import { describe, expect, it } from "vitest"

function makeProfile(overrides: Partial<ParsedProfile> = {}): ParsedProfile {
  return {
    id: "profile-1",
    firstName: "Ava",
    lastName: "Stone",
    headline: "Platform Engineer",
    company: "Acme",
    location: "New York",
    industry: "Technology",
    connections: 500,
    skills: ["React", "TypeScript"],
    matchScore: 88,
    seniority: "Senior",
    tribe: undefined,
    linkedinUrl: "https://linkedin.com/in/ava",
    email: undefined,
    connectedOn: undefined,
    ...overrides,
  }
}

describe("import-session", () => {
  it("serializes parsed profiles into canonical CSV", () => {
    const csv = serializeProfilesToCanonicalCsv([
      makeProfile({
        id: "pdf-ava",
        matchScore: Number.NaN,
        seniority: "",
      }),
    ])

    expect(csv).toContain("id,firstName,lastName,headline,company,location,industry,connections,skills,matchScore,seniority,tribe,email,linkedinUrl,connectedOn")
    expect(csv).toContain("pdf-ava,Ava,Stone,Platform Engineer,Acme,New York,Technology,500,React;TypeScript,,,")
  })

  it("appends a PDF-derived profile to an existing imported dataset", () => {
    const existing = [makeProfile()]
    const incoming = [
      makeProfile({
        id: "pdf-brian",
        firstName: "Brian",
        lastName: "Thomas",
        headline: "Technology Executive",
        company: "City of Lawrence, KS",
        location: "Kansas City, Missouri, United States",
        linkedinUrl: "https://www.linkedin.com/in/brianethomas1",
      }),
    ]

    const merged = mergeImportedProfiles(existing, incoming)

    expect(merged).toHaveLength(2)
    expect(merged.map((profile) => profile.id)).toEqual(["profile-1", "pdf-brian"])
  })

  it("replaces a matched imported profile by LinkedIn URL without duplicating it", () => {
    const existing = [
      makeProfile({
        id: "csv-ava",
        headline: "Senior Engineer",
        industry: "Technology",
        connections: 500,
        linkedinUrl: "https://linkedin.com/in/ava?trk=public",
      }),
    ]
    const incoming = [
      makeProfile({
        id: "pdf-ava",
        headline: "Platform Engineering Leader",
        industry: "",
        connections: 0,
        matchScore: Number.NaN,
        seniority: "",
        linkedinUrl: "https://www.linkedin.com/in/ava/",
      }),
    ]

    const merged = mergeImportedProfiles(existing, incoming)

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe("csv-ava")
    expect(merged[0].headline).toBe("Platform Engineering Leader")
    expect(merged[0].connections).toBe(500)
    expect(merged[0].industry).toBe("Technology")
  })

  it("preserves CSV replacement behavior when a new CSV is uploaded", () => {
    const firstCsvState = applyImportToSession(
      null,
      {
        type: "csv",
        fileName: "first.csv",
        profiles: [makeProfile({ id: "csv-ava" })],
      },
      { sourceId: "src-1", importedAt: "2026-03-05T12:00:00.000Z" },
    )

    const replacedState = applyImportToSession(
      firstCsvState,
      {
        type: "csv",
        fileName: "second.csv",
        profiles: [makeProfile({ id: "csv-brian", firstName: "Brian", lastName: "Thomas" })],
      },
      { sourceId: "src-2", importedAt: "2026-03-05T12:05:00.000Z" },
    )

    expect(replacedState.sources).toHaveLength(1)
    expect(replacedState.displayLabel).toBe("second.csv")
    expect(replacedState.unsavedPdfProfileIds).toEqual([])
    expect(replacedState.profiles.map((profile) => profile.id)).toEqual(["csv-brian"])
  })

  it("stores activity audit rows and raw CSV on csv import, replacing on next csv", () => {
    const activities: ParsedActivity[] = [
      {
        activityId: "a1",
        type: "Open",
        dateIso: "2025-01-01",
        actorName: "Test",
        email: "t@example.com",
        uid: "",
        providerName: "P",
        scheme: "s",
        groupName: "g",
        resourceLabel: "/x",
        os: "Win",
        clientType: "web",
      },
    ]
    const raw = "Activity ID,Type,Date\na1,Open,2025-01-01"

    const withAudit = applyImportToSession(
      null,
      {
        type: "csv",
        fileName: "audit.csv",
        profiles: [makeProfile({ id: "p1" })],
        activities,
        rawActivityCsv: raw,
      },
      { sourceId: "src-a", importedAt: "2026-03-05T12:00:00.000Z" },
    )

    expect(withAudit.activities).toEqual(activities)
    expect(withAudit.activityCsv).toBe(raw)

    const replaced = applyImportToSession(
      withAudit,
      {
        type: "csv",
        fileName: "connections.csv",
        profiles: [makeProfile({ id: "p2", firstName: "Pat" })],
      },
      { sourceId: "src-b", importedAt: "2026-03-05T12:10:00.000Z" },
    )

    expect(replaced.activities).toEqual([])
    expect(replaced.activityCsv).toBeNull()
  })
})
