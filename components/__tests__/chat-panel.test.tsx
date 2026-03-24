/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChatPanel } from "@/components/chat-panel"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { importLinkedInPdf } from "@/lib/linkedin/linkedin-pdf-parser"
import { toast } from "sonner"
import { describe, expect, it, beforeEach, vi } from "vitest"

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    setMessages: vi.fn(),
    setInput: vi.fn(),
  }),
}))

vi.mock("@/lib/supabase/supabase-client-auth", () => ({
  resolveSupabaseAccessToken: vi.fn(() => null),
}))

vi.mock("@/lib/linkedin/linkedin-pdf-parser", () => ({
  importLinkedInPdf: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function renderChatPanel() {
  const onImportProfiles = vi.fn()
  const view = render(
    <ChatPanel
      csvData={null}
      importLabel={null}
      onImportProfiles={onImportProfiles}
    />,
  )

  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement | null
  if (!input) {
    throw new Error("File input not found")
  }

  return { ...view, input, onImportProfiles }
}

describe("ChatPanel import upload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveSupabaseAccessToken).mockReturnValue(null)
  })

  it("accepts CSV uploads and forwards parsed profiles", async () => {
    const { input, onImportProfiles } = renderChatPanel()
    const csv = [
      "firstName,lastName,headline,company,location,industry,connections,skills,matchScore,seniority,linkedinUrl",
      "Ava,Stone,Platform Engineer,Acme,New York,Technology,500,React;TypeScript,88,Senior,https://linkedin.com/in/ava",
    ].join("\n")

    fireEvent.change(input, {
      target: {
        files: [new File([csv], "profiles.csv", { type: "text/csv" })],
      },
    })

    await waitFor(() => {
      expect(onImportProfiles).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "csv",
          fileName: "profiles.csv",
          rawCsv: csv,
        }),
      )
    })

    expect(toast.success).toHaveBeenCalledWith("CSV loaded: profiles.csv", {
      description: "1 profiles ready for analysis",
    })
    expect(screen.getByRole("button", { name: "Import CSV/PDF" })).toBeInTheDocument()
  })

  it("accepts LinkedIn PDF uploads and forwards parsed profiles", async () => {
    const { input, onImportProfiles } = renderChatPanel()
    vi.mocked(importLinkedInPdf).mockResolvedValue({
      profile: {
        id: "pdf-brian",
        firstName: "Brian",
        lastName: "Thomas",
        headline: "Technology Executive",
        company: "City of Lawrence, KS",
        location: "Kansas City, Missouri, United States",
        industry: "",
        connections: 0,
        skills: ["Lean Transformation", "IT Transformation"],
        matchScore: Number.NaN,
        seniority: "",
        linkedinUrl: "https://www.linkedin.com/in/brianethomas1",
        email: "brian.thomas@coruzant.com",
        connectedOn: undefined,
      },
      warnings: [],
    })

    fireEvent.change(input, {
      target: {
        files: [new File(["pdf"], "brian-profile.pdf", { type: "application/pdf" })],
      },
    })

    await waitFor(() => {
      expect(onImportProfiles).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "linkedin_pdf",
          fileName: "brian-profile.pdf",
          profiles: [expect.objectContaining({ firstName: "Brian", lastName: "Thomas" })],
        }),
      )
    })

    expect(toast.success).toHaveBeenCalledWith("LinkedIn PDF imported: Brian Thomas", {
      description: "Profile ready for analysis. Sign in to review and save in Profiles CRM.",
    })
  })

  it("rejects unsupported file types", async () => {
    const { input, onImportProfiles } = renderChatPanel()

    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "notes.txt", { type: "text/plain" })],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Please upload a CSV or LinkedIn PDF file.")
    })
    expect(onImportProfiles).not.toHaveBeenCalled()
  })
})
