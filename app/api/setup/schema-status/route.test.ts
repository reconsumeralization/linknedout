import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/shared/resolve-request-keys", () => {
  const clientFactory = (missing: Set<string>) => ({
    from: (table: string) => ({
      select: () => ({
        limit: async () => {
          if (missing.has(table)) {
            return { error: { message: `relation "public.${table}" does not exist` } }
          }
          return { error: null }
        },
      }),
    }),
  })

  return {
    resolveSupabaseCredentials: (req: Request) => {
      const url = req.headers.get("x-user-supabase-url") ?? "http://example.supabase.co"
      const anonKey = req.headers.get("x-user-supabase-anon-key") ?? "anon"
      return { url, anonKey }
    },
    resolveSupabaseClientFromRequest: (req: Request) => {
      const missing = new Set<string>()
      if (req.headers.get("x-missing-table") === "tribes") missing.add("tribes")
      return clientFactory(missing)
    },
  }
})

describe("GET /api/setup/schema-status", () => {
  it("returns ok with summary and recommendedAction when tables missing", async () => {
    const { GET } = await import("@/app/api/setup/schema-status/route")
    const req = new Request("http://localhost/api/setup/schema-status", {
      headers: {
        "x-user-supabase-url": "http://localhost:54321",
        "x-user-supabase-anon-key": "anon",
        "x-missing-table": "tribes",
      },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean; summary?: { missing: number }; recommendedAction?: string }
    expect(body.ok).toBe(true)
    expect(body.summary?.missing).toBeGreaterThan(0)
    expect(body.recommendedAction).toContain("Apply repo migrations")
  })

  it("returns ok with schema looks good when none missing", async () => {
    const { GET } = await import("@/app/api/setup/schema-status/route")
    const req = new Request("http://localhost/api/setup/schema-status", {
      headers: {
        "x-user-supabase-url": "http://localhost:54321",
        "x-user-supabase-anon-key": "anon",
      },
    })
    const res = await GET(req)
    const body = (await res.json()) as { ok?: boolean; summary?: { missing: number }; recommendedAction?: string }
    expect(body.ok).toBe(true)
    expect(body.summary?.missing).toBe(0)
    expect(body.recommendedAction).toContain("Schema looks good")
  })
})

