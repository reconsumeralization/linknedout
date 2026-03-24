import "server-only"

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default maximum request body size (256 KB) */
const DEFAULT_MAX_BODY_BYTES = 256_000

/** Absolute maximum request body size to prevent abuse (20 MB) */
const ABSOLUTE_MAX_BODY_BYTES = 20_000_000

/** Minimum body size to consider valid (1 byte) */
const MIN_BODY_BYTES = 1

/** Default timeout for reading request body (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000

/** Common content types for validation */
const JSON_CONTENT_TYPES = [
  "application/json",
  "application/json; charset=utf-8",
  "application/json;charset=utf-8",
  "application/json; charset=UTF-8",
]

/** Form content types */
const FORM_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
]

/** Text content types */
const TEXT_CONTENT_TYPES = [
  "text/plain",
  "text/html",
  "text/xml",
  "application/xml",
]

/** Binary content types */
const BINARY_CONTENT_TYPES = [
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/zip",
]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP status codes for body parsing errors */
export type BodyErrorStatus = 400 | 408 | 413 | 415 | 422

/** Result of reading request body as text */
export type BodyTextResult =
  | { ok: true; text: string; bytes: number; contentType: string | null }
  | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }

/** Result of parsing request body as JSON */
export type JsonBodyResult<T = unknown> =
  | { ok: true; value: T; bytes: number; contentType: string | null }
  | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }

/** Result of parsing request body as form data */
export type FormBodyResult =
  | { ok: true; data: Record<string, string>; bytes: number; contentType: string | null }
  | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }

/** Result of reading request body as bytes */
export type BodyBytesResult =
  | { ok: true; data: Uint8Array; bytes: number; contentType: string | null }
  | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }

/** Error codes for body parsing failures */
export type BodyErrorCode =
  | "BODY_TOO_LARGE"
  | "BODY_REQUIRED"
  | "BODY_ALREADY_CONSUMED"
  | "BODY_READ_ERROR"
  | "BODY_TIMEOUT"
  | "INVALID_CONTENT_TYPE"
  | "INVALID_JSON"
  | "INVALID_FORM_DATA"
  | "VALIDATION_FAILED"
  | "TOO_MANY_FIELDS"
  | "INVALID_CHARSET"

/** Options for reading request body */
export type ReadBodyOptions = {
  /** Maximum allowed body size in bytes */
  maxBytes?: number
  /** Whether to require a non-empty body. Default: false */
  requireBody?: boolean
  /** Allowed content types. If specified, validates Content-Type header */
  allowedContentTypes?: string[]
  /** Timeout in milliseconds for reading the body. Default: 30000 */
  timeoutMs?: number
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/** Options for parsing JSON body */
export type ParseJsonOptions = ReadBodyOptions & {
  /** Whether to validate Content-Type header. Default: false */
  validateContentType?: boolean
  /** Whether to allow arrays as root value. Default: true */
  allowArrays?: boolean
  /** Whether to allow null as root value. Default: true */
  allowNull?: boolean
  /** Whether to allow primitives (string, number, boolean) as root value. Default: true */
  allowPrimitives?: boolean
  /** Custom reviver function for JSON.parse */
  reviver?: (key: string, value: unknown) => unknown
}

/** Options for parsing form body */
export type ParseFormOptions = ReadBodyOptions & {
  /** Whether to validate Content-Type header. Default: false */
  validateContentType?: boolean
  /** Maximum number of fields allowed. Default: 100 */
  maxFields?: number
  /** Maximum length of a single field value. Default: 10000 */
  maxFieldLength?: number
  /** Fields that are required to be present */
  requiredFields?: string[]
}

/** Options for reading binary body */
export type ReadBinaryOptions = ReadBodyOptions & {
  /** Expected content types for binary data */
  expectedContentTypes?: string[]
}

/** Validation function for parsed JSON */
export type JsonValidator<T> = (value: unknown) => value is T

/** Validation function that returns an error message */
export type JsonValidatorWithError<T> = (value: unknown) => { ok: true; value: T } | { ok: false; error: string }

/** Middleware function for processing request body */
export type BodyMiddleware<T, R> = (body: T, req: Request) => R | Promise<R>

// ─────────────────────────────────────────────────────────────────────────────
// Error Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a standardized body error result.
 *
 * @param status - HTTP status code
 * @param error - Error message
 * @param code - Error code for programmatic handling
 * @returns A body error result object
 */
function createBodyError<T extends { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }>(
  status: T["status"],
  error: string,
  code: BodyErrorCode,
): { ok: false; status: T["status"]; error: string; code: BodyErrorCode } {
  return { ok: false, status, error, code }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a max body bytes value to be within acceptable bounds.
 *
 * @param value - The value to normalize
 * @returns A valid max body bytes value
 */
function normalizeMaxBodyBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_BODY_BYTES
  }
  return Math.min(Math.floor(value), ABSOLUTE_MAX_BODY_BYTES)
}

