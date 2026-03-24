/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { OnboardingCard } from "@/components/onboarding-card"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("OnboardingCard", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem("linkedout_welcome_seen", "true")
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows a conversational first step when Supabase is not configured", () => {
    render(
      <OnboardingCard
        hasSupabaseConfigured={false}
        hasAuth={false}
        hasData={false}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByText("Let's get Supabase connected first.")).toBeInTheDocument()
    expect(screen.getByText("0 of 3 core steps")).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Open setup guide" })).toHaveLength(2)
    expect(screen.getByText("Import your first profiles")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import CSV/PDF" })).toBeInTheDocument()
  })

  it("routes the user to chat when they ask for AI guidance", () => {
    const onNavigate = vi.fn()

    render(
      <OnboardingCard
        hasSupabaseConfigured
        hasAuth
        hasData={false}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Ask AI to guide me" }))

    expect(onNavigate).toHaveBeenCalledWith("chat")
  })

  it("shows the completed core-setup state when forced open", () => {
    render(
      <OnboardingCard
        hasSupabaseConfigured
        hasAuth
        hasData
        forceShow
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByText("Core setup complete")).toBeInTheDocument()
    expect(screen.getByText("You are ready to use LinkedOut.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Hide checklist" })).toBeInTheDocument()
    expect(screen.getByText("Optional next steps")).toBeInTheDocument()
  })
})
