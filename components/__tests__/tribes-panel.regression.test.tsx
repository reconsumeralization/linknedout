/**
 * @vitest-environment jsdom
 * Regression: TribesPanel metric cards, CSV data source, and AI preview hydration.
 */
import { act, render, screen, waitFor } from "@testing-library/react"
import { fireEvent } from "@testing-library/react"
import { TribesPanel } from "@/components/tribes-panel"
import {
  fetchSupabaseProfiles,
  fetchSupabaseProjects,
  fetchSupabaseTribes,
  subscribeToProfiles,
  subscribeToTribes,
} from "@/lib/supabase/supabase-data"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const designPreviewListenerState = vi.hoisted(() => ({
  handler: null as null | ((detail: {
    sourceId: string
    output: {
      objective: string
      designedTribes: Array<Record<string, unknown>>
    }
  }) => void),
}))

vi.mock("@/lib/supabase/supabase-data", () => ({
  fetchSupabaseProfiles: vi.fn().mockResolvedValue([]),
  fetchSupabaseTribes: vi.fn().mockResolvedValue([]),
  fetchSupabaseProjects: vi.fn().mockResolvedValue([]),
  subscribeToProfiles: vi.fn().mockImplementation(() => () => {}),
  subscribeToTribes: vi.fn().mockImplementation(() => () => {}),
}))

vi.mock("@/lib/shared/tribe-design-preview-events", () => ({
  addTribeDesignPreviewEventListener: vi.fn().mockImplementation((handler) => {
    designPreviewListenerState.handler = handler
    return () => {
      designPreviewListenerState.handler = null
    }
  }),
}))

