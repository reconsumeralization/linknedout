import "server-only"

import { randomUUID } from "node:crypto"

import type {
  AuthCredential,
  EmailAddress,
  EmailPriority,
  EmailProvider,
  SendEmailPayload,
} from "@/lib/email/email-intergrations"

const DEFAULT_SYNC_LIMIT = 20

export interface ProviderSyncMailbox {
  externalId?: string
  name: string
  kind: "label" | "folder"
  type: "system" | "user" | "custom"
  color?: string
  messageCount?: number
  unreadCount?: number
  parentExternalId?: string
  isHidden?: boolean
}

export interface ProviderSyncMessage {
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
  priority?: EmailPriority
  mailboxes: string[]
  headers?: Record<string, string>
  rawSize?: number
}

export interface ProviderSyncCursor {
  nextPageToken?: string | null
  syncToken?: string
  lastHistoryId?: string
}

export interface ProviderSyncResult {
  mailboxes: ProviderSyncMailbox[]
  messages: ProviderSyncMessage[]
  nextPageToken?: string | null
  syncToken?: string
  lastHistoryId?: string
  isPartialSync?: boolean
  simulated: boolean
}

export interface ProviderSendResult {
  providerMessageId: string
  sentAt: string
  simulated: boolean
}

export interface ProviderDraftResult {
  providerDraftId: string
  simulated: boolean
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

function parseAddress(raw: string): EmailAddress {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { email: "unknown@example.com" }
  }

  const angleStart = trimmed.lastIndexOf("<")
  const angleEnd = trimmed.lastIndexOf(">")
  if (angleStart > 0 && angleEnd > angleStart) {
    return {
      name: trimmed.slice(0, angleStart).replace(/^"|"$/g, "").trim() || undefined,
      email: trimmed.slice(angleStart + 1, angleEnd).trim(),
    }
  }

  return { email: trimmed.replace(/^"|"$/g, "") }
}

function parseAddressList(raw: string | undefined): EmailAddress[] {
  if (!raw) {
    return []
  }
  return raw
    .split(",")
    .map((part) => parseAddress(part))
    .filter((item) => item.email.length > 0)
}

function getOAuthAccessToken(auth: AuthCredential | null): string | null {
  if (!auth || auth.kind !== "oauth") {
    return null
  }
  const token = auth.tokens.accessToken?.trim()
  return token ? token : null
}

function buildMockMailboxSet(provider: EmailProvider): ProviderSyncMailbox[] {
  if (provider === "gmail") {
    return [
      { name: "INBOX", kind: "label", type: "system" },
      { name: "SENT", kind: "label", type: "system" },
      { name: "DRAFT", kind: "label", type: "system" },
      { name: "IMPORTANT", kind: "label", type: "system" },
    ]
  }

  return [
    { name: "Inbox", kind: "folder", type: "system" },
    { name: "Sent Items", kind: "folder", type: "system" },
    { name: "Drafts", kind: "folder", type: "system" },
    { name: "Archive", kind: "folder", type: "system" },
  ]
}

function buildMockMessages(email: string, provider: EmailProvider): ProviderSyncMessage[] {
  const now = Date.now()
  const domain = email.includes("@") ? email.split("@")[1] : "example.com"
  const senderBase = provider === "outlook" ? "contoso.com" : "team.example"

  return Array.from({ length: 6 }).map((_, index) => {
    const receivedAt = new Date(now - index * 90 * 60 * 1000).toISOString()
    const idSuffix = Math.floor(now / 1000).toString(36)
    return {
      providerMessageId: `${provider}-mock-${idSuffix}-${index + 1}`,
      threadId: `${provider}-thread-${Math.floor(index / 2) + 1}`,
      subject: `Mock ${provider} message ${index + 1}`,
      from: parseAddress(`Noreply ${index + 1} <noreply${index + 1}@${senderBase}>`),
      to: [{ email }],
      body: `Mock synchronized message ${index + 1} for ${email}.`,
      snippet: `Mock synchronized message ${index + 1} for ${domain}.`,
      receivedAt,
      sentAt: receivedAt,
      isRead: index % 2 === 0,
      isStarred: index === 0,
      isArchived: false,
      isDraft: false,
      isSpam: false,
      isTrash: false,
      priority: index === 0 ? "high" : "normal",
      mailboxes: [provider === "gmail" ? "INBOX" : "Inbox"],
      headers: {
        "x-linkedout-source": "mock-sync",
      },
      rawSize: 1024 + index * 77,
    }
  })
}

