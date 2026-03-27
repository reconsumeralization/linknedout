import "server-only"

import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"

/**
 * Agent Message Priority Levels
 * - low: Non-urgent messages
 * - normal: Standard priority
 * - high: Time-sensitive
 * - critical: Requires immediate attention
 */
export type AgentMessagePriority = "low" | "normal" | "high" | "critical"

/**
 * Agent Message Delivery Status
 * - pending: Message created, not yet delivered
 * - delivered: Successfully sent to recipient(s)
 * - acknowledged: Recipient confirmed receipt
 * - failed: Delivery failed
 * - expired: TTL exceeded before delivery
 */
export type AgentMessageStatus = "pending" | "delivered" | "acknowledged" | "failed" | "expired"

/**
 * Represents a message sent between agents or published to a topic
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string
  /** ID of the sending agent */
  fromAgentId: string
  /** ID of the receiving agent (null for broadcasts) */
  toAgentId: string | null
  /** Topic/channel the message is published to */
  topic: string
  /** Message payload data */
  payload: Record<string, unknown>
  /** Priority level for processing */
  priority: AgentMessagePriority
  /** Current delivery status */
  status: AgentMessageStatus
  /** For correlating request/reply patterns */
  correlationId?: string
  /** For reply patterns, ID of the message being replied to */
  replyToMessageId?: string
  /** ISO 8601 timestamp when message expires */
  expiresAt?: string
  /** ISO 8601 timestamp when created */
  createdAt: string
  /** ISO 8601 timestamp when delivered */
  deliveredAt?: string
  /** ISO 8601 timestamp when acknowledged */
  acknowledgedAt?: string
}

/**
 * Represents an agent's subscription to a topic
 */
export interface AgentEventSubscription {
  /** Unique subscription identifier */
  id: string
  /** ID of the subscribing agent */
  agentId: string
  /** Topic being subscribed to */
  topic: string
  /** Optional filter conditions for messages */
  filter?: Record<string, unknown>
  /** ISO 8601 timestamp when subscription created */
  createdAt: string
}

/**
 * Defines allowed publishers and subscribers for a topic
 */
export interface AgentMessageChannel {
  /** Topic identifier */
  topic: string
  /** Human-readable description */
  description: string
  /** Agent IDs allowed to publish, or "*" for all */
  allowedPublishers: string[] | "*"
  /** Agent IDs allowed to subscribe, or "*" for all */
  allowedSubscribers: string[] | "*"
}

// Table names from environment with defaults
const MESSAGES_TABLE = process.env.SUPABASE_AGENT_MESSAGES_TABLE || "agent_messages"
const SUBSCRIPTIONS_TABLE = process.env.SUPABASE_AGENT_SUBSCRIPTIONS_TABLE || "agent_event_subscriptions"

