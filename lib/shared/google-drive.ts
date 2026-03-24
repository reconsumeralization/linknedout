// Google Drive integration utilities
// Provides secure Google Drive API integration with token management and validation
// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 Game-changing features:
//   - Real-time sync with conflict resolution
//   - Intelligent caching with stale-while-revalidate
//   - Circuit breaker pattern for resilience
//   - Event-driven architecture for reactive updates
//   - Batch operations with automatic chunking
//   - Predictive prefetching based on user patterns
// ═══════════════════════════════════════════════════════════════════════════════

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024 // 100MB limit
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes before expiry
export const MAX_RETRIES = 3
export const RETRY_COOLDOWN_MS = 60 * 1000 // 1 minute
const MAX_ERROR_MESSAGE_LENGTH = 500
const MAX_FILENAME_LENGTH = 255
const MAX_FILE_ID_LENGTH = 100
const MAX_EMAIL_LENGTH = 254

// Circuit breaker configuration
export const CIRCUIT_BREAKER_THRESHOLD = 5 // Failures before opening
export const CIRCUIT_BREAKER_RESET_MS = 30 * 1000 // 30 seconds
const CIRCUIT_BREAKER_HALF_OPEN_REQUESTS = 3

// Batch operation limits
export const BATCH_SIZE_LIMIT = 100
const BATCH_BYTES_LIMIT = 10 * 1024 * 1024 // 10MB per batch

// Cache configuration
export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
export const STALE_WHILE_REVALIDATE_MS = 60 * 1000 // 1 minute grace period

export const ALLOWED_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.folder',
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

// Export mappings for Google Workspace to standard formats
export const GOOGLE_EXPORT_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const

// Suppress unused variable warnings
void BATCH_BYTES_LIMIT

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: number
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  webContentLink?: string
  iconLink?: string
  thumbnailLink?: string
  parents?: string[]
  md5Checksum?: string
  sha256Checksum?: string
  shared?: boolean
  starred?: boolean
  trashed?: boolean
  ownedByMe?: boolean
  version?: string
  headRevisionId?: string
}

export interface GoogleDriveFolder {
  id: string
  name: string
  parents?: string[]
  colorRgb?: string
}

export interface GoogleDriveTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
  scope: string
  tokenType?: string
}

export interface GoogleDriveIntegration {
  id: string
  email: string
  displayName?: string
  photoUrl?: string
  status: 'connected' | 'disconnected' | 'syncing' | 'error' | 'expired' | 'pending'
  lastSyncedAt?: Date
  syncEnabled: boolean
  selectedFolders?: string[]
  createdAt: Date
  updatedAt: Date
  tokens?: GoogleDriveTokens
  errorMessage?: string
  errorCode?: string
  retryCount: number
  lastErrorAt?: Date
  quotaBytesUsed?: number
  quotaBytesTotal?: number
  syncCursor?: string // For incremental sync
  watchChannelId?: string // For real-time notifications
  watchExpiration?: Date
}

export type GoogleDriveStatus = GoogleDriveIntegration['status']

export interface GoogleDriveConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: readonly string[]
}

export interface SyncResult {
  success: boolean
  filesProcessed: number
  filesSkipped: number
  bytesProcessed: number
  errors: SyncError[]
  warnings: string[]
  timestamp: Date
  duration: number
  newCursor?: string
  conflicts?: ConflictResolution[]
}

export interface SyncError {
  fileId?: string
  fileName?: string
  code: string
  message: string
  retryable: boolean
}

export interface ListFilesOptions {
  folderId?: string
  pageSize?: number
  pageToken?: string
  mimeType?: string
  query?: string
  orderBy?: 'name' | 'modifiedTime' | 'createdTime' | 'folder'
  includeTrash?: boolean
}

export interface ListFilesResult {
  files: GoogleDriveFile[]
  nextPageToken?: string
  incompleteSearch?: boolean
}

// =============================================================================
// 🆕 ADVANCED TYPES - Circuit Breaker, Caching, Events
// =============================================================================

export type CircuitBreakerState = 'closed' | 'open' | 'half-open'