function createMockSyncResult(email: string, provider: EmailProvider): ProviderSyncResult {
  return {
    mailboxes: buildMockMailboxSet(provider),
    messages: buildMockMessages(email, provider),
    isPartialSync: false,
    simulated: true,
  }
}

function getHeaderValue(
  headers: Array<{ name?: unknown; value?: unknown }> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined
  }

  const lower = name.toLowerCase()
  const match = headers.find((item) => asString(item.name).toLowerCase() === lower)
  const value = asString(match?.value)
  return value || undefined
}

async function syncFromGmail(
  accessToken: string,
  cursor?: ProviderSyncCursor,
): Promise<ProviderSyncResult> {
  const headers = { Authorization: `Bearer ${accessToken}` }

  const labelsResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers,
    cache: "no-store",
  })
  if (!labelsResponse.ok) {
    throw new Error(`Gmail labels request failed (${labelsResponse.status}).`)
  }

  const labelsJson = (await labelsResponse.json()) as {
    labels?: Array<{
      id?: string
      name?: string
      type?: string
      messagesTotal?: number
      messagesUnread?: number
    }>
  }

  const mailboxes: ProviderSyncMailbox[] = []
  for (const label of labelsJson.labels || []) {
    const name = asString(label.name)
    if (!name) {
      continue
    }
    mailboxes.push({
      externalId: asString(label.id) || undefined,
      name,
      kind: "label",
      type: asString(label.type, "user") === "system" ? "system" : "user",
      messageCount: typeof label.messagesTotal === "number" ? label.messagesTotal : undefined,
      unreadCount: typeof label.messagesUnread === "number" ? label.messagesUnread : undefined,
    })
  }

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
  listUrl.searchParams.set("maxResults", String(DEFAULT_SYNC_LIMIT))
  if (cursor?.nextPageToken) {
    listUrl.searchParams.set("pageToken", cursor.nextPageToken)
  }

  const messagesListResponse = await fetch(listUrl, { headers, cache: "no-store" })
  if (!messagesListResponse.ok) {
    throw new Error(`Gmail message list request failed (${messagesListResponse.status}).`)
  }

  const listJson = (await messagesListResponse.json()) as {
    nextPageToken?: string
    resultSizeEstimate?: number
    messages?: Array<{ id?: string; threadId?: string }>
    historyId?: string
  }

  const baseMessages = (listJson.messages || []).filter((item) => asString(item.id).length > 0)

  const details: Array<ProviderSyncMessage | null> = await Promise.all(
    baseMessages.map(async (item) => {
      const id = asString(item.id)
      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`)
      detailUrl.searchParams.set("format", "metadata")
      detailUrl.searchParams.set("metadataHeaders", "Subject")
      detailUrl.searchParams.set("metadataHeaders", "From")
      detailUrl.searchParams.set("metadataHeaders", "To")
      detailUrl.searchParams.set("metadataHeaders", "Date")
      detailUrl.searchParams.set("metadataHeaders", "In-Reply-To")
      detailUrl.searchParams.set("metadataHeaders", "References")

      const detailResponse = await fetch(detailUrl, { headers, cache: "no-store" })
      if (!detailResponse.ok) {
        return null
      }

      const detail = (await detailResponse.json()) as {
        id?: string
        threadId?: string
        labelIds?: string[]
        snippet?: string
        internalDate?: string
        payload?: {
          headers?: Array<{ name?: string; value?: string }>
        }
        sizeEstimate?: number
      }

      const subject = getHeaderValue(detail.payload?.headers, "Subject") || asString(detail.snippet, "No subject")
      const from = parseAddress(getHeaderValue(detail.payload?.headers, "From") || "unknown@example.com")
      const to = parseAddressList(getHeaderValue(detail.payload?.headers, "To"))
      const receivedAtRaw = detail.internalDate
      const receivedAt = receivedAtRaw
        ? new Date(Number(receivedAtRaw)).toISOString()
        : new Date().toISOString()

      const mapped: ProviderSyncMessage = {
        providerMessageId: asString(detail.id, id),
        threadId: asString(detail.threadId) || undefined,
        inReplyTo: getHeaderValue(detail.payload?.headers, "In-Reply-To"),
        references: parseAddressList(getHeaderValue(detail.payload?.headers, "References") || "")
          .map((item) => item.email)
          .filter(Boolean),
        subject,
        from,
        to: to.length > 0 ? to : [{ email: "unknown@example.com" }],
        body: asString(detail.snippet),
        snippet: asString(detail.snippet),
        receivedAt,
        sentAt: receivedAt,
        isRead: !(detail.labelIds || []).includes("UNREAD"),
        isStarred: (detail.labelIds || []).includes("STARRED"),
        isArchived: (detail.labelIds || []).includes("ARCHIVE"),
        isDraft: (detail.labelIds || []).includes("DRAFT"),
        isSpam: (detail.labelIds || []).includes("SPAM"),
        isTrash: (detail.labelIds || []).includes("TRASH"),
        priority: (detail.labelIds || []).includes("IMPORTANT") ? "high" : "normal",
        mailboxes:
          (detail.labelIds || [])
            .map((labelId) => {
              const found = mailboxes.find((item) => item.externalId === labelId)
              return found?.name || labelId
            })
            .filter(Boolean) || [],
        rawSize: typeof detail.sizeEstimate === "number" ? detail.sizeEstimate : undefined,
      }
      return mapped
    }),
  )

  const messages: ProviderSyncMessage[] = details.flatMap((item) => (item ? [item] : []))

  return {
    mailboxes,
    messages,
    nextPageToken: asString(listJson.nextPageToken) || null,
    syncToken: asString(listJson.historyId) || cursor?.syncToken,
    lastHistoryId: asString(listJson.historyId) || cursor?.lastHistoryId,
    isPartialSync: Boolean(listJson.nextPageToken),
    simulated: false,
  }
}

async function syncFromOutlook(
  accessToken: string,
  cursor?: ProviderSyncCursor,
): Promise<ProviderSyncResult> {
  const headers = { Authorization: `Bearer ${accessToken}` }

  const foldersResponse = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders?$top=50&$select=id,displayName,parentFolderId,unreadItemCount,totalItemCount",
    { headers, cache: "no-store" },
  )
  if (!foldersResponse.ok) {
    throw new Error(`Outlook folder request failed (${foldersResponse.status}).`)
  }

  const foldersJson = (await foldersResponse.json()) as {
    value?: Array<{
      id?: string
      displayName?: string
      parentFolderId?: string
      unreadItemCount?: number
      totalItemCount?: number
    }>
  }

  const mailboxes: ProviderSyncMailbox[] = []
  for (const item of foldersJson.value || []) {
    const name = asString(item.displayName)
    if (!name) {
      continue
    }

    mailboxes.push({
      externalId: asString(item.id) || undefined,
      parentExternalId: asString(item.parentFolderId) || undefined,
      name,
      kind: "folder",
      type: "system",
      unreadCount: typeof item.unreadItemCount === "number" ? item.unreadItemCount : undefined,
      messageCount: typeof item.totalItemCount === "number" ? item.totalItemCount : undefined,
    })
  }

  const messagesUrl = new URL("https://graph.microsoft.com/v1.0/me/messages")
  messagesUrl.searchParams.set("$top", String(DEFAULT_SYNC_LIMIT))
  messagesUrl.searchParams.set(
    "$select",
    [
      "id",
      "conversationId",
      "subject",
      "bodyPreview",
      "receivedDateTime",
      "sentDateTime",
      "isRead",
      "importance",
      "from",
      "toRecipients",
      "ccRecipients",
      "internetMessageId",
      "parentFolderId",
    ].join(","),
  )
  messagesUrl.searchParams.set("$orderby", "receivedDateTime desc")
  if (cursor?.nextPageToken) {
    messagesUrl.searchParams.set("$skiptoken", cursor.nextPageToken)
  }

  const messagesResponse = await fetch(messagesUrl, { headers, cache: "no-store" })
  if (!messagesResponse.ok) {
    throw new Error(`Outlook message request failed (${messagesResponse.status}).`)
  }

  const messagesJson = (await messagesResponse.json()) as {
    "@odata.nextLink"?: string
    value?: Array<{
      id?: string
      conversationId?: string
      subject?: string
      bodyPreview?: string
      receivedDateTime?: string
      sentDateTime?: string
      isRead?: boolean
      importance?: string
      from?: { emailAddress?: { address?: string; name?: string } }
      toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>
      ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>
      internetMessageId?: string
      parentFolderId?: string
    }>
  }

  const messages: ProviderSyncMessage[] = (messagesJson.value || []).map((message) => {
    const folderId = asString(message.parentFolderId)
    const folderName =
      mailboxes.find((item) => item.externalId === folderId)?.name || "Inbox"
    const to =
      (message.toRecipients || []).map((recipient) => ({
        email: asString(recipient.emailAddress?.address),
        name: asString(recipient.emailAddress?.name) || undefined,
      })) || []
    const cc =
      (message.ccRecipients || []).map((recipient) => ({
        email: asString(recipient.emailAddress?.address),
        name: asString(recipient.emailAddress?.name) || undefined,
      })) || []

    return {
      providerMessageId: asString(message.id, randomUUID()),
      threadId: asString(message.conversationId) || undefined,
      subject: asString(message.subject, "No subject"),
      from: {
        email: asString(message.from?.emailAddress?.address, "unknown@example.com"),
        name: asString(message.from?.emailAddress?.name) || undefined,
      },
      to: to.length > 0 ? to : [{ email: "unknown@example.com" }],
      cc: cc.length > 0 ? cc : undefined,
      body: asString(message.bodyPreview),
      snippet: asString(message.bodyPreview),
      receivedAt: asString(message.receivedDateTime, new Date().toISOString()),
      sentAt: asString(message.sentDateTime) || undefined,
      isRead: Boolean(message.isRead),
      isStarred: false,
      isArchived: folderName.toLowerCase().includes("archive"),
      isDraft: folderName.toLowerCase().includes("draft"),
      isSpam: folderName.toLowerCase().includes("junk"),
      isTrash: folderName.toLowerCase().includes("deleted"),
      priority:
        asString(message.importance).toLowerCase() === "high"
          ? "high"
          : asString(message.importance).toLowerCase() === "low"
          ? "low"
          : "normal",
      mailboxes: [folderName],
      headers: {
        "internet-message-id": asString(message.internetMessageId),
      },
    }
  })

  const nextLink = asString(messagesJson["@odata.nextLink"])
  let nextPageToken: string | null = null
  if (nextLink) {
    try {
      const parsed = new URL(nextLink)
      nextPageToken = parsed.searchParams.get("$skiptoken")
    } catch {
      nextPageToken = null
    }
  }

  return {
    mailboxes,
    messages,
    nextPageToken,
    isPartialSync: Boolean(nextPageToken),
    simulated: false,
  }
}

function normalizeRecipients(list: EmailAddress[] | undefined): EmailAddress[] {
  return (list || [])
    .map((item) => ({
      email: asString(item.email).trim(),
      name: asString(item.name).trim() || undefined,
    }))
    .filter((item) => item.email.length > 0)
}

function normalizeAttachments(
  attachments: SendEmailPayload["attachments"],
): NonNullable<SendEmailPayload["attachments"]> {
  return (attachments || [])
    .map((item) => ({
      filename: asString(item.filename).trim(),
      mimeType: asString(item.mimeType).trim() || "application/octet-stream",
      size: Number.isFinite(item.size) ? item.size : 0,
      contentId: asString(item.contentId).trim() || undefined,
      isInline: Boolean(item.isInline),
      contentDisposition: item.contentDisposition ?? (item.isInline ? "inline" : "attachment"),
      url: asString(item.url).trim() || undefined,
      storageLocation: item.storageLocation,
      checksum: asString(item.checksum).trim() || undefined,
      contentBase64: asString(item.contentBase64).trim() || undefined,
    }))
    .filter((item) => item.filename.length > 0)
}

function renderAddress(address: EmailAddress): string {
  if (address.name) {
    return `${address.name} <${address.email}>`
  }
  return address.email
}

function wrapBase64(value: string): string {
  return value.replace(/\s+/g, "").match(/.{1,76}/g)?.join("\r\n") || value
}

function formatRfc2822Message(payload: SendEmailPayload): string {
  const lines: string[] = []
  const attachments = normalizeAttachments(payload.attachments)
  const from = payload.from?.email || "no-reply@linkedout.local"
  lines.push(`From: ${renderAddress(payload.from || { email: from })}`)
  lines.push(`To: ${normalizeRecipients(payload.to).map(renderAddress).join(", ")}`)
  if (payload.cc && payload.cc.length > 0) {
    lines.push(`Cc: ${normalizeRecipients(payload.cc).map(renderAddress).join(", ")}`)
  }
  lines.push(`Subject: ${payload.subject || "No subject"}`)

  if (attachments.length === 0) {
    lines.push("MIME-Version: 1.0")
    lines.push(`Content-Type: ${payload.htmlBody ? "text/html" : "text/plain"}; charset=UTF-8`)
    lines.push("")
    lines.push(payload.htmlBody || payload.body || "")
    return lines.join("\r\n")
  }

  const boundary = `linkedout-mixed-${randomUUID()}`
  lines.push("MIME-Version: 1.0")
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  lines.push("")

  lines.push(`--${boundary}`)
  lines.push(`Content-Type: ${payload.htmlBody ? "text/html" : "text/plain"}; charset=UTF-8`)
  lines.push("Content-Transfer-Encoding: 8bit")
  lines.push("")
  lines.push(payload.htmlBody || payload.body || "")

  for (const attachment of attachments) {
    if (!attachment.contentBase64) {
      continue
    }
    lines.push(`--${boundary}`)
    lines.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`)
    lines.push(`Content-Disposition: ${attachment.contentDisposition || (attachment.isInline ? "inline" : "attachment")}; filename="${attachment.filename}"`)
    if (attachment.contentId) {
      lines.push(`Content-ID: <${attachment.contentId}>`)
    }
    lines.push("Content-Transfer-Encoding: base64")
    lines.push("")
    lines.push(wrapBase64(attachment.contentBase64))
  }

  lines.push(`--${boundary}--`)
  return lines.join("\r\n")
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

async function trySendViaGmail(accessToken: string, payload: SendEmailPayload): Promise<ProviderSendResult> {
  const raw = toBase64Url(formatRfc2822Message(payload))
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Gmail send failed (${response.status}).`)
  }

  const body = (await response.json()) as { id?: string }
  return {
    providerMessageId: asString(body.id, `gmail-sent-${randomUUID()}`),
    sentAt: new Date().toISOString(),
    simulated: false,
  }
}

async function trySaveDraftViaGmail(accessToken: string, payload: SendEmailPayload): Promise<ProviderDraftResult> {
  const raw = toBase64Url(formatRfc2822Message(payload))
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Gmail draft save failed (${response.status}).`)
  }

  const body = (await response.json()) as { id?: string }
  return {
    providerDraftId: asString(body.id, `gmail-draft-${randomUUID()}`),
    simulated: false,
  }
}