// Predefined agent messaging channels
const PREDEFINED_CHANNELS: AgentMessageChannel[] = [
  {
    topic: "agent.run.started",
    description: "Emitted when an agent starts execution",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "agent.run.completed",
    description: "Emitted when an agent completes execution successfully",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "agent.run.failed",
    description: "Emitted when an agent execution fails",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "agent.approval.needed",
    description: "Agent requests approval for an action",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "agent.approval.resolved",
    description: "Approval decision for pending request",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "agent.skill.learned",
    description: "Agent has learned a new skill or capability",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "agent.budget.warning",
    description: "Agent budget threshold exceeded",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "orchestrator.task.assign",
    description: "Orchestrator assigns a task to an agent",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "orchestrator.task.complete",
    description: "Agent reports task completion to orchestrator",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "meta.optimization.proposed",
    description: "Meta-agent proposes system optimization",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
  {
    topic: "meta.optimization.applied",
    description: "System optimization has been applied",
    allowedPublishers: "*",
    allowedSubscribers: "*",
  },
]

/**
 * Get all predefined message channels
 * @returns Array of predefined channels
 */
export function getChannels(): AgentMessageChannel[] {
  return PREDEFINED_CHANNELS
}

/**
 * Publish a message to agents or a topic
 * Persists message to Supabase and marks as delivered
 *
 * @param message - The message to publish
 * @returns The published message with ID and timestamp
 * @throws Error if publishing fails
 */
export async function publishAgentMessage(
  message: Omit<AgentMessage, "id" | "status" | "createdAt" | "deliveredAt">
): Promise<AgentMessage> {
  const supabase = getSupabaseServerClient()
  if (!supabase) throw new Error("Supabase not configured")

  const now = new Date().toISOString()
  const messageId = crypto.randomUUID()

  const publishedMessage: AgentMessage = {
    id: messageId,
    fromAgentId: message.fromAgentId,
    toAgentId: message.toAgentId,
    topic: message.topic,
    payload: message.payload,
    priority: message.priority,
    status: "delivered",
    correlationId: message.correlationId,
    replyToMessageId: message.replyToMessageId,
    expiresAt: message.expiresAt,
    createdAt: now,
    deliveredAt: now,
    acknowledgedAt: message.acknowledgedAt,
  }

  const { error } = await supabase.from(MESSAGES_TABLE).insert({
    id: publishedMessage.id,
    from_agent_id: publishedMessage.fromAgentId,
    to_agent_id: publishedMessage.toAgentId,
    topic: publishedMessage.topic,
    payload: publishedMessage.payload,
    priority: publishedMessage.priority,
    status: publishedMessage.status,
    correlation_id: publishedMessage.correlationId,
    reply_to_message_id: publishedMessage.replyToMessageId,
    expires_at: publishedMessage.expiresAt,
    created_at: publishedMessage.createdAt,
    delivered_at: publishedMessage.deliveredAt,
    acknowledged_at: publishedMessage.acknowledgedAt,
  })

  if (error) {
    throw new Error(`Failed to publish message: ${error.message}`)
  }

  return publishedMessage
}

/**
 * Subscribe an agent to a topic
 * Returns a subscription ID that can be used to unsubscribe later
 *
 * @param agentId - ID of the subscribing agent
 * @param topic - Topic to subscribe to
 * @param filter - Optional filter conditions for message payload
 * @returns The created subscription
 * @throws Error if subscription fails
 */
export async function subscribeToTopic(
  agentId: string,
  topic: string,
  filter?: Record<string, unknown>
): Promise<AgentEventSubscription> {
  const supabase = getSupabaseServerClient()
  if (!supabase) throw new Error("Supabase not configured")

  const subscriptionId = crypto.randomUUID()
  const now = new Date().toISOString()

  const subscription: AgentEventSubscription = {
    id: subscriptionId,
    agentId,
    topic,
    filter,
    createdAt: now,
  }

  const { error } = await supabase.from(SUBSCRIPTIONS_TABLE).insert({
    id: subscription.id,
    agent_id: subscription.agentId,
    topic: subscription.topic,
    filter: subscription.filter,
    created_at: subscription.createdAt,
  })

  if (error) {
    throw new Error(`Failed to subscribe to topic: ${error.message}`)
  }

  return subscription
}

/**
 * Unsubscribe an agent from a topic
 *
 * @param subscriptionId - ID of the subscription to remove
 * @throws Error if unsubscription fails
 */
export async function unsubscribeFromTopic(subscriptionId: string): Promise<void> {
  const supabase = getSupabaseServerClient()
  if (!supabase) throw new Error("Supabase not configured")

  const { error } = await supabase.from(SUBSCRIPTIONS_TABLE).delete().eq("id", subscriptionId)

  if (error) {
    throw new Error(`Failed to unsubscribe from topic: ${error.message}`)
  }
}

/**
 * Options for fetching messages
 */
export interface GetMessagesOptions {
  /** Filter by topic */
  topic?: string
  /** Filter by minimum priority (inclusive) */
  minPriority?: AgentMessagePriority
  /** Filter by status */
  status?: AgentMessageStatus
  /** Only include unexpired messages */
  excludeExpired?: boolean
  /** Maximum number of messages to return */
  limit?: number
  /** Number of messages to skip */
  offset?: number
}

/**
 * Get messages for an agent
 * Fetches messages sent to the agent or broadcast to subscribed topics
 *
 * @param agentId - ID of the agent
 * @param options - Query options
 * @returns Array of matching messages
 * @throws Error if query fails
 */
export async function getMessagesForAgent(
  agentId: string,
  options: GetMessagesOptions = {}
): Promise<AgentMessage[]> {
  const supabase = getSupabaseServerClient()
  if (!supabase) throw new Error("Supabase not configured")
  const now = new Date().toISOString()

  let query = supabase
    .from(MESSAGES_TABLE)
    .select("*")
    .or(`to_agent_id.eq.${agentId},to_agent_id.is.null`)

  // Filter by topic if specified
  if (options.topic) {
    query = query.eq("topic", options.topic)
  }

  // Filter by status if specified
  if (options.status) {
    query = query.eq("status", options.status)
  }

  // Exclude expired messages
  if (options.excludeExpired !== false) {
    query = query.or(`expires_at.is.null,expires_at.gt.${now}`)
  }

  // Apply priority filtering if specified
  const priorityOrder: Record<AgentMessagePriority, number> = {
    low: 1,
    normal: 2,
    high: 3,
    critical: 4,
  }

  // Set limit and offset
  if (options.limit !== undefined) {
    query = query.limit(options.limit)
  }
  if (options.offset !== undefined) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1)
  }

  // Order by priority and timestamp
  query = query.order("priority", { ascending: false }).order("created_at", { ascending: false })

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`)
  }

  // Filter by minimum priority if specified
  let messages = (data || []).map(dbRowToAgentMessage)
  if (options.minPriority) {
    const minLevel = priorityOrder[options.minPriority]
    messages = messages.filter((m) => priorityOrder[m.priority] >= minLevel)
  }

  return messages
}

/**
 * Acknowledge receipt of a message
 * Updates message status to acknowledged with current timestamp
 *
 * @param messageId - ID of the message to acknowledge
 * @returns The acknowledged message
 * @throws Error if acknowledgement fails
 */
export async function acknowledgeMessage(messageId: string): Promise<AgentMessage> {
  const supabase = getSupabaseServerClient()
  if (!supabase) throw new Error("Supabase not configured")
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .update({
      status: "acknowledged",
      acknowledged_at: now,
    })
    .eq("id", messageId)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to acknowledge message: ${error.message}`)
  }

  return dbRowToAgentMessage(data)
}