export interface CircuitBreaker {
  state: CircuitBreakerState
  failureCount: number
  successCount: number
  lastFailureAt?: Date
  lastStateChangeAt: Date
  halfOpenRequests: number
}

export interface CacheEntry<T> {
  data: T
  fetchedAt: Date
  expiresAt: Date
  etag?: string
  isRevalidating: boolean
}

export interface ConflictResolution {
  fileId: string
  fileName: string
  localVersion: string
  remoteVersion: string
  resolution: 'local' | 'remote' | 'merge' | 'skip'
  resolvedAt: Date
}

export interface BatchOperation<T> {
  id: string
  type: 'download' | 'upload' | 'delete' | 'move' | 'copy'
  target: string
  payload?: T
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
}

export interface BatchResult<T> {
  totalOperations: number
  successful: number
  failed: number
  results: Map<string, T | Error>
  duration: number
}

// Event system types
export type GoogleDriveEventType = 
  | 'file:created'
  | 'file:modified'
  | 'file:deleted'
  | 'file:moved'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:failed'
  | 'token:refreshed'
  | 'token:expired'
  | 'quota:warning'
  | 'circuit:opened'
  | 'circuit:closed'

export interface GoogleDriveEvent<T = unknown> {
  type: GoogleDriveEventType
  timestamp: Date
  integrationId: string
  payload: T
  metadata?: Record<string, unknown>
}

export type EventHandler<T = unknown> = (event: GoogleDriveEvent<T>) => void | Promise<void>

// Predictive prefetch types
export interface AccessPattern {
  fileId: string
  accessCount: number
  lastAccessedAt: Date
  averageIntervalMs: number
  predictedNextAccess?: Date
}

export interface PrefetchStrategy {
  enabled: boolean
  maxPrefetchItems: number
  minAccessCount: number
  confidenceThreshold: number
}

// =============================================================================
// CUSTOM ERRORS
// =============================================================================

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'GoogleDriveError'
  }
}

export class TokenExpiredError extends GoogleDriveError {
  constructor(message = 'Google Drive token has expired') {
    super(message, 'TOKEN_EXPIRED', true)
    this.name = 'TokenExpiredError'
  }
}

export class QuotaExceededError extends GoogleDriveError {
  constructor(message = 'Google Drive API quota exceeded') {
    super(message, 'QUOTA_EXCEEDED', true)
    this.name = 'QuotaExceededError'
  }
}

export class InvalidFileError extends GoogleDriveError {
  constructor(message: string, public readonly fileId?: string) {
    super(message, 'INVALID_FILE', false)
    this.name = 'InvalidFileError'
  }
}

export class CircuitBreakerOpenError extends GoogleDriveError {
  constructor(
    message = 'Circuit breaker is open, requests temporarily blocked',
    public readonly resetAt?: Date
  ) {
    super(message, 'CIRCUIT_OPEN', true)
    this.name = 'CircuitBreakerOpenError'
  }
}

export class ConflictError extends GoogleDriveError {
  constructor(
    message: string,
    public readonly localVersion: string,
    public readonly remoteVersion: string
  ) {
    super(message, 'CONFLICT', false)
    this.name = 'ConflictError'
  }
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FILE_ID_REGEX = /^[a-zA-Z0-9_-]+$/

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }
  const trimmed = email.trim()
  return EMAIL_REGEX.test(trimmed) && trimmed.length <= MAX_EMAIL_LENGTH
}

export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'unnamed'
  }
  // Remove potentially dangerous characters and control characters
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '')
    .replace(/\.+$/g, '') // Remove trailing dots
    .trim()
  
  return sanitized.length > 0 ? sanitized.slice(0, MAX_FILENAME_LENGTH) : 'unnamed'
}

export function isAllowedMimeType(mimeType: string): boolean {
  if (!mimeType || typeof mimeType !== 'string') {
    return false
  }
  return ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])
}

export function isGoogleWorkspaceFile(mimeType: string): boolean {
  return mimeType?.startsWith('application/vnd.google-apps.')
}

export function getExportMimeType(googleMimeType: string): string | null {
  return GOOGLE_EXPORT_MIME_TYPES[googleMimeType] || null
}

