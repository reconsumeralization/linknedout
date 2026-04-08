import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("executeMarketplaceIntegration", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("sends email via Resend API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_1" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { executeMarketplaceIntegration } = await import("@/lib/integrations/execute")
    const out = await executeMarketplaceIntegration({
      providerId: "resend",
      tool: "email:send",
      input: {
        from: "onboarding@resend.dev",
        to: "you@example.com",
        subject: "Hi",
        text: "Hello",
      },
      ctx: { userId: "u1", accessToken: "t" },
    })

    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(init.headers.Authorization).toContain("Bearer")
  })

  it("uses request-scoped override key for OpenAI embeddings", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { executeMarketplaceIntegration } = await import("@/lib/integrations/execute")
    const out = await executeMarketplaceIntegration({
      providerId: "openai",
      tool: "llm:embed",
      input: { input: "hello" },
      ctx: { userId: "u1", accessToken: "t" },
      keyOverrides: { openai: "sk_override_123" },
    })

    expect(out.ok).toBe(true)
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(init.headers.Authorization).toBe("Bearer sk_override_123")
  })

  it("fails OpenAI execution when no env key and no override", async () => {
    vi.stubEnv("OPENAI_API_KEY", "")
    const { executeMarketplaceIntegration } = await import("@/lib/integrations/execute")
    const out = await executeMarketplaceIntegration({
      providerId: "openai",
      tool: "llm:embed",
      input: { input: "hello" },
      ctx: { userId: "u1", accessToken: "t" },
    })

    expect(out.ok).toBe(false)
    expect(out.error).toContain("Missing API key for openai")
  })

  it("sends PostHog analytics:track capture payload", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1 }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { executeMarketplaceIntegration } = await import("@/lib/integrations/execute")
    const out = await executeMarketplaceIntegration({
      providerId: "posthog",
      tool: "analytics:track",
      input: { event: "marketplace_test", distinct_id: "user_x", properties: { plan: "free" } },
      ctx: { userId: "u1", accessToken: "t" },
    })

    expect(out.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(url).toContain("/capture/")
    const body = JSON.parse(init.body) as { api_key: string; event: string; properties: Record<string, unknown> }
    expect(body.api_key).toBe("phc_test_key")
    expect(body.event).toBe("marketplace_test")
    expect(body.properties.distinct_id).toBe("user_x")
    expect(body.properties.plan).toBe("free")
  })
})

describe("deriveImplementationStatus", () => {
  it("returns live for marketplace execute providers", async () => {
    const { deriveImplementationStatus } = await import("@/lib/integrations/execute")
    expect(deriveImplementationStatus("resend", true)).toBe("live")
    expect(deriveImplementationStatus("openai", false)).toBe("live")
  })

  it("returns partial when runtime wired but not on execute list", async () => {
    const { deriveImplementationStatus } = await import("@/lib/integrations/execute")
    expect(deriveImplementationStatus("anthropic", true)).toBe("partial")
    expect(deriveImplementationStatus("mongodb", true)).toBe("partial")
  })

  it("returns planned when not wired", async () => {
    const { deriveImplementationStatus } = await import("@/lib/integrations/execute")
    expect(deriveImplementationStatus("stripe", false)).toBe("planned")
  })
})

describe("partialIntegrationHint", () => {
  it("returns known hints for partial providers", async () => {
    const { partialIntegrationHint } = await import("@/lib/integrations/execute")
    expect(partialIntegrationHint("mongodb")).toContain("/api/mongodb/proxy")
    expect(partialIntegrationHint("anthropic")).toContain("Anthropic")
    expect(partialIntegrationHint("unknown-partial")).toContain("integrations/execute")
  })
})
