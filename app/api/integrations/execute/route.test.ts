import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockImplementation(async () => ({
    allowed: true,
    remaining: 39,
    retryAfterSeconds: 0,
    limit: 40,
    resetAt: Date.now() + 60_000,
  })),
  requireSupabaseAuth: vi.fn(),
  parseJsonBodyWithLimit: vi.fn(),
  executeMarketplaceIntegration: vi.fn(),
  providerSupportsMarketplaceExecute: vi.fn(),
  recordIntegrationUsage: vi.fn().mockResolvedValue(undefined),
  maybeSingle: vi.fn(),
}))

vi.mock("@/lib/shared/request-rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
  createRateLimitHeaders: vi.fn(() => ({})),
  getClientAddressFromRequest: vi.fn(() => "127.0.0.1"),
  parseRateLimitConfigFromEnv: vi.fn(() => ({ max: 40, windowMs: 60_000 })),
}))

vi.mock("@/lib/auth/require-auth", () => ({
  requireSupabaseAuth: (...args: unknown[]) => mocks.requireSupabaseAuth(...args),
}))

vi.mock("@/lib/shared/request-body", () => ({
  getMaxBodyBytesFromEnv: vi.fn(() => 48_000),
  parseJsonBodyWithLimit: (...args: unknown[]) => mocks.parseJsonBodyWithLimit(...args),
}))

vi.mock("@/lib/shared/resolve-request-keys", () => ({
  resolveOpenAIKey: vi.fn(() => null),
  resolveGroqKey: vi.fn(() => null),
  resolveMistralKey: vi.fn(() => null),
}))

vi.mock("@/lib/integrations/execute", () => ({
  executeMarketplaceIntegration: (...args: unknown[]) => mocks.executeMarketplaceIntegration(...args),
  providerSupportsMarketplaceExecute: (...args: unknown[]) => mocks.providerSupportsMarketplaceExecute(...args),
}))

vi.mock("@/lib/integrations/integration-usage-log", () => ({
  recordIntegrationUsage: (...args: unknown[]) => mocks.recordIntegrationUsage(...args),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => mocks.maybeSingle()),
    })),
  })),
}))

describe("POST /api/integrations/execute", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service_test")
    mocks.checkRateLimit.mockImplementation(async () => ({
      allowed: true,
      remaining: 39,
      retryAfterSeconds: 0,
      limit: 40,
      resetAt: Date.now() + 60_000,
    }))
    mocks.requireSupabaseAuth.mockResolvedValue({
      auth: { userId: "user-1", accessToken: "jwt-1" },
      response: null,
    })
    mocks.parseJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { provider: "resend", tool: "email:send", input: {} },
    })
    mocks.providerSupportsMarketplaceExecute.mockReturnValue(true)
    mocks.maybeSingle.mockResolvedValue({ data: { id: "cfg" }, error: null })
    mocks.executeMarketplaceIntegration.mockResolvedValue({ ok: true, result: { id: "sent" } })
    mocks.recordIntegrationUsage.mockClear()
    mocks.executeMarketplaceIntegration.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns 429 when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
      limit: 40,
      resetAt: Date.now() + 30_000,
    })
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(429)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it("returns auth response when requireSupabaseAuth fails", async () => {
    mocks.requireSupabaseAuth.mockResolvedValueOnce({
      auth: null,
      response: new Response(JSON.stringify({ error: "nope" }), { status: 401 }),
    })
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for unsupported provider before install check", async () => {
    mocks.providerSupportsMarketplaceExecute.mockReturnValueOnce(false)
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain("not supported")
    expect(mocks.executeMarketplaceIntegration).not.toHaveBeenCalled()
  })

  it("returns 403 when integration not installed", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(403)
    expect(mocks.executeMarketplaceIntegration).not.toHaveBeenCalled()
  })

  it("returns 500 when install check errors", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "db err" } })
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(500)
  })

  it("returns 200 and records usage on success", async () => {
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mocks.executeMarketplaceIntegration).toHaveBeenCalledTimes(1)
    expect(mocks.recordIntegrationUsage).toHaveBeenCalledTimes(1)
    const usageArg = mocks.recordIntegrationUsage.mock.calls[0][1] as { userId: string; ok: boolean }
    expect(usageArg.userId).toBe("user-1")
    expect(usageArg.ok).toBe(true)
  })

  it("returns 422 when handler returns ok false", async () => {
    mocks.executeMarketplaceIntegration.mockResolvedValueOnce({ ok: false, error: "vendor down" })
    const { POST } = await import("./route")
    const res = await POST(new Request("http://localhost/api/integrations/execute", { method: "POST" }))
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(mocks.recordIntegrationUsage).toHaveBeenCalled()
    const usageArg = mocks.recordIntegrationUsage.mock.calls[0][1] as { ok: boolean }
    expect(usageArg.ok).toBe(false)
  })
})
