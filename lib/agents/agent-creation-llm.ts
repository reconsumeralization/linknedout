import { generateObject, type LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  buildAgentDraftFromPromptLegacy,
  type AgentDraftInput,
  type AgentDraftOutput,
} from './agent-platform-types';

/**
 * Available connectors that can be integrated with agents.
 */
const AVAILABLE_CONNECTORS = [
  'gmail',
  'calendar',
  'slack',
  'notion',
  'crm',
  'youtube_studio',
  'zoom',
  'instacart',
  'ad_platforms',
  'drive',
  'web',
] as const;

/**
 * Available skills that agents can leverage.
 */
const AVAILABLE_SKILLS = [
  'web research',
  'crm enrichment',
  'outreach drafting',
  'workflow summarization',
  'content clipping',
  'thumbnail optimization',
  'approval routing',
  'budget governance',
  'multi-agent orchestration',
  'process automation',
  'structured reasoning',
] as const;

/**
 * Available models for agent execution.
 */
const AVAILABLE_MODELS = [
  'gpt-4.1-mini',
  'claude-3.7-sonnet',
  'kimi-2.5',
  'llama-3.3-70b',
  'local-macstudio',
] as const;

/**
 * Zod schema for LLM-generated agent draft output.
 * Ensures type safety and structured validation.
 */
const AgentDraftSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(50)
    .describe('Creative, descriptive agent name (3-50 chars)'),
  purpose: z
    .string()
    .min(10)
    .max(200)
    .describe('Clear purpose statement of what the agent does'),
  soul: z
    .string()
    .min(50)
    .max(500)
    .describe(
      'Tailored system prompt defining agent personality, values, and behavior patterns'
    ),
  skills: z
    .array(z.enum(AVAILABLE_SKILLS))
    .min(1)
    .max(5)
    .describe('Relevant skills the agent should utilize'),
  connectors: z
    .array(z.enum(AVAILABLE_CONNECTORS))
    .min(0)
    .max(4)
    .describe('Relevant connectors for data access and integrations'),
  preferredModelId: z
    .enum(AVAILABLE_MODELS)
    .describe('Optimal model for this agent workload'),
  fallbackModelIds: z
    .array(z.enum(AVAILABLE_MODELS))
    .min(1)
    .describe('Alternative models if preferred is unavailable'),
  recursiveImprovementEnabled: z
    .boolean()
    .describe('Whether agent should refine its outputs iteratively'),
  weeklyEfficiencyGainPct: z
    .number()
    .min(0)
    .max(100)
    .describe('Estimated weekly efficiency improvement percentage'),
  tokenBudgetUsdMonthly: z
    .number()
    .min(0)
    .describe('Monthly token budget in USD'),
});

/**
 * Builds an agent draft using LLM-powered intelligent analysis.
 *
 * This function leverages Vercel AI SDK to:
 * 1. Generate creative, context-aware agent names
 * 2. Create tailored system prompts specific to the agent's purpose
 * 3. Intelligently select connectors and skills based on semantic understanding
 * 4. Recommend optimal models based on task complexity
 * 5. Estimate efficiency gains with reasoning
 *
 * Falls back to legacy keyword-matching approach on LLM failure or timeout.
 *
 * @param input - Agent draft input with user prompt and optional preferences
 * @returns Promise resolving to complete agent draft output
 * @throws Falls back gracefully to legacy system on error
 *
 * @example
 * ```typescript
 * const draft = await buildAgentDraftWithLLM({
 *   prompt: 'Build an agent that manages my emails and schedules meetings',
 *   preferredModelId: 'gpt-4.1-mini',
 *   tokenBudgetUsdMonthly: 20
 * });
 * ```
 */
export async function buildAgentDraftWithLLM(
  input: AgentDraftInput
): Promise<AgentDraftOutput> {
  const creationModel = process.env.AGENT_CREATION_MODEL || 'gpt-4.1-mini';
  const timeoutMs = 15000;

  try {
    // Create timeout promise for safety
    const timeoutPromise = new Promise<AgentDraftOutput>(() => {
      // Intentionally never resolves - used for Promise.race
    });

    const llmPromise = (async () => {
      try {
        const systemPrompt = `You are an expert AI agent architect. Analyze user requirements and design intelligent, well-configured AI agents.

Your task:
1. Generate a creative agent name (3-50 chars) that reflects its purpose
2. Create a detailed system prompt (soul) that defines the agent's personality, decision-making style, and operational guidelines
3. Intelligently select connectors based on semantic understanding of what data/tools are needed
4. Choose appropriate skills that complement the agent's purpose
5. Recommend the best model based on task complexity and requirements
6. Estimate realistic weekly efficiency gains (0-100%)

Available connectors: ${AVAILABLE_CONNECTORS.join(', ')}
Available skills: ${AVAILABLE_SKILLS.join(', ')}
Available models: ${AVAILABLE_MODELS.join(', ')}

Generate a complete agent design that is practical, well-reasoned, and aligned with the user's intent.`;

        const userPrompt = `Design an AI agent based on this requirement:

"${input.prompt}"

${input.tokenBudgetUsdMonthly ? `Token budget: $${input.tokenBudgetUsdMonthly}/month` : ''}
${input.preferredModelId ? `Preferred model: ${input.preferredModelId}` : ''}

Return a JSON object matching the AgentDraftSchema with all required fields. Ensure connectors and skills are chosen based on semantic understanding, not keyword matching.`;

        const result = await generateObject({
          model: openai(creationModel) as unknown as LanguageModel,
          schema: AgentDraftSchema,
          system: systemPrompt,
          prompt: userPrompt,
        });

        if (!result.object) {
          throw new Error('LLM did not return valid object');
        }

        // Validate and transform the result
        const validated = AgentDraftSchema.parse(result.object);

        return {
          name: validated.name,
          purpose: validated.purpose,
          soul: validated.soul,
          skills: validated.skills,
          connectors: validated.connectors,
          preferredModelId: validated.preferredModelId,
          fallbackModelIds: validated.fallbackModelIds,
          recursiveImprovementEnabled: validated.recursiveImprovementEnabled,
          weeklyEfficiencyGainPct: validated.weeklyEfficiencyGainPct,
          tokenBudgetUsdMonthly:
            validated.tokenBudgetUsdMonthly ||
            input.tokenBudgetUsdMonthly ||
            10,
        };
      } catch (error) {
        // Re-throw to be caught by outer handler
        throw error;
      }
    })();

    // Race LLM call against timeout
    return await Promise.race([
      llmPromise,
      new Promise<AgentDraftOutput>((_, reject) =>
        setTimeout(
          () => reject(new Error('Agent creation LLM timeout')),
          timeoutMs
        )
      ),
    ]);
  } catch (error) {
    // Log error for debugging but don't expose to user
    console.warn(
      'LLM agent creation failed, falling back to legacy system:',
      error instanceof Error ? error.message : String(error)
    );

    // Graceful fallback to legacy keyword-matching system
    return buildAgentDraftFromPromptLegacy(input);
  }
}

/**
 * Legacy export for backward compatibility.
 * Directly uses keyword-matching approach.
 *
 * @deprecated Use buildAgentDraftWithLLM instead for better results
 */
export { buildAgentDraftFromPromptLegacy };

export type { AgentDraftInput, AgentDraftOutput };