export function isFileSizeAllowed(size: number | undefined): boolean {
  if (size === undefined) return true
  return Number.isFinite(size) && size >= 0 && size <= MAX_FILE_SIZE_BYTES
}

export function validateFileId(fileId: string): boolean {
  if (!fileId || typeof fileId !== 'string') {
    return false
  }
  return FILE_ID_REGEX.test(fileId) && fileId.length <= MAX_FILE_ID_LENGTH
}

export function validateFile(file: Partial<GoogleDriveFile>): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!file.id || !validateFileId(file.id)) {
    errors.push('Invalid file ID')
  }
  
  if (!file.name || typeof file.name !== 'string') {
    errors.push('Missing or invalid file name')
  }
  
  if (!file.mimeType || typeof file.mimeType !== 'string') {
    errors.push('Missing or invalid MIME type')
  } else if (!isAllowedMimeType(file.mimeType)) {
    errors.push(`Unsupported MIME type: ${file.mimeType}`)
  }
  
  if (!isFileSizeAllowed(file.size)) {
    errors.push(`File size exceeds limit of ${formatFileSize(MAX_FILE_SIZE_BYTES)}`)
  }
  
  return { valid: errors.length === 0, errors }
}

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

export function isTokenExpired(tokens: GoogleDriveTokens | undefined): boolean {
  if (!tokens?.expiresAt) return true
  const expiresAt = tokens.expiresAt instanceof Date 
    ? tokens.expiresAt.getTime() 
    : new Date(tokens.expiresAt).getTime()
  return expiresAt - TOKEN_REFRESH_BUFFER_MS < Date.now()
}

export function isTokenExpiringSoon(tokens: GoogleDriveTokens | undefined, bufferMs = 15 * 60 * 1000): boolean {
  if (!tokens?.expiresAt) return true
  const expiresAt = tokens.expiresAt instanceof Date 
    ? tokens.expiresAt.getTime() 
    : new Date(tokens.expiresAt).getTime()
  return expiresAt - bufferMs < Date.now()
}

export function maskToken(token: string): string {
  if (!token || typeof token !== 'string') return '***'
  if (token.length < 8) return '***'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

export function getTokenExpirationDate(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000)
}

export function hasRequiredScopes(tokenScope: string, requiredScopes: readonly string[]): boolean {
  const grantedScopes = tokenScope.split(' ')
  return requiredScopes.every(scope => grantedScopes.includes(scope))
}

// =============================================================================
// 🆕 CIRCUIT BREAKER PATTERN
// =============================================================================

export function createCircuitBreaker(): CircuitBreaker {
  return {
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    lastStateChangeAt: new Date(),
    halfOpenRequests: 0,
  }
}

export function recordCircuitSuccess(breaker: CircuitBreaker): CircuitBreaker {
  const now = new Date()
  
  if (breaker.state === 'half-open') {
    const newSuccessCount = breaker.successCount + 1
    if (newSuccessCount >= CIRCUIT_BREAKER_HALF_OPEN_REQUESTS) {
      // Transition to closed
      return {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastStateChangeAt: now,
        halfOpenRequests: 0,
      }
    }
    return {
      ...breaker,
      successCount: newSuccessCount,
    }
  }
  
  return {
    ...breaker,
    failureCount: 0,
    successCount: breaker.successCount + 1,
  }
}

export function recordCircuitFailure(breaker: CircuitBreaker): CircuitBreaker {
  const now = new Date()
  
  if (breaker.state === 'half-open') {
    // Immediately open on failure in half-open state
    return {
      state: 'open',
      failureCount: 1,
      successCount: 0,
      lastFailureAt: now,
      lastStateChangeAt: now,
      halfOpenRequests: 0,
    }
  }
  
  const newFailureCount = breaker.failureCount + 1
  
  if (newFailureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    return {
      state: 'open',
      failureCount: newFailureCount,
      successCount: 0,
      lastFailureAt: now,
      lastStateChangeAt: now,
      halfOpenRequests: 0,
    }
  }
  
  return {
    ...breaker,
    failureCount: newFailureCount,
    lastFailureAt: now,
  }
}

