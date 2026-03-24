export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0)
}

export async function GET(): Promise<Response> {
  const openAiConfigured = hasValue(process.env.OPENAI_API_KEY)
  const anthropicConfigured = hasValue(process.env.ANTHROPIC_API_KEY)
  const moonshotConfigured = hasValue(process.env.MOONSHOT_API_KEY)
  const metaConfigured =
    hasValue(process.env.META_API_KEY) ||
    hasValue(process.env.LLAMA_API_KEY)
  const localConfigured =
    hasValue(process.env.LOCAL_MODEL_BASE_URL) ||
    hasValue(process.env.LOCAL_MODEL_API_KEY)

  return new Response(
    JSON.stringify({
      ok: true,
      providers: [
        {
          id: "openai",
          label: "OpenAI",
          configured: openAiConfigured,
          envKeys: ["OPENAI_API_KEY"],
          notes: "Required for chat and realtime session exchange.",
        },
        {
          id: "anthropic",
          label: "Anthropic",
          configured: anthropicConfigured,
          envKeys: ["ANTHROPIC_API_KEY"],
          notes: "Optional model provider for agent/model routing.",
        },
        {
          id: "moonshot",
          label: "Moonshot",
          configured: moonshotConfigured,
          envKeys: ["MOONSHOT_API_KEY"],
          notes: "Optional model provider for agent/model routing.",
        },
        {
          id: "meta",
          label: "Meta / Llama",
          configured: metaConfigured,
          envKeys: ["META_API_KEY", "LLAMA_API_KEY"],
          notes: "Optional model provider if configured in your deployment.",
        },
        {
          id: "local",
          label: "Local Model Gateway",
          configured: localConfigured,
          envKeys: ["LOCAL_MODEL_BASE_URL", "LOCAL_MODEL_API_KEY"],
          notes: "Optional local or self-hosted model gateway settings.",
        },
      ],
      generatedAt: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  )
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}

