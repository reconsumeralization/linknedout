/**
 * Gmail Connector for linkedout
 * Provides comprehensive Gmail API integration with OAuth token refresh,
 * email listing, searching, reading, sending, and draft management.
 */

// ============================================================================
// Types
// ============================================================================

export interface GmailConnectorConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  writeMode?: 'direct' | 'write_with_approval';
}

export interface GmailConnector {
  config: GmailConnectorConfig;
  provider: 'gmail';
  authenticated: boolean;
}

export interface ListEmailsOptions {
  maxResults?: number;
  pageToken?: string;
  labels?: string[];
  query?: string;
  includeSpamTrash?: boolean;
}

export interface SearchOptions {
  maxResults?: number;
  pageToken?: string;
}

export interface EmailResult {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  internalDate: string;
}

export interface EmailDetail extends EmailResult {
  headers: {
    from?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    date?: string;
    contentType?: string;
    [key: string]: string | undefined;
  };
  body: string;
  attachments: EmailAttachment[];
  mimeType: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  data?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  body: string;
  html?: boolean;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: { filename: string; content: string; mimeType: string }[];
}

export interface SendEmailResult {
  id: string;
  threadId: string;
  labelIds?: string[];
  requiresApproval?: boolean;
  approvalPending?: boolean;
}

export interface DraftResult {
  id: string;
  message: {
    id: string;
    threadId: string;
    labelIds?: string[];
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Decode base64url-encoded string
 */
function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binaryString = Buffer.from(padded, 'base64').toString('utf-8');
  return binaryString;
}

/**
 * Encode string to base64url
 */
function encodeBase64Url(str: string): string {
  const base64 = Buffer.from(str, 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Parse MIME message to extract headers and body
 */
function parseMimeMessage(
  mimeString: string
): { headers: Record<string, string>; body: string; parts: string[] } {
  const lines = mimeString.split('\r\n');
  const headers: Record<string, string> = {};
  let currentHeader = '';
  let bodyStartIndex = 0;

  // Parse headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === '') {
      bodyStartIndex = i + 1;
      break;
    }

    if (line.match(/^\s/) && currentHeader) {
      // Continuation of previous header
      headers[currentHeader] += ' ' + line.trim();
    } else {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        currentHeader = key.trim();
        headers[currentHeader] = valueParts.join(':').trim();
      }
    }
  }

  const body = lines.slice(bodyStartIndex).join('\r\n');
  return { headers, body, parts: [] };
}

/**
 * Extract header value case-insensitively
 */