export function shouldAllowRequest(breaker: CircuitBreaker): { allowed: boolean; reason?: string } {
  if (breaker.state === 'closed') {
    return { allowed: true }
  }
  
  if (breaker.state === 'open') {
    const timeSinceOpen = Date.now() - breaker.lastStateChangeAt.getTime()
    if (timeSinceOpen >= CIRCUIT_BREAKER_RESET_MS) {
      // Could transition to half-open
      return { allowed: true, reason: 'Transitioning to half-open' }
    }
    const resetAt = new Date(breaker.lastStateChangeAt.getTime() + CIRCUIT_BREAKER_RESET_MS)
    return { 
      allowed: false, 
      reason: `Circuit breaker open until ${resetAt.toLocaleTimeString()}` 
    }
  }
  
  // Half-open: allow limited requests
  if (breaker.halfOpenRequests < CIRCUIT_BREAKER_HALF_OPEN_REQUESTS) {
    return { allowed: true, reason: 'Testing in half-open state' }
  }
  
  return { allowed: false, reason: 'Half-open request limit reached' }
}

export function transitionCircuitState(breaker: CircuitBreaker): CircuitBreaker {
  const now = new Date()
  
  if (breaker.state === 'open') {
    const timeSinceOpen = Date.now() - breaker.lastStateChangeAt.getTime()
    if (timeSinceOpen >= CIRCUIT_BREAKER_RESET_MS) {
      return {
        ...breaker,
        state: 'half-open',
        halfOpenRequests: 0,
        successCount: 0,
        lastStateChangeAt: now,
      }
    }
  }
  
  return breaker
}

// =============================================================================
// 🆕 SMART CACHING WITH STALE-WHILE-REVALIDATE
// =============================================================================

export function createCacheEntry<T>(
  data: T, 
  ttlMs: number = CACHE_TTL_MS,
  etag?: string
): CacheEntry<T> {
  const now = new Date()
  return {
    data,
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
    etag,
    isRevalidating: false,
  }
}

export function isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false
  return entry.expiresAt.getTime() > Date.now()
}

export function isCacheStale<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return true
  return entry.expiresAt.getTime() <= Date.now()
}

export function canServeStale<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false
  const staleDeadline = entry.expiresAt.getTime() + STALE_WHILE_REVALIDATE_MS
  return Date.now() <= staleDeadline
}

export function markAsRevalidating<T>(entry: CacheEntry<T>): CacheEntry<T> {
  return { ...entry, isRevalidating: true }
}

export function getCacheStrategy<T>(
  entry: CacheEntry<T> | undefined
): 'fresh' | 'stale-revalidate' | 'expired' {
  if (isCacheValid(entry)) return 'fresh'
  if (canServeStale(entry)) return 'stale-revalidate'
  return 'expired'
}

// =============================================================================
// 🆕 EVENT SYSTEM
// =============================================================================

type EventListeners = Map<GoogleDriveEventType, Set<EventHandler>>

const globalEventListeners: EventListeners = new Map()

export function addEventListener(
  type: GoogleDriveEventType,
  handler: EventHandler
): () => void {
  if (!globalEventListeners.has(type)) {
    globalEventListeners.set(type, new Set())
  }
  globalEventListeners.get(type)!.add(handler)
  
  // Return unsubscribe function
  return () => {
    globalEventListeners.get(type)?.delete(handler)
  }
}

export function removeEventListener(
  type: GoogleDriveEventType,
  handler: EventHandler
): void {
  globalEventListeners.get(type)?.delete(handler)
}

export async function emitEvent<T>(
  type: GoogleDriveEventType,
  integrationId: string,
  payload: T,
  metadata?: Record<string, unknown>
): Promise<void> {
  const event: GoogleDriveEvent<T> = {
    type,
    timestamp: new Date(),
    integrationId,
    payload,
    metadata,
  }
  
  const handlers = globalEventListeners.get(type)
  if (!handlers) return
  
  const promises = Array.from(handlers).map(handler => {
    try {
      return Promise.resolve(handler(event))
    } catch (error) {
      console.error(`[GoogleDrive] Event handler error for ${type}:`, error)
      return Promise.resolve()
    }
  })
  
  await Promise.allSettled(promises)
}

