import "server-only"

import { randomUUID } from "node:crypto"

import { z } from "zod"

import type {
  AuthCredential,
  EmailAddress,
  EmailProvider,
  SendEmailPayload,
} from "@/lib/email/email-intergrations"
import { isValidEmail, isValidProvider } from "@/lib/email/email-intergrations"
import {
  saveDraftThroughProvider,
  sendThroughProvider,
  syncProviderMessages,
  type ProviderSyncCursor,
} from "@/lib/email/email-provider-adapters"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { decryptJsonValue, encryptJsonValue, isEmailCredentialEncryptionEnabled } from "@/lib/security/secure-crypto"

type JsonObject = Record<string, unknown>

const MAX_MESSAGE_QUERY_LIMIT = 200
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000

const TABLES = {
  integrations: process.env.SUPABASE_EMAIL_INTEGRATIONS_TABLE || "email_integrations",
  secrets: process.env.SUPABASE_EMAIL_SECRETS_TABLE || "email_integration_secrets",
  mailboxes: process.env.SUPABASE_EMAIL_MAILBOXES_TABLE || "email_mailboxes",
  messages: process.env.SUPABASE_EMAIL_MESSAGES_TABLE || "email_messages",
  attachments: process.env.SUPABASE_EMAIL_ATTACHMENTS_TABLE || "email_attachments",
  syncRuns: process.env.SUPABASE_EMAIL_SYNC_RUNS_TABLE || "email_sync_runs",
}

const OAuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z
    .preprocess((value) => {
      if (typeof value === "string") {
        const parsed = new Date(value)
        return Number.isNaN(parsed.getTime()) ? undefined : parsed
      }
      return value
    }, z.date())
    .optional(),
  scope: z.array(z.string()).optional(),
  tokenType: z.string().optional(),
  idToken: z.string().optional(),
})

const AuthCredentialSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("oauth"),
    tokens: OAuthTokensSchema,
  }),
  z.object({
    kind: z.literal("password"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({
    kind: z.literal("appPassword"),
    token: z.string().min(1),
  }),
  z.object({
    kind: z.literal("accessToken"),
    token: z.string().min(1),
  }),
])

export const EmailIntegrationCreateSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().max(160).optional(),
  provider: z.enum(["gmail", "outlook", "imap", "other"]),
  syncEnabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  auth: AuthCredentialSchema.optional(),
})

export const EmailIntegrationUpdateSchema = z.object({
  displayName: z.string().max(160).optional(),
  syncEnabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  auth: AuthCredentialSchema.optional(),
  status: z.enum(["connected", "disconnected", "syncing", "error", "pending"]).optional(),
})

export const MessageSearchSchema = z.object({
  integrationId: z.string().uuid().optional(),
  text: z.string().max(500).optional(),
  isDraft: z.boolean().optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_MESSAGE_QUERY_LIMIT).optional(),
})

const EmailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
})

const EmailAttachmentSchema = z.object({
  filename: z.string().max(400),
  mimeType: z.string().max(200),
  size: z.number().int().min(0),
  contentId: z.string().max(300).optional(),
  isInline: z.boolean(),
  contentDisposition: z.enum(["inline", "attachment"]).optional(),
  url: z.string().max(1000).optional(),
  storageLocation: z.enum(["local", "s3", "external"]).optional(),
  checksum: z.string().max(300).optional(),
  contentBase64: z.string().max(35_000_000).optional(),
})

const RecipientListSchema = z.array(EmailAddressSchema).max(200)

const BaseComposePayloadSchema = z.object({
  integrationId: z.string().uuid(),
  from: EmailAddressSchema.optional(),
  to: RecipientListSchema,
  cc: RecipientListSchema.optional(),
  bcc: RecipientListSchema.optional(),
  replyTo: EmailAddressSchema.optional(),
  subject: z.string().max(998),
  body: z.string().max(10_000_000),
  htmlBody: z.string().max(10_000_000).optional(),
  attachments: z.array(EmailAttachmentSchema).max(20).optional(),
  threadId: z.string().max(300).optional(),
  inReplyTo: z.string().max(300).optional(),
  references: z.array(z.string().max(300)).max(100).optional(),
})

export const SendEmailPayloadSchema = BaseComposePayloadSchema.extend({
  to: RecipientListSchema.min(1),
})

export const SaveDraftPayloadSchema = BaseComposePayloadSchema.extend({
  draftId: z.string().uuid().optional(),
})

type SaveDraftPayload = SendEmailPayload & {
  draftId?: string
}

export const SendOrDraftRequestSchema = z.object({
  action: z.enum(["send", "draft"]),
  payload: z.unknown(),
})

