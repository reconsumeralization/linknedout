import { buildGlobeLiveData, resolveGlobeCoordinates } from "@/lib/globe/globe-live-data"
import { describe, expect, it } from "vitest"

describe("globe-live-data", () => {
  it("maps common locations and remote records to stable coordinates", () => {
    const sanFrancisco = resolveGlobeCoordinates("San Francisco, CA", "sf-1")
    const remote = resolveGlobeCoordinates("Remote", "remote-1")

    expect(sanFrancisco).not.toBeNull()
    expect(sanFrancisco?.longitude).toBeGreaterThan(-123.5)
    expect(sanFrancisco?.longitude).toBeLessThan(-121.5)
    expect(sanFrancisco?.latitude).toBeGreaterThan(37)
    expect(sanFrancisco?.latitude).toBeLessThan(38.5)

    expect(remote).not.toBeNull()
    expect(remote?.longitude).toBeGreaterThan(-180)
    expect(remote?.longitude).toBeLessThan(180)
    expect(remote?.latitude).toBeGreaterThan(-80)
    expect(remote?.latitude).toBeLessThan(80)
  })

  it("derives globe layers from live CRM records", () => {
    const snapshot = buildGlobeLiveData({
      profiles: [
        {
          id: "profile-1",
          firstName: "Alice",
          lastName: "Ng",
          headline: "Product Lead",
          company: "Orbit",
          location: "San Francisco, CA",
          industry: "Technology",
          connections: 840,
          skills: ["Product"],
          matchScore: 90,
          seniority: "Lead",
          tribe: "Builders",
        },
        {
          id: "profile-2",
          firstName: "Noah",
          lastName: "Kim",
          headline: "Data Scientist",
          company: "Orbit",
          location: "New York, NY",
          industry: "Technology",
          connections: 620,
          skills: ["Data"],
          matchScore: 88,
          seniority: "Senior",
          tribe: "Builders",
        },
        {
          id: "profile-3",
          firstName: "Emma",
          lastName: "Rossi",
          headline: "UX Director",
          company: "Northstar",
          location: "London",
          industry: "Design",
          connections: 530,
          skills: ["Design"],
          matchScore: 84,
          seniority: "Director",
          tribe: "Design Loop",
        },
        {
          id: "profile-4",
          firstName: "James",
          lastName: "Sato",
          headline: "Growth Marketer",
          company: "Northstar",
          location: "Remote",
          industry: "Marketing",
          connections: 455,
          skills: ["Growth"],
          matchScore: 76,
          seniority: "Mid",
          tribe: "Design Loop",
        },
      ],
      tribes: [
        {
          id: "tribe-1",
          name: "Builders",
          description: "Build team",
          members: [
            { personId: "profile-1", tribeRole: "Lead" },
            { personId: "profile-2", tribeRole: "Executor" },
          ],
          commonSkills: ["Product", "Data"],
          avgExperience: 7,
          industryFocus: "Technology",
          projects: ["project-1"],
          status: "active",
        },
        {
          id: "tribe-2",
          name: "Design Loop",
          description: "Design team",
          members: [
            { personId: "profile-3", tribeRole: "Lead" },
            { personId: "profile-4", tribeRole: "Executor" },
          ],
          commonSkills: ["Design", "Growth"],
          avgExperience: 6,
          industryFocus: "Design",
          projects: ["project-2"],
          status: "active",
        },
      ],
      projects: [
        {
          id: "project-1",
          name: "Expansion Sprint",
          description: "",
          type: "hiring",
          status: "active",
          progress: 62,
          profiles: 3,
          tribe: "Builders",
          tags: ["Product"],
          milestones: [],
          nextAction: "Review shortlist",
        },
        {
          id: "project-2",
          name: "Design Sync",
          description: "",
          type: "team-building",
          status: "planned",
          progress: 20,
          profiles: 2,
          tribe: "Design Loop",
          tags: ["Design"],
          milestones: [],
          nextAction: "Plan kickoff",
        },
      ],
    })

    expect(snapshot.profileDots).toHaveLength(4)
    expect(snapshot.tribeClusters).toHaveLength(2)
    expect(snapshot.projectArcs).toHaveLength(2)
    expect(snapshot.connectionLines.length).toBeGreaterThan(0)
    expect(snapshot.tribeClusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Builders" }),
        expect.objectContaining({ name: "Design Loop" }),
      ]),
    )
  })
})
