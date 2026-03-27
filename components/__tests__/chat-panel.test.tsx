/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChatPanel } from "@/components/chat-panel"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { importLinkedInPdf } from "@/lib/linkedin/linkedin-pdf-parser"
import { importLinkedInDataExport } from "@/lib/import/linkedin-data-export"
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

vi.mock("@/lib/import/linkedin-data-export", () => ({
  importLinkedInDataExport: vi.fn(),
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
      expect(toast.error).toHaveBeenCalledWith(
        "Unsupported file type. Please upload a CSV, PDF, JSON, VCF, or select multiple files from a LinkedIn export folder.",
      )
    })
    expect(onImportProfiles).not.toHaveBeenCalled()
  })

  it("accepts multi-file LinkedIn export bundles", async () => {
    const { input, onImportProfiles } = renderChatPanel()

    vi.mocked(importLinkedInDataExport).mockResolvedValue({
      profiles: [
        {
          id: "csv-1-ava-stone",
          firstName: "Ava",
          lastName: "Stone",
          headline: "Platform Engineer",
          company: "Acme",
          location: "New York",
          industry: "Technology",
          connections: 0,
          skills: ["React"],
          matchScore: 88,
          seniority: "Senior",
          linkedinUrl: "https://linkedin.com/in/ava",
          email: undefined,
          connectedOn: "25 Mar 2026",
        },
      ],
      canonicalCsv: "id,firstName,lastName\ncsv-1-ava-stone,Ava,Stone",
      warnings: ["LinkedIn export artifacts detected: connections=1."],
      errors: [],
      artifactCounts: { connections: 1 },
    })

    fireEvent.change(input, {
      target: {
        files: [
          new File(["csv"], "Connections.csv", { type: "text/csv" }),
          new File(["<html></html>"], "Articles/Articles/foo.html", { type: "text/html" }),
        ],
      },
    })

    await waitFor(() => {
      expect(onImportProfiles).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "linkedin_export",
          fileName: "LinkedIn data export",
          warnings: expect.any(Array),
          rawCsv: expect.any(String),
        }),
      )
    })

    expect(toast.success).toHaveBeenCalledWith("LinkedIn export imported", {
      description: "1 connections ready for analysis",
    })
  })
})
