import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/mongodb/proxy/route"

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
  return new Request("http://localhost/api/mongodb/proxy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0]
}

describe("mongodb proxy route", () => {
  it("returns 401 when authorization is missing", async () => {
    const res = await POST(makeRequest({ action: "ping", _connectionString: "mongodb+srv://user:pass@cluster0.abc.mongodb.net/db" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when action is missing", async () => {
    const res = await POST(makeRequest({}, "test-token"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for unsupported action", async () => {
    const res = await POST(
      makeRequest({ action: "dropDatabase", _connectionString: "mongodb+srv://user:pass@cluster0.abc.mongodb.net/db" }, "test-token"),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/unsupported/i)
  })

  it("returns 200 for ping with valid auth and connection string", async () => {
    const res = await POST(
      makeRequest({
        action: "ping",
        _connectionString: "mongodb+srv://user:pass@cluster0.abc.mongodb.net/db",
      }, "test-token"),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data).toHaveProperty("ok", true)
  })
})
