// Email integration utilities
// Core types and helpers for multi-provider email integrations and sync.

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

export const EMAIL_PROVIDERS = ["gmail", "outlook", "imap", "other"] as const
export const EMAIL_STATUSES = ["connected", "disconnected", "syncing", "error", "pending"] as const
export const AUTH_CREDENTIAL_KINDS = ["oauth", "password", "appPassword", "accessToken"] as const
export const MAILBOX_KINDS = ["label", "folder"] as const

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_EMAIL = 20
export const SYNC_INTERVAL_MS = 5 * 60 * 1000
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const MAX_RETRIES = 3
export const RETRY_DELAY_MS = 1000
export const MAX_EMAIL_SUBJECT_LENGTH = 998
export const MAX_EMAIL_BODY_LENGTH = 10 * 1024 * 1024

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type EmailProvider = typeof EMAIL_PROVIDERS[number]
export type EmailStatus = typeof EMAIL_STATUSES[number]
export type EmailAuthKind = typeof AUTH_CREDENTIAL_KINDS[number]
export type MailboxKind = typeof MAILBOX_KINDS[number]
export type EmailPriority = "high" | "normal" | "low"
export type OAuthTokenType = "Bearer" | "MAC" | string
export type SyncProgressStatus = "idle" | "syncing" | "completed" | "failed"
export type IntegrationId = string & { readonly __brand: "IntegrationId" }
export type ThreadId = string & { readonly __brand: "ThreadId" }
export type MessageId = string & { readonly __brand: "MessageId" }
export type MailboxId = string & { readonly __brand: "MailboxId" }
export type AttachmentId = string & { readonly __brand: "AttachmentId" }

export interface EmailIntegrationConfig {
  maxSyncItems?: number
  syncFolders?: string[]
  excludeFolders?: string[]
  syncAttachments?: boolean
  maxAttachmentSizeBytes?: number
  maxAttachmentsPerEmail?: number
  archiveAfterDays?: number
  syncIntervalMs?: number
}

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scope?: string[]
  tokenType?: OAuthTokenType
  idToken?: string
}

export type AuthCredential =
  | { kind: "oauth"; tokens: OAuthTokens }
  | { kind: "password"; username: string; password: string }
  | { kind: "appPassword" | "accessToken"; token: string }

