export function tryParseAuthToken(raw: string): string | null {
  if (!raw) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (typeof record.access_token === "string") {
        return record.access_token
      }
      const currentSession =
        record.currentSession &&
        typeof record.currentSession === "object" &&
        !Array.isArray(record.currentSession)
          ? (record.currentSession as Record<string, unknown>)
          : null
      if (currentSession && typeof currentSession.access_token === "string") {
        return currentSession.access_token
      }
    }

    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0]
    }
  } catch {
    // Ignore malformed localStorage values
  }

  return null
}

export function resolveSupabaseAccessTokenFromStorage(storage: Storage): string | null {
  const directToken = storage.getItem("supabase_access_token")
  if (directToken) {
    return directToken
  }

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) {
      continue
    }

    if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) {
      continue
    }

    const token = tryParseAuthToken(storage.getItem(key) || "")
    if (token) {
      return token
    }
  }

  return null
}

export function resolveSupabaseAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  return resolveSupabaseAccessTokenFromStorage(window.localStorage)
}
