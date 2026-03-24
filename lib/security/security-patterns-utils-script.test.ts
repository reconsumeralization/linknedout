import { describe, expect, it } from "vitest"
import {
  extractFirstJsonObject,
  normalizeDocument,
  validateDocument,
} from "../../scripts/security-patterns-utils.mjs"

describe("security-patterns updater utils", () => {
  it("extracts a JSON object from markdown-wrapped model output", () => {
    const parsed = extractFirstJsonObject(
      "```json\n{\"chat\":{\"jailbreak\":[]},\"mcp\":{\"suspiciousText\":[],\"injectionCategories\":{},\"egressDlp\":[]},\"supabaseLlm\":{\"ragPoison\":[],\"querySensitive\":[]},\"web\":{\"promptInjection\":[],\"suspicious\":[]}}\n```",
    )
    expect(parsed).toBeTruthy()
    expect(parsed.chat).toBeTruthy()
    expect(parsed.mcp).toBeTruthy()
  })

  it("returns null when no JSON object exists", () => {
    expect(extractFirstJsonObject("model refused to answer")).toBeNull()
  })

  it("rejects invalid regexes during validation", () => {
    const base = normalizeDocument(
      {
        version: 1,
        updatedAt: "2026-03-03T00:00:00.000Z",
        chat: { jailbreak: [] },
        mcp: { suspiciousText: [], injectionCategories: {}, egressDlp: [] },
        supabaseLlm: { ragPoison: [], querySensitive: [] },
        web: { promptInjection: [], suspicious: [] },
      },
      {},
    )
    const next = normalizeDocument(base, {
      chat: {
        jailbreak: [
          {
            pattern: "(",
            flags: "i",
            label: "broken",
            severity: "high",
            enabled: true,
          },
        ],
      },
    })

    expect(() => validateDocument(next)).toThrow("Pattern validation failed")
  })

  it("prefers incoming rule state when a regex already exists", () => {
    const base = normalizeDocument(
      {
        version: 1,
        updatedAt: "2026-03-03T00:00:00.000Z",
        chat: {
          jailbreak: [
            {
              pattern: "ignore\\s+instructions",
              flags: "i",
              label: "existing",
              severity: "high",
              enabled: true,
            },
          ],
        },
        mcp: { suspiciousText: [], injectionCategories: {}, egressDlp: [] },
        supabaseLlm: { ragPoison: [], querySensitive: [] },
        web: { promptInjection: [], suspicious: [] },
      },
      {},
    )

    const next = normalizeDocument(base, {
      chat: {
        jailbreak: [
          {
            pattern: "ignore\\s+instructions",
            flags: "i",
            label: "existing",
            severity: "high",
            enabled: false,
          },
        ],
      },
    })

    expect(next.chat.jailbreak).toHaveLength(1)
    expect(next.chat.jailbreak[0].enabled).toBe(false)
  })
})