export interface EmailIntegration {
  id: IntegrationId
  userId: string
  email: string
  displayName?: string
  provider: EmailProvider
  status: EmailStatus
  lastSyncedAt?: Date
  nextSyncAt?: Date
  syncEnabled: boolean
  syncError?: string
  syncErrorCount: number
  lastFailedSyncAttempt?: Date
  config: EmailIntegrationConfig
  auth?: AuthCredential
  // Legacy compatibility
  tokens?: OAuthTokens
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface EmailAddress {
  email: string
  name?: string
}

export interface EmailMailbox {
  id: MailboxId
  integrationId: IntegrationId
  name: string
  kind: MailboxKind
  color?: string
  type: "system" | "user" | "custom"
  messageCount?: number
  unreadCount?: number
  parentId?: string
  isHidden?: boolean
}

// Backward-compatible alias.
export type EmailLabel = EmailMailbox

export interface EmailThread {
  id: ThreadId
  integrationId: IntegrationId
  subject: string
  participants: EmailAddress[]
  messageCount: number
  lastMessageAt: Date
  isRead: boolean
  mailboxes?: string[]
  // Legacy compatibility
  labels?: string[]
  snippet?: string
}

export interface EmailAttachment {
  id: AttachmentId
  messageId: MessageId
  filename: string
  mimeType: string
  size: number
  contentId?: string
  isInline: boolean
  contentDisposition?: "inline" | "attachment"
  url?: string
  thumbnailUrl?: string
  checksum?: string
  storageLocation?: "local" | "s3" | "external"
  virusScanStatus?: "clean" | "infected" | "pending" | "failed"
  downloadCount?: number
}

export interface EmailAttachmentPayload {
  filename: string
  mimeType: string
  size: number
  contentId?: string
  isInline: boolean
  contentDisposition?: "inline" | "attachment"
  url?: string
  storageLocation?: "local" | "s3" | "external"
  checksum?: string
  contentBase64?: string
}

export interface EmailMessage {
  id: MessageId
  integrationId: IntegrationId
  threadId?: ThreadId
  messageId?: string
  inReplyTo?: string
  references?: string[]
  subject: string
  from: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  replyTo?: EmailAddress
  body: string
  htmlBody?: string
  snippet?: string
  receivedAt: Date
  sentAt?: Date
  isRead: boolean
  isStarred: boolean
  isArchived: boolean
  isDraft: boolean
  isSpam: boolean
  isTrash: boolean
  mailboxes?: string[]
  // Legacy compatibility
  labels?: string[]
  folder?: string
  priority?: EmailPriority
  attachments?: EmailAttachment[]
  headers?: Record<string, string>
  rawSize?: number
}

export interface EmailSearchQuery {
  text?: string
  from?: string
  to?: string
  subject?: string
  hasAttachment?: boolean
  mailboxIds?: string[]
  isRead?: boolean
  isStarred?: boolean
  dateFrom?: Date
  dateTo?: Date
  limit?: number
  offset?: number
}

export interface SendEmailPayload {
  integrationId: IntegrationId
  from?: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  replyTo?: EmailAddress
  subject: string
  body: string
  htmlBody?: string
  attachments?: EmailAttachmentPayload[]
  threadId?: ThreadId
  inReplyTo?: string
  references?: string[]
}

export interface EmailSyncProgress {
  integrationId: IntegrationId
  status: SyncProgressStatus
  totalItems: number
  processedItems: number
  startedAt?: Date
  completedAt?: Date
  error?: string
  currentPageToken?: string | null
  nextPageToken?: string | null
  syncToken?: string
  lastHistoryId?: string
  isPartialSync?: boolean
}

// =============================================================================
// VALIDATION
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function asIntegrationId(value: string): IntegrationId {
  return value as IntegrationId
}

function asMessageId(value: string): MessageId {
  return value as MessageId
}

function asMailboxId(value: string): MailboxId {
  return value as MailboxId
}

function asAttachmentId(value: string): AttachmentId {
  return value as AttachmentId
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}

export function isValidProvider(provider: string): provider is EmailProvider {
  return EMAIL_PROVIDERS.includes(provider as EmailProvider)
}

export function isValidStatus(status: string): status is EmailStatus {
  return EMAIL_STATUSES.includes(status as EmailStatus)
}

export function validateEmailIntegration(integration: Partial<EmailIntegration>): string[] {
  const errors: string[] = []

  if (!integration.email || !isValidEmail(integration.email)) {
    errors.push("Invalid email address")
  }

  if (integration.provider && !isValidProvider(integration.provider)) {
    errors.push("Invalid email provider")
  }

  if (integration.status && !isValidStatus(integration.status)) {
    errors.push("Invalid integration status")
  }

  if (integration.syncErrorCount !== undefined && integration.syncErrorCount < 0) {
    errors.push("syncErrorCount cannot be negative")
  }

  if (integration.config?.maxSyncItems !== undefined && integration.config.maxSyncItems <= 0) {
    errors.push("maxSyncItems must be greater than 0")
  }

  if (
    integration.config?.maxAttachmentSizeBytes !== undefined &&
    integration.config.maxAttachmentSizeBytes <= 0
  ) {
    errors.push("maxAttachmentSizeBytes must be greater than 0")
  }

  if (
    integration.config?.maxAttachmentsPerEmail !== undefined &&
    integration.config.maxAttachmentsPerEmail <= 0
  ) {
    errors.push("maxAttachmentsPerEmail must be greater than 0")
  }

  if (integration.auth?.kind === "oauth" && !integration.auth.tokens.accessToken) {
    errors.push("OAuth credentials must include an access token")
  }

  return errors
}

export function assertValidEmailIntegration(integration: Partial<EmailIntegration>): void {
  const errors = validateEmailIntegration(integration)
  if (errors.length > 0) {
    throw new Error(`Email integration validation failed:\n- ${errors.join("\n- ")}`)
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createEmailIntegration(
  userId: string,
  email: string,
  provider: EmailProvider,
  options?: Partial<EmailIntegrationConfig>,
  auth?: AuthCredential,
): EmailIntegration {
  const now = new Date()

  const config: EmailIntegrationConfig = {
    maxSyncItems: 1000,
    syncAttachments: true,
    syncIntervalMs: SYNC_INTERVAL_MS,
    maxAttachmentSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
    maxAttachmentsPerEmail: MAX_ATTACHMENTS_PER_EMAIL,
    ...options,
  }

  return {
    id: asIntegrationId(crypto.randomUUID()),
    userId,
    email,
    provider,
    status: "pending",
    syncEnabled: false,
    syncErrorCount: 0,
    config,
    auth,
    tokens: auth?.kind === "oauth" ? auth.tokens : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export function createEmailMessage(
  integrationId: string,
  from: EmailAddress,
  to: EmailAddress[],
  subject: string,
  body: string,
  options?: Partial<EmailMessage>,
): EmailMessage {
  const now = new Date()
  return {
    id: asMessageId(crypto.randomUUID()),
    integrationId: asIntegrationId(integrationId),
    subject: sanitizeEmailSubject(subject).slice(0, MAX_EMAIL_SUBJECT_LENGTH),
    from,
    to,
    body: body.slice(0, MAX_EMAIL_BODY_LENGTH),
    receivedAt: now,
    isRead: false,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    isSpam: false,
    isTrash: false,
    ...options,
  }
}

export function createEmailAttachment(
  messageId: string,
  filename: string,
  mimeType: string,
  size: number,
  options?: Partial<EmailAttachment>,
): EmailAttachment {
  return {
    id: asAttachmentId(crypto.randomUUID()),
    messageId: asMessageId(messageId),
    filename,
    mimeType,
    size,
    isInline: false,
    contentDisposition: "attachment",
    virusScanStatus: "pending",
    downloadCount: 0,
    ...options,
  }
}

export function createEmailMailbox(
  integrationId: string,
  name: string,
  kind: MailboxKind,
  options?: Partial<EmailMailbox>,
): EmailMailbox {
  return {
    id: asMailboxId(crypto.randomUUID()),
    integrationId: asIntegrationId(integrationId),
    name,
    kind,
    type: "user",
    ...options,
  }
}

// Backward-compatible label factory.
export function createEmailLabel(
  integrationId: string,
  name: string,
  options?: Partial<EmailLabel>,
): EmailLabel {
  return createEmailMailbox(integrationId, name, "label", options)
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

export function getProviderDisplayName(provider: EmailProvider): string {
  const names: Record<EmailProvider, string> = {
    gmail: "Gmail",
    outlook: "Outlook",
    imap: "IMAP",
    other: "Other",
  }
  return names[provider]
}

export function getProviderIcon(provider: EmailProvider): string {
  const icons: Record<EmailProvider, string> = {
    gmail: "gmail",
    outlook: "outlook",
    imap: "imap",
    other: "mail",
  }
  return icons[provider]
}

export function getStatusDisplayName(status: EmailStatus): string {
  const names: Record<EmailStatus, string> = {
    connected: "Connected",
    disconnected: "Disconnected",
    syncing: "Syncing",
    error: "Error",
    pending: "Pending Setup",
  }
  return names[status]
}

export function getStatusColor(status: EmailStatus): string {
  const colors: Record<EmailStatus, string> = {
    connected: "green",
    disconnected: "gray",
    syncing: "blue",
    error: "red",
    pending: "yellow",
  }
  return colors[status]
}

export function formatEmailAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email
}

export function parseEmailAddress(raw: string): EmailAddress {
  const match = raw.match(/^(?:"?(.+?)"?\s*)?<(.+?)>$/)
  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].trim(),
    }
  }
  return { email: raw.trim() }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function sanitizeEmailSubject(subject: string): string {
  const sanitized = subject.replace(/[\\/:*?"<>|]/g, "_").trim()
  return sanitized.slice(0, 200) || "email"
}

// =============================================================================
// ATTACHMENT & MAILBOX UTILITIES
// =============================================================================

export function getAttachmentLimits(config?: EmailIntegrationConfig): {
  maxAttachmentSizeBytes: number
  maxAttachmentsPerEmail: number
} {
  return {
    maxAttachmentSizeBytes: config?.maxAttachmentSizeBytes || MAX_ATTACHMENT_SIZE_BYTES,
    maxAttachmentsPerEmail: config?.maxAttachmentsPerEmail || MAX_ATTACHMENTS_PER_EMAIL,
  }
}

export function isAttachmentAllowed(
  attachment: Pick<EmailAttachment, "size">,
  existingCount: number,
  config?: EmailIntegrationConfig,
): boolean {
  const limits = getAttachmentLimits(config)
  return attachment.size <= limits.maxAttachmentSizeBytes && existingCount < limits.maxAttachmentsPerEmail
}

export function normalizeMailboxNames(message: Pick<EmailMessage, "mailboxes" | "labels" | "folder">): string[] {
  if (message.mailboxes && message.mailboxes.length > 0) {
    return message.mailboxes
  }
  if (message.labels && message.labels.length > 0) {
    return message.labels
  }
  if (message.folder) {
    return [message.folder]
  }
  return []
}

// =============================================================================
// SYNC UTILITIES
// =============================================================================

export function shouldRefreshToken(tokensOrCredential: OAuthTokens | AuthCredential | undefined): boolean {
  let tokens: OAuthTokens | undefined

  if (!tokensOrCredential) {
    return true
  }

  if ("kind" in tokensOrCredential) {
    if (tokensOrCredential.kind !== "oauth") {
      return false
    }
    tokens = tokensOrCredential.tokens
  } else {
    tokens = tokensOrCredential
  }

  if (!tokens.expiresAt) {
    return true
  }

  const bufferTime = new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS)
  return tokens.expiresAt <= bufferTime
}

export function calculateNextSyncTime(lastSyncAt: Date, intervalMs = SYNC_INTERVAL_MS): Date {
  return new Date(lastSyncAt.getTime() + intervalMs)
}

export function canRetrySync(integration: EmailIntegration, maxRetries = MAX_RETRIES): boolean {
  return integration.syncErrorCount < maxRetries
}

export function calculateRetryDelay(errorCount: number, baseDelayMs = RETRY_DELAY_MS): number {
  const exponent = Math.max(0, errorCount - 1)
  return baseDelayMs * 2 ** exponent
}

export function updateIntegrationStatus(
  integration: EmailIntegration,
  status: EmailStatus,
  error?: string,
): EmailIntegration {
  const now = new Date()
  const syncIntervalMs = integration.config.syncIntervalMs || SYNC_INTERVAL_MS

  return {
    ...integration,
    status,
    syncError: error,
    syncErrorCount: status === "error" ? integration.syncErrorCount + 1 : 0,
    lastFailedSyncAttempt: status === "error" ? now : integration.lastFailedSyncAttempt,
    lastSyncedAt: status === "connected" ? now : integration.lastSyncedAt,
    nextSyncAt: status === "connected" ? calculateNextSyncTime(now, syncIntervalMs) : undefined,
    updatedAt: now,
  }
}

export function createSyncProgress(integrationId: string): EmailSyncProgress {
  return {
    integrationId: asIntegrationId(integrationId),
    status: "idle",
    totalItems: 0,
    processedItems: 0,
    currentPageToken: null,
    nextPageToken: null,
    isPartialSync: false,
  }
}

export function updateSyncProgress(
  progress: EmailSyncProgress,
  patch: Partial<EmailSyncProgress>,
): EmailSyncProgress {
  return {
    ...progress,
    ...patch,
  }
}

export function getSyncProgress(progress: EmailSyncProgress): number {
  if (progress.totalItems <= 0) {
    return 0
  }
  return Math.round((progress.processedItems / progress.totalItems) * 100)
}

export function isSyncDue(integration: EmailIntegration): boolean {
  if (!integration.syncEnabled || !integration.nextSyncAt) {
    return false
  }
  return integration.nextSyncAt <= new Date()
}
