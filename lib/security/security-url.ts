export function toSafeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2048) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null
  }

  return parsed.toString()
}

export function toSafeLinkedInUrl(value: string | null | undefined): string | null {
  const safeUrl = toSafeExternalUrl(value)
  if (!safeUrl) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(safeUrl)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  const isLinkedInHost = host === "linkedin.com" || host.endsWith(".linkedin.com")
  if (!isLinkedInHost) {
    return null
  }

  return parsed.toString()
}