export interface EmailIntegrationView {
  id: string
  email: string
  displayName?: string
  provider: EmailProvider
  status: "connected" | "disconnected" | "syncing" | "error" | "pending"
  syncEnabled: boolean
  syncError?: string
  syncErrorCount: number
  lastSyncedAt?: string
  nextSyncAt?: string
  lastFailedSyncAttempt?: string
  config: JsonObject
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export interface EmailAttachmentView {
  id?: string
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
  contentBase64?: string
}

export interface EmailMessageView {
  id: string
  integrationId: string
  subject: string
  snippet?: string
  from: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  replyTo?: EmailAddress
  body: string
  htmlBody?: string
  receivedAt: string
  sentAt?: string
  isRead: boolean
  isStarred: boolean
  isArchived: boolean
  isDraft: boolean
  isSpam: boolean
  isTrash: boolean
  mailboxes: string[]
  mailboxesById: string[]
  messageId?: string
  threadId?: string
  priority?: "high" | "normal" | "low"
  attachments?: EmailAttachmentView[]
  updatedAt: string
}

class EmailServiceError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value
  }
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject
  }
  return {}
}

function asAddress(value: unknown): EmailAddress {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const email = asString(parsed.email)
  return {
    email: email || "unknown@example.com",
    name: asString(parsed.name) || undefined,
  }
}

function asAddressArray(value: unknown): EmailAddress[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => asAddress(item))
    .filter((item) => item.email.length > 0)
}

function asAttachmentView(value: unknown): EmailAttachmentView | null {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const filename = asString(parsed.filename)
  if (!filename) {
    return null
  }

  return {
    id: asString(parsed.id) || undefined,
    filename,
    mimeType: asString(parsed.mimeType || parsed.mime_type, "application/octet-stream"),
    size: asNumber(parsed.size, 0),
    contentId: asString(parsed.contentId || parsed.content_id) || undefined,
    isInline: asBoolean(parsed.isInline ?? parsed.is_inline),
    contentDisposition:
      (asString(parsed.contentDisposition || parsed.content_disposition) as EmailAttachmentView["contentDisposition"]) ||
      undefined,
    url: asString(parsed.url) || undefined,
    thumbnailUrl: asString(parsed.thumbnailUrl || parsed.thumbnail_url) || undefined,
    checksum: asString(parsed.checksum) || undefined,
    storageLocation:
      (asString(parsed.storageLocation || parsed.storage_location) as EmailAttachmentView["storageLocation"]) ||
      undefined,
    virusScanStatus:
      (asString(parsed.virusScanStatus || parsed.virus_scan_status) as EmailAttachmentView["virusScanStatus"]) ||
      undefined,
    downloadCount: asNumber(parsed.downloadCount || parsed.download_count, 0),
    contentBase64: asString(parsed.contentBase64 || parsed.content_base64) || undefined,
  }
}

function asAttachmentArray(value: unknown): EmailAttachmentView[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => asAttachmentView(item))
    .filter((item): item is EmailAttachmentView => item !== null)
}

function normalizeAddressArray(value: EmailAddress[] | undefined): EmailAddress[] {
  return (value || [])
    .map((item) => ({
      email: item.email.trim().toLowerCase(),
      name: item.name?.trim() || undefined,
    }))
    .filter((item) => item.email.length > 0)
}

function normalizeAttachmentArray(
  value: SendEmailPayload["attachments"],
): NonNullable<SendEmailPayload["attachments"]> {
  return (value || [])
    .map((item) => ({
      filename: item.filename.trim(),
      mimeType: item.mimeType.trim() || "application/octet-stream",
      size: Number.isFinite(item.size) ? item.size : 0,
      contentId: item.contentId?.trim() || undefined,
      isInline: Boolean(item.isInline),
      contentDisposition: item.contentDisposition ?? (item.isInline ? "inline" : "attachment"),
      url: item.url?.trim() || undefined,
      storageLocation: item.storageLocation,
      checksum: item.checksum?.trim() || undefined,
      contentBase64: item.contentBase64?.trim() || undefined,
    }))
    .filter((item) => item.filename.length > 0)
}

function ensureProvider(value: unknown): EmailProvider {
  const provider = asString(value)
  if (!isValidProvider(provider)) {
    throw new EmailServiceError("Unsupported email provider.", 400)
  }
  return provider
}

