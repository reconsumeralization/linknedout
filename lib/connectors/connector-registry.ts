/**
 * Connector Registry for linkedout
 * Manages connector definitions and tool registrations across all integrated services.
 */

// ============================================================================
// Types
// ============================================================================

export interface ConnectorTool {
  name: string;
  description: string;
  requiresApproval: boolean;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required: boolean;
    }
  >;
}

export interface ConnectorDefinition {
  provider: string;
  displayName: string;
  requiredScopes: string[];
  oauthConfigured: boolean;
  tools: ConnectorTool[];
}

// ============================================================================
// Registry Store
// ============================================================================

const connectorRegistry = new Map<string, ConnectorDefinition>();

// ============================================================================
// Gmail Connector Definition
// ============================================================================

const GMAIL_CONNECTOR: ConnectorDefinition = {
  provider: 'gmail',
  displayName: 'Gmail',
  requiredScopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  oauthConfigured: true,
  tools: [
    {
      name: 'listEmails',
      description:
        'List emails from inbox or other labels with pagination, filtering by labels, dates, and custom queries',
      requiresApproval: false,
      parameters: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 10, max: 100)',
          required: false,
        },
        pageToken: {
          type: 'string',
          description: 'Page token for pagination',
          required: false,
        },
        labels: {
          type: 'array',
          description: 'Gmail label IDs to filter by (e.g., ["INBOX", "UNREAD"])',
          required: false,
        },
        query: {
          type: 'string',
          description:
            'Gmail search query (e.g., "from:user@example.com is:unread after:2024-01-01")',
          required: false,
        },
        includeSpamTrash: {
          type: 'boolean',
          description: 'Include spam and trash in results',
          required: false,
        },
      },
    },
    {
      name: 'searchEmails',
      description: 'Search emails using Gmail search query syntax with pagination',
      requiresApproval: false,
      parameters: {
        query: {
          type: 'string',
          description:
            'Gmail search query syntax (from:, to:, subject:, has:attachment, is:unread, etc.)',
          required: true,
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 100)',
          required: false,
        },
        pageToken: {
          type: 'string',
          description: 'Page token for pagination',
          required: false,
        },
      },
    },
    {
      name: 'getEmailById',
      description: 'Get full email details including headers, body, and attachments',
      requiresApproval: false,
      parameters: {
        messageId: {
          type: 'string',
          description: 'Gmail message ID',
          required: true,
        },
      },
    },
    {
      name: 'sendEmail',
      description: 'Send an email (requires approval if connector in write_with_approval mode)',
      requiresApproval: true,
      parameters: {
        to: {
          type: 'string|string[]',
          description: 'Recipient email address or array of addresses',
          required: true,
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
          required: true,
        },
        body: {
          type: 'string',
          description: 'Email body content',
          required: true,
        },
        html: {
          type: 'boolean',
          description: 'Whether body is HTML (default: false)',
          required: false,
        },
        cc: {
          type: 'string|string[]',
          description: 'CC recipient(s)',
          required: false,
        },
        bcc: {
          type: 'string|string[]',
          description: 'BCC recipient(s)',
          required: false,
        },
        attachments: {
          type: 'array',
          description: 'Array of attachments with filename, content, and mimeType',
          required: false,
        },
      },
    },
    {
      name: 'createDraftEmail',
      description: 'Create a draft email without sending',
      requiresApproval: false,
      parameters: {
        to: {
          type: 'string|string[]',
          description: 'Recipient email address or array of addresses',
          required: true,
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
          required: true,
        },
        body: {
          type: 'string',
          description: 'Email body content',
          required: true,
        },
        html: {
          type: 'boolean',
          description: 'Whether body is HTML (default: false)',
          required: false,
        },
        cc: {
          type: 'string|string[]',
          description: 'CC recipient(s)',
          required: false,
        },
        bcc: {
          type: 'string|string[]',
          description: 'BCC recipient(s)',
          required: false,
        },
      },
    },
    {
      name: 'refreshToken',
      description: 'Refresh Gmail OAuth access token using refresh token',
      requiresApproval: false,
      parameters: {},
    },
  ],
};

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Register a new connector definition
 */
export function registerConnector(definition: ConnectorDefinition): void {
  if (!definition.provider || definition.provider.trim().length === 0) {
    throw new Error('Connector definition must have a provider name');
  }

  if (!definition.displayName || definition.displayName.trim().length === 0) {
    throw new Error('Connector definition must have a displayName');
  }

  if (!Array.isArray(definition.tools) || definition.tools.length === 0) {
    throw new Error('Connector definition must have at least one tool');
  }

  connectorRegistry.set(definition.provider.toLowerCase(), definition);
}

