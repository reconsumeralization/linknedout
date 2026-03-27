/**
 * Error sanitization utility for API responses.
 * Prevents database schema, column names, and constraint details from leaking to clients.
 * Logs full error details server-side for debugging.
 */

/** Safe error messages for common database/auth error patterns */
const ERROR_PATTERNS: [RegExp, string][] = [
  [/duplicate key.*violates unique constraint/i, "A record with this identifier already exists."],
  [/violates foreign key constraint/i, "Referenced record not found."],
  [/violates not-null constraint/i, "A required field is missing."],
  [/violates check constraint/i, "A field value is out of allowed range."],
  [/permission denied/i, "You do not have permission for this operation."],
  [/JWT expired/i, "Your session has expired. Please sign in again."],
  [/invalid.*token/i, "Invalid authentication token."],
  [/row-level security/i, "Access denied."],
  [/relation.*does not exist/i, "Internal configuration error."],
  [/column.*does not exist/i, "Internal configuration error."],
  [/function.*does not exist/i, "Internal configuration error."],
  [/timeout/i, "The operation timed out. Please try again."],
  [/connection refused/i, "Service temporarily unavailable."],
  [/ECONNREFUSED/i, "Service temporarily unavailable."],
  [/fetch failed/i, "Service temporarily unavailable."],
]

const GENERIC_ERROR = "An unexpected error occurred."

/**
 * Sanitize an error for client-facing API responses.
 * Returns a safe, generic message that doesn't leak internal details.
 */
export function sanitizeErrorForClient(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""

  for (const [pattern, safeMessage] of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return safeMessage
    }
  }

  return GENERIC_ERROR
}

/**
 * Log the full error server-side for debugging, then return a sanitized version.
 * Use this in catch blocks of API route handlers.
 */
export function handleApiError(error: unknown, context?: string): { message: string; detail: string } {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const sanitized = sanitizeErrorForClient(error)

  // Server-side logging with full details
  console.error(
    `[API_ERROR]${context ? ` [${context}]` : ""} ${rawMessage}`,
    error instanceof Error ? error.stack : "",
  )

  return { message: sanitized, detail: rawMessage }
}
