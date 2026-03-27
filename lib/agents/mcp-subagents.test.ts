import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import {
  getSubagentProfileById,
  registerSubagentProfile,
  unregisterSubagentProfile,
  resolveSubagentFromAgentDefinition,
  isToolAllowedForSubagent,
  canExecuteToolCall,
  filterToolsForSubagent,
  getAllSubagentIds,
  getAllSubagentProfiles,
  validateSubagentScopes,
  createSubagentExecutionContext,
  getMcpSubagentProfile,
  incrementToolCallCount,
  getRetryPolicy,
  getSubagentInstructions,
  requiresAuthenticatedSessionForSubagent,
  resolveMcpSubagentIdFromRequest,
  authorizeSubagentRequest,
  authorizeSubagentToolCall,
  getAccessibleToolsForSubagent,
  canAccessToolInSubagent,
  type McpSubagentProfile,
  type SubagentExecutionContext,
} from "@/lib/agents/mcp-subagents"

// Mock dependencies
vi.mock("@/lib/auth/mcp-auth", () => ({
  createForbiddenResponse: vi.fn((req, scopes) => {
    return new Response(JSON.stringify({ error: "forbidden", scopes }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }),
  createUnauthorizedResponse: vi.fn((req, opts) => {
    return new Response(JSON.stringify({ error: "unauthorized", ...opts }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }),
  getMissingScopesForTool: vi.fn((auth, toolName) => {
    // Mock implementation: return empty array for known tools with matching scopes
    if (!auth || !auth.scopes) return []
    const requiredScopesMap: Record<string, string[]> = {
      "crm:read_contact": ["mcp:crm:read"],
      "email:send_message": ["mcp:email:send"],
      "web:search": ["mcp:web:read"],
    }
    const required = requiredScopesMap[toolName] || []
    return required.filter((scope) => !auth.scopes.includes(scope))
  }),
}))

vi.mock("@/lib/supabase/supabase-auth", () => ({}))

vi.mock("@/lib/supabase/supabase-llm-db-tools", () => ({
  SUPABASE_LLM_DB_TOOL_NAMES: [
    "supabase:read_table",
    "supabase:write_row",
    "supabase:delete_row",
  ],
}))

describe("mcp-subagents", () => {
  describe("built-in profiles", () => {
    it("initializes all 6 built-in profiles on module load", () => {
      const allIds = getAllSubagentIds()
      const allProfiles = getAllSubagentProfiles()

      expect(allIds).toContain("supabase")
      expect(allIds).toContain("sales-intel")
      expect(allIds).toContain("weekly-reporter")
      expect(allIds).toContain("content-clipper")
      expect(allIds).toContain("orchestrator")
      expect(allIds).toContain("meta-reasoner")

      expect(allProfiles.length).toBeGreaterThanOrEqual(6)
    })

    it("supabase profile has correct configuration", () => {
      const profile = getSubagentProfileById("supabase")
      expect(profile).toBeDefined()
      expect(profile?.name).toBe("Supabase Secure DB Sub-Agent")
      expect(profile?.description).toContain("user-scoped Supabase")
      expect(profile?.requiredScopes).toContain("mcp:db:read")
      expect(profile?.requiredScopes).toContain("mcp:db:write")
      expect(profile?.maxToolCallsPerRequest).toBe(100)
      expect(profile?.timeoutMs).toBe(60000)
      expect(profile?.retryPolicy?.maxRetries).toBe(3)
    })

    it("sales-intel profile has correct configuration", () => {
      const profile = getSubagentProfileById("sales-intel")
      expect(profile).toBeDefined()
      expect(profile?.name).toBe("Sales Intelligence Sub-Agent")
      expect(profile?.allowedTools).toContain("crm:read_contact")
      expect(profile?.allowedTools).toContain("email:send_message")
      expect(profile?.requiredScopes).toContain("mcp:crm:read")
      expect(profile?.requiredScopes).toContain("mcp:email:send")
    })

    it("weekly-reporter profile has correct configuration", () => {
      const profile = getSubagentProfileById("weekly-reporter")
      expect(profile).toBeDefined()
      expect(profile?.name).toBe("Weekly Reporter Sub-Agent")
      expect(profile?.allowedTools).toContain("email:read_inbox")
      expect(profile?.allowedTools).toContain("calendar:read_events")
      expect(profile?.allowedTools).toContain("slack:read_messages")
      expect(profile?.requiredScopes).toContain("mcp:email:read")
      expect(profile?.requiredScopes).toContain("mcp:calendar:read")
    })

    it("content-clipper profile has correct configuration", () => {
      const profile = getSubagentProfileById("content-clipper")
      expect(profile).toBeDefined()
      expect(profile?.name).toBe("Content Clipper Sub-Agent")
      expect(profile?.allowedTools).toContain("youtube:search_videos")
      expect(profile?.allowedTools).toContain("drive:read_file")
      expect(profile?.allowedTools).toContain("drive:upload_file")
      expect(profile?.requiredScopes).toContain("mcp:youtube:read")
      expect(profile?.requiredScopes).toContain("mcp:drive:write")
    })

    it("orchestrator profile has wildcard tool access", () => {
      const profile = getSubagentProfileById("orchestrator")
      expect(profile).toBeDefined()
      expect(profile?.allowedTools).toContain("*")
      expect(profile?.maxToolCallsPerRequest).toBe(500)
      expect(profile?.timeoutMs).toBe(120000)
    })

    it("meta-reasoner profile has correct configuration", () => {
      const profile = getSubagentProfileById("meta-reasoner")
      expect(profile).toBeDefined()
      expect(profile?.name).toBe("Meta-Reasoner Sub-Agent")
      expect(profile?.allowedTools).toContain("db:read_schema")
      expect(profile?.allowedTools).toContain("meta:write_metrics")
      expect(profile?.requiredScopes).toContain("mcp:meta:read")
      expect(profile?.requiredScopes).toContain("mcp:meta:write")
    })
  })

  describe("registerSubagentProfile()", () => {
    afterEach(() => {
      // Clean up custom profile
      unregisterSubagentProfile("custom-test-profile")
    })

    it("registers a new custom profile dynamically", () => {
      const customProfile: McpSubagentProfile = {
        id: "custom-test-profile",
        name: "Custom Test Profile",
        description: "A profile for testing dynamic registration",
        instructions: "Test instructions",
        allowedTools: ["custom:tool1", "custom:tool2"],
        requiredScopes: ["mcp:custom:read"],
        maxToolCallsPerRequest: 50,
        timeoutMs: 30000,
      }

      registerSubagentProfile(customProfile)
      const retrieved = getSubagentProfileById("custom-test-profile")

      expect(retrieved).toEqual(customProfile)
    })

    it("throws error if profile has no id", () => {
      const invalidProfile = {
        id: "",
        name: "Invalid Profile",
        description: "Missing id",
        instructions: "Test",
        allowedTools: [],
        requiredScopes: [],
      } as McpSubagentProfile

      expect(() => registerSubagentProfile(invalidProfile)).toThrow("Profile must have an id")
    })

    it("overwrites existing profile with same id", () => {
      const profile1: McpSubagentProfile = {
        id: "custom-test-profile",
        name: "Version 1",
        description: "First version",
        instructions: "v1",
        allowedTools: ["tool1"],
        requiredScopes: [],
      }

      const profile2: McpSubagentProfile = {
        id: "custom-test-profile",
        name: "Version 2",
        description: "Second version",
        instructions: "v2",
        allowedTools: ["tool2"],
        requiredScopes: [],
      }

      registerSubagentProfile(profile1)
      registerSubagentProfile(profile2)

      const retrieved = getSubagentProfileById("custom-test-profile")
      expect(retrieved?.name).toBe("Version 2")
      expect(retrieved?.allowedTools).toContain("tool2")
    })
  })

  describe("unregisterSubagentProfile()", () => {
    it("removes a registered profile", () => {
      const profile: McpSubagentProfile = {
        id: "temp-profile",
        name: "Temporary",
        description: "To be deleted",
        instructions: "Test",
        allowedTools: [],
        requiredScopes: [],
      }

      registerSubagentProfile(profile)
      expect(getSubagentProfileById("temp-profile")).toBeDefined()

      unregisterSubagentProfile("temp-profile")
      expect(getSubagentProfileById("temp-profile")).toBeNull()
    })

    it("does not throw error when unregistering non-existent profile", () => {
      expect(() => unregisterSubagentProfile("non-existent-id")).not.toThrow()
    })
  })

  describe("getSubagentProfileById()", () => {
    it("returns profile when id exists", () => {
      const profile = getSubagentProfileById("supabase")
      expect(profile).toBeDefined()
      expect(profile?.id).toBe("supabase")
    })

    it("returns null when id does not exist", () => {
      const profile = getSubagentProfileById("non-existent-profile")
      expect(profile).toBeNull()
    })

    it("returns correct profile for each built-in id", () => {
      const ids = ["supabase", "sales-intel", "weekly-reporter", "content-clipper", "orchestrator", "meta-reasoner"]
      for (const id of ids) {
        const profile = getSubagentProfileById(id)
        expect(profile).toBeDefined()
        expect(profile?.id).toBe(id)
      }
    })
  })

  describe("resolveSubagentFromAgentDefinition()", () => {
    it("resolves by exact id match", () => {
      const agent = {
        id: "sales-intel",
        name: "Some Other Name",
        description: "Some description",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("sales-intel")
    })

    it("resolves sales agents by name keyword", () => {
      const agent = {
        name: "Sales Intelligence Tool",
        description: "Manage customer relationships",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("sales-intel")
    })

    it("resolves CRM agents by name keyword", () => {
      const agent = {
        name: "CRM Integration Agent",
        description: "Works with customer data",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("sales-intel")
    })

    it("resolves sales agents by description keyword", () => {
      const agent = {
        name: "Customer Data Agent",
        description: "Handles sales operations and customer interactions",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("sales-intel")
    })

    it("resolves reporting agents by name keyword", () => {
      const agent = {
        name: "Weekly Report Generator",
        description: "Generates reports",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("weekly-reporter")
    })

    it("resolves reporting agents by description keyword", () => {
      const agent = {
        name: "Summary Creator",
        description: "Aggregates data from multiple sources",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("weekly-reporter")
    })

    it("resolves content agents by name keyword", () => {
      const agent = {
        name: "Content Clipper",
        description: "Clips and saves content",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("content-clipper")
    })

    it("resolves content agents by tool keyword", () => {
      const agent = {
        name: "Video Manager",
        description: "Manages videos",
        tools: ["youtube:search_videos"],
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("content-clipper")
    })

    it("resolves orchestrator agents by name keyword", () => {
      const agent = {
        name: "Master Orchestrator",
        description: "Orchestrates workflows",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("orchestrator")
    })

    it("resolves meta-reasoner agents by name keyword", () => {
      const agent = {
        name: "Meta Analysis Tool",
        description: "Analyzes system state",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("meta-reasoner")
    })

    it("resolves to supabase as default when no keywords match", () => {
      const agent = {
        name: "Generic Agent",
        description: "A generic agent with no matching keywords",
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("supabase")
    })

    it("handles agents with no name or description", () => {
      const agent = {}
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("supabase")
    })

    it("handles agents with skills and connectors array", () => {
      const agent = {
        name: "Video Processing Agent",
        skills: ["youtube", "processing"],
        connectors: ["youtube"],
      }
      const profile = resolveSubagentFromAgentDefinition(agent)
      expect(profile?.id).toBe("content-clipper")
    })
  })

  describe("isToolAllowedForSubagent()", () => {
    it("returns true when id is null", () => {
      expect(isToolAllowedForSubagent(null, "any:tool")).toBe(true)
    })

    it("returns false when profile does not exist", () => {
      expect(isToolAllowedForSubagent("non-existent", "any:tool")).toBe(false)
    })

    it("returns true for any tool when orchestrator has wildcard", () => {
      expect(isToolAllowedForSubagent("orchestrator", "crm:read_contact")).toBe(true)
      expect(isToolAllowedForSubagent("orchestrator", "email:send_message")).toBe(true)
      expect(isToolAllowedForSubagent("orchestrator", "any:unknown:tool")).toBe(true)
    })

    it("returns true for explicitly allowed tools", () => {
      expect(isToolAllowedForSubagent("sales-intel", "crm:read_contact")).toBe(true)
      expect(isToolAllowedForSubagent("sales-intel", "email:send_message")).toBe(true)
    })

    it("returns false for disallowed tools", () => {
      expect(isToolAllowedForSubagent("sales-intel", "youtube:search_videos")).toBe(false)
      expect(isToolAllowedForSubagent("sales-intel", "slack:read_messages")).toBe(false)
    })

    it("allows supabase tools for all subagents", () => {
      expect(isToolAllowedForSubagent("sales-intel", "supabase:read_table")).toBe(true)
      expect(isToolAllowedForSubagent("weekly-reporter", "supabase:write_row")).toBe(true)
      expect(isToolAllowedForSubagent("content-clipper", "supabase:delete_row")).toBe(true)
    })
  })

  describe("filterToolsForSubagent()", () => {
    const mockTools = [
      { name: "crm:read_contact", type: "read" },
      { name: "email:send_message", type: "write" },
      { name: "youtube:search_videos", type: "search" },
      { name: "supabase:read_table", type: "read" },
      { name: "unknown:tool", type: "unknown" },
    ]

    it("returns all tools when id is null", () => {
      const filtered = filterToolsForSubagent(null, mockTools)
      expect(filtered).toEqual(mockTools)
    })

    it("filters tools for sales-intel profile", () => {
      const filtered = filterToolsForSubagent("sales-intel", mockTools)
      expect(filtered).toHaveLength(3) // crm, email, supabase
      expect(filtered.map((t) => t.name)).toContain("crm:read_contact")
      expect(filtered.map((t) => t.name)).toContain("email:send_message")
      expect(filtered.map((t) => t.name)).toContain("supabase:read_table")
      expect(filtered.map((t) => t.name)).not.toContain("youtube:search_videos")
    })

    it("returns all tools for orchestrator profile", () => {
      const filtered = filterToolsForSubagent("orchestrator", mockTools)
      expect(filtered).toEqual(mockTools)
    })

    it("filters tools for weekly-reporter profile", () => {
      const filtered = filterToolsForSubagent("weekly-reporter", mockTools)
      expect(filtered.map((t) => t.name)).toContain("email:send_message") // email:read_inbox exists, but not email:send_message
      expect(filtered.map((t) => t.name)).not.toContain("youtube:search_videos")
    })
  })

  describe("canExecuteToolCall()", () => {
    it("returns allowed:true when within limits", () => {
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile: getSubagentProfileById("sales-intel")!,
        startTime: Date.now(),
        toolCallCount: 5,
        auth: null,
      }

      const result = canExecuteToolCall(context)
      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it("returns allowed:false when max tool calls exceeded", () => {
      const profile = getSubagentProfileById("sales-intel")!
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile,
        startTime: Date.now(),
        toolCallCount: profile.maxToolCallsPerRequest! + 1,
        auth: null,
      }

      const result = canExecuteToolCall(context)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("Maximum tool calls")
    })

    it("returns allowed:false when timeout exceeded", () => {
      const profile = getSubagentProfileById("sales-intel")!
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile,
        startTime: Date.now() - profile.timeoutMs! - 1000, // Started 1s ago + timeout
        toolCallCount: 5,
        auth: null,
      }

      const result = canExecuteToolCall(context)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("Timeout")
    })

    it("respects profile-specific max tool calls", () => {
      const supabaseProfile = getSubagentProfileById("supabase")!
      const context: SubagentExecutionContext = {
        subagentId: "supabase",
        profile: supabaseProfile,
        startTime: Date.now(),
        toolCallCount: supabaseProfile.maxToolCallsPerRequest! - 1,
        auth: null,
      }

      expect(canExecuteToolCall(context).allowed).toBe(true)

      context.toolCallCount = supabaseProfile.maxToolCallsPerRequest!
      expect(canExecuteToolCall(context).allowed).toBe(false)
    })
  })

  describe("incrementToolCallCount()", () => {
    it("increments tool call count", () => {
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile: getSubagentProfileById("sales-intel")!,
        startTime: Date.now(),
        toolCallCount: 5,
        auth: null,
      }

      incrementToolCallCount(context)
      expect(context.toolCallCount).toBe(6)

      incrementToolCallCount(context)
      expect(context.toolCallCount).toBe(7)
    })
  })

  describe("validateSubagentScopes()", () => {
    it("returns valid:true when all required scopes are present", () => {
      const result = validateSubagentScopes("sales-intel", [
        "mcp:tools",
        "mcp:crm:read",
        "mcp:crm:write",
        "mcp:email:read",
        "mcp:email:send",
        "mcp:web:read",
      ])

      expect(result.valid).toBe(true)
      expect(result.missingScopes).toEqual([])
    })

    it("returns valid:false when required scopes are missing", () => {
      const result = validateSubagentScopes("sales-intel", ["mcp:tools"])

      expect(result.valid).toBe(false)
      expect(result.missingScopes).toContain("mcp:crm:read")
      expect(result.missingScopes).toContain("mcp:email:send")
    })

    it("returns valid:true when id is null", () => {
      const result = validateSubagentScopes(null, [])
      expect(result.valid).toBe(true)
      expect(result.missingScopes).toEqual([])
    })

    it("returns valid:true when profile does not exist", () => {
      const result = validateSubagentScopes("non-existent", ["any:scope"])
      expect(result.valid).toBe(true)
      expect(result.missingScopes).toEqual([])
    })

    it("detects all missing scopes accurately", () => {
      const result = validateSubagentScopes("content-clipper", ["mcp:tools"])

      expect(result.valid).toBe(false)
      expect(result.missingScopes).toContain("mcp:youtube:read")
      expect(result.missingScopes).toContain("mcp:drive:read")
      expect(result.missingScopes).toContain("mcp:drive:write")
    })
  })

  describe("createSubagentExecutionContext()", () => {
    it("creates context for valid subagent id", () => {
      const context = createSubagentExecutionContext("sales-intel")

      expect(context).toBeDefined()
      expect(context?.subagentId).toBe("sales-intel")
      expect(context?.profile.id).toBe("sales-intel")
      expect(context?.toolCallCount).toBe(0)
      expect(context?.startTime).toBeLessThanOrEqual(Date.now())
      expect(context?.auth).toBeNull()
    })

    it("returns null for non-existent subagent id", () => {
      const context = createSubagentExecutionContext("non-existent")
      expect(context).toBeNull()
    })

    it("includes auth context when provided", () => {
      const mockAuth = {
        scopes: ["mcp:tools", "mcp:crm:read"],
        user: { id: "test-user" },
      }

      const context = createSubagentExecutionContext("sales-intel", mockAuth as any)

      expect(context?.auth).toEqual(mockAuth)
    })
  })

  describe("getSubagentInstructions()", () => {
    it("appends profile instructions to base instructions", () => {
      const baseInstructions = "Do your best work."
      const result = getSubagentInstructions(baseInstructions, "sales-intel")

      expect(result).toContain("Do your best work.")
      expect(result).toContain("Sub-agent policy:")
      expect(result).toContain("CRM tools")
    })

    it("returns only base instructions when id is null", () => {
      const baseInstructions = "Do your best work."
      const result = getSubagentInstructions(baseInstructions, null)

      expect(result).toBe(baseInstructions)
    })

    it("returns only base instructions when profile not found", () => {
      const baseInstructions = "Do your best work."
      const result = getSubagentInstructions(baseInstructions, "non-existent")

      expect(result).toBe(baseInstructions)
    })
  })

  describe("requiresAuthenticatedSessionForSubagent()", () => {
    it("returns true for subagents with required scopes", () => {
      expect(requiresAuthenticatedSessionForSubagent("sales-intel")).toBe(true)
      expect(requiresAuthenticatedSessionForSubagent("supabase")).toBe(true)
    })

    it("returns false when id is null", () => {
      expect(requiresAuthenticatedSessionForSubagent(null)).toBe(false)
    })

    it("returns false when profile not found", () => {
      expect(requiresAuthenticatedSessionForSubagent("non-existent")).toBe(false)
    })
  })

  describe("getRetryPolicy()", () => {
    it("returns profile retry policy when defined", () => {
      const policy = getRetryPolicy("supabase")

      expect(policy.maxRetries).toBe(3)
      expect(policy.backoffMs).toBe(500)
    })

    it("returns default retry policy when profile has none", () => {
      const customProfile: McpSubagentProfile = {
        id: "no-retry-policy",
        name: "No Retry",
        description: "Test",
        instructions: "Test",
        allowedTools: [],
        requiredScopes: [],
        // No retryPolicy
      }
      registerSubagentProfile(customProfile)

      const policy = getRetryPolicy("no-retry-policy")

      expect(policy.maxRetries).toBe(3) // DEFAULT_MAX_RETRIES
      expect(policy.backoffMs).toBe(1000) // DEFAULT_BACKOFF_MS

      unregisterSubagentProfile("no-retry-policy")
    })

    it("returns defaults when id is null or profile not found", () => {
      const policyNull = getRetryPolicy(null)
      const policyNotFound = getRetryPolicy("non-existent")

      expect(policyNull.maxRetries).toBe(3)
      expect(policyNull.backoffMs).toBe(1000)
      expect(policyNotFound).toEqual(policyNull)
    })
  })

  describe("getAllSubagentIds()", () => {
    it("returns all registered subagent ids", () => {
      const ids = getAllSubagentIds()

      expect(ids).toContain("supabase")
      expect(ids).toContain("sales-intel")
      expect(ids).toContain("weekly-reporter")
      expect(ids).toContain("content-clipper")
      expect(ids).toContain("orchestrator")
      expect(ids).toContain("meta-reasoner")
      expect(ids.length).toBeGreaterThanOrEqual(6)
    })
  })

  describe("getAllSubagentProfiles()", () => {
    it("returns all registered subagent profiles", () => {
      const profiles = getAllSubagentProfiles()

      expect(profiles.length).toBeGreaterThanOrEqual(6)
      expect(profiles.map((p) => p.id)).toContain("supabase")
      expect(profiles.map((p) => p.id)).toContain("orchestrator")
    })

    it("returns profiles with expected structure", () => {
      const profiles = getAllSubagentProfiles()

      for (const profile of profiles) {
        expect(profile.id).toBeDefined()
        expect(profile.name).toBeDefined()
        expect(profile.description).toBeDefined()
        expect(profile.instructions).toBeDefined()
        expect(profile.allowedTools).toBeDefined()
        expect(profile.requiredScopes).toBeDefined()
      }
    })
  })

  describe("getMcpSubagentProfile()", () => {
    it("returns profile when id exists", () => {
      const profile = getMcpSubagentProfile("supabase")
      expect(profile).toBeDefined()
      expect(profile?.id).toBe("supabase")
    })

    it("returns null when id is null", () => {
      const profile = getMcpSubagentProfile(null)
      expect(profile).toBeNull()
    })

    it("returns null when profile does not exist", () => {
      const profile = getMcpSubagentProfile("non-existent")
      expect(profile).toBeNull()
    })
  })

  describe("authorizeSubagentRequest()", () => {
    const mockRequest = new Request("http://example.com/test")

    it("returns unauthorized response when auth is null", () => {
      const response = authorizeSubagentRequest(mockRequest, null, "sales-intel")

      expect(response).toBeDefined()
      expect(response?.status).toBe(401)
    })

    it("returns null when all required scopes are present", () => {
      const auth = {
        scopes: ["mcp:tools", "mcp:crm:read", "mcp:crm:write", "mcp:email:read", "mcp:email:send", "mcp:web:read"],
      }

      const response = authorizeSubagentRequest(mockRequest, auth as any, "sales-intel")

      expect(response).toBeNull()
    })

    it("returns forbidden response when scopes are missing", () => {
      const auth = {
        scopes: ["mcp:tools"],
      }

      const response = authorizeSubagentRequest(mockRequest, auth as any, "sales-intel")

      expect(response).toBeDefined()
      expect(response?.status).toBe(403)
    })
  })

  describe("authorizeSubagentToolCall()", () => {
    const mockRequest = new Request("http://example.com/test")

    it("returns forbidden when tool is not allowed", () => {
      const profile = getSubagentProfileById("sales-intel")!
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile,
        startTime: Date.now(),
        toolCallCount: 0,
        auth: null,
      }

      const response = authorizeSubagentToolCall(mockRequest, context, "youtube:search_videos")

      expect(response).toBeDefined()
      expect(response?.status).toBe(403)
    })

    it("returns rate limit when max tool calls exceeded", () => {
      const profile = getSubagentProfileById("sales-intel")!
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile,
        startTime: Date.now(),
        toolCallCount: profile.maxToolCallsPerRequest! + 1,
        auth: null,
      }

      const response = authorizeSubagentToolCall(mockRequest, context, "crm:read_contact")

      expect(response).toBeDefined()
      expect(response?.status).toBe(429)
    })

    it("returns null when tool is allowed and within limits", () => {
      const profile = getSubagentProfileById("sales-intel")!
      const context: SubagentExecutionContext = {
        subagentId: "sales-intel",
        profile,
        startTime: Date.now(),
        toolCallCount: 5,
        auth: null,
      }

      const response = authorizeSubagentToolCall(mockRequest, context, "crm:read_contact")

      expect(response).toBeNull()
    })
  })

  describe("getAccessibleToolsForSubagent()", () => {
    it("returns empty array when id is null", () => {
      const tools = getAccessibleToolsForSubagent(null, null)
      expect(tools).toEqual([])
    })

    it("returns empty array when auth is null", () => {
      const tools = getAccessibleToolsForSubagent("sales-intel", null)
      expect(tools).toEqual([])
    })

    it("filters tools based on auth scopes and allowed tools", () => {
      const auth = {
        scopes: ["mcp:crm:read", "mcp:email:send"],
      }

      const tools = getAccessibleToolsForSubagent("sales-intel", auth as any)

      // Should only include tools that have required scopes in auth
      expect(tools.length).toBeGreaterThan(0)
    })
  })

  describe("canAccessToolInSubagent()", () => {
    it("returns false when tool not allowed for subagent", () => {
      const auth = {
        scopes: ["mcp:youtube:read"],
      }

      const can = canAccessToolInSubagent("sales-intel", auth as any, "youtube:search_videos")

      expect(can).toBe(false)
    })

    it("returns false when auth is null", () => {
      const can = canAccessToolInSubagent("sales-intel", null, "crm:read_contact")

      expect(can).toBe(false)
    })

    it("returns true when tool is allowed and auth scopes present", () => {
      const auth = {
        scopes: ["mcp:crm:read"],
      }

      const can = canAccessToolInSubagent("sales-intel", auth as any, "crm:read_contact")

      expect(can).toBe(true)
    })

    it("returns false when auth missing required scopes for tool", () => {
      const auth = {
        scopes: ["mcp:tools"],
      }

      const can = canAccessToolInSubagent("sales-intel", auth as any, "crm:read_contact")

      expect(can).toBe(false)
    })
  })

  describe("resolveMcpSubagentIdFromRequest()", () => {
    it("resolves subagent from query parameter", () => {
      const request = new Request("http://example.com/test?subagent=sales-intel")
      const id = resolveMcpSubagentIdFromRequest(request)

      expect(id).toBe("sales-intel")
    })

    it("resolves agent from query parameter when subagent not present", () => {
      const request = new Request("http://example.com/test?agent=weekly-reporter")
      const id = resolveMcpSubagentIdFromRequest(request)

      expect(id).toBe("weekly-reporter")
    })

    it("returns null when neither query parameter is present", () => {
      const request = new Request("http://example.com/test")
      const id = resolveMcpSubagentIdFromRequest(request)

      expect(id).toBeNull()
    })

    it("returns null when query parameter references non-existent profile", () => {
      const request = new Request("http://example.com/test?subagent=non-existent")
      const id = resolveMcpSubagentIdFromRequest(request)

      expect(id).toBeNull()
    })

    it("handles case-insensitive parameter values", () => {
      const request = new Request("http://example.com/test?subagent=SALES-INTEL")
      const id = resolveMcpSubagentIdFromRequest(request)

      expect(id).toBe("sales-intel")
    })

    it("handles whitespace in parameter values", () => {
      const request = new Request("http://example.com/test?subagent=%20sales-intel%20")
      const id = resolveMcpSubagentIdFromRequest(request)

      expect(id).toBe("sales-intel")
    })
  })

  describe("integration scenarios", () => {
    it("end-to-end: register, authorize, and use custom subagent", () => {
      const customProfile: McpSubagentProfile = {
        id: "integration-test",
        name: "Integration Test",
        description: "For testing end-to-end flows",
        instructions: "Test instructions",
        allowedTools: ["test:read", "test:write"],
        requiredScopes: ["mcp:test:read", "mcp:test:write"],
        maxToolCallsPerRequest: 20,
        timeoutMs: 30000,
      }

      // Register
      registerSubagentProfile(customProfile)
      expect(getSubagentProfileById("integration-test")).toBeDefined()

      // Create execution context
      const auth = {
        scopes: ["mcp:test:read", "mcp:test:write"],
      }
      const context = createSubagentExecutionContext("integration-test", auth as any)
      expect(context).toBeDefined()
      expect(context?.toolCallCount).toBe(0)

      // Check tool authorization
      expect(isToolAllowedForSubagent("integration-test", "test:read")).toBe(true)
      expect(isToolAllowedForSubagent("integration-test", "test:write")).toBe(true)
      expect(isToolAllowedForSubagent("integration-test", "unauthorized:tool")).toBe(false)

      // Validate scopes
      const scopeValidation = validateSubagentScopes("integration-test", auth.scopes)
      expect(scopeValidation.valid).toBe(true)

      // Clean up
      unregisterSubagentProfile("integration-test")
      expect(getSubagentProfileById("integration-test")).toBeNull()
    })

    it("orchestrator can access any tool", () => {
      const toolNames = [
        "crm:read_contact",
        "email:send_message",
        "youtube:search_videos",
        "custom:unknown:tool",
        "literally:anything",
      ]

      for (const toolName of toolNames) {
        expect(isToolAllowedForSubagent("orchestrator", toolName)).toBe(true)
      }
    })

    it("supabase profile works with supabase tools from mock", () => {
      expect(isToolAllowedForSubagent("supabase", "supabase:read_table")).toBe(true)
      expect(isToolAllowedForSubagent("supabase", "supabase:write_row")).toBe(true)
    })
  })
})
