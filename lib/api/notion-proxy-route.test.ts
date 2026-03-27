import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/notion/proxy/route"

vi.mock("@/lib/auth/require-auth", () => ({
  requireSupabaseAuth: vi.fn(async (req: Request) => {
    if (req.headers.get("authorization") === "Bearer test-token") {
      return {
        auth: { userId: "user-1", accessToken: "test-token" },
        response: null,
      }
    }
    return {
      auth: null,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    }
  }),
}))

beforeEach(() => {
  vi.restoreAllMocks()
})

function makeRequest(body: unknown, token?: string) {
  return new Request("http://localhost/api/notion/proxy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0]
}

describe("notion proxy route", () => {
  it("returns 401 when authorization is missing", async () => {
    const res = await POST(makeRequest({ action: "ping", _credentials: { apiKey: "ntn_test_key_12345" } }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for unsupported action", async () => {
    const res = await POST(
      makeRequest({
        action: "deleteAllPages",
        _credentials: { apiKey: "ntn_test_key_12345" },
      }, "test-token"),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when apiKey is missing from credentials", async () => {
    const res = await POST(
      makeRequest({ action: "ping", _credentials: { workspaceId: "ws-123" } }, "test-token"),
    )
    expect(res.status).toBe(400)
  })
})
