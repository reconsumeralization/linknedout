"use client"

// ---------------------------------------------------------------------------
// User-provided backend keys — stored in localStorage
// Supports: Supabase, multiple AI providers, MongoDB, Notion, self-hosted
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout_user_keys"

export interface UserKeys {
  // Backend
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  selfHostedSupabase: boolean

  // AI Providers (user brings their own keys)
  openaiApiKey: string
  anthropicApiKey: string
  googleApiKey: string
  mistralApiKey: string
  groqApiKey: string
  ollamaUrl: string
  localModelUrl: string
  preferredModel: string

  // Data Sources
  mongodbConnectionString: string
  notionApiKey: string
  notionWorkspaceId: string

  // LinkedIn
  linkedinClientId: string
  linkedinClientSecret: string
}

const EMPTY_KEYS: UserKeys = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseServiceRoleKey: "",
  selfHostedSupabase: false,
  openaiApiKey: "",
  anthropicApiKey: "",
  googleApiKey: "",
  mistralApiKey: "",
  groqApiKey: "",
  ollamaUrl: "",
  localModelUrl: "",
  preferredModel: "gpt-4o-mini",
  mongodbConnectionString: "",
  notionApiKey: "",
  notionWorkspaceId: "",
  linkedinClientId: "",
  linkedinClientSecret: "",
}

/** All supported AI providers */
export const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", keyField: "openaiApiKey" as const, placeholder: "sk-...", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o1-mini"] },
  { id: "anthropic", name: "Anthropic", keyField: "anthropicApiKey" as const, placeholder: "sk-ant-...", models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"] },
  { id: "google", name: "Google Gemini", keyField: "googleApiKey" as const, placeholder: "AI...", models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"] },
  { id: "mistral", name: "Mistral", keyField: "mistralApiKey" as const, placeholder: "...", models: ["mistral-large", "mistral-medium", "codestral"] },
  { id: "groq", name: "Groq", keyField: "groqApiKey" as const, placeholder: "gsk_...", models: ["llama-3.3-70b", "mixtral-8x7b", "gemma2-9b"] },
  { id: "ollama", name: "Ollama (Local)", keyField: "ollamaUrl" as const, placeholder: "http://localhost:11434", models: ["llama3.1", "codellama", "mistral"] },
  { id: "custom", name: "Custom Endpoint", keyField: "localModelUrl" as const, placeholder: "https://your-model.example.com/v1", models: [] },
] as const

/** Data source options */
export const DATA_SOURCES = [
  { id: "supabase", name: "Supabase", description: "PostgreSQL + Auth + Realtime (recommended)", required: true },
  { id: "mongodb", name: "MongoDB", description: "Document database for tribal knowledge graphs", required: false },
  { id: "notion", name: "Notion", description: "Knowledge base and workspace sync", required: false },
] as const

/** Read user-provided keys from localStorage */
export function getUserKeys(): UserKeys {
  if (typeof window === "undefined") return EMPTY_KEYS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_KEYS
    const parsed = JSON.parse(raw) as Partial<UserKeys>
    return { ...EMPTY_KEYS, ...parsed }
  } catch {
    return EMPTY_KEYS
  }
}

/** Save user-provided keys to localStorage */
export function setUserKeys(keys: Partial<UserKeys>): void {
  if (typeof window === "undefined") return
  try {
    const current = getUserKeys()
    const merged = { ...current, ...keys }
    // Trim string values
    for (const [k, v] of Object.entries(merged)) {
      if (typeof v === "string") (merged as Record<string, unknown>)[k] = v.trim()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // ignore storage errors
  }
}

/** Clear all user-provided keys */
export function clearUserKeys(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Check if user has provided Supabase keys */
export function hasUserSupabase(): boolean {
  const keys = getUserKeys()
  return Boolean(keys.supabaseUrl && keys.supabaseAnonKey)
}

/** Check if user has provided an OpenAI key */
export function hasUserOpenAI(): boolean {
  return Boolean(getUserKeys().openaiApiKey)
}

/** Check if user has any AI provider key configured */
export function hasAnyAIProvider(): boolean {
  const keys = getUserKeys()
  return Boolean(
    keys.openaiApiKey || keys.anthropicApiKey || keys.googleApiKey ||
    keys.mistralApiKey || keys.groqApiKey || keys.ollamaUrl || keys.localModelUrl
  )
}

/** Get the list of configured AI provider IDs */
export function getConfiguredProviders(): string[] {
  const keys = getUserKeys()
  const configured: string[] = []
  for (const provider of AI_PROVIDERS) {
    const val = keys[provider.keyField]
    if (val) configured.push(provider.id)
  }
  return configured
}

/** Check if user has MongoDB configured */
export function hasUserMongoDB(): boolean {
  return Boolean(getUserKeys().mongodbConnectionString)
}

/** Check if user has Notion configured */
export function hasUserNotion(): boolean {
  const keys = getUserKeys()
  return Boolean(keys.notionApiKey && keys.notionWorkspaceId)
}

/** Check if any user keys are configured */
export function hasAnyUserKeys(): boolean {
  return hasUserSupabase() || hasAnyAIProvider()
}

/** Build the headers object to send user keys to API routes */
export function getUserKeyHeaders(): Record<string, string> {
  const keys = getUserKeys()
  const headers: Record<string, string> = {}

  // Supabase
  if (keys.supabaseUrl) headers["x-user-supabase-url"] = keys.supabaseUrl
  if (keys.supabaseAnonKey) headers["x-user-supabase-anon-key"] = keys.supabaseAnonKey

  // AI Providers
  if (keys.openaiApiKey) headers["x-user-openai-key"] = keys.openaiApiKey
  if (keys.anthropicApiKey) headers["x-user-anthropic-key"] = keys.anthropicApiKey
  if (keys.googleApiKey) headers["x-user-google-key"] = keys.googleApiKey
  if (keys.mistralApiKey) headers["x-user-mistral-key"] = keys.mistralApiKey
  if (keys.groqApiKey) headers["x-user-groq-key"] = keys.groqApiKey
  if (keys.ollamaUrl) headers["x-user-ollama-url"] = keys.ollamaUrl
  if (keys.localModelUrl) headers["x-user-local-model-url"] = keys.localModelUrl
  if (keys.preferredModel) headers["x-user-preferred-model"] = keys.preferredModel

  // Data Sources
  if (keys.mongodbConnectionString) headers["x-user-mongodb-url"] = keys.mongodbConnectionString
  if (keys.notionApiKey) headers["x-user-notion-key"] = keys.notionApiKey

  return headers
}