export function createEventSubscription(
  types: GoogleDriveEventType[],
  handler: EventHandler
): { unsubscribe: () => void } {
  const unsubscribers = types.map(type => addEventListener(type, handler))
  
  return {
    unsubscribe: () => unsubscribers.forEach(unsub => unsub()),
  }
}

// =============================================================================
// 🆕 BATCH OPERATIONS
// =============================================================================

export function createBatchOperation<T>(
  type: BatchOperation<T>['type'],
  target: string,
  payload?: T
): BatchOperation<T> {
  return {
    id: crypto.randomUUID(),
    type,
    target,
    payload,
    status: 'pending',
    progress: 0,
  }
}

export function chunkBatchOperations<T>(
  operations: BatchOperation<T>[],
  maxSize: number = BATCH_SIZE_LIMIT
): BatchOperation<T>[][] {
  const chunks: BatchOperation<T>[][] = []
  
  for (let i = 0; i < operations.length; i += maxSize) {
    chunks.push(operations.slice(i, i + maxSize))
  }
  
  return chunks
}

export function calculateBatchProgress<T>(operations: BatchOperation<T>[]): number {
  if (operations.length === 0) return 100
  
  const totalProgress = operations.reduce((sum, op) => sum + op.progress, 0)
  return Math.round(totalProgress / operations.length)
}

export function createBatchResult<T>(
  operations: BatchOperation<T>[],
  results: Map<string, T | Error>,
  duration: number
): BatchResult<T> {
  let successful = 0
  let failed = 0
  
  results.forEach(result => {
    if (result instanceof Error) {
      failed++
    } else {
      successful++
    }
  })
  
  return {
    totalOperations: operations.length,
    successful,
    failed,
    results,
    duration,
  }
}

// =============================================================================
// 🆕 CONFLICT RESOLUTION
// =============================================================================

export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'newest-wins' | 'manual'

export function detectConflict(
  localFile: GoogleDriveFile,
  remoteFile: GoogleDriveFile
): boolean {
  // No conflict if versions match
  if (localFile.version === remoteFile.version) return false
  if (localFile.headRevisionId === remoteFile.headRevisionId) return false
  
  // Check if checksums match (content is same despite version)
  if (localFile.md5Checksum && remoteFile.md5Checksum) {
    if (localFile.md5Checksum === remoteFile.md5Checksum) return false
  }
  
  return true
}

export function resolveConflict(
  localFile: GoogleDriveFile,
  remoteFile: GoogleDriveFile,
  strategy: ConflictStrategy
): ConflictResolution {
  let resolution: ConflictResolution['resolution']
  
  switch (strategy) {
    case 'local-wins':
      resolution = 'local'
      break
    case 'remote-wins':
      resolution = 'remote'
      break
    case 'newest-wins': {
      const localTime = new Date(localFile.modifiedTime || 0).getTime()
      const remoteTime = new Date(remoteFile.modifiedTime || 0).getTime()
      resolution = localTime >= remoteTime ? 'local' : 'remote'
      break
    }
    case 'manual':
    default:
      resolution = 'skip'
      break
  }
  
  return {
    fileId: localFile.id,
    fileName: localFile.name,
    localVersion: localFile.version || localFile.headRevisionId || 'unknown',
    remoteVersion: remoteFile.version || remoteFile.headRevisionId || 'unknown',
    resolution,
    resolvedAt: new Date(),
  }
}

// =============================================================================
// 🆕 PREDICTIVE PREFETCHING
// =============================================================================

const accessPatterns: Map<string, AccessPattern> = new Map()

export function recordFileAccess(fileId: string): void {
  const now = new Date()
  const existing = accessPatterns.get(fileId)
  
  if (existing) {
    const interval = now.getTime() - existing.lastAccessedAt.getTime()
    const newAverage = existing.accessCount > 1
      ? (existing.averageIntervalMs * (existing.accessCount - 1) + interval) / existing.accessCount
      : interval
    
    accessPatterns.set(fileId, {
      fileId,
      accessCount: existing.accessCount + 1,
      lastAccessedAt: now,
      averageIntervalMs: newAverage,
      predictedNextAccess: new Date(now.getTime() + newAverage),
    })
  } else {
    accessPatterns.set(fileId, {
      fileId,
      accessCount: 1,
      lastAccessedAt: now,
      averageIntervalMs: 0,
    })
  }
}

