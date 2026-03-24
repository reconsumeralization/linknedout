import { POST } from "@/app/api/profiles/import/route"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/require-auth", () => ({
  requireSupabaseAuth: vi.fn(),
}))

vi.mock("@/lib/supabase/supabase-server", () => ({
  getSupabaseServerClient: vi.fn(),
}))

type StoredProfileRow = Record<string, unknown>

function createMockServerClient(initialRows: StoredProfileRow[] = []) {
  const rows = initialRows.map((row) => ({ ...row }))
  const insertPayloads: StoredProfileRow[] = []
  const updatePayloads: StoredProfileRow[] = []

  const client = {
    rows,
    insertPayloads,
    updatePayloads,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_field: string, ownerUserId: string) => ({
          limit: vi.fn(async () => ({
            data: rows.filter((row) => row.owner_user_id === ownerUserId),
            error: null,
          })),
        })),
      })),
      update: vi.fn((payload: StoredProfileRow) => ({
        eq: vi.fn((_field: string, id: string) => ({
          eq: vi.fn(async (_ownerField: string, ownerUserId: string) => {
            const index = rows.findIndex((row) => row.id === id && row.owner_user_id === ownerUserId)
            if (index >= 0) {
              rows[index] = { ...rows[index], ...payload }
            }
            updatePayloads.push(payload)
            return { error: null }
          }),
        })),
      })),
      insert: vi.fn(async (payload: StoredProfileRow) => {
        rows.push(payload)
        insertPayloads.push(payload)
        return { error: null }
      }),
    })),
  }

  return client
}

describe("profiles import route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when auth is missing", async () => {
    vi.mocked(requireSupabaseAuth).mockResolvedValue({
      auth: null,
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    })

    const response = await POST(
      new Request("http://localhost/api/profiles/import", {
        method: "POST",
        body: JSON.stringify({ profiles: [] }),
        headers: { "Content-Type": "application/json" },
      }),
    )

    expect(response.status).toBe(401)
  })

  it("inserts a new profile when no match exists and does not persist unsupported fields", async () => {
    const client = createMockServerClient()
    vi.mocked(requireSupabaseAuth).mockResolvedValue({
      auth: { userId: "user-1" } as never,
      response: null,
    })
    vi.mocked(getSupabaseServerClient).mockReturnValue(client as never)

    const response = await POST(
      new Request("http://localhost/api/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [
            {
              sessionId: "pdf-brian",
              firstName: "Brian",
              lastName: "Thomas",
              headline: "Technology Executive",
              company: "City of Lawrence, KS",
              location: "Kansas City, Missouri, United States",
              skills: ["Lean Transformation"],
              linkedinUrl: "https://www.linkedin.com/in/brianethomas1?trk=public",
            },
          ],
        }),
      }),
    )

    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.counts).toEqual({ inserted: 1, updated: 0 })
    expect(payload.saved[0].sessionId).toBe("pdf-brian")
    expect(payload.saved[0].action).toBe("inserted")
    expect(payload.saved[0].profileId).toMatch(/^crm-import-\d+-0$/)
    expect(client.insertPayloads).toHaveLength(1)
    expect(client.insertPayloads[0]).not.toHaveProperty("email")
    expect(client.insertPayloads[0].linkedin_url).toBe("https://www.linkedin.com/in/brianethomas1")
  })

  it("updates an existing profile when owner and LinkedIn URL match", async () => {
    const client = createMockServerClient([
      {
        id: "existing-1",
        owner_user_id: "user-1",
        first_name: "Brian",
        last_name: "Thomas",
        headline: "Old Headline",
        company: "Old Company",
        linkedin_url: "https://www.linkedin.com/in/brianethomas1",
      },
    ])
    vi.mocked(requireSupabaseAuth).mockResolvedValue({
      auth: { userId: "user-1" } as never,
      response: null,
    })
    vi.mocked(getSupabaseServerClient).mockReturnValue(client as never)

    const response = await POST(
      new Request("http://localhost/api/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [
            {
              sessionId: "pdf-brian",
              firstName: "Brian",
              lastName: "Thomas",
              headline: "Technology Executive",
              company: "City of Lawrence, KS",
              location: "Kansas City, Missouri, United States",
              skills: ["Lean Transformation"],
              linkedinUrl: "https://linkedin.com/in/brianethomas1/",
            },
          ],
        }),
      }),
    )

    const payload = await response.json()

    expect(payload.counts).toEqual({ inserted: 0, updated: 1 })
    expect(payload.saved[0]).toEqual({
      sessionId: "pdf-brian",
      profileId: "existing-1",
      action: "updated",
    })
    expect(client.updatePayloads[0].headline).toBe("Technology Executive")
  })

  it("falls back to exact name, headline, and company matching when no LinkedIn URL exists", async () => {
    const client = createMockServerClient([
      {
        id: "existing-2",
        owner_user_id: "user-1",
        first_name: "Ava",
        last_name: "Stone",
        headline: "Platform Engineer",
        company: "Acme",
        linkedin_url: null,
      },
    ])
    vi.mocked(requireSupabaseAuth).mockResolvedValue({
      auth: { userId: "user-1" } as never,
      response: null,
    })
    vi.mocked(getSupabaseServerClient).mockReturnValue(client as never)

    const response = await POST(
      new Request("http://localhost/api/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [
            {
              sessionId: "pdf-ava",
              firstName: "Ava",
              lastName: "Stone",
              headline: "Platform Engineer",
              company: "Acme",
              location: "New York",
              skills: ["React", "TypeScript"],
            },
          ],
        }),
      }),
    )

    const payload = await response.json()

    expect(payload.counts).toEqual({ inserted: 0, updated: 1 })
    expect(payload.saved[0]).toEqual({
      sessionId: "pdf-ava",
      profileId: "existing-2",
      action: "updated",
    })
  })
})
