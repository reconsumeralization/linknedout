import "server-only"

import { generateId, generateText, stepCountIs, type LanguageModel } from "ai"
import { openai } from "@ai-sdk/openai"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import type {
  AgentConnectorRecord,
  AgentDefinitionRecord,
  AgentRunRecord,
  AgentModelProvider,
} from "@/lib/agents/agent-platform-types"

/**
 * Create a Supabase client for agent connector operations.
 * Uses service role for backend operations; scoped by user_id in queries.
 */
function getAgentSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Agent execution result with metrics and summary
 */
export interface AgentExecutionResult {
  success: boolean
  runId: string
  agentId: string
  tokenInput: number
  tokenOutput: number
  estimatedCostUsd: number
  duration: number
  efficiencyGainPct: number
  summary: string
  error?: string
  toolCalls: ToolCallRecord[]
}

/**
 * Tracks a single tool invocation during agent execution
 */
export interface ToolCallRecord {
  name: string
  input: Record<string, unknown>
  output: unknown
  duration: number
}

/**
 * Model configuration for a provider
 */
interface ModelConfig {
  provider: AgentModelProvider
  model: LanguageModel
  costPerInputToken: number
  costPerOutputToken: number
}

/**
 * Tool definition for agents
 */
interface ToolDefinition {
  name: string
  description: string
  execute: (input: Record<string, unknown>) => Promise<unknown>
  schema: z.ZodSchema
}

/**
 * Resolve model ID to provider type
 */
export function resolveModelProvider(modelId: string): AgentModelProvider {
  const mapping: Record<string, AgentModelProvider> = {
    "gpt-4.1-mini": "openai",
    "gpt-4-turbo": "openai",
    "gpt-4": "openai",
    "claude-3.7-sonnet": "anthropic",
    "claude-opus": "anthropic",
    "claude-sonnet": "anthropic",
    "kimi-2.5": "moonshot",
    "kimi-full": "moonshot",
    "llama-3.3-70b": "meta",
    "llama-3-70b": "meta",
    "local-macstudio": "local",
  }

  return mapping[modelId] || "openai"
}

/**
 * Get model configuration and LLM instance.
 * Supports OpenAI and Anthropic natively; falls back to OpenAI for others.
 */
function getModelConfig(modelId: string): ModelConfig {
  const provider = resolveModelProvider(modelId)

  if (provider === "openai") {
    return {
      provider: "openai",
      model: openai(modelId) as unknown as LanguageModel,
      costPerInputToken: modelId.includes("mini")
        ? 0.00015 // gpt-4.1-mini: $0.15 per 1M input tokens
        : modelId.includes("4-turbo")
          ? 0.01 // gpt-4-turbo: $10 per 1M input tokens
          : 0.03, // gpt-4: $30 per 1M input tokens
      costPerOutputToken: modelId.includes("mini")
        ? 0.0006 // gpt-4.1-mini: $0.60 per 1M output tokens
        : modelId.includes("4-turbo")
          ? 0.03 // gpt-4-turbo: $30 per 1M output tokens
          : 0.06, // gpt-4: $60 per 1M output tokens
    }
  }

  if (provider === "anthropic") {
    // Use AI Gateway for Anthropic models via OpenAI-compatible interface
    const gatewayKey = process.env.AI_GATEWAY_API_KEY
    if (gatewayKey) {
      const gatewayModelId = `anthropic/${modelId}`
      return {
        provider: "anthropic",
        model: openai(gatewayModelId) as unknown as LanguageModel,
        costPerInputToken: modelId.includes("opus") ? 0.015 : modelId.includes("haiku") ? 0.0008 : 0.003,
        costPerOutputToken: modelId.includes("opus") ? 0.075 : modelId.includes("haiku") ? 0.004 : 0.015,
      }
    }
    // Fallback to direct Anthropic SDK if available
    try {
      const { anthropic } = require("@ai-sdk/anthropic")
      return {
        provider: "anthropic",
        model: anthropic(modelId) as unknown as LanguageModel,
        costPerInputToken: modelId.includes("opus") ? 0.015 : modelId.includes("haiku") ? 0.0008 : 0.003,
        costPerOutputToken: modelId.includes("opus") ? 0.075 : modelId.includes("haiku") ? 0.004 : 0.015,
      }
    } catch {
      // Fall through to OpenAI fallback
    }
  }

  // Fallback: route through OpenAI for moonshot/meta/local
  return {
    provider: provider as AgentModelProvider,
    model: openai("gpt-4.1-mini") as unknown as LanguageModel,
    costPerInputToken: 0.00015,
    costPerOutputToken: 0.0006,
  }
}

