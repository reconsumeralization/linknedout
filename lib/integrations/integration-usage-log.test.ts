import { afterEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordIntegrationUsage } from "@/lib/integrations/integration-usage-log"

describe("recordIntegrationUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("inserts a row with expected columns", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ insert })
    const sb = { from } as unknown as SupabaseClient

    await recordIntegrationUsage(sb, {
      userId: "user-1",
      provider: "resend",
      toolName: "email:send",
      agentId: null,
      ok: true,
      latencyMs: 42,
      errorMessage: null,
    })

    expect(from).toHaveBeenCalledWith("integration_usage_log")
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        provider: "resend",
        tool_name: "email:send",
        agent_id: null,
        status: "success",
        latency_ms: 42,
        error_message: null,
      }),
    )
  })

  it("logs console error when insert fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const insert = vi.fn().mockResolvedValue({ error: { message: "db down" } })
    const from = vi.fn().mockReturnValue({ insert })
    const sb = { from } as unknown as SupabaseClient

    await recordIntegrationUsage(sb, {
      userId: "u",
      provider: "p",
      toolName: "t",
      ok: false,
      latencyMs: 1,
      errorMessage: "boom",
    }, "[test]")

    expect(errSpy).toHaveBeenCalledWith("[test]", "db down")
  })

  it("stores error status and truncates long error message", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ insert })
    const sb = { from } as unknown as SupabaseClient
    const longError = "x".repeat(5000)

    await recordIntegrationUsage(sb, {
      userId: "user-err",
      provider: "openai",
      toolName: "llm:embed",
      ok: false,
      latencyMs: 12,
      errorMessage: longError,
    })

    const payload = insert.mock.calls[0]?.[0] as { status: string; error_message: string | null }
    expect(payload.status).toBe("error")
    expect(payload.error_message?.length).toBe(4000)
  })
})
