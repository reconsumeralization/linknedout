import { describe, it, expect, vi, beforeEach } from "vitest"
import { requireSupabaseAuth } from "./require-auth"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"

vi.mock("@/lib/supabase/supabase-auth", () => ({
  resolveSupabaseAuthContextFromRequest: vi.fn(),
}))

describe("requireSupabaseAuth", () => {
  const mockAuth = {
    accessToken: "mock-token",
    userId: "user-123",
    email: "u@example.com",
    issuer: "https://example.supabase.co",
    audiences: [],
    scopes: [],
    tokenClaims: {},
    isSupabaseSession: true,
  }

  beforeEach(() => {
    vi.mocked(resolveSupabaseAuthContextFromRequest).mockReset()
  })

  it("returns auth when Supabase resolves a session", async () => {
    vi.mocked(resolveSupabaseAuthContextFromRequest).mockResolvedValue(mockAuth)
    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Bearer fake-token" },
    })
    const result = await requireSupabaseAuth(req)
    expect(result.auth).toEqual(mockAuth)
    expect(result.response).toBeNull()
  })

  it("returns 401 response when Supabase resolves no session", async () => {
    vi.mocked(resolveSupabaseAuthContextFromRequest).mockResolvedValue(null)
    const req = new Request("https://example.com/api")
    const result = await requireSupabaseAuth(req)
    expect(result.auth).toBeNull()
    const response = result.response
    expect(response).not.toBeNull()
    if (!response) {
      throw new Error("Expected unauthorized response")
    }
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(body.error).toContain("bearer token")
  })

  it("uses custom error body and status when provided", async () => {
    vi.mocked(resolveSupabaseAuthContextFromRequest).mockResolvedValue(null)
    const req = new Request("https://example.com/api")
    const result = await requireSupabaseAuth(req, {
      errorBody: { ok: false, message: "Custom" },
      status: 403,
    })
    const response = result.response
    expect(response).not.toBeNull()
    if (!response) {
      throw new Error("Expected forbidden response")
    }
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body).toEqual({ ok: false, message: "Custom" })
  })
})
