/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ProfilesPanel } from "@/components/profiles-panel"
import type { SessionImportState } from "@/lib/csv/import-session"
import { fetchSupabaseProfiles, fetchSupabaseTribes, subscribeToProfiles } from "@/lib/supabase/supabase-data"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { useState } from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase/supabase-data", () => ({
  fetchSupabaseProfiles: vi.fn().mockResolvedValue([]),
  fetchSupabaseTribes: vi.fn().mockResolvedValue([]),
  subscribeToProfiles: vi.fn().mockImplementation(() => () => {}),
}))

vi.mock("@/lib/supabase/supabase", () => ({
  getSupabaseClient: vi.fn(() => null),
}))

vi.mock("@/lib/supabase/supabase-client-auth", () => ({
  resolveSupabaseAccessToken: vi.fn(() => "token"),
}))

function buildSessionImport(overrides: Partial<SessionImportState> = {}): SessionImportState {
  return {
    canonicalCsv: null,
    profiles: [],
    activities: [],
    activityCsv: null,
    sources: [
      {
        id: "src-1",
        type: "linkedin_pdf",
        fileName: "Brian Thomas - LinkedIn Profile.pdf",
        profileIds: ["pdf-ava"],
        importedAt: "2026-03-05T12:00:00.000Z",
      },
    ],
    displayLabel: "Brian Thomas - LinkedIn Profile.pdf",
    unsavedPdfProfileIds: ["pdf-ava"],
    ...overrides,
  }
}

describe("ProfilesPanel regression", () => {
  beforeEach(() => {
    vi.mocked(fetchSupabaseProfiles).mockResolvedValue([])
    vi.mocked(fetchSupabaseTribes).mockResolvedValue([])
    vi.mocked(subscribeToProfiles).mockImplementation(() => () => {})
    vi.mocked(resolveSupabaseAccessToken).mockReturnValue("token")
  })

  it("keeps selected CSV profiles stable across reparses and respects quoted fields", async () => {
    const csv = [
      "firstName,lastName,headline,company,location,industry,connections,skills,matchScore,seniority,tribe,linkedinUrl",
      'Ava,Stone,Platform Engineer,Acme,New York,Technology,500,React;TypeScript,88,Senior,,https://linkedin.com/in/ava',
      'Jordan,Kim,Product Lead,"Orbit, Inc.",Austin,Technology,120,Strategy;Research,77,Lead,Ops Council,https://linkedin.com/in/jordan',
    ].join("\n")

    const { rerender } = render(
      <ProfilesPanel
        csvData={csv}
        sessionImport={null}
        onSaveImportedPdfProfiles={vi.fn().mockResolvedValue(undefined)}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    expect(await screen.findByRole("heading", { name: "Ava Stone" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Jordan Kim/i }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Jordan Kim" })).toBeInTheDocument()
    })
    expect(screen.getAllByText("Orbit, Inc.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Ops Council").length).toBeGreaterThan(0)

    rerender(
      <ProfilesPanel
        csvData={`${csv}\n`}
        sessionImport={null}
        onSaveImportedPdfProfiles={vi.fn().mockResolvedValue(undefined)}
        onNavigate={undefined}
        onPageContextChange={undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Jordan Kim" })).toBeInTheDocument()
    })
    expect(screen.getAllByText("Orbit, Inc.").length).toBeGreaterThan(0)
  })

  it("shows the imported PDF save banner, reviews imported profiles, and hides after save", async () => {
    const csv = [
      "id,firstName,lastName,headline,company,location,industry,connections,skills,matchScore,seniority,tribe,linkedinUrl",
      "pdf-ava,Ava,Stone,Platform Engineer,Acme,New York,Technology,500,React;TypeScript,88,Senior,,https://linkedin.com/in/ava",
    ].join("\n")
    const saveImportedProfiles = vi.fn().mockResolvedValue(undefined)

    function Harness() {
      const [sessionImport, setSessionImport] = useState<SessionImportState>(
        buildSessionImport({
          canonicalCsv: csv,
          profiles: [],
        }),
      )

      return (
        <ProfilesPanel
          csvData={csv}
          sessionImport={sessionImport}
          onSaveImportedPdfProfiles={async (profileIds) => {
            await saveImportedProfiles(profileIds)
            setSessionImport((current) => ({
              ...current,
              unsavedPdfProfileIds: current.unsavedPdfProfileIds.filter((id) => !profileIds.includes(id)),
            }))
          }}
          onNavigate={undefined}
          onPageContextChange={undefined}
        />
      )
    }

    render(<Harness />)

    expect(screen.getByText("Imported PDF profiles ready to save")).toBeInTheDocument()
    expect(
      screen.getByText("Review the imported LinkedIn PDF profile, then save it to Supabase."),
    ).toBeInTheDocument()
    expect(screen.getByText("Only CRM-supported fields will be saved in v1.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Review imported profiles" }))
    expect(await screen.findByRole("heading", { name: "Ava Stone" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Save to Supabase" }))

    await waitFor(() => {
      expect(saveImportedProfiles).toHaveBeenCalledWith(["pdf-ava"])
    })

    await waitFor(() => {
      expect(screen.queryByText("Imported PDF profiles ready to save")).not.toBeInTheDocument()
    })
  })
})
