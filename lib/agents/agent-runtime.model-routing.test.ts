import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("getAgentModelConfig routing", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("keeps OpenAI models on OpenAI with matching effective id", async () => {
    const { getAgentModelConfig } = await import("@/lib/agents/agent-runtime")
    const c = getAgentModelConfig("gpt-4.1-mini")
    expect(c.nominalProvider).toBe("openai")
    expect(c.provider).toBe("openai")
    expect(c.effectiveModelId).toBe("gpt-4.1-mini")
  })

  it("routes Kimi id to OpenAI gpt-4.1-mini fallback", async () => {
    const { getAgentModelConfig } = await import("@/lib/agents/agent-runtime")
    const c = getAgentModelConfig("kimi-2.5")
    expect(c.nominalProvider).toBe("moonshot")
    expect(c.provider).toBe("openai")
    expect(c.effectiveModelId).toBe("gpt-4.1-mini")
  })

  it("routes Llama id to OpenAI gpt-4.1-mini fallback", async () => {
    const { getAgentModelConfig } = await import("@/lib/agents/agent-runtime")
    const c = getAgentModelConfig("llama-3.3-70b")
    expect(c.nominalProvider).toBe("meta")
    expect(c.provider).toBe("openai")
    expect(c.effectiveModelId).toBe("gpt-4.1-mini")
  })

  it("routes local placeholder to OpenAI gpt-4.1-mini fallback", async () => {
    const { getAgentModelConfig } = await import("@/lib/agents/agent-runtime")
    const c = getAgentModelConfig("local-macstudio")
    expect(c.nominalProvider).toBe("local")
    expect(c.provider).toBe("openai")
    expect(c.effectiveModelId).toBe("gpt-4.1-mini")
  })

  it("uses AI Gateway for Anthropic when AI_GATEWAY_API_KEY is set", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gw_test_key")
    const { getAgentModelConfig } = await import("@/lib/agents/agent-runtime")
    const c = getAgentModelConfig("claude-3.7-sonnet")
    expect(c.nominalProvider).toBe("anthropic")
    expect(c.provider).toBe("anthropic")
    expect(c.effectiveModelId).toBe("anthropic/claude-3.7-sonnet")
  })
})
