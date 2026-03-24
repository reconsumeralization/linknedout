import { z } from "zod"

// ============================================================================
// Route Parameter Schemas
// ============================================================================

/** UUID v4 format for Supabase/Postgres IDs. Use for integrationId, draftId, etc. */
export const uuidParamSchema = z.string().uuid()

/** Alphanumeric slug format (e.g., for readable identifiers). */
export const slugParamSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "Must be a lowercase alphanumeric slug with hyphens",
})

/** Safe string param that rejects dangerous patterns. */
export const safeStringParamSchema = z.string()
  .min(1)
  .max(256)
  .refine(
    (val) => !containsDangerousPatterns(val),
    { message: "Contains potentially dangerous patterns" }
  )

// ============================================================================
// Security Pattern Detection
// ============================================================================

/** Patterns that indicate potential injection or traversal attacks. */
const DANGEROUS_PARAM_PATTERNS: RegExp[] = [
  // Path traversal
  /\.\.\//,
  /\.\.\\+/,
  /%2e%2e%2f/i,
  /%2e%2e%5c/i,
  
  // Null byte injection
  /%00/,
  /\x00/,
  
  // SQL injection indicators
  /('\s*(or|and)\s*'?\d+'\s*=\s*'\d+)/i,
  /;\s*(drop|delete|truncate|alter)\s+/i,
  
  // Command injection
  /[;&|`$]\s*(rm|curl|wget|nc|bash|sh)/i,
  /\$\(/,
  /`[^`]+`/,
  
  // SSRF/metadata service
  /169\.254\.169\.254/,
  /metadata\.google\.internal/i,
  /localhost/i,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /::1/,
  
  // Template injection
  /\{\{.*\}\}/,
  /\$\{.*\}/,
  /<%.*%>/,
  
  // Hidden/invisible characters
  /[\u200b-\u200f\u2028\u2029\ufeff\u00ad]/,
  /[\u2060-\u206f]/,
]

/**
 * Check if a string contains potentially dangerous patterns.
 * Used for route parameter validation to prevent injection attacks.
 */
function containsDangerousPatterns(value: string): boolean {
  const normalized = value.toLowerCase()
  return DANGEROUS_PARAM_PATTERNS.some((pattern) => pattern.test(normalized))
}

// ============================================================================
// Validation Result Types
// ============================================================================

export type ValidationSuccess<T> = { ok: true; value: T }
export type ValidationFailure = { ok: false; error: string; status: number; code?: string }
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

// ============================================================================
// Single Parameter Validation
// ============================================================================

/**
 * Validate a single UUID parameter with security checks.
 */
export function validateUuidParam(
  value: string,
  paramName: string,
): ValidationResult<string> {
  // Check for null/undefined/empty
  if (!value || typeof value !== "string") {
    return {
      ok: false,
      error: `Missing ${paramName}: parameter is required.`,
      status: 400,
      code: "MISSING_PARAM",
    }
  }

  const trimmed = value.trim()
  
  // Length check before processing
  if (trimmed.length > 128) {
    return {
      ok: false,
      error: `Invalid ${paramName}: exceeds maximum length.`,
      status: 400,
      code: "PARAM_TOO_LONG",
    }
  }

  // Security pattern check
  if (containsDangerousPatterns(trimmed)) {
    return {
      ok: false,
      error: `Invalid ${paramName}: contains invalid characters.`,
      status: 400,
      code: "DANGEROUS_PATTERN",
    }
  }

  const result = uuidParamSchema.safeParse(trimmed)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  
  return {
    ok: false,
    error: `Invalid ${paramName}: must be a valid UUID.`,
    status: 400,
    code: "INVALID_UUID",
  }
}

/**
 * Validate a single slug parameter with security checks.
 */
export function validateSlugParam(
  value: string,
  paramName: string,
): ValidationResult<string> {
  if (!value || typeof value !== "string") {
    return {
      ok: false,
      error: `Missing ${paramName}: parameter is required.`,
      status: 400,
      code: "MISSING_PARAM",
    }
  }

  const trimmed = value.trim()
  
  if (trimmed.length > 128) {
    return {
      ok: false,
      error: `Invalid ${paramName}: exceeds maximum length.`,
      status: 400,
      code: "PARAM_TOO_LONG",
    }
  }

  if (containsDangerousPatterns(trimmed)) {
    return {
      ok: false,
      error: `Invalid ${paramName}: contains invalid characters.`,
      status: 400,
      code: "DANGEROUS_PATTERN",
    }
  }

  const result = slugParamSchema.safeParse(trimmed)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  
  return {
    ok: false,
    error: `Invalid ${paramName}: must be a valid slug (lowercase alphanumeric with hyphens).`,
    status: 400,
    code: "INVALID_SLUG",
  }
}

// ============================================================================
// Batch Parameter Validation
// ============================================================================

export interface RouteParamsValidationOptions {
  /** If true, trim whitespace from parameter values. Default: true */
  trimValues?: boolean
  /** Maximum allowed length for any parameter value. Default: 256 */
  maxLength?: number
  /** If true, perform security pattern checks. Default: true */
  securityCheck?: boolean
}

/**
 * Validate multiple route context params against a schema.
 * Includes security checks for injection patterns (traversal, SQL/command injection, SSRF).
 * On success returns `{ ok: true, value: Record<string, string> }` with validated param values.
 */
export function validateRouteParams(
  params: Record<string, string>,
  schema: Record<string, z.ZodType<string>>,
  options: RouteParamsValidationOptions = {},
): ValidationResult<Record<string, string>> {
  const {
    trimValues = true,
    maxLength = 256,
    securityCheck = true,
  } = options

  const values: Record<string, string> = {}
  
  for (const [key, zodSchema] of Object.entries(schema)) {
    const raw = params[key]
    
    // Check for missing params
    if (raw === undefined || raw === "") {
      return {
        ok: false,
        error: `Missing route parameter: ${key}.`,
        status: 400,
        code: "MISSING_PARAM",
      }
    }

    const value = trimValues ? raw.trim() : raw

    // Length validation
    if (value.length > maxLength) {
      return {
        ok: false,
        error: `Invalid ${key}: exceeds maximum length of ${maxLength}.`,
        status: 400,
        code: "PARAM_TOO_LONG",
      }
    }

    // Security pattern check
    if (securityCheck && containsDangerousPatterns(value)) {
      return {
        ok: false,
        error: `Invalid ${key}: contains invalid characters.`,
        status: 400,
        code: "DANGEROUS_PATTERN",
      }
    }

    // Schema validation
    const parsed = zodSchema.safeParse(value)
    if (!parsed.success) {
      const zodError = parsed.error.issues[0]?.message || "Invalid format"
      return {
        ok: false,
        error: `Invalid ${key}: ${zodError}.`,
        status: 400,
        code: "SCHEMA_VALIDATION_FAILED",
      }
    }
    
    values[key] = parsed.data
  }

  return { ok: true, value: values }
}

// ============================================================================
// Common Route Parameter Schemas
// ============================================================================

export const routeParamSchemas = {
  integrationId: uuidParamSchema,
  draftId: uuidParamSchema,
  userId: uuidParamSchema,
  sessionId: uuidParamSchema,
  messageId: uuidParamSchema,
  templateId: uuidParamSchema,
  slug: slugParamSchema,
} as const

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a validated error response for route parameter failures.
 */
export function createParamErrorResponse(
  error: string,
  status: number = 400,
  code?: string,
): Response {
  return new Response(
    JSON.stringify({
      error: "invalid_request",
      error_description: error,
      code,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  )
}

/**
 * Sanitize a parameter value for logging (redact sensitive patterns).
 */
export function sanitizeParamForLogging(value: string): string {
  if (value.length <= 8) {
    return "****"
  }
  // Show first and last 2 chars only
  return `${value.slice(0, 2)}****${value.slice(-2)}`
}