import {
  getMcpAuthorizationServers,
  getMcpResourceUrl,
  getMcpScopesSupported,
} from "@/lib/auth/mcp-auth"

export const runtime = "nodejs"

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}

export async function GET(req: Request): Promise<Response> {
  return jsonResponse({
    resource: getMcpResourceUrl(req),
    authorization_servers: getMcpAuthorizationServers(),
    scopes_supported: getMcpScopesSupported(),
    bearer_methods_supported: ["header"],
    resource_name: process.env.MCP_SERVER_NAME || "linknedout-mcp",
  })
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  })
}