export function getPrefetchCandidates(
  strategy: PrefetchStrategy
): string[] {
  if (!strategy.enabled) return []
  
  const now = Date.now()
  const candidates: Array<{ fileId: string; score: number }> = []
  
  accessPatterns.forEach((pattern) => {
    if (pattern.accessCount < strategy.minAccessCount) return
    if (!pattern.predictedNextAccess) return
    
    // Calculate confidence based on access count and consistency
    const confidence = Math.min(pattern.accessCount / 10, 1)
    if (confidence < strategy.confidenceThreshold) return
    
    // Score based on how soon we predict the next access
    const timeUntilPredicted = pattern.predictedNextAccess.getTime() - now
    if (timeUntilPredicted > 0 && timeUntilPredicted < 5 * 60 * 1000) {
      // Within 5 minutes of predicted access
      const score = confidence * (1 - timeUntilPredicted / (5 * 60 * 1000))
      candidates.push({ fileId: pattern.fileId, score })
    }
  })
  
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, strategy.maxPrefetchItems)
    .map(c => c.fileId)
}

export function clearAccessPatterns(): void {
  accessPatterns.clear()
}

export function getAccessPattern(fileId: string): AccessPattern | undefined {
  return accessPatterns.get(fileId)
}

// =============================================================================
// 🆕 REAL-TIME SYNC HELPERS
// =============================================================================

export interface ChangeToken {
  startPageToken: string
  fetchedAt: Date
}

export function isChangeTokenStale(
  token: ChangeToken | undefined,
  maxAgeMs: number = 24 * 60 * 60 * 1000 // 24 hours
): boolean {
  if (!token) return true
  return Date.now() - token.fetchedAt.getTime() > maxAgeMs
}

export interface WatchChannel {
  id: string
  resourceId: string
  resourceUri: string
  expiration: Date
  token?: string
}

export function isWatchChannelExpired(channel: WatchChannel | undefined): boolean {
  if (!channel) return true
  // Consider expired if within 1 hour of expiration (time to renew)
  return channel.expiration.getTime() - 60 * 60 * 1000 < Date.now()
}

export function createWatchChannelId(): string {
  return `gdrive-watch-${crypto.randomUUID()}`
}

// =============================================================================
// 🆕 QUOTA MANAGEMENT
// =============================================================================

export interface QuotaInfo {
  used: number
  total: number
  usedPercentage: number
  warningThreshold: number
  criticalThreshold: number
}

export function calculateQuotaInfo(
  bytesUsed: number,
  bytesTotal: number,
  warningPercent: number = 80,
  criticalPercent: number = 95
): QuotaInfo {
  const usedPercentage = bytesTotal > 0 ? (bytesUsed / bytesTotal) * 100 : 0
  
  return {
    used: bytesUsed,
    total: bytesTotal,
    usedPercentage: Math.round(usedPercentage * 100) / 100,
    warningThreshold: warningPercent,
    criticalThreshold: criticalPercent,
  }
}

export function getQuotaStatus(
  quota: QuotaInfo
): 'ok' | 'warning' | 'critical' {
  if (quota.usedPercentage >= quota.criticalThreshold) return 'critical'
  if (quota.usedPercentage >= quota.warningThreshold) return 'warning'
  return 'ok'
}

export function estimateOperationQuota(
  operation: 'upload' | 'download' | 'list' | 'metadata',
  fileSize?: number
): number {
  // Rough estimates of quota units consumed
  const baseQuota: Record<typeof operation, number> = {
    upload: 1,
    download: 1,
    list: 1,
    metadata: 1,
  }
  
  // Large files consume more quota
  if (fileSize && operation === 'upload') {
    return baseQuota[operation] + Math.ceil(fileSize / (10 * 1024 * 1024))
  }
  
  return baseQuota[operation]
}

