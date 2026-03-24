import { describe, expect, it } from "vitest"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"

describe("csv parser", () => {
  it("preserves explicit ids when the CSV provides them", () => {
    const csv = [
      "id,firstName,lastName,headline,company",
      "profile-123,Ada,Lovelace,Engineer,Acme",
    ].join("\n")

    const profiles = parseLinkedInCsv(csv)

    expect(profiles[0]?.id).toBe("profile-123")
  })

  it("uses explicit match scores and deterministic derived fallbacks", () => {
    const csv = [
      "firstName,lastName,headline,company,location,industry,connections,skills,matchScore,email,linkedinUrl,connectedOn",
      "Ada,Lovelace,Senior React Engineer,Acme,New York,Technology,500,React;TypeScript,88,ada@example.com,https://linkedin.com/in/ada,2024-02-20",
      "Grace,Hopper,Senior React Engineer,Acme,New York,Technology,500,React;TypeScript,invalid,grace@example.com,https://linkedin.com/in/grace,2024-02-20",
      "Taylor,Jones,,Acme,,,,,,,",
    ].join("\n")

    const profiles = parseLinkedInCsv(csv)

    expect(profiles.map((profile) => profile.matchScore)).toEqual([88, 84, 55])
  })

  it("produces stable derived scores across repeated parses", () => {
    const csv = [
      "firstName,lastName,headline,company,location,industry,connections,skills,matchScore",
      "Jordan,Kim,Principal Platform Engineer,Orbit,Remote,Technology,1200,React;Node.js,",
      "Riley,Stone,Product Designer,Orbit,Remote,Design,not-a-number,,",
    ].join("\n")

    const firstPass = parseLinkedInCsv(csv).map((profile) => profile.matchScore)
    const secondPass = parseLinkedInCsv(csv).map((profile) => profile.matchScore)

    expect(secondPass).toEqual(firstPass)
    expect(firstPass).toEqual([85, 62])
  })
})
