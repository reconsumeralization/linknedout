/**
 * Allowlist of paths that may be used as post-login redirect targets.
 * Prevents open redirects (e.g. redirect=https://evil.com).
 */
const REDIRECT_ALLOWLIST = new Set<string>([
  "/",
  "/auth",
  "/auth/ai",
  "/auth/email",
  "/auth/linkedin",
  "/login",
])

const DEFAULT_REDIRECT = "/auth"

/**
 * Normalizes and validates a redirect path from query string (e.g. ?redirect=/auth).
 * Returns an allowlisted path or the default. Rejects protocol-relative (//),
 * absolute URLs, and any path not in the allowlist.
 */
export function normalizeRedirectPath(value: string | null | undefined): string {
  if (value == null) return DEFAULT_REDIRECT
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_REDIRECT
  // Reject protocol-relative or non-path
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_REDIRECT
  }
  // Use pathname only (strip query and hash)
  const pathname = trimmed.split("?")[0].split("#")[0].trim() || "/"
  const normalized = pathname === "" ? "/" : pathname
  return REDIRECT_ALLOWLIST.has(normalized) ? normalized : DEFAULT_REDIRECT
}

/**
 * Default path to use when no redirect is specified (e.g. after login).
 */
export function getDefaultAuthRedirect(): string {
  return "/auth"
}
