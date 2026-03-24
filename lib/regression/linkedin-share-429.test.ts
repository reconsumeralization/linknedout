/**
 * Regression: LinkedIn share API 429 messaging (option 2).
 * Ensures app-level and LinkedIn-API 429 responses include user-facing message and Retry-After.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockRateLimitResult = (retryAfterSeconds: number) => ({
  allowed: false,
  remaining: 0,
  retryAfterSeconds,
  limit: 30,
  resetAt: Date.now() + retryAfterSeconds * 1000,
})

vi.mock("@/lib/shared/request-rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientAddressFromRequest: vi.fn(() => "127.0.0.1"),
  createRateLimitHeaders: vi.fn(() => ({})),
  parseRateLimitConfigFromEnv: vi.fn(() => ({ max: 30, windowMs: 60_000 })),
}))

vi.mock("@/lib/supabase/supabase-auth", () => ({
  resolveSupabaseAuthContextFromRequest: vi.fn(() => null),
}))

vi.mock("@/lib/linkedin/linkedin-identity-server", () => ({
  getLinkedInAccessToken: vi.fn(() => null),
  getLinkedInIdentity: vi.fn(() => null),
}))

vi.mock("@/lib/linkedin/linkedin-consumer", () => ({
  buildUgcPostBody: vi.fn(() => ({})),
  createUgcPostWithRetry: vi.fn(() =>
    Promise.resolve({
      ok: false,
      status: 429,
      error: "Rate limit exceeded",
      retryAfter: 90,
    }),
  ),
  introspectToken: vi.fn(() => Promise.resolve({ active: true })),
}))

describe("LinkedIn share route 429 messaging", () => {
  beforeEach(async () => {
    const { checkRateLimit } = await import("@/lib/shared/request-rate-limit")
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 0,
      limit: 30,
      resetAt: Date.now() + 60_000,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns 429 with user message and Retry-After when app-level rate limit is exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/shared/request-rate-limit")
    vi.mocked(checkRateLimit).mockResolvedValue(mockRateLimitResult(120) as never)

    const { POST } = await import("@/app/api/linkedin/share/route")
    const req = new Request("http://localhost/api/linkedin/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello" }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("120")
    expect(body.ok).toBe(false)
    expect(body.error).toBe("rate_limit_exceeded")
    expect(body.retryAfterSeconds).toBe(120)
    expect(typeof body.message).toBe("string")
    expect(body.message).toMatch(/try again in .* minute/)
  })

  it("returns 429 with singular 'minute' when retry is <= 60 seconds", async () => {
    const { checkRateLimit } = await import("@/lib/shared/request-rate-limit")
    vi.mocked(checkRateLimit).mockResolvedValue(mockRateLimitResult(45) as never)

    const { POST } = await import("@/app/api/linkedin/share/route")
    const req = new Request("http://localhost/api/linkedin/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hi" }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.message).toMatch(/try again in 1 minute/)
  })

  it("returns 429 with LinkedIn user message and Retry-After when LinkedIn API returns 429", async () => {
    const { resolveSupabaseAuthContextFromRequest } = await import("@/lib/supabase/supabase-auth")
    const { getLinkedInAccessToken, getLinkedInIdentity } = await import("@/lib/linkedin/linkedin-identity-server")
    vi.mocked(resolveSupabaseAuthContextFromRequest).mockResolvedValue({
      userId: "test-user",
      accessToken: "token",
    } as never)
    vi.mocked(getLinkedInAccessToken).mockResolvedValue({
      accessToken: "at",
      linkedinSubject: "urn:li:person:xxx",
    } as never)
    vi.mocked(getLinkedInIdentity).mockResolvedValue({ has_share_scope: true } as never)

    const { POST } = await import("@/app/api/linkedin/share/route")
    const req = new Request("http://localhost/api/linkedin/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Post" }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("90")
    expect(body.ok).toBe(false)
    expect(body.error).toBe("rate_limit")
    expect(body.retryAfter).toBe(90)
    expect(typeof body.message).toBe("string")
    expect(body.message).toMatch(/LinkedIn limit reached/)
    expect(body.message).toMatch(/try again in .* minute/)
  })
})
