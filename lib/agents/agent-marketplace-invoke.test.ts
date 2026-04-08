import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const installState = vi.hoisted(() => ({
  data: { id: "cfg-1" } as { id: string } | null,
  error: null as { message: string } | null,
}))

const executeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, result: { done: true } }),
)
const recordMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock("@/lib/integrations/execute", () => ({
  executeMarketplaceIntegration: (...args: unknown[]) => executeMock(...args),
}))

vi.mock("@/lib/integrations/integration-usage-log", () => ({
  recordIntegrationUsage: (...args: unknown[]) => recordMock(...args),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: installState.data, error: installState.error }),
      ),
    })),
  })),
}))

describe("invokeMarketplaceIntegrationFromAgent", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon_test")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service_test")
    installState.data = { id: "cfg-1" }
    installState.error = null
    executeMock.mockResolvedValue({ ok: true, result: { done: true } })
    recordMock.mockClear()
    executeMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("runs execute and records usage when integration is installed", async () => {
    const { invokeMarketplaceIntegrationFromAgent } = await import(
      "@/lib/agents/agent-marketplace-invoke"
    )
    const out = await invokeMarketplaceIntegrationFromAgent(
      { userId: "u1", accessToken: "tok", agentId: "agent-9" },
      { provider: "resend", tool: "email:send", params: { x: 1 } },
    )

    expect(out.ok).toBe(true)
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(recordMock).toHaveBeenCalledTimes(1)
    const recordArgs = recordMock.mock.calls[0] as [
      unknown,
      {
        userId: string
        provider: string
        toolName: string
        agentId: string | null
        ok: boolean
      },
    ]
    expect(recordArgs[1].userId).toBe("u1")
    expect(recordArgs[1].provider).toBe("resend")
    expect(recordArgs[1].toolName).toBe("email:send")
    expect(recordArgs[1].agentId).toBe("agent-9")
    expect(recordArgs[1].ok).toBe(true)
  })

  it("skips execute and usage log when not installed", async () => {
    installState.data = null
    const { invokeMarketplaceIntegrationFromAgent } = await import(
      "@/lib/agents/agent-marketplace-invoke"
    )
    const out = await invokeMarketplaceIntegrationFromAgent(
      { userId: "u1", accessToken: "tok" },
      { provider: "resend", tool: "email:send" },
    )

    expect(out.ok).toBe(false)
    expect(out.error).toContain("Install this integration")
    expect(executeMock).not.toHaveBeenCalled()
    expect(recordMock).not.toHaveBeenCalled()
  })
})
