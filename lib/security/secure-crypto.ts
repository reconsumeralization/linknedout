import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto"

// ============================================================================
// Constants
// ============================================================================

const ENCRYPTION_VERSION = "v1"
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32
const SEGMENT_DELIMITER = ":"

// ============================================================================
// Error Types
// ============================================================================

export class CryptoError extends Error {
  constructor(
    message: string,
    public readonly code: CryptoErrorCode,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = "CryptoError"
  }
}

export type CryptoErrorCode =
  | "MISSING_KEY"
  | "INVALID_PAYLOAD"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "DECRYPTION_FAILED"
  | "SERIALIZATION_FAILED"

// ============================================================================
// Key Management
// ============================================================================

let cachedKey: Buffer | null = null

function getRawEncryptionSecret(): string | null {
  const value = process.env.EMAIL_TOKEN_ENCRYPTION_KEY
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getDerivedKey(): Buffer {
  if (cachedKey) {
    return cachedKey
  }

  const rawSecret = getRawEncryptionSecret()
  if (!rawSecret) {
    throw new CryptoError(
      "Missing EMAIL_TOKEN_ENCRYPTION_KEY environment variable.",
      "MISSING_KEY"
    )
  }

  cachedKey = createHash("sha256").update(rawSecret).digest()
  
  if (cachedKey.length !== KEY_BYTES) {
    throw new CryptoError(
      "Derived key has unexpected length.",
      "MISSING_KEY"
    )
  }

  return cachedKey
}

/**
 * Clear the cached encryption key. Useful for testing or key rotation scenarios.
 */
export function clearKeyCache(): void {
  cachedKey = null
}

// ============================================================================
// Encoding Utilities
// ============================================================================

function encodeSegment(value: Buffer): string {
  return value.toString("base64url")
}

function decodeSegment(value: string): Buffer {
  if (!value || typeof value !== "string") {
    throw new CryptoError("Invalid segment: empty or not a string.", "INVALID_FORMAT")
  }
  return Buffer.from(value, "base64url")
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if email credential encryption is enabled (key is configured).
 */
export function isEmailCredentialEncryptionEnabled(): boolean {
  return Boolean(getRawEncryptionSecret())
}

/**
 * Encrypt a JSON-serializable value using AES-256-GCM.
 * 
 * @param value - Any JSON-serializable value
 * @returns Encrypted string in format: "v1:iv:authTag:ciphertext"
 * @throws CryptoError if encryption fails or key is missing
 */
export function encryptJsonValue(value: unknown): string {
  if (value === undefined) {
    throw new CryptoError(
      "Cannot encrypt undefined value.",
      "SERIALIZATION_FAILED"
    )
  }

  let plaintext: Buffer
  try {
    plaintext = Buffer.from(JSON.stringify(value), "utf8")
  } catch (err) {
    throw new CryptoError(
      "Failed to serialize value to JSON.",
      "SERIALIZATION_FAILED",
      err
    )
  }

  const iv = randomBytes(IV_BYTES)
  const key = getDerivedKey()
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES })

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_VERSION,
    encodeSegment(iv),
    encodeSegment(authTag),
    encodeSegment(ciphertext),
  ].join(SEGMENT_DELIMITER)
}

/**
 * Decrypt a value that was encrypted with encryptJsonValue.
 * 
 * @param encrypted - Encrypted string from encryptJsonValue
 * @returns Decrypted and parsed JSON value
 * @throws CryptoError if decryption fails, format is invalid, or key is missing
 */
export function decryptJsonValue<T>(encrypted: string): T {
  if (!encrypted || typeof encrypted !== "string") {
    throw new CryptoError(
      "Encrypted payload is missing or not a string.",
      "INVALID_PAYLOAD"
    )
  }

  const parts = encrypted.split(SEGMENT_DELIMITER)
  if (parts.length !== 4) {
    throw new CryptoError(
      `Invalid encrypted payload format: expected 4 segments, got ${parts.length}.`,
      "INVALID_FORMAT"
    )
  }

  const [version, ivSegment, authTagSegment, ciphertextSegment] = parts

  if (version !== ENCRYPTION_VERSION) {
    throw new CryptoError(
      `Unsupported encrypted payload version: ${version}. Expected: ${ENCRYPTION_VERSION}.`,
      "UNSUPPORTED_VERSION"
    )
  }

  const key = getDerivedKey()
  const iv = decodeSegment(ivSegment)
  const authTag = decodeSegment(authTagSegment)
  const ciphertext = decodeSegment(ciphertextSegment)

  // Validate segment lengths
  if (iv.length !== IV_BYTES) {
    throw new CryptoError(
      `Invalid IV length: expected ${IV_BYTES}, got ${iv.length}.`,
      "INVALID_FORMAT"
    )
  }

  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new CryptoError(
      `Invalid auth tag length: expected ${AUTH_TAG_BYTES}, got ${authTag.length}.`,
      "INVALID_FORMAT"
    )
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    })
    decipher.setAuthTag(authTag)

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return JSON.parse(plaintext.toString("utf8")) as T
  } catch (err) {
    // Don't leak specific crypto errors - could aid attackers
    throw new CryptoError(
      "Failed to decrypt payload. The data may be corrupted or the key may have changed.",
      "DECRYPTION_FAILED",
      err
    )
  }
}

/**
 * Verify if a given string appears to be an encrypted payload from this module.
 * Does NOT validate the encryption - only checks format.
 */
export function isEncryptedPayload(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false
  }

  const parts = value.split(SEGMENT_DELIMITER)
  return parts.length === 4 && parts[0] === ENCRYPTION_VERSION
}

/**
 * Timing-safe comparison of two encrypted payloads.
 * Useful for checking if two encrypted values are identical without revealing timing information.
 */
export function compareEncryptedPayloads(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false
  }

  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")

  if (bufA.length !== bufB.length) {
    return false
  }

  return timingSafeEqual(bufA, bufB)
}