// =============================================================================
// INTEGRATION MANAGEMENT
// =============================================================================

export function createGoogleDriveIntegration(
  email: string,
  displayName?: string
): GoogleDriveIntegration | null {
  if (!validateEmail(email)) {
    console.error('[GoogleDrive] Invalid email provided for integration')
    return null
  }

  const now = new Date()
  return {
    id: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    displayName: displayName?.trim().slice(0, 100),
    status: 'disconnected',
    syncEnabled: false,
    selectedFolders: [],
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
  }
}

export function updateIntegrationStatus(
  integration: GoogleDriveIntegration,
  status: GoogleDriveStatus,
  options?: { errorMessage?: string; errorCode?: string }
): GoogleDriveIntegration {
  const now = new Date()
  const updated: GoogleDriveIntegration = {
    ...integration,
    status,
    updatedAt: now,
  }

  if (status === 'error') {
    updated.errorMessage = options?.errorMessage?.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    updated.errorCode = options?.errorCode
    updated.lastErrorAt = now
    updated.retryCount = integration.retryCount + 1
  } else if (status === 'connected') {
    updated.errorMessage = undefined
    updated.errorCode = undefined
    updated.retryCount = 0
    updated.lastErrorAt = undefined
  }

  if (status === 'syncing') {
    updated.lastSyncedAt = now
  }

  return updated
}

export function shouldRetry(integration: GoogleDriveIntegration): boolean {
  if (integration.retryCount >= MAX_RETRIES) {
    return false
  }

  if (integration.lastErrorAt) {
    const timeSinceError = Date.now() - new Date(integration.lastErrorAt).getTime()
    // Exponential backoff: 1min, 2min, 4min
    const backoffMs = RETRY_COOLDOWN_MS * Math.pow(2, integration.retryCount)
    return timeSinceError >= backoffMs
  }

  return true
}

export function getNextRetryTime(integration: GoogleDriveIntegration): Date | null {
  if (!shouldRetry(integration) || !integration.lastErrorAt) {
    return null
  }
  const backoffMs = RETRY_COOLDOWN_MS * Math.pow(2, integration.retryCount)
  return new Date(new Date(integration.lastErrorAt).getTime() + backoffMs)
}

export function canStartSync(integration: GoogleDriveIntegration): { allowed: boolean; reason?: string } {
  if (integration.status === 'syncing') {
    return { allowed: false, reason: 'Sync already in progress' }
  }
  
  if (integration.status === 'disconnected') {
    return { allowed: false, reason: 'Integration is disconnected' }
  }
  
  if (integration.status === 'expired') {
    return { allowed: false, reason: 'Session has expired, please reconnect' }
  }
  
  if (integration.status === 'error' && !shouldRetry(integration)) {
    const nextRetry = getNextRetryTime(integration)
    const reason = nextRetry 
      ? `Retry available at ${nextRetry.toLocaleTimeString()}`
      : 'Maximum retry attempts reached'
    return { allowed: false, reason }
  }
  
  if (!integration.syncEnabled) {
    return { allowed: false, reason: 'Sync is disabled for this integration' }
  }
  
  return { allowed: true }
}

// =============================================================================
// DISPLAY UTILITIES
// =============================================================================

export function getStatusDisplayName(status: GoogleDriveStatus): string {
  const names: Record<GoogleDriveStatus, string> = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    syncing: 'Syncing',
    error: 'Error',
    expired: 'Session Expired',
    pending: 'Pending',
  }
  return names[status]
}

export function getStatusColor(status: GoogleDriveStatus): string {
  const colors: Record<GoogleDriveStatus, string> = {
    connected: 'text-green-600',
    disconnected: 'text-gray-500',
    syncing: 'text-blue-500',
    error: 'text-red-600',
    expired: 'text-yellow-600',
    pending: 'text-orange-500',
  }
  return colors[status]
}

export function getStatusBgColor(status: GoogleDriveStatus): string {
  const colors: Record<GoogleDriveStatus, string> = {
    connected: 'bg-green-100',
    disconnected: 'bg-gray-100',
    syncing: 'bg-blue-100',
    error: 'bg-red-100',
    expired: 'bg-yellow-100',
    pending: 'bg-orange-100',
  }
  return colors[status]
}

