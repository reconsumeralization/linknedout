import { describe, expect, it } from "vitest"
import {
  getAllPlatformAgents,
  getPlatformAgentById,
  getAgentDependencyGraph,
  getTopologicalExecutionOrder,
  validatePlatformAgentConfiguration,
} from "@/lib/agents/agent-definitions-registry"

describe("agent definitions registry", () => {
  it("getAllPlatformAgents() returns exactly 6 agents", () => {
    const agents = getAllPlatformAgents()
    expect(agents).toHaveLength(6)
  })

  it("each agent has valid AgentDefinitionRecord with all required fields", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      // Check PlatformAgentDefinition structure
      expect(agent).toHaveProperty("id")
      expect(agent).toHaveProperty("definition")
      expect(agent).toHaveProperty("subagentProfileId")
      expect(agent).toHaveProperty("messagingConfig")
      expect(agent).toHaveProperty("autoStart")
      expect(agent).toHaveProperty("dependsOn")

      // Check definition structure
      const def = agent.definition
      expect(def).toHaveProperty("name")
      expect(def).toHaveProperty("version")
      expect(def).toHaveProperty("description")
      expect(def).toHaveProperty("capabilities")
      expect(def).toHaveProperty("maxTokensPerRun")
      expect(def).toHaveProperty("timeout")
      expect(def).toHaveProperty("retryPolicy")
      expect(def).toHaveProperty("soul")

      // Validate field types
      expect(typeof agent.id).toBe("string")
      expect(typeof agent.subagentProfileId).toBe("string")
      expect(typeof agent.autoStart).toBe("boolean")
      expect(Array.isArray(agent.dependsOn)).toBe(true)

      expect(typeof def.name).toBe("string")
      expect(typeof def.version).toBe("string")
      expect(typeof def.description).toBe("string")
      expect(Array.isArray(def.capabilities)).toBe(true)
      expect(typeof def.maxTokensPerRun).toBe("number")
      expect(typeof def.timeout).toBe("number")
      expect(def.retryPolicy).toHaveProperty("maxRetries")
      expect(def.retryPolicy).toHaveProperty("backoffMultiplier")
      expect(def.retryPolicy).toHaveProperty("initialDelayMs")
    }
  })

  it("each agent's soul field is at least 200 characters", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      expect(agent.definition.soul.length).toBeGreaterThanOrEqual(200)
    }
  })

  it("getPlatformAgentById() returns correct agent or null", () => {
    const orchestrator = getPlatformAgentById("runtime-orchestrator")
    expect(orchestrator).not.toBeNull()
    expect(orchestrator?.id).toBe("runtime-orchestrator")
    expect(orchestrator?.definition.name).toBe("runtime-orchestrator")

    const salesIntel = getPlatformAgentById("sales-intelligence")
    expect(salesIntel).not.toBeNull()
    expect(salesIntel?.id).toBe("sales-intelligence")

    const contentClipper = getPlatformAgentById("content-clipper")
    expect(contentClipper).not.toBeNull()
    expect(contentClipper?.id).toBe("content-clipper")

    const unknown = getPlatformAgentById("non-existent-agent")
    expect(unknown).toBeNull()
  })

  it("getAgentDependencyGraph() returns a valid Map", () => {
    const graph = getAgentDependencyGraph()

    expect(graph instanceof Map).toBe(true)
    expect(graph.size).toBeGreaterThan(0)

    // Verify all agents are in the graph
    const agents = getAllPlatformAgents()
    for (const agent of agents) {
      expect(graph.has(agent.id)).toBe(true)
      expect(Array.isArray(graph.get(agent.id))).toBe(true)
    }
  })

  it("getTopologicalExecutionOrder() returns all agent IDs", () => {
    const executionOrder = getTopologicalExecutionOrder()
    const agents = getAllPlatformAgents()

    expect(executionOrder).toHaveLength(agents.length)

    // All agent IDs should be in the execution order
    const agentIds = new Set(agents.map((a) => a.id))
    for (const id of executionOrder) {
      expect(agentIds.has(id)).toBe(true)
    }
  })

  it("getTopologicalExecutionOrder() puts runtime-orchestrator first (no dependencies)", () => {
    const executionOrder = getTopologicalExecutionOrder()

    expect(executionOrder[0]).toBe("runtime-orchestrator")
  })

  it("no circular dependencies exist", () => {
    // If getTopologicalExecutionOrder() completes without throwing, there are no cycles
    const executionOrder = getTopologicalExecutionOrder()
    expect(executionOrder.length).toBeGreaterThan(0)
  })

  it("all subagentProfileId values are valid known profiles", () => {
    const agents = getAllPlatformAgents()
    const validProfiles = new Set([
      "orchestrator",
      "sales-intel",
      "weekly-reporter",
      "content-clipper",
      "meta-reasoner",
    ])

    for (const agent of agents) {
      expect(validProfiles.has(agent.subagentProfileId)).toBe(true)
    }
  })

  it("all messaging topics are well-formed (dot-separated)", () => {
    const agents = getAllPlatformAgents()
    const topicRegex = /^[a-z]+(\.[a-z]+)*$/

    for (const agent of agents) {
      const { publishTopics, subscribeTopics } = agent.messagingConfig

      for (const topic of publishTopics) {
        expect(topicRegex.test(topic)).toBe(true)
      }

      for (const topic of subscribeTopics) {
        expect(topicRegex.test(topic)).toBe(true)
      }
    }
  })

  it("validates platform agent configuration with no errors", () => {
    const validation = validatePlatformAgentConfiguration()

    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })

  it("dependency graph respects agent dependencies", () => {
    const graph = getAgentDependencyGraph()
    const executionOrder = getTopologicalExecutionOrder()
    const orderIndex = new Map<string, number>(
      executionOrder.map((id, index) => [id, index])
    )

    // For each agent, verify all dependencies come before it in execution order
    for (const agentId of graph.keys()) {
      const deps = graph.get(agentId) || []
      const agentIndex = orderIndex.get(agentId) || 0

      for (const dep of deps) {
        const depIndex = orderIndex.get(dep) || 0
        expect(depIndex).toBeLessThan(agentIndex)
      }
    }
  })

  it("all agents have non-empty capabilities", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      expect(agent.definition.capabilities.length).toBeGreaterThan(0)
    }
  })

  it("all agents have messaging configuration", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      const config = agent.messagingConfig
      expect(Array.isArray(config.publishTopics)).toBe(true)
      expect(Array.isArray(config.subscribeTopics)).toBe(true)
    }
  })

  it("retry policies have valid values", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      const policy = agent.definition.retryPolicy
      expect(policy.maxRetries).toBeGreaterThanOrEqual(0)
      expect(policy.backoffMultiplier).toBeGreaterThan(0)
      expect(policy.initialDelayMs).toBeGreaterThan(0)
    }
  })

  it("timeout values are reasonable", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      // Timeout should be at least 30 seconds and less than 1 hour
      expect(agent.definition.timeout).toBeGreaterThanOrEqual(30)
      expect(agent.definition.timeout).toBeLessThanOrEqual(3600)
    }
  })

  it("maxTokensPerRun values are reasonable", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      // Token budget should be reasonable (1000-10000 tokens)
      expect(agent.definition.maxTokensPerRun).toBeGreaterThanOrEqual(1000)
      expect(agent.definition.maxTokensPerRun).toBeLessThanOrEqual(10000)
    }
  })

  it("security-sentinel agent has comprehensive subscriptions", () => {
    const sentinel = getPlatformAgentById("security-sentinel")
    expect(sentinel).not.toBeNull()

    // Security Sentinel should subscribe to many topics
    const subscribeTopics = sentinel!.messagingConfig.subscribeTopics
    expect(subscribeTopics.length).toBeGreaterThan(10)
  })

  it("runtime-orchestrator has no dependencies", () => {
    const orchestrator = getPlatformAgentById("runtime-orchestrator")
    expect(orchestrator?.dependsOn).toHaveLength(0)
  })

  it("all non-orchestrator agents depend on runtime-orchestrator", () => {
    const agents = getAllPlatformAgents()

    for (const agent of agents) {
      if (agent.id !== "runtime-orchestrator") {
        expect(agent.dependsOn).toContain("runtime-orchestrator")
      }
    }
  })

  it("meta-reasoner subscribes to agent completion events", () => {
    const metaReasoner = getPlatformAgentById("meta-reasoner")
    expect(metaReasoner).not.toBeNull()

    const subscribeTopics = metaReasoner!.messagingConfig.subscribeTopics
    expect(subscribeTopics).toContain("agent.run.completed")
    expect(subscribeTopics).toContain("agent.run.failed")
  })
})