/**
 * Check if a Content-Type header matches any of the allowed types.
 *
 * @param contentType - The Content-Type header value
 * @param allowedTypes - Array of allowed content types
 * @returns True if the content type is allowed
 */
function matchesContentType(contentType: string | null, allowedTypes: string[]): boolean {
  if (!contentType) return false
  const normalized = contentType.toLowerCase().trim()
  return allowedTypes.some((type) => {
    const baseType = type.split(";")[0].toLowerCase()
    return normalized.startsWith(baseType)
  })
}

/**
 * Check if a Content-Type header indicates JSON content.
 *
 * @param contentType - The Content-Type header value
 * @returns True if the content type indicates JSON
 */
function isJsonContentType(contentType: string | null): boolean {
  return matchesContentType(contentType, JSON_CONTENT_TYPES)
}

/**
 * Check if a Content-Type header indicates form content.
 *
 * @param contentType - The Content-Type header value
 * @returns True if the content type indicates form data
 */
function isFormContentType(contentType: string | null): boolean {
  return matchesContentType(contentType, FORM_CONTENT_TYPES)
}

/**
 * Check if a Content-Type header indicates text content.
 *
 * @param contentType - The Content-Type header value
 * @returns True if the content type indicates text
 */
export function isTextContentType(contentType: string | null): boolean {
  return matchesContentType(contentType, TEXT_CONTENT_TYPES)
}

/**
 * Check if a Content-Type header indicates binary content.
 *
 * @param contentType - The Content-Type header value
 * @returns True if the content type indicates binary data
 */
export function isBinaryContentType(contentType: string | null): boolean {
  return matchesContentType(contentType, BINARY_CONTENT_TYPES)
}

/**
 * Format bytes as a human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Human-readable string (e.g., "1.5 KB", "2.3 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 bytes"
  if (bytes === 1) return "1 byte"
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Parse bytes from a human-readable string.
 *
 * @param str - Human-readable string (e.g., "1.5 KB", "2 MB", "500")
 * @returns Number of bytes, or null if invalid
 *
 * @example
 *   parseBytes("1.5 KB") // 1536
 *   parseBytes("2 MB") // 2097152
 *   parseBytes("500") // 500
 */
export function parseBytes(str: string): number | null {
  const trimmed = str.trim().toLowerCase()
  const match = trimmed.match(/^([\d.]+)\s*(bytes?|kb|mb|gb)?$/)
  if (!match) return null

  const value = parseFloat(match[1])
  if (!Number.isFinite(value) || value < 0) return null

  const unit = match[2] || "bytes"
  switch (unit) {
    case "byte":
    case "bytes":
      return Math.floor(value)
    case "kb":
      return Math.floor(value * 1024)
    case "mb":
      return Math.floor(value * 1024 * 1024)
    case "gb":
      return Math.floor(value * 1024 * 1024 * 1024)
    default:
      return null
  }
}

/**
 * Get max body bytes from an environment variable with a fallback.
 *
 * @param envName - The environment variable name
 * @param fallback - Fallback value if env var is not set or invalid
 * @returns The normalized max body bytes value
 *
 * @example
 *   const maxBytes = getMaxBodyBytesFromEnv("MAX_UPLOAD_SIZE", 1_000_000)
 */
export function getMaxBodyBytesFromEnv(
  envName: string,
  fallback: number,
): number {
  const envValue = process.env[envName]
  if (!envValue) {
    return normalizeMaxBodyBytes(fallback)
  }

  // Try parsing as number first
  const parsed = Number(envValue)
  if (Number.isFinite(parsed) && parsed > 0) {
    return normalizeMaxBodyBytes(parsed)
  }

  // Try parsing as human-readable format
  const bytes = parseBytes(envValue)
  if (bytes !== null) {
    return normalizeMaxBodyBytes(bytes)
  }

  return normalizeMaxBodyBytes(fallback)
}

