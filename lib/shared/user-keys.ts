"use client"

// ---------------------------------------------------------------------------
// User-provided backend keys — stored in localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout_user_keys"

export interface UserKeys {
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
}

const EMPTY_KEYS: UserKeys = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  openaiApiKey: "",
}

/** Read user-provided keys from localStorage */
export function getUserKeys(): UserKeys {
  if (typeof window === "undefined") return EMPTY_KEYS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_KEYS
    const parsed = JSON.parse(raw) as Partial<UserKeys>
    return {
      supabaseUrl: parsed.supabaseUrl?.trim() || "",
      supabaseAnonKey: parsed.supabaseAnonKey?.trim() || "",
      openaiApiKey: parsed.openaiApiKey?.trim() || "",
    }
  } catch {
    return EMPTY_KEYS
  }
}

/** Save user-provided keys to localStorage */
export function setUserKeys(keys: Partial<UserKeys>): void {
  if (typeof window === "undefined") return
  try {
    const current = getUserKeys()
    const merged: UserKeys = {
      supabaseUrl: keys.supabaseUrl?.trim() ?? current.supabaseUrl,
      supabaseAnonKey: keys.supabaseAnonKey?.trim() ?? current.supabaseAnonKey,
      openaiApiKey: keys.openaiApiKey?.trim() ?? current.openaiApiKey,
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

/** Check if any user keys are configured */
export function hasAnyUserKeys(): boolean {
  return hasUserSupabase() || hasUserOpenAI()
}

/** Build the headers object to send user keys to API routes */
export function getUserKeyHeaders(): Record<string, string> {
  const keys = getUserKeys()
  const headers: Record<string, string> = {}
  if (keys.supabaseUrl) headers["x-user-supabase-url"] = keys.supabaseUrl
  if (keys.supabaseAnonKey) headers["x-user-supabase-anon-key"] = keys.supabaseAnonKey
  if (keys.openaiApiKey) headers["x-user-openai-key"] = keys.openaiApiKey
  return headers
}
