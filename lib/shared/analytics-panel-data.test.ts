import { createAnalyticsSnapshot } from "@/lib/shared/analytics-panel-data"
import { describe, expect, it } from "vitest"

describe("analytics-panel-data", () => {
  it("merges Supabase and CSV profiles into one combined analytics snapshot", () => {
    const snapshot = createAnalyticsSnapshot({
      supabaseProfiles: [
        {
          id: "profile-1",
          firstName: "Alice",
          lastName: "Ng",
          headline: "Senior React Engineer",
          company: "Orbit",
          location: "Remote",
          industry: "Technology",
          connections: 500,
          skills: ["React", "TypeScript"],
          matchScore: 92,
          seniority: "Senior",
          tribe: "Builders",
          linkedinUrl: "https://linkedin.com/in/alice-ng",
        },
        {
          id: "profile-2",
          firstName: "Bob",
          lastName: "Stone",
          headline: "Principal Platform Engineer",
          company: "Orbit",
          location: "New York",
          industry: "Technology",
          connections: 900,
          skills: ["Python", "Platform", "Leadership", "React"],
          matchScore: 88,
          seniority: "Principal",
        },
      ],
      csvProfiles: [
        {
          id: "csv-1",
          firstName: "Alice",
          lastName: "Ng",
          headline: "Senior React Engineer",
          company: "Orbit",
          location: "Remote",
          industry: "Technology",
          connections: 450,
          skills: ["React", "Leadership"],
          matchScore: 80,
          seniority: "Senior",
          tribe: "Builders",
          linkedinUrl: "https://linkedin.com/in/alice-ng",
        },
        {
          id: "csv-2",
          firstName: "Cara",
          lastName: "Voss",
          headline: "Product Designer",
          company: "Northstar",
          location: "Austin",
          industry: "Design",
          connections: 220,
          skills: ["Design", "Research"],
          matchScore: 74,
          seniority: "Mid",
          email: "cara@example.com",
        },
      ],
      tribes: [
        {
          id: "tribe-1",
          name: "Builders",
          description: "Core product builders",
          members: [
            { personId: "profile-1", tribeRole: "Lead", skills: ["React", "Leadership"] },
            { personId: "profile-2", tribeRole: "Executor", skills: ["Python", "Platform"] },
          ],
          commonSkills: ["React", "Python", "Leadership"],
          avgExperience: 7,
          industryFocus: "Technology",
          projects: ["project-1"],
          status: "active",
        },
      ],
      projects: [
        {
          id: "project-1",
          name: "Platform Hiring",
          description: "",
          type: "hiring",
          status: "active",
          progress: 55,
          profiles: 4,
          tribe: "Builders",
          tags: ["React", "Platform"],
          milestones: [],
          nextAction: "Review candidates",
        },
        {
          id: "project-2",
          name: "Leadership Program",
          description: "",
          type: "aspiration",
          status: "completed",
          progress: 100,
          profiles: 2,
          tags: ["Leadership"],
          milestones: [],
          nextAction: "Close loop",
        },
      ],
    })

    expect(snapshot.source).toBe("combined")
    expect(snapshot.profileCount).toBe(3)
    expect(snapshot.kpis[0]).toMatchObject({
      key: "profiles",
      value: "3",
    })
    expect(snapshot.kpis[1]).toMatchObject({
      key: "tribes",
      value: "1",
    })
    expect(snapshot.kpis[2]).toMatchObject({
      key: "projects",
      value: "1",
    })
    expect(snapshot.profileSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Dual-sourced" }),
        expect.objectContaining({ name: "Supabase" }),
        expect.objectContaining({ name: "CSV upload" }),
      ]),
    )
    expect(snapshot.skillCoverage.series.map((item) => item.label)).toEqual(
      expect.arrayContaining(["React", "Leadership"]),
    )
    expect(snapshot.projectPortfolio.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "Hiring", active: 1 }),
        expect.objectContaining({ category: "Aspiration", completed: 1 }),
      ]),
    )
    expect(snapshot.topSkills[0]).toMatchObject({
      skill: "Leadership",
      type: "core",
    })
  })

  it("derives tribe analytics from profile assignments when tribe rows are absent", () => {
    const snapshot = createAnalyticsSnapshot({
      csvProfiles: [
        {
          id: "csv-a",
          firstName: "Alex",
          lastName: "Kim",
          headline: "Senior Engineer",
          company: "North",
          location: "Remote",
          industry: "Technology",
          connections: 150,
          skills: ["React", "Node.js"],
          matchScore: 84,
          seniority: "Senior",
          tribe: "Alpha",
        },
        {
          id: "csv-b",
          firstName: "Bea",
          lastName: "Lopez",
          headline: "Staff Engineer",
          company: "North",
          location: "Remote",
          industry: "Technology",
          connections: 180,
          skills: ["React", "TypeScript"],
          matchScore: 86,
          seniority: "Staff",
          tribe: "Alpha",
        },
        {
          id: "csv-c",
          firstName: "Chris",
          lastName: "Vale",
          headline: "Designer",
          company: "South",
          location: "Austin",
          industry: "Design",
          connections: 120,
          skills: ["Design"],
          matchScore: 72,
          seniority: "Mid",
          tribe: "Beta",
        },
      ],
      projects: [
        {
          id: "project-alpha",
          name: "Alpha Build",
          description: "",
          type: "team-building",
          status: "active",
          progress: 44,
          profiles: 3,
          tribe: "Alpha",
          tags: ["React"],
          milestones: [],
          nextAction: "Staff team",
        },
      ],
    })

    expect(snapshot.source).toBe("csv")
    expect(snapshot.kpis[1]).toMatchObject({
      key: "tribes",
      value: "2",
    })
    expect(snapshot.tribeComparison.description).toContain("Derived")
    expect(snapshot.tribeComparison.series.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Alpha", "Beta"]),
    )
    expect(snapshot.focusAreas.title).toBe("Industry Mix")
    expect(snapshot.focusAreas.data[0]).toMatchObject({
      label: "Technology",
      count: 2,
    })
  })
})