/**
 * Get a connector definition by provider name
 */
export function getConnector(provider: string): ConnectorDefinition | undefined {
  return connectorRegistry.get(provider.toLowerCase());
}

/**
 * Get all registered connectors
 */
export function getAllConnectors(): ConnectorDefinition[] {
  return Array.from(connectorRegistry.values());
}

/**
 * Check if a connector is registered
 */
export function isConnectorRegistered(provider: string): boolean {
  return connectorRegistry.has(provider.toLowerCase());
}

/**
 * Get tool by connector provider and tool name
 */
export function getConnectorTool(
  provider: string,
  toolName: string
): ConnectorTool | undefined {
  const connector = getConnector(provider);
  if (!connector) return undefined;

  return connector.tools.find((tool) => tool.name === toolName);
}

/**
 * List all tools for a connector
 */
export function getConnectorTools(provider: string): ConnectorTool[] {
  const connector = getConnector(provider);
  return connector ? connector.tools : [];
}

/**
 * Check if a tool requires approval
 */
export function toolRequiresApproval(provider: string, toolName: string): boolean {
  const tool = getConnectorTool(provider, toolName);
  return tool ? tool.requiresApproval : false;
}

/**
 * Get required OAuth scopes for a connector
 */
export function getRequiredScopes(provider: string): string[] {
  const connector = getConnector(provider);
  return connector ? connector.requiredScopes : [];
}

/**
 * Validate tool parameters against connector definition
 */
export function validateToolParameters(
  provider: string,
  toolName: string,
  params: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tool = getConnectorTool(provider, toolName);

  if (!tool) {
    return {
      valid: false,
      errors: [`Tool ${toolName} not found for provider ${provider}`],
    };
  }

  // Check required parameters
  for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
    if (paramDef.required && !(paramName in params)) {
      errors.push(`Required parameter "${paramName}" is missing`);
    }

    // Type validation
    if (paramName in params) {
      const value = params[paramName];
      const expectedType = paramDef.type.split('|')[0]; // Handle union types like "string|string[]"

      if (expectedType === 'array' && !Array.isArray(value)) {
        errors.push(`Parameter "${paramName}" must be an array`);
      } else if (expectedType === 'number' && typeof value !== 'number') {
        errors.push(`Parameter "${paramName}" must be a number`);
      } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Parameter "${paramName}" must be a boolean`);
      } else if (expectedType === 'string' && typeof value !== 'string') {
        errors.push(`Parameter "${paramName}" must be a string`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Marketplace Integration Connectors (auto-generated from catalog)
// ============================================================================

import { INTEGRATION_CATALOG } from './integration-catalog';

function buildConnectorsFromCatalog(): ConnectorDefinition[] {
  return INTEGRATION_CATALOG.filter((entry) => entry.available && entry.agentTools.length > 0).map(
    (entry) => ({
      provider: entry.id,
      displayName: entry.name,
      requiredScopes: entry.envKeys.map((k) => `env:${k}`),
      oauthConfigured: entry.oauth,
      tools: entry.agentTools.map((toolId) => ({
        name: toolId,
        description: `${entry.name}: ${toolId.replace(':', ' ')}`,
        requiresApproval: toolId.includes(':send') || toolId.includes(':write') || toolId.includes(':delete') || toolId.includes(':create') || toolId.includes(':mutate') || toolId.includes(':publish'),
        parameters: {},
      })),
    })
  );
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the connector registry with default connectors
 */
export function initializeRegistry(): void {
  registerConnector(GMAIL_CONNECTOR);

  // Register all marketplace integrations
  for (const connector of buildConnectorsFromCatalog()) {
    // Don't overwrite Gmail which has detailed tool definitions
    if (!connectorRegistry.has(connector.provider.toLowerCase())) {
      connectorRegistry.set(connector.provider.toLowerCase(), connector);
    }
  }
}

/**
 * Get registry statistics
 */
export function getRegistryStats(): {
  totalConnectors: number;
  connectorNames: string[];
  totalTools: number;
} {
  const connectors = getAllConnectors();
  return {
    totalConnectors: connectors.length,
    connectorNames: connectors.map((c) => c.provider),
    totalTools: connectors.reduce((sum, c) => sum + c.tools.length, 0),
  };
}

// Auto-initialize on module load
if (typeof globalThis !== 'undefined') {
  try {
    // Only initialize if not already initialized
    if (connectorRegistry.size === 0) {
      initializeRegistry();
    }
  } catch {
    // Silently catch any initialization errors in module loading context
  }
}
