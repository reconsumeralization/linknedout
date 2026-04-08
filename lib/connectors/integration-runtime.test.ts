import { describe, expect, it } from "vitest"
import { isIntegrationRuntimeWired } from "@/lib/connectors/integration-runtime"

describe("isIntegrationRuntimeWired", () => {
  it("returns true for providers with in-repo wiring", () => {
    expect(isIntegrationRuntimeWired("supabase")).toBe(true)
    expect(isIntegrationRuntimeWired("mongodb")).toBe(true)
    expect(isIntegrationRuntimeWired("openai")).toBe(true)
    expect(isIntegrationRuntimeWired("redis")).toBe(true)
    expect(isIntegrationRuntimeWired("groq")).toBe(true)
    expect(isIntegrationRuntimeWired("mistral")).toBe(true)
    expect(isIntegrationRuntimeWired("resend")).toBe(true)
    expect(isIntegrationRuntimeWired("posthog")).toBe(true)
  })

  it("returns false for catalog-only providers", () => {
    expect(isIntegrationRuntimeWired("stripe")).toBe(false)
    expect(isIntegrationRuntimeWired("shopify")).toBe(false)
    expect(isIntegrationRuntimeWired("slack")).toBe(false)
    expect(isIntegrationRuntimeWired("unknown-vendor")).toBe(false)
  })
})