describe("TribesPanel regression", () => {
  beforeEach(() => {
    designPreviewListenerState.handler = null
    vi.mocked(fetchSupabaseProfiles).mockResolvedValue([])
    vi.mocked(fetchSupabaseTribes).mockResolvedValue([])
    vi.mocked(fetchSupabaseProjects).mockResolvedValue([])
    vi.mocked(subscribeToProfiles).mockImplementation(() => () => {})
    vi.mocked(subscribeToTribes).mockImplementation(() => () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders without throwing and shows the empty-state tribe prompt", async () => {
    render(
      <TribesPanel
        csvData={null}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText("No tribes yet")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Form First Tribe" })).toBeInTheDocument()
    })
  })

  it("shows metric card labels when a tribe with health data is present", async () => {
    vi.mocked(fetchSupabaseTribes).mockResolvedValue([
      {
        id: "t1",
        name: "Test Tribe",
        description: "Desc",
        members: [{ personId: "p1", name: "Alice", tribeRole: "Lead" }],
        commonSkills: ["React"],
        avgExperience: 5,
        industryFocus: "Tech",
        projects: [],
        status: "active",
        cohesion: 7,
        complementarity: 8,
        requiredSkillCoveragePercent: 85,
        networkSharePercent: 12.5,
        radarData: [
          { metric: "Skills", value: 80 },
          { metric: "Diversity", value: 70 },
          { metric: "Cohesion", value: 75 },
        ],
      } as never,
    ])

    render(
      <TribesPanel
        csvData={null}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    expect(await screen.findByRole("heading", { name: "Test Tribe" })).toBeInTheDocument()
    expect(screen.getByText("Members")).toBeInTheDocument()
    expect(screen.getByText("Skill Coverage")).toBeInTheDocument()
    expect(screen.getByText("Network Share")).toBeInTheDocument()
  })

  it("keeps CSV auto-grouped tribes when Supabase has no tribes", async () => {
    render(
      <TribesPanel
        csvData={"firstName,lastName,skills\nAva,Stone,React;TypeScript\nBen,Lopez,React;Node.js"}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    expect(await screen.findByRole("heading", { name: "React Team" })).toBeInTheDocument()
    expect(screen.getByText("Ava Stone")).toBeInTheDocument()
    expect(screen.getByText("100.0% required skills covered")).toBeInTheDocument()
    expect(screen.queryByText("No tribes yet")).not.toBeInTheDocument()
  })

  it("hydrates AI design preview members from workspace profiles", async () => {
    vi.mocked(fetchSupabaseProfiles).mockResolvedValue([
      {
        id: "profile-123",
        firstName: "Avery",
        lastName: "Stone",
        headline: "Principal Platform Engineer",
        company: "Acme",
        location: "New York",
        industry: "Technology",
        connections: 420,
        skills: ["Platform", "React", "Architecture"],
        matchScore: 91,
        seniority: "Principal",
      },
    ])

    render(
      <TribesPanel
        csvData={null}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    await waitFor(() => {
      expect(designPreviewListenerState.handler).toBeTruthy()
    })

    act(() => {
      designPreviewListenerState.handler?.({
        sourceId: "tool-1",
        output: {
          objective: "Launch a new platform",
          designedTribes: [
            {
              tribeIndex: 1,
              suggestedName: "Launch Crew",
              profileIds: ["profile-123"],
              memberCount: 1,
              avgMatchScore: 86,
              topSkills: ["React", "Strategy"],
            },
          ],
        },
      })
    })

    expect(await screen.findByRole("heading", { name: "Launch Crew" })).toBeInTheDocument()
    expect(screen.getByText("Avery Stone")).toBeInTheDocument()
    expect(screen.getAllByText("Principal")).toHaveLength(2)
    expect(screen.queryByText(/Profile profile-123/i)).not.toBeInTheDocument()
  })

  it("forms a persisted tribe from realtime design output instead of local mock data", async () => {
    vi.mocked(fetchSupabaseTribes)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "tribe-1",
          name: "Launch Crew",
          description: "Ship the platform launch",
          members: [
            {
              personId: "profile-1",
              name: "Avery Stone",
              tribeRole: "Lead",
              seniority: "Senior",
              skills: ["React", "Strategy"],
            },
            {
              personId: "profile-2",
              name: "Jordan Kim",
              tribeRole: "Strategist",
              seniority: "Principal",
              skills: ["Node.js", "Strategy"],
            },
          ],
          commonSkills: ["React", "Strategy", "Node.js"],
          avgExperience: 8,
          industryFocus: "Technology",
          projects: [],
          status: "active",
          cohesion: 7.8,
          complementarity: 8.1,
          strengths: ["Shared strength in React + Strategy"],
          radarData: [
            { metric: "Cohesion", value: 78 },
            { metric: "Skills", value: 81 },
          ],
          skillDist: [
            { name: "Strategy", value: 2 },
            { name: "React", value: 1 },
          ],
        } as never,
      ])

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          output: {
            designedTribes: [
              {
                profileIds: ["profile-1", "profile-2"],
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          output: {
            tribes: [{ id: "tribe-1" }],
          },
        }),
      })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <TribesPanel
        csvData={null}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Form First Tribe" }))
    fireEvent.change(screen.getByPlaceholderText("e.g. Fintech Catalyst Crew"), {
      target: { value: "Launch Crew" },
    })
    fireEvent.change(
      screen.getByPlaceholderText(
        "e.g. A cross-functional team for a fintech product launch with strong engineering and design...",
      ),
      {
        target: { value: "Ship the platform launch" },
      },
    )
    fireEvent.change(screen.getByPlaceholderText("e.g. React, Node.js, Product Management"), {
      target: { value: "React, Strategy" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Form Tribe" }))

    expect(await screen.findByRole("heading", { name: "Launch Crew" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const designRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(designRequest).toEqual({
      name: "designTribesForObjective",
      arguments: {
        objective: "Ship the platform launch",
        desiredTribeCount: 1,
        desiredTribeSize: 5,
        requiredSkills: ["React", "Strategy"],
      },
    })

    const createRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(createRequest).toEqual({
      name: "createTribe",
      arguments: {
        tribeName: "Launch Crew",
        profileIds: ["profile-1", "profile-2"],
        tribePurpose: "Ship the platform launch",
        tribeSize: 5,
        optimizeFor: "balanced",
        constraints: {
          mustIncludeSkills: ["React", "Strategy"],
        },
      },
    })
  })

  it("re-analyzes a persisted tribe from realtime composition output", async () => {
    vi.mocked(fetchSupabaseTribes).mockResolvedValue([
      {
        id: "tribe-1",
        name: "Launch Crew",
        description: "Ship the platform launch",
        members: [
          {
            personId: "profile-1",
            name: "Avery Stone",
            tribeRole: "Lead",
            seniority: "Senior",
            skills: ["React", "Strategy"],
          },
          {
            personId: "profile-2",
            name: "Jordan Kim",
            tribeRole: "Strategist",
            seniority: "Principal",
            skills: ["Node.js", "Strategy"],
          },
        ],
        commonSkills: ["React", "Strategy", "Node.js"],
        avgExperience: 8,
        industryFocus: "Technology",
        projects: [],
        status: "active",
        cohesion: 7.1,
        complementarity: 6.8,
        strengths: ["Legacy strength"],
        radarData: [
          { metric: "Cohesion", value: 71 },
          { metric: "Skills", value: 68 },
        ],
        skillDist: [
          { name: "Strategy", value: 2 },
          { name: "React", value: 1 },
        ],
      } as never,
    ])

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        output: {
          tribes: [
            {
              tribeId: "tribe-1",
              healthScore: 8.4,
              avgMatchScore: 91.5,
              avgConnections: 860,
              avgExperienceYears: 8.2,
              topSkills: [
                { skill: "React", count: 2, percentage: 100 },
                { skill: "Strategy", count: 2, percentage: 100 },
                { skill: "Node.js", count: 1, percentage: 50 },
              ],
              requiredSkillCoverage: [
                { skill: "React", coveragePercent: 100 },
                { skill: "Strategy", coveragePercent: 100 },
                { skill: "Node.js", coveragePercent: 50 },
              ],
              gapSkills: [],
              recommendedAdds: [
                {
                  name: "Pat Doe",
                  reasons: ["Covers current gap skill(s)"],
                },
              ],
              seniorityMix: [
                { label: "Senior", count: 1, percentage: 50 },
                { label: "Lead/Staff", count: 1, percentage: 50 },
              ],
              industryMix: [
                { label: "Technology", count: 2, percentage: 100 },
              ],
            },
          ],
        },
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <TribesPanel
        csvData={null}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    expect(await screen.findByRole("heading", { name: "Launch Crew" })).toBeInTheDocument()
    expect(screen.getByText("Legacy strength")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Re-analyze" }))

    expect(await screen.findByText("8.4/10 composition health")).toBeInTheDocument()
    expect(screen.queryByText("Legacy strength")).not.toBeInTheDocument()

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(requestBody).toEqual({
      name: "analyzeTribeComposition",
      arguments: {
        tribeId: "tribe-1",
        requiredSkills: ["React", "Strategy", "Node.js"],
        benchmarkAgainstWorkspace: true,
        limitRecommendations: 3,
      },
    })
  })
})