function toOutlookRecipients(list: EmailAddress[] | undefined): Array<{ emailAddress: { address: string; name?: string } }> {
  return normalizeRecipients(list).map((item) => ({
    emailAddress: {
      address: item.email,
      name: item.name,
    },
  }))
}

async function trySendViaOutlook(accessToken: string, payload: SendEmailPayload): Promise<ProviderSendResult> {
  const attachments = normalizeAttachments(payload.attachments)
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: payload.subject || "No subject",
        body: {
          contentType: payload.htmlBody ? "HTML" : "Text",
          content: payload.htmlBody || payload.body || "",
        },
        toRecipients: toOutlookRecipients(payload.to),
        ccRecipients: toOutlookRecipients(payload.cc),
        bccRecipients: toOutlookRecipients(payload.bcc),
        attachments: attachments
          .filter((item) => item.contentBase64)
          .map((item) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: item.filename,
            contentType: item.mimeType,
            contentBytes: item.contentBase64,
            contentId: item.contentId,
            isInline: item.isInline,
          })),
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Outlook send failed (${response.status}).`)
  }

  return {
    providerMessageId: `outlook-sent-${randomUUID()}`,
    sentAt: new Date().toISOString(),
    simulated: false,
  }
}

async function trySaveDraftViaOutlook(accessToken: string, payload: SendEmailPayload): Promise<ProviderDraftResult> {
  const attachments = normalizeAttachments(payload.attachments)
  const response = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: payload.subject || "No subject",
      body: {
        contentType: payload.htmlBody ? "HTML" : "Text",
        content: payload.htmlBody || payload.body || "",
      },
      toRecipients: toOutlookRecipients(payload.to),
      ccRecipients: toOutlookRecipients(payload.cc),
      bccRecipients: toOutlookRecipients(payload.bcc),
      attachments: attachments
        .filter((item) => item.contentBase64)
        .map((item) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: item.filename,
          contentType: item.mimeType,
          contentBytes: item.contentBase64,
          contentId: item.contentId,
          isInline: item.isInline,
        })),
      isDraft: true,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Outlook draft save failed (${response.status}).`)
  }

  const body = (await response.json()) as { id?: string }
  return {
    providerDraftId: asString(body.id, `outlook-draft-${randomUUID()}`),
    simulated: false,
  }
}