/**
 * Extract the charset from a Content-Type header.
 *
 * @param contentType - The Content-Type header value
 * @returns The charset or "utf-8" as default
 */
export function extractCharset(contentType: string | null): string {
  if (!contentType) return "utf-8"
  const match = contentType.match(/charset=([^\s;]+)/i)
  return match?.[1]?.toLowerCase() ?? "utf-8"
}

/**
 * Extract the boundary from a multipart Content-Type header.
 *
 * @param contentType - The Content-Type header value
 * @returns The boundary string or null if not found
 */
export function extractBoundary(contentType: string | null): string | null {
  if (!contentType) return null
  const match = contentType.match(/boundary=([^\s;]+)/i)
  return match?.[1] ?? null
}

/**
 * Check if a request has a body.
 *
 * @param req - The incoming request
 * @returns True if the request likely has a body
 */
export function hasRequestBody(req: Request): boolean {
  const method = req.method.toUpperCase()
  // These methods typically don't have bodies
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false
  }

  const contentLength = req.headers.get("content-length")
  if (contentLength === "0") {
    return false
  }

  return req.body !== null
}

/**
 * Create a timeout promise that rejects after the specified duration.
 *
 * @param ms - Timeout in milliseconds
 * @param signal - Optional abort signal
 * @returns A promise that rejects with a timeout error
 */
function createTimeout(ms: number, signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Request body read timeout"))
    }, ms)

    signal?.addEventListener("abort", () => {
      clearTimeout(timeoutId)
      reject(new Error("Request aborted"))
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Body Reading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a request body as text with size limit enforcement.
 * Streams the body to avoid loading large payloads into memory before checking size.
 *
 * @param req - The incoming request
 * @param maxBodyBytes - Maximum allowed body size in bytes
 * @param options - Additional options
 * @returns Promise resolving to the body text or an error
 *
 * @example
 *   const result = await readRequestTextWithLimit(req, 100_000)
 *   if (!result.ok) {
 *     return new Response(result.error, { status: result.status })
 *   }
 *   const bodyText = result.text
 */
export async function readRequestTextWithLimit(
  req: Request,
  maxBodyBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BodyTextResult> {
  const normalizedLimit = normalizeMaxBodyBytes(maxBodyBytes)
  const contentType = req.headers.get("content-type")

  // Early rejection based on Content-Length header
  const contentLengthHeader = req.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > normalizedLimit) {
      return createBodyError(
        413,
        `Request body too large (${formatBytes(contentLength)}). Maximum: ${formatBytes(normalizedLimit)}.`,
        "BODY_TOO_LARGE",
      )
    }
  }

  // Check if body has already been consumed
  if (req.bodyUsed) {
    return createBodyError(400, "Request body has already been consumed.", "BODY_ALREADY_CONSUMED")
  }

  // Handle empty body
  if (!req.body) {
    return { ok: true, text: "", bytes: 0, contentType }
  }

  const reader = req.body.getReader()
  const charset = extractCharset(contentType)

  // Validate charset
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charset, { fatal: false })
  } catch {
    decoder = new TextDecoder("utf-8", { fatal: false })
  }

  let bytes = 0
  let text = ""
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    const readWithTimeout = async (): Promise<void> => {
      while (true) {
        const readPromise = reader.read()
        const result = await (timeoutMs > 0
          ? Promise.race([readPromise, createTimeout(timeoutMs, options.signal)])
          : readPromise)

        const { done, value } = result as ReadableStreamReadResult<Uint8Array>
        if (done) {
          break
        }

        if (value) {
          bytes += value.byteLength
          if (bytes > normalizedLimit) {
            await reader.cancel().catch(() => {})
            throw new Error("BODY_TOO_LARGE")
          }

          text += decoder.decode(value, { stream: true })
        }
      }
    }

    await readWithTimeout()

    // Flush any remaining bytes
    text += decoder.decode()
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (message === "BODY_TOO_LARGE") {
      return createBodyError(
        413,
        `Request body too large (>${formatBytes(normalizedLimit)}). Maximum: ${formatBytes(normalizedLimit)}.`,
        "BODY_TOO_LARGE",
      )
    }

    if (message === "Request body read timeout") {
      return createBodyError(408, "Request body read timed out.", "BODY_TIMEOUT")
    }

    if (message === "Request aborted") {
      return createBodyError(400, "Request was aborted.", "BODY_READ_ERROR")
    }

    return createBodyError(400, `Unable to read request body: ${message}`, "BODY_READ_ERROR")
  }

  return { ok: true, text, bytes, contentType }
}

