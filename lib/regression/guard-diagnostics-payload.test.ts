/**
 * Regression: Guard Diagnostics payload shape (option 3).
 * Ensures /api/chat?action=health strictMode includes egressAllowlistTools and egressToolRateLimits
 * in the shape consumed by Sentinel Guard Diagnostics UI.
 */

import { afterEach, describe, expect, it } from "vitest"
import {
  getMcpDataEgressToolAllowlist,
  getMcpDataEgressToolRateLimitOverrides,
} from "@/lib/security/mcp-tool-security"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("Guard Diagnostics strictMode payload shape (chat health)", () => {
  it("egressAllowlistTools is a sorted array from getMcpDataEgressToolAllowlist", () => {
    process.env.MCP_DATA_EGRESS_TOOL_ALLOWLIST = "postContent,sendMessage,createUgcPost"
    const allowlist = getMcpDataEgressToolAllowlist()
    const asArray = Array.from(allowlist).sort()
    expect(Array.isArray(asArray)).toBe(true)
    expect(asArray).toEqual(["createugcpost", "postcontent", "sendmessage"])
  })

  it("egressToolRateLimits is a plain object from getMcpDataEgressToolRateLimitOverrides", () => {
    process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMITS = "sendMessage:5,postContent:2"
    const overrides = getMcpDataEgressToolRateLimitOverrides()
    const asObject = Object.fromEntries(overrides)
    expect(asObject).toEqual({ sendmessage: 5, postcontent: 2 })
  })

  it("strictMode shape has egressAllowlistTools and egressToolRateLimits for UI", () => {
    process.env.MCP_DATA_EGRESS_TOOL_ALLOWLIST = "postContent"
    process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMITS = "postContent:3"
    const strictMode = {
      egressAllowlistTools: Array.from(getMcpDataEgressToolAllowlist()).sort(),
      egressToolRateLimits: Object.fromEntries(getMcpDataEgressToolRateLimitOverrides()),
    }
    expect(strictMode.egressAllowlistTools).toEqual(["postcontent"])
    expect(strictMode.egressToolRateLimits).toEqual({ postcontent: 3 })
  })
})