export async function syncProviderMessages(input: {
  provider: EmailProvider
  email: string
  auth: AuthCredential | null
  cursor?: ProviderSyncCursor
}): Promise<ProviderSyncResult> {
  const accessToken = getOAuthAccessToken(input.auth)

  if (input.provider === "gmail" && accessToken) {
    try {
      return await syncFromGmail(accessToken, input.cursor)
    } catch {
      return createMockSyncResult(input.email, input.provider)
    }
  }

  if (input.provider === "outlook" && accessToken) {
    try {
      return await syncFromOutlook(accessToken, input.cursor)
    } catch {
      return createMockSyncResult(input.email, input.provider)
    }
  }

  return createMockSyncResult(input.email, input.provider)
}

export async function sendThroughProvider(input: {
  provider: EmailProvider
  auth: AuthCredential | null
  payload: SendEmailPayload
}): Promise<ProviderSendResult> {
  const accessToken = getOAuthAccessToken(input.auth)

  if (input.provider === "gmail" && accessToken) {
    try {
      return await trySendViaGmail(accessToken, input.payload)
    } catch {
      // fall through to simulated send
    }
  }

  if (input.provider === "outlook" && accessToken) {
    try {
      return await trySendViaOutlook(accessToken, input.payload)
    } catch {
      // fall through to simulated send
    }
  }

  return {
    providerMessageId: `${input.provider}-simulated-send-${randomUUID()}`,
    sentAt: new Date().toISOString(),
    simulated: true,
  }
}

export async function saveDraftThroughProvider(input: {
  provider: EmailProvider
  auth: AuthCredential | null
  payload: SendEmailPayload
}): Promise<ProviderDraftResult> {
  const accessToken = getOAuthAccessToken(input.auth)

  if (input.provider === "gmail" && accessToken) {
    try {
      return await trySaveDraftViaGmail(accessToken, input.payload)
    } catch {
      // fall through to simulated save
    }
  }

  if (input.provider === "outlook" && accessToken) {
    try {
      return await trySaveDraftViaOutlook(accessToken, input.payload)
    } catch {
      // fall through to simulated save
    }
  }

  return {
    providerDraftId: `${input.provider}-simulated-draft-${randomUUID()}`,
    simulated: true,
  }
}