/**
 * Request/reply pattern for agent-to-agent communication
 * Sends a request and waits for a reply with matching correlationId
 *
 * @param fromAgentId - ID of the requesting agent
 * @param toAgentId - ID of the target agent
 * @param topic - Topic for the request
 * @param payload - Request payload
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The reply message
 * @throws Error if request fails or times out
 */
export async function requestFromAgent(
  fromAgentId: string,
  toAgentId: string,
  topic: string,
  payload: Record<string, unknown>,
  timeoutMs: number = 30000
): Promise<AgentMessage> {
  const correlationId = crypto.randomUUID()

  // Send the request
  const requestMessage = await publishAgentMessage({
    fromAgentId,
    toAgentId,
    topic,
    payload,
    priority: "high",
    correlationId,
  })

  // Wait for a reply with matching correlationId
  const startTime = Date.now()
  const pollIntervalMs = 500
  const maxAttempts = Math.ceil(timeoutMs / pollIntervalMs)
  let attempts = 0

  while (attempts < maxAttempts) {
    const replies = await getMessagesForAgent(fromAgentId, {
      topic,
      limit: 10,
    })

    const reply = replies.find(
      (msg) =>
        msg.correlationId === correlationId &&
        msg.replyToMessageId === requestMessage.id &&
        msg.fromAgentId === toAgentId
    )

    if (reply) {
      return reply
    }

    // Check if we've exceeded timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `Request/reply timeout: No reply received from agent ${toAgentId} within ${timeoutMs}ms`
      )
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    attempts++
  }

  throw new Error(
    `Request/reply timeout: No reply received from agent ${toAgentId} within ${timeoutMs}ms`
  )
}

/**
 * Get all subscriptions for an agent
 *
 * @param agentId - ID of the agent
 * @returns Array of the agent's subscriptions
 * @throws Error if query fails
 */
export async function getSubscriptionsForAgent(agentId: string): Promise<AgentEventSubscription[]> {
  const supabase = getSupabaseServerClient()
  if (!supabase) throw new Error("Supabase not configured")

  const { data, error } = await supabase
    .from(SUBSCRIPTIONS_TABLE)
    .select("*")
    .eq("agent_id", agentId)

  if (error) {
    throw new Error(`Failed to fetch subscriptions: ${error.message}`)
  }

  return (data || []).map(dbRowToAgentEventSubscription)
}

/**
 * Helper: Convert database row to AgentMessage
 */
function dbRowToAgentMessage(row: Record<string, unknown>): AgentMessage {
  return {
    id: row.id as string,
    fromAgentId: row.from_agent_id as string,
    toAgentId: (row.to_agent_id as string | null) || null,
    topic: row.topic as string,
    payload: (row.payload as Record<string, unknown>) || {},
    priority: (row.priority as AgentMessagePriority) || "normal",
    status: (row.status as AgentMessageStatus) || "pending",
    correlationId: (row.correlation_id as string | undefined) || undefined,
    replyToMessageId: (row.reply_to_message_id as string | undefined) || undefined,
    expiresAt: (row.expires_at as string | undefined) || undefined,
    createdAt: row.created_at as string,
    deliveredAt: (row.delivered_at as string | undefined) || undefined,
    acknowledgedAt: (row.acknowledged_at as string | undefined) || undefined,
  }
}

/**
 * Helper: Convert database row to AgentEventSubscription
 */
function dbRowToAgentEventSubscription(row: Record<string, unknown>): AgentEventSubscription {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    topic: row.topic as string,
    filter: (row.filter as Record<string, unknown> | undefined) || undefined,
    createdAt: row.created_at as string,
  }
}