/**
 * Read request body with configurable options.
 *
 * @param req - The incoming request
 * @param options - Configuration options
 * @returns Promise resolving to the body text or an error
 *
 * @example
 *   const result = await readRequestBody(req, { maxBytes: 50_000, requireBody: true })
 */
export async function readRequestBody(
  req: Request,
  options: ReadBodyOptions = {},
): Promise<BodyTextResult> {
  const contentType = req.headers.get("content-type")

  // Validate content type if specified
  if (options.allowedContentTypes?.length) {
    if (!matchesContentType(contentType, options.allowedContentTypes)) {
      return createBodyError(
        415,
        `Invalid Content-Type. Expected: ${options.allowedContentTypes.join(", ")}.`,
        "INVALID_CONTENT_TYPE",
      )
    }
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const result = await readRequestTextWithLimit(req, maxBytes, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })

  if (!result.ok) {
    return result
  }

  if (options.requireBody && !result.text.trim()) {
    return createBodyError(400, "Request body is required.", "BODY_REQUIRED")
  }

  return result
}

/**
 * Read request body as a Uint8Array with size limit enforcement.
 * Useful for binary data like file uploads.
 *
 * @param req - The incoming request
 * @param maxBodyBytes - Maximum allowed body size in bytes
 * @param options - Additional options
 * @returns Promise resolving to the body bytes or an error
 */
export async function readRequestBytesWithLimit(
  req: Request,
  maxBodyBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BodyBytesResult> {
  const normalizedLimit = normalizeMaxBodyBytes(maxBodyBytes)
  const contentType = req.headers.get("content-type")

  // Early rejection based on Content-Length header
  const contentLengthHeader = req.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > normalizedLimit) {
      return createBodyError(
        413,
        `Request body too large (${formatBytes(contentLength)}). Maximum: ${formatBytes(normalizedLimit)}.`,
        "BODY_TOO_LARGE",
      )
    }
  }

  // Check if body has already been consumed
  if (req.bodyUsed) {
    return createBodyError(400, "Request body has already been consumed.", "BODY_ALREADY_CONSUMED")
  }

  // Handle empty body
  if (!req.body) {
    return { ok: true, data: new Uint8Array(0), bytes: 0, contentType }
  }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    while (true) {
      const readPromise = reader.read()
      const result = await (timeoutMs > 0
        ? Promise.race([readPromise, createTimeout(timeoutMs, options.signal)])
        : readPromise)

      const { done, value } = result as ReadableStreamReadResult<Uint8Array>
      if (done) {
        break
      }

      if (value) {
        bytes += value.byteLength
        if (bytes > normalizedLimit) {
          await reader.cancel().catch(() => {})
          return createBodyError(
            413,
            `Request body too large (>${formatBytes(normalizedLimit)}). Maximum: ${formatBytes(normalizedLimit)}.`,
            "BODY_TOO_LARGE",
          )
        }
        chunks.push(value)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (message === "Request body read timeout") {
      return createBodyError(408, "Request body read timed out.", "BODY_TIMEOUT")
    }

    if (message === "Request aborted") {
      return createBodyError(400, "Request was aborted.", "BODY_READ_ERROR")
    }

    return createBodyError(400, `Unable to read request body: ${message}`, "BODY_READ_ERROR")
  }

  // Concatenate chunks into a single Uint8Array
  const data = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, data, bytes, contentType }
}

/**
 * Read request body as binary with configurable options.
 *
 * @param req - The incoming request
 * @param options - Configuration options
 * @returns Promise resolving to the body bytes or an error
 */
