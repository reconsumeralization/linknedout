import { describe, expect, it, beforeEach } from "vitest"
import {
  getAllConnectors,
  getConnector,
  registerConnector,
  getConnectorTool,
  getConnectorTools,
  toolRequiresApproval,
  getRequiredScopes,
  isConnectorRegistered,
  validateToolParameters,
  initializeRegistry,
  getRegistryStats,
  type ConnectorDefinition,
} from "@/lib/connectors/connector-registry"

describe("connector registry", () => {
  beforeEach(() => {
    // Ensure registry is initialized before each test
    initializeRegistry()
  })

  it("getAllConnectors() returns at least Gmail", () => {
    const connectors = getAllConnectors()
    expect(connectors.length).toBeGreaterThanOrEqual(1)

    const gmailConnector = connectors.find((c) => c.provider === "gmail")
    expect(gmailConnector).toBeDefined()
  })

  it("getConnector('gmail') returns a valid definition", () => {
    const gmail = getConnector("gmail")
    expect(gmail).toBeDefined()
    expect(gmail?.provider).toBe("gmail")
    expect(gmail?.displayName).toBe("Gmail")
  })

  it("getConnector() is case-insensitive", () => {
    const gmail1 = getConnector("gmail")
    const gmail2 = getConnector("GMAIL")
    const gmail3 = getConnector("Gmail")

    expect(gmail1).toEqual(gmail2)
    expect(gmail2).toEqual(gmail3)
  })

  it("Gmail connector has expected tools (read, send, search, draft)", () => {
    const gmail = getConnector("gmail")
    expect(gmail).toBeDefined()

    const toolNames = new Set(gmail!.tools.map((t) => t.name))

    expect(toolNames.has("listEmails")).toBe(true)
    expect(toolNames.has("searchEmails")).toBe(true)
    expect(toolNames.has("sendEmail")).toBe(true)
    expect(toolNames.has("createDraftEmail")).toBe(true)
  })

  it("registerConnector() adds a new connector", () => {
    const newConnector: ConnectorDefinition = {
      provider: "test-connector",
      displayName: "Test Connector",
      requiredScopes: ["test.read", "test.write"],
      oauthConfigured: true,
      tools: [
        {
          name: "testTool",
          description: "A test tool",
          requiresApproval: false,
          parameters: {
            input: {
              type: "string",
              description: "Test input",
              required: true,
            },
          },
        },
      ],
    }

    registerConnector(newConnector)

    const registered = getConnector("test-connector")
    expect(registered).toBeDefined()
    expect(registered?.displayName).toBe("Test Connector")
    expect(registered?.tools).toHaveLength(1)
  })

  it("getConnector() returns undefined for unknown providers", () => {
    const unknown = getConnector("non-existent-provider")
    expect(unknown).toBeUndefined()
  })

  it("each tool has name, description, and parameters", () => {
    const connectors = getAllConnectors()

    for (const connector of connectors) {
      for (const tool of connector.tools) {
        expect(typeof tool.name).toBe("string")
        expect(tool.name.length).toBeGreaterThan(0)

        expect(typeof tool.description).toBe("string")
        expect(tool.description.length).toBeGreaterThan(0)

        expect(typeof tool.requiresApproval).toBe("boolean")
        expect(typeof tool.parameters).toBe("object")
      }
    }
  })

  it("Gmail connector has required OAuth scopes", () => {
    const gmail = getConnector("gmail")
    expect(gmail?.requiredScopes).toBeDefined()
    expect(gmail?.requiredScopes.length).toBeGreaterThan(0)

    expect(gmail?.requiredScopes).toContain(
      "https://www.googleapis.com/auth/gmail.readonly"
    )
    expect(gmail?.requiredScopes).toContain(
      "https://www.googleapis.com/auth/gmail.send"
    )
  })

  it("getConnectorTool() returns specific tool from connector", () => {
    const sendEmailTool = getConnectorTool("gmail", "sendEmail")
    expect(sendEmailTool).toBeDefined()
    expect(sendEmailTool?.name).toBe("sendEmail")
    expect(sendEmailTool?.description).toMatch(/send/i)
  })

  it("getConnectorTool() returns undefined for non-existent tools", () => {
    const unknownTool = getConnectorTool("gmail", "nonExistentTool")
    expect(unknownTool).toBeUndefined()
  })

  it("getConnectorTools() returns all tools for a connector", () => {
    const gmailTools = getConnectorTools("gmail")
    expect(Array.isArray(gmailTools)).toBe(true)
    expect(gmailTools.length).toBeGreaterThan(0)
  })

  it("getConnectorTools() returns empty array for unknown connector", () => {
    const unknownTools = getConnectorTools("unknown-connector")
    expect(Array.isArray(unknownTools)).toBe(true)
    expect(unknownTools).toHaveLength(0)
  })

  it("toolRequiresApproval() correctly identifies approval requirements", () => {
    // sendEmail should require approval
    expect(toolRequiresApproval("gmail", "sendEmail")).toBe(true)

    // listEmails should not require approval
    expect(toolRequiresApproval("gmail", "listEmails")).toBe(false)
    expect(toolRequiresApproval("gmail", "searchEmails")).toBe(false)
  })

  it("toolRequiresApproval() returns false for non-existent tool", () => {
    expect(toolRequiresApproval("gmail", "nonExistentTool")).toBe(false)
  })

  it("getRequiredScopes() returns scopes for valid connector", () => {
    const scopes = getRequiredScopes("gmail")
    expect(Array.isArray(scopes)).toBe(true)
    expect(scopes.length).toBeGreaterThan(0)
  })

  it("getRequiredScopes() returns empty array for unknown connector", () => {
    const scopes = getRequiredScopes("unknown-connector")
    expect(Array.isArray(scopes)).toBe(true)
    expect(scopes).toHaveLength(0)
  })

  it("isConnectorRegistered() correctly identifies registered connectors", () => {
    expect(isConnectorRegistered("gmail")).toBe(true)
    expect(isConnectorRegistered("GMAIL")).toBe(true)
    expect(isConnectorRegistered("unknown-connector")).toBe(false)
  })

  it("validateToolParameters() detects missing required parameters", () => {
    // sendEmail requires 'to', 'subject', and 'body'
    const result = validateToolParameters("gmail", "sendEmail", {
      subject: "Test Subject",
      // Missing 'to' and 'body'
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes("to"))).toBe(true)
  })

  it("validateToolParameters() accepts valid parameters", () => {
    const result = validateToolParameters("gmail", "sendEmail", {
      to: "test@example.com",
      subject: "Test Subject",
      body: "Test Body",
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("validateToolParameters() validates parameter types", () => {
    const result = validateToolParameters("gmail", "listEmails", {
      maxResults: "not-a-number", // Should be number
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("validateToolParameters() returns error for non-existent tool", () => {
    const result = validateToolParameters("gmail", "nonExistentTool", {})

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("Gmail sendEmail tool has all required parameters defined", () => {
    const sendEmailTool = getConnectorTool("gmail", "sendEmail")
    expect(sendEmailTool).toBeDefined()

    expect(sendEmailTool?.parameters).toHaveProperty("to")
    expect(sendEmailTool?.parameters).toHaveProperty("subject")
    expect(sendEmailTool?.parameters).toHaveProperty("body")
  })

  it("Gmail createDraftEmail tool has correct parameters", () => {
    const draftTool = getConnectorTool("gmail", "createDraftEmail")
    expect(draftTool).toBeDefined()
    expect(draftTool?.requiresApproval).toBe(false)

    expect(draftTool?.parameters).toHaveProperty("to")
    expect(draftTool?.parameters).toHaveProperty("subject")
    expect(draftTool?.parameters).toHaveProperty("body")
  })

  it("getRegistryStats() returns accurate statistics", () => {
    const stats = getRegistryStats()

    expect(stats).toHaveProperty("totalConnectors")
    expect(stats).toHaveProperty("connectorNames")
    expect(stats).toHaveProperty("totalTools")

    expect(stats.totalConnectors).toBeGreaterThanOrEqual(1)
    expect(stats.connectorNames.length).toBe(stats.totalConnectors)
    expect(stats.totalTools).toBeGreaterThan(0)

    // Gmail should be in the registry
    expect(stats.connectorNames).toContain("gmail")
  })

  it("all connectors have non-empty displayName", () => {
    const connectors = getAllConnectors()

    for (const connector of connectors) {
      expect(connector.displayName).toBeDefined()
      expect(connector.displayName.length).toBeGreaterThan(0)
    }
  })

  it("all connectors have required fields", () => {
    const connectors = getAllConnectors()

    for (const connector of connectors) {
      expect(connector).toHaveProperty("provider")
      expect(connector).toHaveProperty("displayName")
      expect(connector).toHaveProperty("requiredScopes")
      expect(connector).toHaveProperty("oauthConfigured")
      expect(connector).toHaveProperty("tools")

      expect(typeof connector.provider).toBe("string")
      expect(typeof connector.displayName).toBe("string")
      expect(Array.isArray(connector.requiredScopes)).toBe(true)
      expect(typeof connector.oauthConfigured).toBe("boolean")
      expect(Array.isArray(connector.tools)).toBe(true)
    }
  })

  it("Gmail connector has at least 5 tools", () => {
    const gmail = getConnector("gmail")
    expect(gmail?.tools.length).toBeGreaterThanOrEqual(5)
  })

  it("all tool parameters have type and description", () => {
    const connectors = getAllConnectors()

    for (const connector of connectors) {
      for (const tool of connector.tools) {
        for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
          expect(paramDef).toHaveProperty("type")
          expect(paramDef).toHaveProperty("description")
          expect(paramDef).toHaveProperty("required")

          expect(typeof paramDef.type).toBe("string")
          expect(typeof paramDef.description).toBe("string")
          expect(typeof paramDef.required).toBe("boolean")
        }
      }
    }
  })

  it("registerConnector() validates provider name", () => {
    const invalidConnector: ConnectorDefinition = {
      provider: "",
      displayName: "Invalid",
      requiredScopes: [],
      oauthConfigured: false,
      tools: [
        {
          name: "tool",
          description: "A tool",
          requiresApproval: false,
          parameters: {},
        },
      ],
    }

    expect(() => registerConnector(invalidConnector)).toThrow()
  })

  it("registerConnector() validates displayName", () => {
    const invalidConnector: ConnectorDefinition = {
      provider: "test",
      displayName: "",
      requiredScopes: [],
      oauthConfigured: false,
      tools: [
        {
          name: "tool",
          description: "A tool",
          requiresApproval: false,
          parameters: {},
        },
      ],
    }

    expect(() => registerConnector(invalidConnector)).toThrow()
  })

  it("registerConnector() validates tools array", () => {
    const invalidConnector: ConnectorDefinition = {
      provider: "test",
      displayName: "Test",
      requiredScopes: [],
      oauthConfigured: false,
      tools: [],
    }

    expect(() => registerConnector(invalidConnector)).toThrow()
  })

  it("Gmail listEmails tool accepts query parameter", () => {
    const listEmailsTool = getConnectorTool("gmail", "listEmails")
    expect(listEmailsTool?.parameters).toHaveProperty("query")
    expect(listEmailsTool?.parameters.query.type).toBe("string")
    expect(listEmailsTool?.parameters.query.required).toBe(false)
  })

  it("Gmail searchEmails tool requires query parameter", () => {
    const searchEmailsTool = getConnectorTool("gmail", "searchEmails")
    expect(searchEmailsTool?.parameters).toHaveProperty("query")
    expect(searchEmailsTool?.parameters.query.required).toBe(true)
  })

  it("connector registry preserves case-insensitive lookups", () => {
    registerConnector({
      provider: "MyConnector",
      displayName: "My Connector",
      requiredScopes: [],
      oauthConfigured: true,
      tools: [
        {
          name: "myTool",
          description: "A tool",
          requiresApproval: false,
          parameters: {},
        },
      ],
    })

    expect(getConnector("myconnector")).toBeDefined()
    expect(getConnector("MYCONNECTOR")).toBeDefined()
    expect(getConnector("MyConnector")).toBeDefined()
  })

  it("Gmail getEmailById tool has messageId parameter", () => {
    const getEmailTool = getConnectorTool("gmail", "getEmailById")
    expect(getEmailTool?.parameters).toHaveProperty("messageId")
    expect(getEmailTool?.parameters.messageId.required).toBe(true)
  })

  it("Gmail refreshToken tool exists", () => {
    const refreshTool = getConnectorTool("gmail", "refreshToken")
    expect(refreshTool).toBeDefined()
    expect(refreshTool?.requiresApproval).toBe(false)
  })

  it("validateToolParameters() allows array types", () => {
    const result = validateToolParameters("gmail", "listEmails", {
      labels: ["INBOX", "UNREAD"],
    })

    expect(result.valid).toBe(true)
  })

  it("validateToolParameters() validates array type parameter", () => {
    const result = validateToolParameters("gmail", "listEmails", {
      labels: "not-an-array", // Should be array
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