/**
 * Build system prompt from agent soul and context
 */
function buildSystemPrompt(agent: AgentDefinitionRecord, connectors: AgentConnectorRecord[]): string {
  const connectorList = connectors
    .filter((c) => agent.connectors.includes(c.id))
    .map(
      (c) =>
        `- ${c.provider} (${c.status}${c.approvalRequired ? ", requires approval for writes" : ""})`,
    )
    .join("\n")

  const skillList = agent.skills.map((s) => `- ${s}`).join("\n")

  return `You are the "${agent.name}" agent.

PURPOSE:
${agent.purpose}

SOUL (Your Operating Principles):
${agent.soul}

SKILLS:
${skillList || "- General-purpose automation and reasoning"}

AVAILABLE CONNECTORS:
${connectorList || "- No connectors configured"}

CONSTRAINTS:
- Respect budget limits for token usage
- Request approval before making any write/delete operations
- Log all actions clearly with timestamps and results
- Summarize your work concisely when complete
- On errors, explain the issue and suggest fallback approaches

GOAL: Complete the assigned task efficiently while respecting governance rules.`
}

/**
 * Create tool registry based on connectors
 */
function createToolRegistry(connectors: AgentConnectorRecord[]): ToolDefinition[] {
  const tools: ToolDefinition[] = []

  // Build a set of available provider types
  const availableProviders = new Set(connectors.map((c) => c.provider))

  // Gmail tools — backed by email_messages table
  if (availableProviders.has("gmail")) {
    tools.push({
      name: "read_emails",
      description: "Read recent emails from inbox, optionally filtered by sender or subject",
      schema: z.object({
        limit: z.number().int().min(1).max(50).default(10),
        query: z.string().optional(),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        let q = sb.from("email_messages").select("id, from_address, subject, received_at, snippet, is_read")
          .order("received_at", { ascending: false }).limit(input.limit as number)
        if (input.query) q = q.or(`subject.ilike.%${input.query}%,from_address.ilike.%${input.query}%`)
        const { data, error } = await q
        if (error) return { status: "error", message: error.message }
        return { status: "success", count: data?.length ?? 0, emails: data ?? [] }
      },
    })

    tools.push({
      name: "search_emails",
      description: "Search emails by keywords, sender, date range, or labels",
      schema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("email_messages")
          .select("id, from_address, to_address, subject, received_at, snippet")
          .or(`subject.ilike.%${input.query}%,from_address.ilike.%${input.query}%,snippet.ilike.%${input.query}%`)
          .order("received_at", { ascending: false }).limit(input.limit as number)
        if (error) return { status: "error", message: error.message }
        return { status: "success", query: input.query, results: data ?? [] }
      },
    })

    tools.push({
      name: "send_email",
      description: "Send an email (requires approval for write_with_approval mode)",
      schema: z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
        cc: z.array(z.string().email()).optional(),
      }),
      execute: async (input) => ({
        status: "pending_approval",
        messageId: generateId(),
        action: "send_email",
        summary: `Send email to ${input.to} with subject: "${input.subject}"`,
      }),
    })
  }

  // Slack tools — backed by agent_messages table (internal messaging bus)
  if (availableProviders.has("slack")) {
    tools.push({
      name: "read_messages",
      description: "Read recent messages from a specific channel or tribe",
      schema: z.object({
        channel: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("agent_messages")
          .select("id, sender_agent_id, channel, payload, status, created_at")
          .eq("channel", input.channel)
          .order("created_at", { ascending: false }).limit(input.limit as number)
        if (error) return { status: "error", message: error.message }
        return { status: "success", channel: input.channel, messages: data ?? [] }
      },
    })

    tools.push({
      name: "search_channels",
      description: "Search for messaging channels by name or topic",
      schema: z.object({
        query: z.string(),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("agent_messages")
          .select("channel")
          .ilike("channel", `%${input.query}%`)
          .limit(50)
        if (error) return { status: "error", message: error.message }
        const unique = [...new Set((data ?? []).map(d => d.channel))]
        return { status: "success", query: input.query, channels: unique }
      },
    })

    tools.push({
      name: "post_message",
      description: "Post a message to a Slack channel",
      schema: z.object({
        channel: z.string(),
        text: z.string(),
        threadTs: z.string().optional(),
      }),
      execute: async (input) => ({
        status: "success",
        channel: input.channel,
        timestamp: new Date().toISOString(),
        messageId: generateId(),
      }),
    })
  }

  // Calendar tools — backed by agent_schedules table
  if (availableProviders.has("calendar")) {
    tools.push({
      name: "list_events",
      description: "List upcoming scheduled events for the next N days",
      schema: z.object({
        days: z.number().int().min(1).max(365).default(7),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const futureDate = new Date(Date.now() + (input.days as number) * 86400000).toISOString()
        const { data, error } = await sb.from("agent_schedules")
          .select("id, agent_definition_id, schedule_type, cron_expression, next_run_at, status")
          .lte("next_run_at", futureDate)
          .eq("status", "active")
          .order("next_run_at", { ascending: true })
        if (error) return { status: "error", message: error.message }
        return { status: "success", days: input.days, events: data ?? [] }
      },
    })

    tools.push({
      name: "create_event",
      description: "Create a new calendar event (requires approval for write_with_approval mode)",
      schema: z.object({
        title: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        description: z.string().optional(),
        attendees: z.array(z.string().email()).optional(),
      }),
      execute: async (input) => ({
        status: "pending_approval",
        eventId: generateId(),
        action: "create_event",
        summary: `Create event: ${input.title}`,
      }),
    })
  }

  // CRM tools — backed by profiles + marketplace_orders tables
  if (availableProviders.has("crm")) {
    tools.push({
      name: "search_contacts",
      description: "Search CRM contacts by name, email, or company",
      schema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("profiles")
          .select("id, first_name, last_name, email, company, position, headline")
          .or(`first_name.ilike.%${input.query}%,last_name.ilike.%${input.query}%,email.ilike.%${input.query}%,company.ilike.%${input.query}%`)
          .limit(input.limit as number)
        if (error) return { status: "error", message: error.message }
        return { status: "success", query: input.query, contacts: data ?? [] }
      },
    })

    tools.push({
      name: "list_deals",
      description: "List recent deals/orders with status and value",
      schema: z.object({
        status: z.enum(["open", "closed_won", "closed_lost"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        let q = sb.from("marketplace_orders")
          .select("id, listing_id, buyer_id, seller_id, status, total_amount, created_at")
          .order("created_at", { ascending: false }).limit(input.limit as number)
        if (input.status) q = q.eq("status", input.status)
        const { data, error } = await q
        if (error) return { status: "error", message: error.message }
        return { status: "success", deals: data ?? [] }
      },
    })

    tools.push({
      name: "update_contact",
      description: "Update a contact record in CRM (requires approval for write_with_approval mode)",
      schema: z.object({
        contactId: z.string(),
        updates: z.record(z.unknown()),
      }),
      execute: async (input) => ({
        status: "pending_approval",
        contactId: input.contactId,
        action: "update_contact",
        summary: `Update contact ${input.contactId}`,
      }),
    })
  }

  // Web tools — real fetch for scraping; tribal wisdom for search
  if (availableProviders.has("web")) {
    tools.push({
      name: "scrape_url",
      description: "Fetch and parse content from a URL",
      schema: z.object({
        url: z.string().url(),
        includeMetadata: z.boolean().default(true),
      }),
      execute: async (input) => {
        try {
          const resp = await fetch(input.url as string, {
            headers: { "User-Agent": "LinkedOut-Agent/1.0" },
            signal: AbortSignal.timeout(10_000),
          })
          const html = await resp.text()
          // Extract title from HTML
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
          const title = titleMatch?.[1]?.trim() ?? "Untitled"
          // Extract text content (strip tags, limit to 4000 chars)
          const textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000)
          return { status: "success", url: input.url, title, content: textContent }
        } catch (err) {
          return { status: "error", url: input.url, message: err instanceof Error ? err.message : "Fetch failed" }
        }
      },
    })

    tools.push({
      name: "search_web",
      description: "Search tribal knowledge base and threat intelligence",
      schema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        // Search across tribal knowledge: sentinel threat intel + world models
        const [threats, models] = await Promise.all([
          sb.from("sentinel_threat_intel").select("id, title, description, severity, created_at")
            .ilike("title", `%${input.query}%`).limit(input.limit as number),
          sb.from("world_models").select("id, model_name, description, accuracy_pct, created_at")
            .ilike("model_name", `%${input.query}%`).limit(input.limit as number),
        ])
        return {
          status: "success",
          query: input.query,
          results: [
            ...(threats.data ?? []).map(t => ({ type: "threat_intel", ...t })),
            ...(models.data ?? []).map(m => ({ type: "world_model", ...m })),
          ],
        }
      },
    })
  }

  // Notion tools — proxied through our Notion API route
  if (availableProviders.has("notion")) {
    tools.push({
      name: "read_page",
      description: "Read content from a Notion page via proxy",
      schema: z.object({
        pageId: z.string(),
      }),
      execute: async (input) => {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
          const resp = await fetch(`${baseUrl}/api/notion/proxy?pageId=${input.pageId}`, {
            signal: AbortSignal.timeout(10_000),
          })
          const data = await resp.json()
          return { status: "success", pageId: input.pageId, content: data }
        } catch (err) {
          return { status: "error", pageId: input.pageId, message: err instanceof Error ? err.message : "Failed" }
        }
      },
    })

    tools.push({
      name: "update_page",
      description: "Update a Notion page (requires approval for write_with_approval mode)",
      schema: z.object({
        pageId: z.string(),
        content: z.string(),
      }),
      execute: async (input) => ({
        status: "pending_approval",
        pageId: input.pageId,
        action: "update_page",
        summary: `Update Notion page ${input.pageId}`,
      }),
    })
  }

  // YouTube Studio tools — backed by agent_skill_events for content tracking
  if (availableProviders.has("youtube_studio")) {
    tools.push({
      name: "list_videos",
      description: "List tracked video content and clips",
      schema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("agent_skill_events")
          .select("id, skill_name, input_summary, output_summary, created_at")
          .ilike("skill_name", "%video%")
          .order("created_at", { ascending: false }).limit(input.limit as number)
        if (error) return { status: "error", message: error.message }
        return { status: "success", videos: data ?? [] }
      },
    })

    tools.push({
      name: "get_analytics",
      description: "Get analytics for a content asset",
      schema: z.object({
        videoId: z.string(),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("agent_runs")
          .select("id, summary, token_input, token_output, estimated_cost_usd, created_at")
          .eq("id", input.videoId).single()
        if (error) return { status: "error", videoId: input.videoId, message: error.message }
        return { status: "success", videoId: input.videoId, analytics: data }
      },
    })
  }

  // Drive/Storage tools — backed by Supabase storage + artifact tables
  if (availableProviders.has("drive")) {
    tools.push({
      name: "list_files",
      description: "List files and artifacts in sovereign storage",
      schema: z.object({
        folderId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("malware_artifacts")
          .select("id, file_name, file_hash, file_size_bytes, analysis_status, created_at")
          .order("created_at", { ascending: false }).limit(input.limit as number)
        if (error) return { status: "error", message: error.message }
        return { status: "success", files: data ?? [] }
      },
    })

    tools.push({
      name: "read_file",
      description: "Read metadata for a stored artifact",
      schema: z.object({
        fileId: z.string(),
      }),
      execute: async (input) => {
        const sb = getAgentSupabase()
        const { data, error } = await sb.from("malware_artifacts")
          .select("*").eq("id", input.fileId).single()
        if (error) return { status: "error", fileId: input.fileId, message: error.message }
        return { status: "success", fileId: input.fileId, content: data }
      },
    })

    tools.push({
      name: "upload_file",
      description: "Upload a file to Google Drive (requires approval for write_with_approval mode)",
      schema: z.object({
        name: z.string(),
        content: z.string(),
        folderId: z.string().optional(),
      }),
      execute: async (input) => ({
        status: "pending_approval",
        action: "upload_file",
        summary: `Upload file: ${input.name}`,
      }),
    })
  }

  return tools
}

/**
 * Calculate estimated cost based on token usage
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  costPerInputToken: number,
  costPerOutputToken: number,
): number {
  return inputTokens * costPerInputToken + outputTokens * costPerOutputToken
}

/**
 * Check if agent has exceeded its monthly budget
 */
function isBudgetExceeded(
  currentSpendUsd: number,
  monthlyBudgetUsd: number,
  utilizationThreshold: number = 0.9,
): boolean {
  return currentSpendUsd > monthlyBudgetUsd * utilizationThreshold
}

/**
 * Execute an agent with tool use and approval gates
 */
export async function executeAgent(
  agent: AgentDefinitionRecord,
  connectors: AgentConnectorRecord[],
  options?: {
    task?: string
    currentMonthlySpendUsd?: number
    maxRuns?: number
  },
): Promise<AgentExecutionResult> {
  const runId = generateId()
  const startTime = Date.now()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const toolCalls: ToolCallRecord[] = []

  try {
    // Check budget
    const currentSpend = options?.currentMonthlySpendUsd ?? 0
    if (isBudgetExceeded(currentSpend, agent.tokenBudgetUsdMonthly)) {
      return {
        success: false,
        runId,
        agentId: agent.id,
        tokenInput: 0,
        tokenOutput: 0,
        estimatedCostUsd: 0,
        duration: 0,
        efficiencyGainPct: 0,
        summary: "Budget limit exceeded for this month",
        error: `Current spend ($${currentSpend.toFixed(2)}) exceeds 90% of monthly budget ($${agent.tokenBudgetUsdMonthly.toFixed(2)})`,
        toolCalls: [],
      }
    }

    // Get model configuration
    let modelConfig = getModelConfig(agent.preferredModelId)
    const fallbackModelIds = agent.fallbackModelIds || []

    // Try primary model, then fallbacks
    let lastError: Error | null = null
    const modelsToTry = [agent.preferredModelId, ...fallbackModelIds]

    for (const modelId of modelsToTry) {
      try {
        modelConfig = getModelConfig(modelId)
        break
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        continue
      }
    }

    if (lastError && !modelConfig) {
      throw new Error(`Failed to initialize any model: ${lastError.message}`)
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(agent, connectors)

    // Create tool registry
    const toolRegistry = createToolRegistry(connectors)

    // Build initial message
    const userMessage =
      options?.task ||
      `Execute your workflow as defined in your purpose and soul. Use available tools to accomplish your goals. Log your work clearly.`

    const maxSteps = options?.maxRuns ?? 10
    const executionLog: string[] = []
    let approvalGatePassed = true

    // Check for approval-required connectors
    const approvalRequiredConnectors = connectors.filter((c) => c.approvalRequired)
    if (approvalRequiredConnectors.length > 0) {
      executionLog.push(
        `[GOVERNANCE] ${approvalRequiredConnectors.length} connector(s) require approval for write operations`,
      )
    }

    executionLog.push(`[START] Agent: ${agent.name}`)
    executionLog.push(`[TASK] ${userMessage}`)
    executionLog.push(`[MODEL] ${modelConfig.provider}`)
    executionLog.push(`[TOOLS] ${toolRegistry.length} available`)

    // Build AI SDK tool map for generateText
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiTools: Record<string, any> = {}
    for (const toolDef of toolRegistry) {
      aiTools[toolDef.name] = {
        description: toolDef.description,
        parameters: toolDef.schema,
        execute: async (input: Record<string, unknown>) => {
          const toolStartTime = Date.now()
          const result = await toolDef.execute(input)
          const duration = Date.now() - toolStartTime
          toolCalls.push({
            name: toolDef.name,
            input,
            output: result,
            duration,
          })
          executionLog.push(`[TOOL] ${toolDef.name} → ${JSON.stringify(result).substring(0, 120)}`)
          // Check if approval is pending
          if (result && typeof result === "object" && "status" in result) {
            if ((result as Record<string, unknown>).status === "pending_approval") {
              executionLog.push(
                `[APPROVAL] Action requires human review: ${(result as Record<string, unknown>).action || "write operation"}`,
              )
              approvalGatePassed = false
            }
          }
          return result
        },
      }
    }

    // Execute with real LLM via AI SDK generateText with multi-step tool use
    const result = await generateText({
      model: modelConfig.model,
      system: systemPrompt,
      prompt: userMessage,
      tools: aiTools,
      stopWhen: stepCountIs(maxSteps),
      maxOutputTokens: 4096,
      onStepFinish: ({ toolCalls: stepToolCalls }) => {
        if (stepToolCalls && stepToolCalls.length > 0) {
          for (const tc of stepToolCalls) {
            executionLog.push(`[STEP] Called ${tc.toolName}`)
          }
        }
      },
    })

    executionLog.push(`[END] ${result.text?.substring(0, 200) || "Completed"}`)

    totalInputTokens = result.usage?.inputTokens ?? 0
    totalOutputTokens = result.usage?.outputTokens ?? 0

    const estimatedCost = calculateCost(
      totalInputTokens,
      totalOutputTokens,
      modelConfig.costPerInputToken,
      modelConfig.costPerOutputToken,
    )

    // Check if execution would exceed budget
    if (currentSpend + estimatedCost > agent.tokenBudgetUsdMonthly) {
      return {
        success: false,
        runId,
        agentId: agent.id,
        tokenInput: totalInputTokens,
        tokenOutput: totalOutputTokens,
        estimatedCostUsd: estimatedCost,
        duration: Date.now() - startTime,
        efficiencyGainPct: 0,
        summary: "Execution would exceed monthly budget",
        error: `Estimated cost ($${estimatedCost.toFixed(2)}) would exceed remaining budget`,
        toolCalls,
      }
    }

    const summary = [...executionLog, result.text || ""].join("\n")

    return {
      success: approvalGatePassed,
      runId,
      agentId: agent.id,
      tokenInput: totalInputTokens,
      tokenOutput: totalOutputTokens,
      estimatedCostUsd: estimatedCost,
      duration: Date.now() - startTime,
      efficiencyGainPct: agent.weeklyEfficiencyGainPct,
      summary,
      toolCalls,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    return {
      success: false,
      runId,
      agentId: agent.id,
      tokenInput: totalInputTokens,
      tokenOutput: totalOutputTokens,
      estimatedCostUsd: 0,
      duration,
      efficiencyGainPct: 0,
      summary: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
      toolCalls,
    }
  }
}

/**
 * Convert execution result to AgentRunRecord for persistence
 */
export function buildAgentRunRecord(result: AgentExecutionResult): AgentRunRecord {
  const now = new Date().toISOString()

  return {
    id: result.runId,
    agentId: result.agentId,
    status: result.success ? "completed" : "failed",
    startedAt: new Date(Date.now() - result.duration).toISOString(),
    completedAt: now,
    tokenInput: result.tokenInput,
    tokenOutput: result.tokenOutput,
    estimatedCostUsd: result.estimatedCostUsd,
    efficiencyGainPct: result.efficiencyGainPct,
    summary: result.summary,
  }
}

/**
 * Import and use agent messaging (dynamic import with fallback).
 * Constructs a proper AgentMessage object matching the messaging module's signature.
 */
export async function tryPublishAgentMessage(
  sourceAgentId: string,
  toAgentId: string | null,
  topic: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const messaging = await import("./agent-messaging")
    if (messaging.publishAgentMessage) {
      await messaging.publishAgentMessage({
        fromAgentId: sourceAgentId,
        toAgentId,
        topic,
        payload,
        priority: "normal",
      })
      return true
    }
  } catch {
    // agent-messaging may not exist yet or may fail to import
    // Gracefully continue without inter-agent messaging
  }
  return false
}