function getHeaderValue(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

/**
 * Create RFC 2822 message format
 */
function createRfc2822Message(email: SendEmailInput): string {
  const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
  const cc = email.cc ? (Array.isArray(email.cc) ? email.cc.join(', ') : email.cc) : '';
  const bcc = email.bcc ? (Array.isArray(email.bcc) ? email.bcc.join(', ') : email.bcc) : '';

  let message = `To: ${to}\r\n`;
  message += `Subject: ${email.subject}\r\n`;
  if (cc) message += `Cc: ${cc}\r\n`;
  if (bcc) message += `Bcc: ${bcc}\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  message += `Content-Type: ${email.html ? 'text/html' : 'text/plain'}; charset="UTF-8"\r\n`;
  message += `\r\n${email.body}`;

  return message;
}

// ============================================================================
// Core Connector Functions
// ============================================================================

/**
 * Initialize a configured Gmail connector
 */
export function initGmailConnector(config: GmailConnectorConfig): GmailConnector {
  if (!config.clientId || !config.clientSecret || !config.accessToken) {
    throw new Error('Gmail connector config requires clientId, clientSecret, and accessToken');
  }

  return {
    config,
    provider: 'gmail',
    authenticated: true,
  };
}

/**
 * Refresh Gmail OAuth token using refresh token
 */
export async function refreshGmailToken(connector: GmailConnector): Promise<GmailConnector> {
  if (!connector.config.refreshToken) {
    throw new Error('No refresh token available for Gmail connector');
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: connector.config.clientId,
        client_secret: connector.config.clientSecret,
        refresh_token: connector.config.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    const updatedConnector: GmailConnector = {
      ...connector,
      config: {
        ...connector.config,
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      },
    };

    return updatedConnector;
  } catch (error) {
    throw new Error(
      `Failed to refresh Gmail token: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List emails with pagination and filtering
 */
export async function listEmails(
  connector: GmailConnector,
  options: ListEmailsOptions = {}
): Promise<{ emails: EmailResult[]; nextPageToken?: string }> {
  const {
    maxResults = 10,
    pageToken,
    labels = [],
    query,
    includeSpamTrash = false,
  } = options;

  const params = new URLSearchParams();
  params.append('maxResults', Math.min(maxResults, 100).toString());

  if (pageToken) params.append('pageToken', pageToken);
  if (labels.length > 0) {
    params.append('labelIds', labels.join(','));
  }
  if (query) params.append('q', query);
  params.append('includeSpamTrash', includeSpamTrash.toString());

  try {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${connector.config.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    };

    const emails: EmailResult[] = data.messages
      ? data.messages.map((msg) => ({
          id: msg.id,
          threadId: msg.threadId,
          snippet: '',
          internalDate: '',
        }))
      : [];

    return {
      emails,
      nextPageToken: data.nextPageToken,
    };
  } catch (error) {
    throw new Error(
      `Failed to list emails: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Search emails using Gmail search query syntax
 */
export async function searchEmails(
  connector: GmailConnector,
  query: string,
  options: SearchOptions = {}
): Promise<{ emails: EmailResult[]; nextPageToken?: string }> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const { maxResults = 10, pageToken } = options;

  const params = new URLSearchParams();
  params.append('q', query);
  params.append('maxResults', Math.min(maxResults, 100).toString());

  if (pageToken) params.append('pageToken', pageToken);

  try {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${connector.config.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gmail search failed: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    };

    const emails: EmailResult[] = data.messages
      ? data.messages.map((msg) => ({
          id: msg.id,
          threadId: msg.threadId,
          snippet: '',
          internalDate: '',
        }))
      : [];

    return {
      emails,
      nextPageToken: data.nextPageToken,
    };
  } catch (error) {
    throw new Error(
      `Failed to search emails: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get full email details including headers, body, and attachments
 */
export async function getEmailById(
  connector: GmailConnector,
  messageId: string
): Promise<EmailDetail> {
  if (!messageId || messageId.trim().length === 0) {
    throw new Error('Message ID cannot be empty');
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${connector.config.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch email: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id: string;
      threadId: string;
      labelIds?: string[];
      snippet: string;
      internalDate: string;
      payload?: {
        headers?: Array<{ name: string; value: string }>;
        mimeType: string;
        parts?: Array<{
          mimeType: string;
          filename?: string;
          body?: { size: number; data?: string; attachmentId?: string };
        }>;
        body?: { size: number; data?: string };
      };
    };

    const payload = data.payload;
    const mimeType = payload?.mimeType || 'text/plain';

    // Extract headers
    const headers: EmailDetail['headers'] = {};
    if (payload?.headers) {
      for (const header of payload.headers) {
        headers[header.name] = header.value;
      }
    }

    // Extract body
    let body = '';
    if (payload?.body?.data) {
      body = decodeBase64Url(payload.body.data);
    } else if (payload?.parts) {
      // Find text or html part
      for (const part of payload.parts) {
        if (
          (part.mimeType === 'text/plain' || part.mimeType === 'text/html') &&
          part.body?.data
        ) {
          body = decodeBase64Url(part.body.data);
          break;
        }
      }
    }

    // Extract attachments
    const attachments: EmailAttachment[] = [];
    if (payload?.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size || 0,
          });
        }
      }
    }

    return {
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds,
      snippet: data.snippet,
      internalDate: data.internalDate,
      headers: {
        from: getHeaderValue(headers, 'From'),
        to: getHeaderValue(headers, 'To'),
        cc: getHeaderValue(headers, 'Cc'),
        bcc: getHeaderValue(headers, 'Bcc'),
        subject: getHeaderValue(headers, 'Subject'),
        date: getHeaderValue(headers, 'Date'),
        contentType: getHeaderValue(headers, 'Content-Type'),
      },
      body,
      attachments,
      mimeType,
    };
  } catch (error) {
    throw new Error(
      `Failed to get email details: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Send an email with optional approval check for write_with_approval mode
 */
export async function sendEmail(
  connector: GmailConnector,
  email: SendEmailInput
): Promise<SendEmailResult> {
  if (!email.to || !email.subject || !email.body) {
    throw new Error('Email requires to, subject, and body fields');
  }

  const writeMode = connector.config.writeMode || 'direct';

  // Return approval pending if in write_with_approval mode
  if (writeMode === 'write_with_approval') {
    return {
      id: '',
      threadId: '',
      requiresApproval: true,
      approvalPending: true,
    };
  }

  try {
    const rfc2822Message = createRfc2822Message(email);
    const encodedMessage = encodeBase64Url(rfc2822Message);

    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connector.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedMessage,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id: string;
      threadId: string;
      labelIds?: string[];
    };

    return {
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds,
      requiresApproval: false,
      approvalPending: false,
    };
  } catch (error) {
    throw new Error(
      `Failed to send email: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create a draft email
 */
export async function createDraftEmail(
  connector: GmailConnector,
  email: SendEmailInput
): Promise<DraftResult> {
  if (!email.to || !email.subject || !email.body) {
    throw new Error('Draft requires to, subject, and body fields');
  }

  try {
    const rfc2822Message = createRfc2822Message(email);
    const encodedMessage = encodeBase64Url(rfc2822Message);

    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connector.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          raw: encodedMessage,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create draft: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id: string;
      message: {
        id: string;
        threadId: string;
        labelIds?: string[];
      };
    };

    return {
      id: data.id,
      message: {
        id: data.message.id,
        threadId: data.message.threadId,
        labelIds: data.message.labelIds,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to create draft: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
