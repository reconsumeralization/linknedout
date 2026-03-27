import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  getChannels,
  type AgentMessage,
  type AgentMessageChannel,
  type AgentMessagePriority,
  type AgentMessageStatus,
  type AgentEventSubscription,
} from "@/lib/agents/agent-messaging"

// Mock the Supabase server client
vi.mock("@/lib/supabase/supabase-server", () => ({
  getSupabaseServerClient: vi.fn(),
}))

describe("agent messaging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getChannels()", () => {
    it("returns all predefined channels", () => {
      const channels = getChannels()
      expect(channels).toBeDefined()
      expect(Array.isArray(channels)).toBe(true)
      expect(channels.length).toBeGreaterThan(0)
    })

    it("returns channels with correct structure", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        expect(channel).toHaveProperty("topic")
        expect(channel).toHaveProperty("description")
        expect(channel).toHaveProperty("allowedPublishers")
        expect(channel).toHaveProperty("allowedSubscribers")
      })
    })

    it("ensures all channels have topic as non-empty string", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        expect(typeof channel.topic).toBe("string")
        expect(channel.topic.length).toBeGreaterThan(0)
      })
    })

    it("ensures all channels have description as non-empty string", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        expect(typeof channel.description).toBe("string")
        expect(channel.description.length).toBeGreaterThan(0)
      })
    })

    it("ensures allowedPublishers is either wildcard or array of strings", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        const publishers = channel.allowedPublishers
        if (typeof publishers === "string") {
          expect(publishers).toBe("*")
        } else {
          expect(Array.isArray(publishers)).toBe(true)
          expect(publishers.every((p) => typeof p === "string")).toBe(true)
        }
      })
    })

    it("ensures allowedSubscribers is either wildcard or array of strings", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        const subscribers = channel.allowedSubscribers
        if (typeof subscribers === "string") {
          expect(subscribers).toBe("*")
        } else {
          expect(Array.isArray(subscribers)).toBe(true)
          expect(subscribers.every((s) => typeof s === "string")).toBe(true)
        }
      })
    })

    it("returns consistent channels across multiple calls", () => {
      const first = getChannels()
      const second = getChannels()
      expect(first).toEqual(second)
    })
  })

  describe("channel topic names", () => {
    it("channel topics are well-formed with dot notation", () => {
      const channels = getChannels()
      const validTopicPattern = /^[a-z]+\.[a-z.]+$/
      channels.forEach((channel) => {
        expect(channel.topic).toMatch(validTopicPattern)
      })
    })

    it("covers agent.run.* topics", () => {
      const channels = getChannels()
      const runTopics = channels.filter((c) => c.topic.startsWith("agent.run."))
      expect(runTopics.length).toBeGreaterThan(0)
      expect(runTopics.some((c) => c.topic === "agent.run.started")).toBe(true)
      expect(runTopics.some((c) => c.topic === "agent.run.completed")).toBe(true)
      expect(runTopics.some((c) => c.topic === "agent.run.failed")).toBe(true)
    })

    it("covers agent.approval.* topics", () => {
      const channels = getChannels()
      const approvalTopics = channels.filter((c) => c.topic.startsWith("agent.approval."))
      expect(approvalTopics.length).toBeGreaterThan(0)
      expect(approvalTopics.some((c) => c.topic === "agent.approval.needed")).toBe(true)
      expect(approvalTopics.some((c) => c.topic === "agent.approval.resolved")).toBe(true)
    })

    it("covers orchestrator.* topics", () => {
      const channels = getChannels()
      const orchestratorTopics = channels.filter((c) => c.topic.startsWith("orchestrator."))
      expect(orchestratorTopics.length).toBeGreaterThan(0)
      expect(orchestratorTopics.some((c) => c.topic === "orchestrator.task.assign")).toBe(true)
      expect(orchestratorTopics.some((c) => c.topic === "orchestrator.task.complete")).toBe(true)
    })

    it("covers meta.* topics", () => {
      const channels = getChannels()
      const metaTopics = channels.filter((c) => c.topic.startsWith("meta."))
      expect(metaTopics.length).toBeGreaterThan(0)
      expect(metaTopics.some((c) => c.topic === "meta.optimization.proposed")).toBe(true)
      expect(metaTopics.some((c) => c.topic === "meta.optimization.applied")).toBe(true)
    })

    it("covers agent.skill.* topics", () => {
      const channels = getChannels()
      const skillTopics = channels.filter((c) => c.topic.startsWith("agent.skill."))
      expect(skillTopics.length).toBeGreaterThan(0)
      expect(skillTopics.some((c) => c.topic === "agent.skill.learned")).toBe(true)
    })

    it("covers agent.budget.* topics", () => {
      const channels = getChannels()
      const budgetTopics = channels.filter((c) => c.topic.startsWith("agent.budget."))
      expect(budgetTopics.length).toBeGreaterThan(0)
      expect(budgetTopics.some((c) => c.topic === "agent.budget.warning")).toBe(true)
    })

    it("ensures no duplicate topic names", () => {
      const channels = getChannels()
      const topics = channels.map((c) => c.topic)
      const uniqueTopics = new Set(topics)
      expect(uniqueTopics.size).toBe(topics.length)
    })
  })

  describe("AgentMessage interface", () => {
    it("has all required properties", () => {
      const message: AgentMessage = {
        id: "msg-123",
        fromAgentId: "agent-1",
        toAgentId: "agent-2",
        topic: "agent.run.started",
        payload: { data: "test" },
        priority: "normal",
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      expect(message.id).toBeDefined()
      expect(message.fromAgentId).toBeDefined()
      expect(message.toAgentId).toBeDefined()
      expect(message.topic).toBeDefined()
      expect(message.payload).toBeDefined()
      expect(message.priority).toBeDefined()
      expect(message.status).toBeDefined()
      expect(message.createdAt).toBeDefined()
    })

    it("allows optional properties", () => {
      const message: AgentMessage = {
        id: "msg-456",
        fromAgentId: "agent-1",
        toAgentId: null,
        topic: "orchestrator.task.assign",
        payload: {},
        priority: "high",
        status: "delivered",
        createdAt: new Date().toISOString(),
        correlationId: "corr-789",
        replyToMessageId: "msg-123",
        expiresAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
      }

      expect(message.correlationId).toBe("corr-789")
      expect(message.replyToMessageId).toBe("msg-123")
      expect(message.expiresAt).toBeDefined()
      expect(message.deliveredAt).toBeDefined()
      expect(message.acknowledgedAt).toBeDefined()
    })

    it("allows toAgentId to be null for broadcasts", () => {
      const message: AgentMessage = {
        id: "msg-789",
        fromAgentId: "agent-1",
        toAgentId: null,
        topic: "agent.run.completed",
        payload: { result: "success" },
        priority: "normal",
        status: "delivered",
        createdAt: new Date().toISOString(),
      }

      expect(message.toAgentId).toBeNull()
    })
  })

  describe("message priority types", () => {
    const validPriorities: AgentMessagePriority[] = ["low", "normal", "high", "critical"]

    it("defines all valid priority levels", () => {
      expect(validPriorities).toContain("low")
      expect(validPriorities).toContain("normal")
      expect(validPriorities).toContain("high")
      expect(validPriorities).toContain("critical")
    })

    it("messages can use any valid priority level", () => {
      validPriorities.forEach((priority) => {
        const message: AgentMessage = {
          id: "msg-123",
          fromAgentId: "agent-1",
          toAgentId: "agent-2",
          topic: "agent.run.started",
          payload: {},
          priority,
          status: "pending",
          createdAt: new Date().toISOString(),
        }
        expect(message.priority).toBe(priority)
      })
    })

    it("message payload can be empty object", () => {
      const message: AgentMessage = {
        id: "msg-empty",
        fromAgentId: "agent-1",
        toAgentId: "agent-2",
        topic: "agent.approval.needed",
        payload: {},
        priority: "normal",
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      expect(message.payload).toEqual({})
    })

    it("message payload supports complex data structures", () => {
      const message: AgentMessage = {
        id: "msg-complex",
        fromAgentId: "agent-1",
        toAgentId: "agent-2",
        topic: "orchestrator.task.assign",
        payload: {
          taskId: "task-123",
          taskName: "Process Report",
          metadata: {
            priority: "urgent",
            deadline: new Date().toISOString(),
            tags: ["report", "monthly", "financial"],
          },
          budget: 100.50,
          requiresApproval: true,
        },
        priority: "critical",
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      expect(message.payload.taskId).toBe("task-123")
      expect(message.payload.metadata).toBeDefined()
      expect((message.payload.metadata as any).tags).toContain("report")
      expect(message.payload.budget).toBe(100.5)
      expect(message.payload.requiresApproval).toBe(true)
    })
  })

  describe("message status types", () => {
    const validStatuses: AgentMessageStatus[] = [
      "pending",
      "delivered",
      "acknowledged",
      "failed",
      "expired",
    ]

    it("defines all valid status values", () => {
      expect(validStatuses).toContain("pending")
      expect(validStatuses).toContain("delivered")
      expect(validStatuses).toContain("acknowledged")
      expect(validStatuses).toContain("failed")
      expect(validStatuses).toContain("expired")
    })

    it("messages can use any valid status", () => {
      validStatuses.forEach((status) => {
        const message: AgentMessage = {
          id: "msg-123",
          fromAgentId: "agent-1",
          toAgentId: "agent-2",
          topic: "agent.run.started",
          payload: {},
          priority: "normal",
          status,
          createdAt: new Date().toISOString(),
        }
        expect(message.status).toBe(status)
      })
    })
  })

  describe("AgentEventSubscription interface", () => {
    it("has all required properties", () => {
      const subscription: AgentEventSubscription = {
        id: "sub-123",
        agentId: "agent-1",
        topic: "agent.run.completed",
        createdAt: new Date().toISOString(),
      }

      expect(subscription.id).toBeDefined()
      expect(subscription.agentId).toBeDefined()
      expect(subscription.topic).toBeDefined()
      expect(subscription.createdAt).toBeDefined()
    })

    it("allows optional filter property", () => {
      const subscription: AgentEventSubscription = {
        id: "sub-456",
        agentId: "agent-2",
        topic: "agent.run.completed",
        filter: {
          status: "success",
          agentType: "analyzer",
        },
        createdAt: new Date().toISOString(),
      }

      expect(subscription.filter).toBeDefined()
      expect((subscription.filter as any).status).toBe("success")
    })
  })

  describe("AgentMessageChannel interface", () => {
    it("has all required properties", () => {
      const channel: AgentMessageChannel = {
        topic: "agent.run.started",
        description: "Emitted when an agent starts execution",
        allowedPublishers: "*",
        allowedSubscribers: "*",
      }

      expect(channel.topic).toBeDefined()
      expect(channel.description).toBeDefined()
      expect(channel.allowedPublishers).toBeDefined()
      expect(channel.allowedSubscribers).toBeDefined()
    })

    it("supports wildcard access control", () => {
      const channel: AgentMessageChannel = {
        topic: "test.topic",
        description: "Test topic",
        allowedPublishers: "*",
        allowedSubscribers: "*",
      }

      expect(channel.allowedPublishers).toBe("*")
      expect(channel.allowedSubscribers).toBe("*")
    })

    it("supports array-based access control", () => {
      const channel: AgentMessageChannel = {
        topic: "restricted.topic",
        description: "Restricted topic",
        allowedPublishers: ["agent-admin", "agent-orchestrator"],
        allowedSubscribers: ["agent-monitor", "agent-logger"],
      }

      expect(Array.isArray(channel.allowedPublishers)).toBe(true)
      expect(Array.isArray(channel.allowedSubscribers)).toBe(true)
      expect((channel.allowedPublishers as string[]).length).toBe(2)
      expect((channel.allowedSubscribers as string[]).length).toBe(2)
    })
  })

  describe("predefined channels coverage", () => {
    it("includes at least one agent.run.* channel", () => {
      const channels = getChannels()
      const hasRunChannel = channels.some((c) => c.topic.startsWith("agent.run."))
      expect(hasRunChannel).toBe(true)
    })

    it("includes at least one agent.approval.* channel", () => {
      const channels = getChannels()
      const hasApprovalChannel = channels.some((c) => c.topic.startsWith("agent.approval."))
      expect(hasApprovalChannel).toBe(true)
    })

    it("includes at least one orchestrator.* channel", () => {
      const channels = getChannels()
      const hasOrchestratorChannel = channels.some((c) => c.topic.startsWith("orchestrator."))
      expect(hasOrchestratorChannel).toBe(true)
    })

    it("includes at least one meta.* channel", () => {
      const channels = getChannels()
      const hasMetaChannel = channels.some((c) => c.topic.startsWith("meta."))
      expect(hasMetaChannel).toBe(true)
    })

    it("all channels have open access control (wildcard)", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        const pubOpenOrArray =
          channel.allowedPublishers === "*" || Array.isArray(channel.allowedPublishers)
        const subOpenOrArray =
          channel.allowedSubscribers === "*" || Array.isArray(channel.allowedSubscribers)
        expect(pubOpenOrArray).toBe(true)
        expect(subOpenOrArray).toBe(true)
      })
    })

    it("all predefined channels allow broad access", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        // In the current implementation, all predefined channels use "*"
        expect(channel.allowedPublishers).toBe("*")
        expect(channel.allowedSubscribers).toBe("*")
      })
    })

    it("channels follow naming convention for namespace.event.action", () => {
      const channels = getChannels()
      const expectedPattern = /^[a-z]+\.[a-z]+(\.[a-z]+)?$/
      channels.forEach((channel) => {
        expect(channel.topic).toMatch(expectedPattern)
      })
    })

    it("channel descriptions are meaningful", () => {
      const channels = getChannels()
      channels.forEach((channel) => {
        expect(channel.description.length).toBeGreaterThan(5)
        expect(channel.description[0]).toMatch(/[A-Z]/) // Starts with capital letter
      })
    })
  })

  describe("message construction validation", () => {
    it("creates valid agent-to-agent message", () => {
      const message: AgentMessage = {
        id: "msg-atoa",
        fromAgentId: "analyzer-agent",
        toAgentId: "report-agent",
        topic: "agent.run.completed",
        payload: { status: "success", dataProcessed: 1000 },
        priority: "normal",
        status: "pending",
        createdAt: new Date().toISOString(),
      }

      expect(message.fromAgentId).toBe("analyzer-agent")
      expect(message.toAgentId).toBe("report-agent")
      expect(message.fromAgentId).not.toEqual(message.toAgentId)
    })

    it("creates valid broadcast message", () => {
      const message: AgentMessage = {
        id: "msg-broadcast",
        fromAgentId: "system-agent",
        toAgentId: null,
        topic: "meta.optimization.proposed",
        payload: { optimizationId: "opt-123" },
        priority: "high",
        status: "delivered",
        createdAt: new Date().toISOString(),
      }

      expect(message.toAgentId).toBeNull()
      expect(message.priority).toBe("high")
    })

    it("supports request/reply pattern with correlationId", () => {
      const requestId = "req-123"
      const request: AgentMessage = {
        id: requestId,
        fromAgentId: "requester-agent",
        toAgentId: "responder-agent",
        topic: "agent.approval.needed",
        payload: { action: "deleteFile", filePath: "/tmp/test.txt" },
        priority: "high",
        status: "delivered",
        createdAt: new Date().toISOString(),
        correlationId: "corr-456",
      }

      const reply: AgentMessage = {
        id: "reply-789",
        fromAgentId: "responder-agent",
        toAgentId: "requester-agent",
        topic: "agent.approval.resolved",
        payload: { approved: true },
        priority: "high",
        status: "delivered",
        createdAt: new Date(Date.now() + 1000).toISOString(),
        correlationId: "corr-456",
        replyToMessageId: requestId,
      }

      expect(request.correlationId).toBe(reply.correlationId)
      expect(reply.replyToMessageId).toBe(request.id)
      expect(request.fromAgentId).toBe(reply.toAgentId)
      expect(request.toAgentId).toBe(reply.fromAgentId)
    })

    it("supports message expiration", () => {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 300000) // 5 minutes

      const message: AgentMessage = {
        id: "msg-ttl",
        fromAgentId: "agent-1",
        toAgentId: "agent-2",
        topic: "agent.approval.needed",
        payload: { action: "approve" },
        priority: "critical",
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }

      expect(message.expiresAt).toBeDefined()
      const expireTime = new Date(message.expiresAt!)
      expect(expireTime.getTime()).toBeGreaterThan(now.getTime())
    })

    it("timestamps are ISO 8601 formatted", () => {
      const now = new Date()
      const isoString = now.toISOString()

      const message: AgentMessage = {
        id: "msg-iso",
        fromAgentId: "agent-1",
        toAgentId: "agent-2",
        topic: "agent.run.started",
        payload: {},
        priority: "normal",
        status: "pending",
        createdAt: isoString,
        deliveredAt: isoString,
        acknowledgedAt: isoString,
      }

      // ISO 8601 format check
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/
      expect(message.createdAt).toMatch(iso8601Regex)
      expect(message.deliveredAt).toMatch(iso8601Regex)
      expect(message.acknowledgedAt).toMatch(iso8601Regex)
    })
  })
})