export async function readRequestBinary(
  req: Request,
  options: ReadBinaryOptions = {},
): Promise<BodyBytesResult> {
  const contentType = req.headers.get("content-type")

  // Validate content type if specified
  if (options.expectedContentTypes?.length) {
    if (!matchesContentType(contentType, options.expectedContentTypes)) {
      return createBodyError(
        415,
        `Invalid Content-Type. Expected: ${options.expectedContentTypes.join(", ")}.`,
        "INVALID_CONTENT_TYPE",
      )
    }
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const result = await readRequestBytesWithLimit(req, maxBytes, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })

  if (!result.ok) {
    return result
  }

  if (options.requireBody && result.bytes === 0) {
    return createBodyError(400, "Request body is required.", "BODY_REQUIRED")
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Body Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a request body as JSON with size limit enforcement.
 * Validates that the body is non-empty and contains valid JSON.
 *
 * @param req - The incoming request
 * @param maxBodyBytes - Maximum allowed body size in bytes
 * @returns Promise resolving to the parsed JSON or an error
 *
 * @example
 *   const result = await parseJsonBodyWithLimit(req, 100_000)
 *   if (!result.ok) {
 *     return new Response(JSON.stringify({ error: result.error }), {
 *       status: result.status,
 *       headers: { "Content-Type": "application/json" },
 *     })
 *   }
 *   const data = result.value
 */
export async function parseJsonBodyWithLimit(
  req: Request,
  maxBodyBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal; reviver?: (key: string, value: unknown) => unknown } = {},
): Promise<JsonBodyResult> {
  const textResult = await readRequestTextWithLimit(req, maxBodyBytes, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  if (!textResult.ok) {
    return textResult
  }

  if (!textResult.text.trim()) {
    return createBodyError(400, "Request body is empty.", "BODY_REQUIRED")
  }

  try {
    const parsed = JSON.parse(textResult.text, options.reviver) as unknown
    return { ok: true, value: parsed, bytes: textResult.bytes, contentType: textResult.contentType }
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : "Invalid JSON"
    return createBodyError(400, `Invalid JSON body: ${message}`, "INVALID_JSON")
  }
}

/**
 * Parse request body as JSON with configurable options.
 *
 * @param req - The incoming request
 * @param options - Configuration options
 * @returns Promise resolving to the parsed JSON or an error
 *
 * @example
 *   const result = await parseJsonBody(req, {
 *     maxBytes: 50_000,
 *     validateContentType: true,
 *   })
 */
export async function parseJsonBody<T = unknown>(
  req: Request,
  options: ParseJsonOptions = {},
): Promise<JsonBodyResult<T>> {
  // Validate Content-Type if requested
  if (options.validateContentType) {
    const contentType = req.headers.get("content-type")
    if (!isJsonContentType(contentType)) {
      return createBodyError(415, "Content-Type must be application/json.", "INVALID_CONTENT_TYPE")
    }
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const result = await parseJsonBodyWithLimit(req, maxBytes, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    reviver: options.reviver,
  })

  if (!result.ok) {
    return result
  }

  // Validate root value type
  if (options.allowArrays === false && Array.isArray(result.value)) {
    return createBodyError(422, "JSON arrays are not allowed as root value.", "VALIDATION_FAILED")
  }

  if (options.allowNull === false && result.value === null) {
    return createBodyError(422, "JSON null is not allowed as root value.", "VALIDATION_FAILED")
  }

  if (options.allowPrimitives === false) {
    const type = typeof result.value
    if (type === "string" || type === "number" || type === "boolean") {
      return createBodyError(422, "JSON primitives are not allowed as root value.", "VALIDATION_FAILED")
    }
  }

  return { ok: true, value: result.value as T, bytes: result.bytes, contentType: result.contentType }
}

/**
 * Parse and validate request body as JSON with a type guard.
 *
 * @param req - The incoming request
 * @param validator - Type guard function to validate the parsed value
 * @param options - Configuration options
 * @returns Promise resolving to the validated JSON or an error
 *
 * @example
 *   const isUser = (v: unknown): v is { name: string } =>
 *     typeof v === "object" && v !== null && "name" in v
 *
 *   const result = await parseValidatedJsonBody(req, isUser, { maxBytes: 10_000 })
 *   if (!result.ok) return createBodyErrorResponse(result)
 *   const user = result.value // typed as { name: string }
 */
export async function parseValidatedJsonBody<T>(
  req: Request,
  validator: JsonValidator<T>,
  options: ParseJsonOptions = {},
): Promise<JsonBodyResult<T>> {
  const result = await parseJsonBody(req, options)
  if (!result.ok) {
    return result
  }

  if (!validator(result.value)) {
    return createBodyError(422, "Request body failed validation.", "VALIDATION_FAILED")
  }

  return { ok: true, value: result.value, bytes: result.bytes, contentType: result.contentType }
}

/**
 * Parse and validate request body as JSON with a validator that returns errors.
 *
 * @param req - The incoming request
 * @param validator - Validator function that returns an error message on failure
 * @param options - Configuration options
 * @returns Promise resolving to the validated JSON or an error
 *
 * @example
 *   const validateUser = (v: unknown) => {
 *     if (typeof v !== "object" || v === null) {
 *       return { ok: false, error: "Expected an object" }
 *     }
 *     if (!("name" in v)) {
 *       return { ok: false, error: "Missing required field: name" }
 *     }
 *     return { ok: true, value: v as { name: string } }
 *   }
 *
 *   const result = await parseValidatedJsonBodyWithError(req, validateUser)
 */
export async function parseValidatedJsonBodyWithError<T>(
  req: Request,
  validator: JsonValidatorWithError<T>,
  options: ParseJsonOptions = {},
): Promise<JsonBodyResult<T>> {
  const result = await parseJsonBody(req, options)
  if (!result.ok) {
    return result
  }

  const validation = validator(result.value)
  if (!validation.ok) {
    return createBodyError(422, validation.error, "VALIDATION_FAILED")
  }

  return { ok: true, value: validation.value, bytes: result.bytes, contentType: result.contentType }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Body Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse request body as URL-encoded form data.
 *
 * @param req - The incoming request
 * @param options - Configuration options
 * @returns Promise resolving to the parsed form data or an error
 *
 * @example
 *   const result = await parseFormBody(req, { validateContentType: true })
 *   if (!result.ok) return createBodyErrorResponse(result)
 *   const { email, password } = result.data
 */
export async function parseFormBody(
  req: Request,
  options: ParseFormOptions = {},
): Promise<FormBodyResult> {
  const contentType = req.headers.get("content-type")

  // Validate Content-Type if requested
  if (options.validateContentType) {
    if (!isFormContentType(contentType)) {
      return createBodyError(
        415,
        "Content-Type must be application/x-www-form-urlencoded or multipart/form-data.",
        "INVALID_CONTENT_TYPE",
      )
    }
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const textResult = await readRequestTextWithLimit(req, maxBytes, {
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  })
  if (!textResult.ok) {
    return textResult
  }

  if (options.requireBody && !textResult.text.trim()) {
    return createBodyError(400, "Request body is required.", "BODY_REQUIRED")
  }

  try {
    const params = new URLSearchParams(textResult.text)
    const data: Record<string, string> = {}
    const maxFields = options.maxFields ?? 100
    const maxFieldLength = options.maxFieldLength ?? 10000
    let fieldCount = 0

    for (const [key, value] of params) {
      fieldCount++
      if (fieldCount > maxFields) {
        return createBodyError(400, `Too many form fields. Maximum: ${maxFields}.`, "TOO_MANY_FIELDS")
      }
      if (value.length > maxFieldLength) {
        return createBodyError(
          400,
          `Field "${key}" exceeds maximum length of ${maxFieldLength} characters.`,
          "VALIDATION_FAILED",
        )
      }
      data[key] = value
    }

    // Check required fields
    if (options.requiredFields?.length) {
      for (const field of options.requiredFields) {
        if (!(field in data) || !data[field].trim()) {
          return createBodyError(400, `Required field "${field}" is missing or empty.`, "VALIDATION_FAILED")
        }
      }
    }

    return { ok: true, data, bytes: textResult.bytes, contentType }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return createBodyError(400, `Invalid form data: ${message}`, "INVALID_FORM_DATA")
  }
}

/**
 * Parse request body as form data and extract specific fields.
 *
 * @param req - The incoming request
 * @param fields - Array of field names to extract
 * @param options - Configuration options
 * @returns Promise resolving to the extracted fields or an error
 *
 * @example
 *   const result = await parseFormFields(req, ["email", "password"])
 *   if (!result.ok) return createBodyErrorResponse(result)
 *   const { email, password } = result.data
 */
export async function parseFormFields<K extends string>(
  req: Request,
  fields: readonly K[],
  options: Omit<ParseFormOptions, "requiredFields"> & { required?: boolean } = {},
): Promise<FormBodyResult & { data: Record<K, string> }> {
  const formResult = await parseFormBody(req, {
    ...options,
    requiredFields: options.required ? [...fields] : undefined,
  })

  if (!formResult.ok) {
    return formResult as FormBodyResult & { data: Record<K, string> }
  }

  const data: Record<K, string> = {} as Record<K, string>
  for (const field of fields) {
    data[field] = formResult.data[field] ?? ""
  }

  return { ok: true, data, bytes: formResult.bytes, contentType: formResult.contentType }
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an error Response from a body parsing result.
 * Useful for quickly returning errors from route handlers.
 *
 * @param result - A failed body parsing result
 * @param options - Additional response options
 * @returns A Response object with appropriate status and error message
 *
 * @example
 *   const result = await parseJsonBodyWithLimit(req, 100_000)
 *   if (!result.ok) {
 *     return createBodyErrorResponse(result)
 *   }
 */
export function createBodyErrorResponse(
  result: { ok: false; status: number; error: string; code?: string },
  options: { headers?: HeadersInit; includeCode?: boolean } = {},
): Response {
  const body: { error: string; code?: string } = { error: result.error }
  if (options.includeCode && result.code) {
    body.code = result.code
  }

  return new Response(
    JSON.stringify(body),
    {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...options.headers,
      },
    },
  )
}

/**
 * Create a success Response from parsed body data.
 * Useful for quickly returning success from route handlers.
 *
 * @param data - The data to include in the response
 * @param options - Additional response options
 * @returns A Response object with the data as JSON
 *
 * @example
 *   return createBodySuccessResponse({ user: result.value })
 */
export function createBodySuccessResponse(
  data: unknown,
  options: { status?: number; headers?: HeadersInit } = {},
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status: options.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...options.headers,
      },
    },
  )
}

/**
 * Create a Response based on a body parsing result.
 * Returns an error response if parsing failed, otherwise processes the data.
 *
 * @param result - The body parsing result
 * @param onSuccess - Function to call with successful data
 * @param options - Additional response options
 * @returns A Response object
 *
 * @example
 *   const result = await parseJsonBody<User>(req)
 *   return handleBodyResult(result, (user) => ({ success: true, id: user.id }))
 */
export async function handleBodyResult<T, R>(
  result: JsonBodyResult<T> | FormBodyResult | BodyTextResult,
  onSuccess: (data: T | Record<string, string> | string) => R | Promise<R>,
  options: { headers?: HeadersInit; includeCode?: boolean } = {},
): Promise<Response> {
  if (!result.ok) {
    return createBodyErrorResponse(result, options)
  }

  const data = "value" in result ? result.value : "data" in result ? result.data : result.text
  const responseData = await onSuccess(data as T | Record<string, string> | string)

  return createBodySuccessResponse(responseData, { headers: options.headers })
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Cloning Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clone a request and read its body, returning both the text and a new request.
 * Useful when you need to read the body but also pass the request to middleware.
 *
 * @param req - The incoming request
 * @param maxBodyBytes - Maximum allowed body size in bytes
 * @param options - Additional options
 * @returns Promise resolving to the body text and cloned request, or an error
 *
 * @example
 *   const result = await cloneAndReadBody(req, 100_000)
 *   if (!result.ok) return createBodyErrorResponse(result)
 *   console.log("Body:", result.text)
 *   const response = await fetch(result.request) // forward the request
 */
export async function cloneAndReadBody(
  req: Request,
  maxBodyBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<
  | { ok: true; text: string; bytes: number; request: Request; contentType: string | null }
  | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }
> {
  const result = await readRequestTextWithLimit(req.clone(), maxBodyBytes, options)
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    text: result.text,
    bytes: result.bytes,
    request: req,
    contentType: result.contentType,
  }
}

/**
 * Clone a request and parse its body as JSON, returning both the value and a new request.
 *
 * @param req - The incoming request
 * @param maxBodyBytes - Maximum allowed body size in bytes
 * @param options - Additional options
 * @returns Promise resolving to the parsed JSON and cloned request, or an error
 */
export async function cloneAndParseJson<T = unknown>(
  req: Request,
  maxBodyBytes: number,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<
  | { ok: true; value: T; bytes: number; request: Request; contentType: string | null }
  | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }
> {
  const result = await parseJsonBodyWithLimit(req.clone(), maxBodyBytes, options)
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    value: result.value as T,
    bytes: result.bytes,
    request: req,
    contentType: result.contentType,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process request body as a stream with chunk callbacks.
 * Useful for processing large uploads without loading everything into memory.
 *
 * @param req - The incoming request
 * @param onChunk - Callback for each chunk of data
 * @param options - Configuration options
 * @returns Promise resolving to the total bytes processed or an error
 *
 * @example
 *   const hash = createHash("sha256")
 *   const result = await streamRequestBody(req, (chunk) => hash.update(chunk), { maxBytes: 10_000_000 })
 *   if (!result.ok) return createBodyErrorResponse(result)
 *   console.log("Hash:", hash.digest("hex"))
 */
export async function streamRequestBody(
  req: Request,
  onChunk: (chunk: Uint8Array) => void | Promise<void>,
  options: ReadBodyOptions = {},
): Promise<{ ok: true; bytes: number } | { ok: false; status: BodyErrorStatus; error: string; code: BodyErrorCode }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const normalizedLimit = normalizeMaxBodyBytes(maxBytes)

  // Early rejection based on Content-Length header
  const contentLengthHeader = req.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > normalizedLimit) {
      return createBodyError(
        413,
        `Request body too large (${formatBytes(contentLength)}). Maximum: ${formatBytes(normalizedLimit)}.`,
        "BODY_TOO_LARGE",
      )
    }
  }

  // Check if body has already been consumed
  if (req.bodyUsed) {
    return createBodyError(400, "Request body has already been consumed.", "BODY_ALREADY_CONSUMED")
  }

  // Handle empty body
  if (!req.body) {
    if (options.requireBody) {
      return createBodyError(400, "Request body is required.", "BODY_REQUIRED")
    }
    return { ok: true, bytes: 0 }
  }

  const reader = req.body.getReader()
  let bytes = 0
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    while (true) {
      const readPromise = reader.read()
      const result = await (timeoutMs > 0
        ? Promise.race([readPromise, createTimeout(timeoutMs, options.signal)])
        : readPromise)

      const { done, value } = result as ReadableStreamReadResult<Uint8Array>
      if (done) {
        break
      }

      if (value) {
        bytes += value.byteLength
        if (bytes > normalizedLimit) {
          await reader.cancel().catch(() => {})
          return createBodyError(
            413,
            `Request body too large (>${formatBytes(normalizedLimit)}). Maximum: ${formatBytes(normalizedLimit)}.`,
            "BODY_TOO_LARGE",
          )
        }

        await onChunk(value)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (message === "Request body read timeout") {
      return createBodyError(408, "Request body read timed out.", "BODY_TIMEOUT")
    }

    if (message === "Request aborted") {
      return createBodyError(400, "Request was aborted.", "BODY_READ_ERROR")
    }

    return createBodyError(400, `Unable to read request body: ${message}`, "BODY_READ_ERROR")
  }

  return { ok: true, bytes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick helper to parse JSON body with common defaults.
 * Validates content type and requires a non-null object.
 *
 * @param req - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes (default: 256KB)
 * @returns Promise resolving to the parsed JSON object or an error
 */
export async function parseJsonObject<T extends Record<string, unknown> = Record<string, unknown>>(
  req: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<JsonBodyResult<T>> {
  return parseJsonBody<T>(req, {
    maxBytes,
    validateContentType: true,
    allowArrays: false,
    allowNull: false,
    allowPrimitives: false,
  })
}

/**
 * Quick helper to parse JSON body allowing arrays.
 *
 * @param req - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes (default: 256KB)
 * @returns Promise resolving to the parsed JSON array or an error
 */
export async function parseJsonArray<T = unknown>(
  req: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<JsonBodyResult<T[]>> {
  const result = await parseJsonBody<T[]>(req, {
    maxBytes,
    validateContentType: true,
    allowNull: false,
  })

  if (result.ok && !Array.isArray(result.value)) {
    return createBodyError(422, "Expected a JSON array.", "VALIDATION_FAILED")
  }

  return result
}

/**
 * Quick helper to read text body with common defaults.
 *
 * @param req - The incoming request
 * @param maxBytes - Maximum allowed body size in bytes (default: 256KB)
 * @returns Promise resolving to the body text or an error
 */
export async function readTextBody(
  req: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<BodyTextResult> {
  return readRequestBody(req, {
    maxBytes,
    requireBody: true,
    allowedContentTypes: [...TEXT_CONTENT_TYPES, ...JSON_CONTENT_TYPES],
  })
}