/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NetworkPanel } from "@/components/network-panel"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/supabase-client-auth", () => ({
  resolveSupabaseAccessToken: vi.fn(() => "mock-token"),
}))

function createEmptyDataset() {
  return {
    friendNodes: [],
    friendLinks: [],
    friendGrowth: [],
    tribeBubbles: [],
    groups: [],
    groupOverlaps: [],
    groupActivity: [],
    groupHeatmap: [],
    jobFunnelNodes: [],
    jobFunnelLinks: [],
    jobScatter: [],
    jobCalendar: [],
  }
}

describe("NetworkPanel regression", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it("refetches network insights when the time range changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        source: "supabase-empty",
        data: createEmptyDataset(),
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<NetworkPanel />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/network/insights?timeRange=90d")

    fireEvent.change(screen.getByDisplayValue("Last 90 days"), {
      target: { value: "30d" },
    })

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/network/insights?timeRange=30d")).toBe(true)
    })
  })
})
