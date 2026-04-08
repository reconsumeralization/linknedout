import { describe, expect, it } from "vitest"
import {
  deriveActorProfilesFromActivities,
  isActivityAuditCsv,
  parseActivityCsv,
  summarizeActivityTypes,
} from "@/lib/csv/activity-csv-parser"

/** Synthetic audit-style export (no real user or tenant data). */
const SAMPLE_AUDIT_CSV = [
  [
    "Activity ID",
    "Type",
    "Date",
    "Name",
    "Email",
    "Uid",
    "ProviderName",
    "Scheme",
    "GroupName",
    "NameVirtualDisplay",
    "PathActualDisplay",
    "ResourceNameOld",
    "OS",
    "Client ID",
  ].join(","),
  [
    "act-001",
    "File Open",
    "2025-06-01T10:00:00",
    "Alex Sample",
    "Alex.Sample@EXAMPLE.COM",
    "uid-7",
    "DemoProvider",
    "https",
    "Team-Alpha",
    '"/Shared/Report Q1"',
    "",
    "",
    "Windows",
    "web-client",
  ].join(","),
  [
    "act-002",
    "File Download",
    "2025-06-02T11:00:00",
    "Alex Sample",
    "alex.sample@example.com",
    "uid-7",
    "DemoProvider",
    "https",
    "Team-Alpha",
    "",
    "/vault/project/readme.txt",
    "",
    "Windows",
    "web-client",
  ].join(","),
  [
    "act-003",
    "Login",
    "2025-06-03T09:00:00",
    "Bob Tester",
    "",
    "uid-88",
    "DemoProvider",
    "https",
    "Team-Beta",
    "",
    "",
    "",
    "macOS",
    "mobile",
  ].join(","),
  ",,,,,,,,,,,,,", // skipped: empty row
  ",bad-row-no-id,,,,,,,,,,,,", // skipped: no Activity ID
].join("\n")

describe("activity-csv-parser", () => {
  it("detects audit CSV from header columns", () => {
    expect(isActivityAuditCsv(SAMPLE_AUDIT_CSV)).toBe(true)
    expect(isActivityAuditCsv("")).toBe(false)
    expect(
      isActivityAuditCsv(
        ["firstName,lastName,company", "Ada,Lovelace,Acme"].join("\n"),
      ),
    ).toBe(false)
  })

  it("parses rows, normalizes email, and picks resource labels", () => {
    const rows = parseActivityCsv(SAMPLE_AUDIT_CSV)
    expect(rows).toHaveLength(3)

    const alexOpen = rows.find((r) => r.activityId === "act-001")
    expect(alexOpen?.email).toBe("alex.sample@example.com")
    expect(alexOpen?.resourceLabel).toBe("/Shared/Report Q1")

    const alexDl = rows.find((r) => r.activityId === "act-002")
    expect(alexDl?.resourceLabel).toBe("/vault/project/readme.txt")
    expect(alexDl?.clientType).toBe("web-client")

    const bob = rows.find((r) => r.activityId === "act-003")
    expect(bob?.email).toBe("")
    expect(bob?.uid).toBe("uid-88")
    expect(bob?.type).toBe("Login")
  })

  it("returns empty array when required columns are missing", () => {
    expect(parseActivityCsv("a,b,c\n1,2,3")).toEqual([])
    // Parser requires both Activity ID and Type columns in the header row.
    expect(parseActivityCsv("Activity ID,Date\nonly-id,2025-01-01")).toEqual([])
  })

  it("groups activities into synthetic profiles by email / uid / name", () => {
    const rows = parseActivityCsv(SAMPLE_AUDIT_CSV)
    const profiles = deriveActorProfilesFromActivities(rows)
    expect(profiles).toHaveLength(2)

    const alex = profiles.find((p) => p.email === "alex.sample@example.com")
    expect(alex?.firstName).toBe("Alex")
    expect(alex?.lastName).toBe("Sample")
    expect(alex?.skills).toEqual(expect.arrayContaining(["File Open", "File Download"]))
    expect(alex?.headline).toMatch(/2 audit events/)

    const bob = profiles.find((p) => p.firstName === "Bob")
    expect(bob?.email).toBeUndefined()
    expect(bob?.skills).toContain("Login")
  })

  it("summarizes types by frequency with a limit", () => {
    const rows = parseActivityCsv(SAMPLE_AUDIT_CSV)
    const summary = summarizeActivityTypes(rows, 2)
    expect(summary).toHaveLength(2)
    expect(summary[0].count).toBeGreaterThanOrEqual(summary[1].count)
  })
})
