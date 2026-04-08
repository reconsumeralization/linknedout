import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/supabase", () => ({
  getSupabaseClient: vi.fn(),
}))

import { getSupabaseClient } from "@/lib/supabase/supabase"
import { fetchOnboardingOptionalStepsState } from "@/lib/supabase/supabase-data"

function queryBuilder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.select = chain
  b.eq = chain
  b.or = chain
  b.limit = chain
  b.order = chain
  b.maybeSingle = () => Promise.resolve(result)
  return b
}

describe("fetchOnboardingOptionalStepsState", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
  })

  it("returns null when Supabase client is missing", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null)
    await expect(fetchOnboardingOptionalStepsState()).resolves.toBeNull()
  })

  it("returns null when there is no session", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
      from: () => {
        throw new Error("from() should not run without session")
      },
    } as never)
    await expect(fetchOnboardingOptionalStepsState()).resolves.toBeNull()
  })

  it("sets flags from row presence", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "user-1" } } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "linkedin_identities") {
          return queryBuilder({ data: { user_id: "user-1" }, error: null })
        }
        if (table === "email_integrations") {
          return queryBuilder({ data: { id: "e1" }, error: null })
        }
        if (table === "marketplace_listings") {
          return queryBuilder({ data: { id: "l1" }, error: null })
        }
        return queryBuilder({ data: null, error: null })
      },
    } as never)

    const result = await fetchOnboardingOptionalStepsState()
    expect(result).not.toBeNull()
    expect(result!.linkedinConnected).toBe(true)
    expect(result!.emailConnected).toBe(true)
    expect(result!.marketplaceEngaged).toBe(true)
    expect(result!.governanceHasTribes).toBe(false)
    expect(result!.authenticityEngaged).toBe(false)
    expect(result!.handcuffAuditStarted).toBe(false)
    expect(result!.autoResearchLaunched).toBe(false)
  })

  it("treats query errors as absent rows", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "user-1" } } },
          error: null,
        }),
      },
      from: () => queryBuilder({ data: null, error: { code: "42P01" } }),
    } as never)

    const result = await fetchOnboardingOptionalStepsState()
    expect(result).not.toBeNull()
    expect(result!.linkedinConnected).toBe(false)
  })
})