export function getStatusIcon(status: GoogleDriveStatus): string {
  const icons: Record<GoogleDriveStatus, string> = {
    connected: '✓',
    disconnected: '○',
    syncing: '↻',
    error: '✗',
    expired: '⚠',
    pending: '◔',
  }
  return icons[status]
}

export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'Unknown'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`
}

export function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return 'Never'
  
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (isNaN(timestamp)) return 'Invalid date'
  
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  
  return new Date(timestamp).toLocaleDateString()
}

export function getMimeTypeIcon(mimeType: string): string {
  const icons: Record<string, string> = {
    'application/vnd.google-apps.document': '📄',
    'application/vnd.google-apps.spreadsheet': '📊',
    'application/vnd.google-apps.presentation': '📽️',
    'application/vnd.google-apps.folder': '📁',
    'application/pdf': '📕',
    'text/csv': '📋',
    'text/plain': '📝',
    'application/json': '{}',
    'image/jpeg': '🖼️',
    'image/png': '🖼️',
    'image/gif': '🖼️',
    'image/webp': '🖼️',
  }
  return icons[mimeType] || '📄'
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
}

export function formatQuota(quota: QuotaInfo): string {
  return `${formatFileSize(quota.used)} / ${formatFileSize(quota.total)} (${quota.usedPercentage}%)`
}

// =============================================================================
// ENVIRONMENT & CONFIG
// =============================================================================

export function hasGoogleDriveConfig(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getGoogleDriveConfig(): GoogleDriveConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return null
  }

  // Validate redirect URI format
  try {
    new URL(redirectUri)
  } catch {
    console.error('[GoogleDrive] Invalid redirect URI format')
    return null
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: GOOGLE_DRIVE_SCOPES,
  }
}

export function buildAuthUrl(config: GoogleDriveConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: (config.scopes || GOOGLE_DRIVE_SCOPES).join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  
  if (state) {
    params.set('state', state)
  }
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// =============================================================================
// SYNC UTILITIES
// =============================================================================

export function createSyncResult(partial?: Partial<SyncResult>): SyncResult {
  return {
    success: partial?.success ?? true,
    filesProcessed: partial?.filesProcessed ?? 0,
    filesSkipped: partial?.filesSkipped ?? 0,
    bytesProcessed: partial?.bytesProcessed ?? 0,
    errors: partial?.errors ?? [],
    warnings: partial?.warnings ?? [],
    timestamp: partial?.timestamp ?? new Date(),
    duration: partial?.duration ?? 0,
    newCursor: partial?.newCursor,
    conflicts: partial?.conflicts ?? [],
  }
}

export function mergeSyncResults(results: SyncResult[]): SyncResult {
  return {
    success: results.every(r => r.success),
    filesProcessed: results.reduce((sum, r) => sum + r.filesProcessed, 0),
    filesSkipped: results.reduce((sum, r) => sum + r.filesSkipped, 0),
    bytesProcessed: results.reduce((sum, r) => sum + r.bytesProcessed, 0),
    errors: results.flatMap(r => r.errors),
    warnings: results.flatMap(r => r.warnings),
    timestamp: new Date(),
    duration: results.reduce((sum, r) => sum + r.duration, 0),
    newCursor: results[results.length - 1]?.newCursor,
    conflicts: results.flatMap(r => r.conflicts ?? []),
  }
}

// =============================================================================
// 🆕 UTILITY HOOKS FOR REACT INTEGRATION
// =============================================================================

export interface UseGoogleDriveOptions {
  autoRefreshToken?: boolean
  enablePrefetch?: boolean
  cacheEnabled?: boolean
  onError?: (error: GoogleDriveError) => void
  onTokenRefresh?: (tokens: GoogleDriveTokens) => void
}

export function createDefaultOptions(): UseGoogleDriveOptions {
  return {
    autoRefreshToken: true,
    enablePrefetch: true,
    cacheEnabled: true,
  }
}