function mapIntegrationRow(row: Record<string, unknown>): EmailIntegrationView {
  return {
    id: asString(row.id),
    email: asString(row.email),
    displayName: asString(row.display_name) || undefined,
    provider: ensureProvider(row.provider),
    status:
      asString(row.status, "pending") as EmailIntegrationView["status"],
    syncEnabled: asBoolean(row.sync_enabled),
    syncError: asString(row.sync_error) || undefined,
    syncErrorCount: asNumber(row.sync_error_count, 0),
    lastSyncedAt: asString(row.last_synced_at) || undefined,
    nextSyncAt: asString(row.next_sync_at) || undefined,
    lastFailedSyncAttempt: asString(row.last_failed_sync_attempt) || undefined,
    config: asJsonObject(row.config),
    metadata: asJsonObject(row.metadata),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function mapMessageRow(
  row: Record<string, unknown>,
  mailboxNameById: Map<string, string>,
  attachmentMap: Map<string, EmailAttachmentView[]>,
): EmailMessageView {
  const mailboxIds = Array.isArray(row.mailbox_ids)
    ? row.mailbox_ids.map((item) => asString(item)).filter(Boolean)
    : []
  const rowId = asString(row.id)
  const storedAttachments = attachmentMap.get(rowId) || []
  const providerMeta = asJsonObject(row.provider_meta)
  const draftAttachments = asAttachmentArray(providerMeta.draft_attachment_payloads)
  const attachments =
    draftAttachments.length > 0
      ? (storedAttachments.length > 0
          ? storedAttachments.map((item, index) => ({
              ...item,
              contentBase64: draftAttachments[index]?.contentBase64,
            }))
          : draftAttachments)
      : storedAttachments

  return {
    id: rowId,
    integrationId: asString(row.integration_id),
    subject: asString(row.subject),
    snippet: asString(row.snippet) || undefined,
    from: asAddress(row.from_address),
    to: asAddressArray(row.to_addresses),
    cc: asAddressArray(row.cc_addresses),
    bcc: asAddressArray(row.bcc_addresses),
    replyTo: row.reply_to_address ? asAddress(row.reply_to_address) : undefined,
    body: asString(row.body),
    htmlBody: asString(row.html_body) || undefined,
    receivedAt: asString(row.received_at),
    sentAt: asString(row.sent_at) || undefined,
    isRead: asBoolean(row.is_read),
    isStarred: asBoolean(row.is_starred),
    isArchived: asBoolean(row.is_archived),
    isDraft: asBoolean(row.is_draft),
    isSpam: asBoolean(row.is_spam),
    isTrash: asBoolean(row.is_trash),
    mailboxesById: mailboxIds,
    mailboxes: mailboxIds.map((id) => mailboxNameById.get(id) || id),
    messageId: asString(row.message_id) || undefined,
    threadId: asString(row.thread_id) || undefined,
    priority: asString(row.priority) as EmailMessageView["priority"],
    attachments: attachments.length > 0 ? attachments : undefined,
    updatedAt: asString(row.updated_at),
  }
}

function getServiceClient() {
  const client = getSupabaseServerClient()
  if (!client) {
    throw new EmailServiceError("Supabase service role client is not configured.", 500)
  }
  return client
}

function assertIntegrationCreateInput(input: unknown) {
  const parsed = EmailIntegrationCreateSchema.safeParse(input)
  if (!parsed.success) {
    throw new EmailServiceError("Invalid integration payload.", 400)
  }
  return parsed.data
}

function assertIntegrationUpdateInput(input: unknown) {
  const parsed = EmailIntegrationUpdateSchema.safeParse(input)
  if (!parsed.success) {
    throw new EmailServiceError("Invalid integration update payload.", 400)
  }
  return parsed.data
}

function assertSearchInput(input: unknown) {
  const parsed = MessageSearchSchema.safeParse(input)
  if (!parsed.success) {
    throw new EmailServiceError("Invalid message search payload.", 400)
  }
  return parsed.data
}

function assertSendPayload(input: unknown) {
  const parsed = SendEmailPayloadSchema.safeParse(input)
  if (!parsed.success) {
    throw new EmailServiceError("Invalid send payload.", 400)
  }
  return parsed.data as SendEmailPayload
}

function assertDraftPayload(input: unknown): SaveDraftPayload {
  const parsed = SaveDraftPayloadSchema.safeParse(input)
  if (!parsed.success) {
    throw new EmailServiceError("Invalid draft payload.", 400)
  }
  return parsed.data as SaveDraftPayload
}

async function ensureOwnedIntegration(
  userId: string,
  integrationId: string,
): Promise<Record<string, unknown>> {
  const client = getServiceClient()
  const { data, error } = await client
    .from(TABLES.integrations)
    .select("*")
    .eq("id", integrationId)
    .eq("owner_user_id", userId)
    .maybeSingle()

  if (error || !data) {
    throw new EmailServiceError("Integration not found.", 404)
  }

  return data as Record<string, unknown>
}

async function getDecryptedCredential(
  userId: string,
  integrationId: string,
): Promise<AuthCredential | null> {
  const client = getServiceClient()

  const { data, error } = await client
    .from(TABLES.secrets)
    .select("encrypted_credentials")
    .eq("integration_id", integrationId)
    .eq("owner_user_id", userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  try {
    const decrypted = decryptJsonValue<unknown>(asString((data as Record<string, unknown>).encrypted_credentials))
    const parsed = AuthCredentialSchema.safeParse(decrypted)
    return parsed.success ? (parsed.data as AuthCredential) : null
  } catch {
    return null
  }
}

async function upsertEncryptedCredential(
  userId: string,
  integrationId: string,
  authCredential: AuthCredential,
): Promise<void> {
  if (!isEmailCredentialEncryptionEnabled()) {
    throw new EmailServiceError("Server is missing EMAIL_TOKEN_ENCRYPTION_KEY.", 500)
  }

  const client = getServiceClient()
  const encrypted = encryptJsonValue(authCredential)
  const nowIso = new Date().toISOString()

  const { error } = await client.from(TABLES.secrets).upsert(
    {
      integration_id: integrationId,
      owner_user_id: userId,
      encrypted_credentials: encrypted,
      key_version: "v1",
      last_rotated_at: nowIso,
      updated_at: nowIso,
      created_at: nowIso,
    },
    { onConflict: "integration_id" },
  )

  if (error) {
    throw new EmailServiceError("Failed to store encrypted credentials.", 500)
  }
}

async function loadMailboxNameMap(
  userId: string,
  integrationIds: string[],
): Promise<Map<string, string>> {
  if (integrationIds.length === 0) {
    return new Map()
  }

  const client = getServiceClient()
  const { data, error } = await client
    .from(TABLES.mailboxes)
    .select("id,name,integration_id")
    .eq("owner_user_id", userId)
    .in("integration_id", integrationIds)

  if (error || !data) {
    return new Map()
  }

  const map = new Map<string, string>()
  for (const row of data as Array<Record<string, unknown>>) {
    map.set(asString(row.id), asString(row.name))
  }
  return map
}

async function loadAttachmentMap(
  userId: string,
  messageRowIds: string[],
): Promise<Map<string, EmailAttachmentView[]>> {
  if (messageRowIds.length === 0) {
    return new Map()
  }

  const client = getServiceClient()
  const { data, error } = await client
    .from(TABLES.attachments)
    .select("*")
    .eq("owner_user_id", userId)
    .in("message_row_id", messageRowIds)
    .order("created_at", { ascending: true })

  if (error || !data) {
    return new Map()
  }

  const map = new Map<string, EmailAttachmentView[]>()
  for (const row of data as Array<Record<string, unknown>>) {
    const messageRowId = asString(row.message_row_id)
    if (!messageRowId) {
      continue
    }
    const current = map.get(messageRowId) || []
    const attachment = asAttachmentView(row)
    if (attachment) {
      current.push(attachment)
      map.set(messageRowId, current)
    }
  }

  return map
}

function validateIntegrationInput(email: string, provider: EmailProvider) {
  if (!isValidEmail(email)) {
    throw new EmailServiceError("Invalid email address.", 400)
  }
  if (!isValidProvider(provider)) {
    throw new EmailServiceError("Invalid provider.", 400)
  }
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export async function listEmailIntegrations(auth: SupabaseAuthContext): Promise<EmailIntegrationView[]> {
  const client = getServiceClient()
  const { data, error } = await client
    .from(TABLES.integrations)
    .select("*")
    .eq("owner_user_id", auth.userId)
    .order("updated_at", { ascending: false })

  if (error) {
    throw new EmailServiceError("Failed to load integrations.", 500)
  }

  return (data || []).map((row) => mapIntegrationRow(row as Record<string, unknown>))
}

export async function createEmailIntegration(
  auth: SupabaseAuthContext,
  input: unknown,
): Promise<EmailIntegrationView> {
  const data = assertIntegrationCreateInput(input)
  validateIntegrationInput(data.email, data.provider)
  const client = getServiceClient()
  const nowIso = new Date().toISOString()
  const normalizedEmail = data.email.trim().toLowerCase()

  const insertPayload = {
    owner_user_id: auth.userId,
    email: normalizedEmail,
    display_name: data.displayName?.trim() || null,
    provider: data.provider,
    status: data.syncEnabled ? "connected" : "pending",
    sync_enabled: Boolean(data.syncEnabled),
    sync_error_count: 0,
    config: data.config || {},
    metadata: data.metadata || {},
    created_at: nowIso,
    updated_at: nowIso,
  }

  const { data: created, error } = await client
    .from(TABLES.integrations)
    .insert(insertPayload)
    .select("*")
    .single()

  if (error || !created) {
    throw new EmailServiceError("Failed to create integration.", 500)
  }

  if (data.auth) {
    await upsertEncryptedCredential(auth.userId, asString((created as Record<string, unknown>).id), data.auth)
  }

  return mapIntegrationRow(created as Record<string, unknown>)
}

export async function updateEmailIntegration(
  auth: SupabaseAuthContext,
  integrationId: string,
  patchInput: unknown,
): Promise<EmailIntegrationView> {
  const patch = assertIntegrationUpdateInput(patchInput)
  const client = getServiceClient()
  await ensureOwnedIntegration(auth.userId, integrationId)

  const nowIso = new Date().toISOString()
  const updates: Record<string, unknown> = {
    updated_at: nowIso,
  }

  if (patch.displayName !== undefined) {
    updates.display_name = patch.displayName.trim() || null
  }
  if (patch.syncEnabled !== undefined) {
    updates.sync_enabled = patch.syncEnabled
  }
  if (patch.config !== undefined) {
    updates.config = patch.config
  }
  if (patch.metadata !== undefined) {
    updates.metadata = patch.metadata
  }
  if (patch.status !== undefined) {
    updates.status = patch.status
  }

  const { data, error } = await client
    .from(TABLES.integrations)
    .update(updates)
    .eq("id", integrationId)
    .eq("owner_user_id", auth.userId)
    .select("*")
    .single()

  if (error || !data) {
    throw new EmailServiceError("Failed to update integration.", 500)
  }

  if (patch.auth) {
    await upsertEncryptedCredential(auth.userId, integrationId, patch.auth)
  }

  return mapIntegrationRow(data as Record<string, unknown>)
}

export async function deleteEmailIntegration(
  auth: SupabaseAuthContext,
  integrationId: string,
): Promise<void> {
  const client = getServiceClient()
  const { error } = await client
    .from(TABLES.integrations)
    .delete()
    .eq("id", integrationId)
    .eq("owner_user_id", auth.userId)

  if (error) {
    throw new EmailServiceError("Failed to delete integration.", 500)
  }
}

async function upsertMailboxes(
  userId: string,
  integrationId: string,
  mailboxes: Array<{
    externalId?: string
    name: string
    kind: "label" | "folder"
    type: "system" | "user" | "custom"
    color?: string
    messageCount?: number
    unreadCount?: number
    isHidden?: boolean
  }>,
): Promise<Map<string, string>> {
  const client = getServiceClient()
  const nowIso = new Date().toISOString()
  const payload = mailboxes.map((mailbox) => ({
    owner_user_id: userId,
    integration_id: integrationId,
    external_id: mailbox.externalId || null,
    name: mailbox.name,
    kind: mailbox.kind,
    mailbox_type: mailbox.type,
    color: mailbox.color || null,
    message_count: mailbox.messageCount ?? null,
    unread_count: mailbox.unreadCount ?? null,
    is_hidden: mailbox.isHidden ?? false,
    updated_at: nowIso,
    created_at: nowIso,
  }))

  if (payload.length > 0) {
    const { error } = await client.from(TABLES.mailboxes).upsert(payload, {
      onConflict: "integration_id,name",
    })
    if (error) {
      throw new EmailServiceError("Failed to upsert mailboxes.", 500)
    }
  }

  const { data, error } = await client
    .from(TABLES.mailboxes)
    .select("id,name")
    .eq("owner_user_id", userId)
    .eq("integration_id", integrationId)

  if (error) {
    throw new EmailServiceError("Failed to resolve mailboxes.", 500)
  }

  const map = new Map<string, string>()
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    map.set(asString(row.name), asString(row.id))
  }
  return map
}

async function upsertMessagesFromSync(
  userId: string,
  integrationId: string,
  messages: Array<{
    providerMessageId: string
    threadId?: string
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
    receivedAt: string
    sentAt?: string
    isRead: boolean
    isStarred: boolean
    isArchived: boolean
    isDraft: boolean
    isSpam: boolean
    isTrash: boolean
    priority?: "high" | "normal" | "low"
    mailboxes: string[]
    headers?: Record<string, string>
    rawSize?: number
  }>,
  mailboxIdByName: Map<string, string>,
  simulated: boolean,
): Promise<number> {
  if (messages.length === 0) {
    return 0
  }

  const client = getServiceClient()
  const nowIso = new Date().toISOString()
  const payload = messages.map((message) => ({
    owner_user_id: userId,
    integration_id: integrationId,
    mailbox_ids: message.mailboxes
      .map((name) => mailboxIdByName.get(name) || null)
      .filter((item): item is string => Boolean(item)),
    thread_id: message.threadId || null,
    message_id: message.providerMessageId,
    in_reply_to: message.inReplyTo || null,
    reference_ids: message.references || [],
    subject: compactText(message.subject || "No subject"),
    from_address: message.from,
    to_addresses: normalizeAddressArray(message.to),
    cc_addresses: normalizeAddressArray(message.cc),
    bcc_addresses: normalizeAddressArray(message.bcc),
    reply_to_address: message.replyTo || null,
    body: message.body || "",
    html_body: message.htmlBody || null,
    snippet: message.snippet || null,
    received_at: message.receivedAt,
    sent_at: message.sentAt || null,
    is_read: message.isRead,
    is_starred: message.isStarred,
    is_archived: message.isArchived,
    is_draft: message.isDraft,
    is_spam: message.isSpam,
    is_trash: message.isTrash,
    priority: message.priority || "normal",
    headers: message.headers || {},
    raw_size: message.rawSize ?? null,
    provider_meta: {
      simulated,
      source: "provider-sync",
    },
    updated_at: nowIso,
    created_at: nowIso,
  }))

  const { error } = await client.from(TABLES.messages).upsert(payload, {
    onConflict: "owner_user_id,integration_id,message_id",
  })

  if (error) {
    throw new EmailServiceError("Failed to upsert synced messages.", 500)
  }

  return payload.length
}

export async function syncEmailIntegration(
  auth: SupabaseAuthContext,
  integrationId: string,
): Promise<{
  integration: EmailIntegrationView
  processedCount: number
  simulated: boolean
}> {
  const client = getServiceClient()
  const integration = await ensureOwnedIntegration(auth.userId, integrationId)
  const provider = ensureProvider(integration.provider)
  const email = asString(integration.email)
  const nowIso = new Date().toISOString()

  const { data: latestRun } = await client
    .from(TABLES.syncRuns)
    .select("next_page_token,sync_token,last_history_id")
    .eq("owner_user_id", auth.userId)
    .eq("integration_id", integrationId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const cursor: ProviderSyncCursor | undefined = latestRun
    ? {
        nextPageToken: asString((latestRun as Record<string, unknown>).next_page_token) || null,
        syncToken: asString((latestRun as Record<string, unknown>).sync_token) || undefined,
        lastHistoryId: asString((latestRun as Record<string, unknown>).last_history_id) || undefined,
      }
    : undefined

  const { data: syncRun, error: syncRunError } = await client
    .from(TABLES.syncRuns)
    .insert({
      owner_user_id: auth.userId,
      integration_id: integrationId,
      provider,
      status: "syncing",
      started_at: nowIso,
      total_items: 0,
      processed_items: 0,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single()

  if (syncRunError || !syncRun) {
    throw new EmailServiceError("Failed to create sync run.", 500)
  }

  const syncRunId = asString((syncRun as Record<string, unknown>).id)

  try {
    const authCredential = await getDecryptedCredential(auth.userId, integrationId)
    const syncResult = await syncProviderMessages({
      provider,
      email,
      auth: authCredential,
      cursor,
    })

    const mailboxIdByName = await upsertMailboxes(auth.userId, integrationId, syncResult.mailboxes)
    const processedCount = await upsertMessagesFromSync(
      auth.userId,
      integrationId,
      syncResult.messages,
      mailboxIdByName,
      syncResult.simulated,
    )

    const syncIntervalMs = asNumber(asJsonObject(integration.config).syncIntervalMs, DEFAULT_SYNC_INTERVAL_MS)
    const nextSyncAt = new Date(Date.now() + Math.max(syncIntervalMs, 60_000)).toISOString()

    await client
      .from(TABLES.integrations)
      .update({
        status: "connected",
        sync_error: null,
        sync_error_count: 0,
        last_synced_at: nowIso,
        next_sync_at: nextSyncAt,
        updated_at: nowIso,
      })
      .eq("id", integrationId)
      .eq("owner_user_id", auth.userId)

    await client
      .from(TABLES.syncRuns)
      .update({
        status: "completed",
        total_items: syncResult.messages.length,
        processed_items: processedCount,
        completed_at: new Date().toISOString(),
        next_page_token: syncResult.nextPageToken || null,
        sync_token: syncResult.syncToken || null,
        last_history_id: syncResult.lastHistoryId || null,
        is_partial_sync: Boolean(syncResult.isPartialSync),
        updated_at: new Date().toISOString(),
      })
      .eq("id", syncRunId)

    const updated = await ensureOwnedIntegration(auth.userId, integrationId)
    return {
      integration: mapIntegrationRow(updated),
      processedCount,
      simulated: syncResult.simulated,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Sync failed."
    const currentErrorCount = asNumber(integration.sync_error_count, 0)

    await client
      .from(TABLES.syncRuns)
      .update({
        status: "failed",
        error: errorMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", syncRunId)

    await client
      .from(TABLES.integrations)
      .update({
        status: "error",
        sync_error: errorMessage,
        sync_error_count: currentErrorCount + 1,
        last_failed_sync_attempt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .eq("owner_user_id", auth.userId)

    throw error instanceof EmailServiceError
      ? error
      : new EmailServiceError(errorMessage, 500)
  }
}

export async function searchEmailMessages(
  auth: SupabaseAuthContext,
  input: unknown,
): Promise<EmailMessageView[]> {
  const data = assertSearchInput(input)
  const client = getServiceClient()
  const limit = data.limit || 50

  let query = client
    .from(TABLES.messages)
    .select("*")
    .eq("owner_user_id", auth.userId)
    .order("received_at", { ascending: false })
    .limit(limit)

  if (data.integrationId) {
    query = query.eq("integration_id", data.integrationId)
  }
  if (data.isDraft !== undefined) {
    query = query.eq("is_draft", data.isDraft)
  }
  if (data.isRead !== undefined) {
    query = query.eq("is_read", data.isRead)
  }
  if (data.isStarred !== undefined) {
    query = query.eq("is_starred", data.isStarred)
  }

  const { data: rows, error } = await query
  if (error) {
    throw new EmailServiceError("Failed to load messages.", 500)
  }

  const records = (rows || []) as Array<Record<string, unknown>>
  const integrationIds = Array.from(
    new Set(records.map((row) => asString(row.integration_id)).filter(Boolean)),
  )
  const mailboxNameById = await loadMailboxNameMap(auth.userId, integrationIds)
  const attachmentMap = await loadAttachmentMap(
    auth.userId,
    records.map((row) => asString(row.id)).filter(Boolean),
  )

  let mapped = records.map((row) => mapMessageRow(row, mailboxNameById, attachmentMap))
  if (data.text && data.text.trim().length > 0) {
    const needle = data.text.trim().toLowerCase()
    mapped = mapped.filter((item) => {
      const haystack = [
        item.subject,
        item.snippet || "",
        item.body,
        item.from.email,
        item.from.name || "",
        item.to.map((address) => `${address.name || ""} ${address.email}`).join(" "),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(needle)
    })
  }

  return mapped
}

function normalizeSendPayload(payload: SendEmailPayload): SendEmailPayload {
  return {
    ...payload,
    subject: compactText(payload.subject || "No subject"),
    body: payload.body || "",
    to: normalizeAddressArray(payload.to),
    cc: normalizeAddressArray(payload.cc),
    bcc: normalizeAddressArray(payload.bcc),
    from: payload.from
      ? {
          email: payload.from.email.trim().toLowerCase(),
          name: payload.from.name?.trim() || undefined,
        }
      : undefined,
    replyTo: payload.replyTo
      ? {
          email: payload.replyTo.email.trim().toLowerCase(),
          name: payload.replyTo.name?.trim() || undefined,
        }
      : undefined,
    attachments: normalizeAttachmentArray(payload.attachments),
  }
}

async function replaceMessageAttachments(
  userId: string,
  integrationId: string,
  messageRowId: string,
  attachments: SendEmailPayload["attachments"],
): Promise<void> {
  const client = getServiceClient()
  const normalized = normalizeAttachmentArray(attachments)

  const { error: deleteError } = await client
    .from(TABLES.attachments)
    .delete()
    .eq("owner_user_id", userId)
    .eq("integration_id", integrationId)
    .eq("message_row_id", messageRowId)

  if (deleteError) {
    throw new EmailServiceError("Failed to replace message attachments.", 500)
  }

  if (normalized.length === 0) {
    return
  }

  const nowIso = new Date().toISOString()
  const payload = normalized.map((attachment) => ({
    owner_user_id: userId,
    integration_id: integrationId,
    message_row_id: messageRowId,
    filename: attachment.filename,
    mime_type: attachment.mimeType,
    size: attachment.size,
    content_id: attachment.contentId || null,
    is_inline: attachment.isInline,
    content_disposition: attachment.contentDisposition || (attachment.isInline ? "inline" : "attachment"),
    url: attachment.url || null,
    checksum: attachment.checksum || null,
    storage_location: attachment.storageLocation || null,
    created_at: nowIso,
    updated_at: nowIso,
  }))

  const { error: insertError } = await client.from(TABLES.attachments).insert(payload)
  if (insertError) {
    throw new EmailServiceError("Failed to persist message attachments.", 500)
  }
}

export async function sendEmailMessage(
  auth: SupabaseAuthContext,
  input: unknown,
): Promise<{ message: EmailMessageView; simulated: boolean }> {
  const payload = normalizeSendPayload(assertSendPayload(input))
  const client = getServiceClient()
  const integration = await ensureOwnedIntegration(auth.userId, payload.integrationId)
  const provider = ensureProvider(integration.provider)
  const authCredential = await getDecryptedCredential(auth.userId, payload.integrationId)
  const sendResult = await sendThroughProvider({
    provider,
    auth: authCredential,
    payload,
  })

  const nowIso = new Date().toISOString()
  const insertedPayload = {
    owner_user_id: auth.userId,
    integration_id: payload.integrationId,
    mailbox_ids: [],
    thread_id: payload.threadId || null,
    message_id: sendResult.providerMessageId,
    in_reply_to: payload.inReplyTo || null,
    reference_ids: payload.references || [],
    subject: payload.subject,
    from_address: payload.from || { email: asString(integration.email) },
    to_addresses: payload.to,
    cc_addresses: payload.cc || [],
    bcc_addresses: payload.bcc || [],
    reply_to_address: payload.replyTo || null,
    body: payload.body,
    html_body: payload.htmlBody || null,
    snippet: payload.body.slice(0, 240),
    received_at: nowIso,
    sent_at: sendResult.sentAt,
    is_read: true,
    is_starred: false,
    is_archived: false,
    is_draft: false,
    is_spam: false,
    is_trash: false,
    priority: "normal",
    headers: {},
    raw_size: payload.body.length + (payload.attachments || []).reduce((sum, item) => sum + item.size, 0),
    provider_meta: {
      simulated: sendResult.simulated,
      source: "send",
      attachment_count: (payload.attachments || []).length,
    },
    created_at: nowIso,
    updated_at: nowIso,
  }

  const { data, error } = await client
    .from(TABLES.messages)
    .insert(insertedPayload)
    .select("*")
    .single()

  if (error || !data) {
    throw new EmailServiceError("Failed to persist sent message.", 500)
  }

  const mailboxNameById = await loadMailboxNameMap(auth.userId, [payload.integrationId])
  await replaceMessageAttachments(
    auth.userId,
    payload.integrationId,
    asString((data as Record<string, unknown>).id),
    payload.attachments,
  )
  const attachmentMap = await loadAttachmentMap(auth.userId, [asString((data as Record<string, unknown>).id)])
  return {
    message: mapMessageRow(data as Record<string, unknown>, mailboxNameById, attachmentMap),
    simulated: sendResult.simulated,
  }
}

export async function saveEmailDraft(
  auth: SupabaseAuthContext,
  input: unknown,
): Promise<{ draft: EmailMessageView; simulated: boolean }> {
  const payload = assertDraftPayload(input)
  const normalized = normalizeSendPayload(payload)
  const client = getServiceClient()
  const integration = await ensureOwnedIntegration(auth.userId, normalized.integrationId)
  const provider = ensureProvider(integration.provider)
  const authCredential = await getDecryptedCredential(auth.userId, normalized.integrationId)
  const draftResult = await saveDraftThroughProvider({
    provider,
    auth: authCredential,
    payload: normalized,
  })

  const nowIso = new Date().toISOString()
  const basePayload = {
    owner_user_id: auth.userId,
    integration_id: normalized.integrationId,
    mailbox_ids: [],
    thread_id: normalized.threadId || null,
    message_id: draftResult.providerDraftId,
    in_reply_to: normalized.inReplyTo || null,
    reference_ids: normalized.references || [],
    subject: normalized.subject,
    from_address: normalized.from || { email: asString(integration.email) },
    to_addresses: normalized.to,
    cc_addresses: normalized.cc || [],
    bcc_addresses: normalized.bcc || [],
    reply_to_address: normalized.replyTo || null,
    body: normalized.body,
    html_body: normalized.htmlBody || null,
    snippet: normalized.body.slice(0, 240),
    received_at: nowIso,
    sent_at: null,
    is_read: true,
    is_starred: false,
    is_archived: false,
    is_draft: true,
    is_spam: false,
    is_trash: false,
    priority: "normal",
    headers: {},
    raw_size: normalized.body.length + (normalized.attachments || []).reduce((sum, item) => sum + item.size, 0),
    provider_meta: {
      simulated: draftResult.simulated,
      source: "draft",
      attachment_count: (normalized.attachments || []).length,
      draft_attachment_payloads: (normalized.attachments || []).map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        contentId: attachment.contentId,
        isInline: attachment.isInline,
        contentDisposition: attachment.contentDisposition,
        contentBase64: attachment.contentBase64,
      })),
    },
    updated_at: nowIso,
  }

  let record: Record<string, unknown> | null = null
  if (payload.draftId) {
    const { data, error } = await client
      .from(TABLES.messages)
      .update(basePayload)
      .eq("id", payload.draftId)
      .eq("owner_user_id", auth.userId)
      .eq("integration_id", normalized.integrationId)
      .eq("is_draft", true)
      .select("*")
      .maybeSingle()

    if (!error && data) {
      record = data as Record<string, unknown>
    }
  }

  if (!record) {
    const { data, error } = await client
      .from(TABLES.messages)
      .insert({
        ...basePayload,
        id: randomUUID(),
        created_at: nowIso,
      })
      .select("*")
      .single()

    if (error || !data) {
      throw new EmailServiceError("Failed to persist draft.", 500)
    }
    record = data as Record<string, unknown>
  }

  const mailboxNameById = await loadMailboxNameMap(auth.userId, [normalized.integrationId])
  await replaceMessageAttachments(auth.userId, normalized.integrationId, asString(record.id), normalized.attachments)
  const attachmentMap = await loadAttachmentMap(auth.userId, [asString(record.id)])
  return {
    draft: mapMessageRow(record, mailboxNameById, attachmentMap),
    simulated: draftResult.simulated,
  }
}

export async function listEmailDrafts(
  auth: SupabaseAuthContext,
  integrationId?: string,
): Promise<EmailMessageView[]> {
  return searchEmailMessages(auth, {
    integrationId,
    isDraft: true,
    limit: 100,
  })
}

export async function deleteEmailDraft(
  auth: SupabaseAuthContext,
  draftId: string,
): Promise<void> {
  const client = getServiceClient()
  const { error } = await client
    .from(TABLES.messages)
    .delete()
    .eq("id", draftId)
    .eq("owner_user_id", auth.userId)
    .eq("is_draft", true)

  if (error) {
    throw new EmailServiceError("Failed to delete draft.", 500)
  }
}

export function getEmailServiceStatus(): {
  supabaseConfigured: boolean
  encryptionConfigured: boolean
  tables: Record<string, string>
} {
  return {
    supabaseConfigured: Boolean(getSupabaseServerClient()),
    encryptionConfigured: isEmailCredentialEncryptionEnabled(),
    tables: {
      ...TABLES,
    },
  }
}

export function toEmailErrorResponse(error: unknown): { status: number; payload: Record<string, unknown> } {
  if (error instanceof EmailServiceError) {
    return {
      status: error.status,
      payload: { error: error.message },
    }
  }

  return {
    status: 500,
    payload: {
      error: error instanceof Error ? error.message : "Unexpected email service error.",
    },
  }
}
