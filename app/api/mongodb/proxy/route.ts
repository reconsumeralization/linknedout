import { NextRequest, NextResponse } from "next/server"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// Supported actions — must match MongoDBBackend client calls
// ---------------------------------------------------------------------------
const VALID_ACTIONS = new Set([
  "ping",
  "fetchProfiles",
  "fetchTribes",
  "fetchProjects",
  "fetchDashboardSnapshot",
  "fetchProfilesPaginated",
  "fetchProjectsPaginated",
  "fetchProjectPositions",
  "fetchProjectHiringSnapshot",
  "fetchFundraisingSnapshot",
  "upsertFundraisingCampaign",
  "upsertFundraisingDonor",
  "upsertFundraisingDonation",
  "upsertFundraisingGoal",
  "importProfiles",
])

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_DB = "linkedout"
const DATA_SOURCE = "Cluster0"
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("MONGODB_PROXY_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "MONGODB_PROXY_RATE_LIMIT_MAX",
  "MONGODB_PROXY_RATE_LIMIT_WINDOW_MS",
  { max: 45, windowMs: 60_000 },
)

const PostBodySchema = z.object({
  action: z.string().min(1),
  _connectionString: z.string().min(12).max(4096).optional(),
}).passthrough()

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `mongodb-proxy:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(payload: unknown, status: number, rateLimit: RateLimitResult): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the Atlas Data API base URL.
 *  Priority: MONGODB_DATA_API_URL env var > parsed from connection string. */
function deriveDataApiUrl(connectionString: string): string | null {
  const envUrl = process.env.MONGODB_DATA_API_URL
  if (envUrl) return envUrl.replace(/\/$/, "")

  try {
    const match = connectionString.match(
      /mongodb(?:\+srv)?:\/\/[^/]+@([^/]+)/
    )
    if (!match) return null
    // Extract cluster segment (e.g. "cluster0.abc123.mongodb.net")
    const host = match[1]
    const segments = host.split(".")
    if (segments.length < 3) return null
    const clusterId = segments[1] // e.g. "abc123"
    return `https://data.mongodb-api.com/app/data-${clusterId}/endpoint/data/v1`
  } catch {
    return null
  }
}

/** Extract database name from connection string, default to "linkedout". */
function extractDatabase(connectionString: string): string {
  try {
    const match = connectionString.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/)
    return match?.[1] || DEFAULT_DB
  } catch {
    return DEFAULT_DB
  }
}

/** Normalize MongoDB _id fields to string id for the frontend. */
function normalizeId(doc: Record<string, unknown>): Record<string, unknown> {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return { id: typeof _id === "string" ? _id : String(_id ?? ""), ...rest }
}

function normalizeDocs(docs: Record<string, unknown>[]): Record<string, unknown>[] {
  return docs.map(normalizeId)
}

/** Make an authenticated request to the Atlas Data API. */
async function dataApiRequest(
  baseUrl: string,
  apiAction: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const apiKey = process.env.MONGODB_DATA_API_KEY
  if (!apiKey) {
    throw new Error("MONGODB_DATA_API_KEY environment variable is required")
  }

  const res = await fetch(`${baseUrl}/action/${apiAction}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Atlas Data API ${res.status}: ${text}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

async function mongoDataApi(
  baseUrl: string,
  connectionString: string,
  action: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const database = extractDatabase(connectionString)
  const base = { dataSource: DATA_SOURCE, database }

  switch (action) {
    case "ping": {
      // If we have a Data API key, verify connectivity; otherwise just confirm parsing works
      if (process.env.MONGODB_DATA_API_KEY) {
        const res = (await dataApiRequest(baseUrl, "findOne", {
          ...base,
          collection: "profiles",
          filter: {},
          projection: { _id: 1 },
        })) as { document: unknown }
        return { ok: true, hasData: !!res.document }
      }
      return { ok: true }
    }

    case "fetchProfiles": {
      const res = (await dataApiRequest(baseUrl, "find", {
        ...base,
        collection: "profiles",
        filter: {},
        limit: 500,
      })) as { documents: Record<string, unknown>[] }
      return normalizeDocs(res.documents ?? [])
    }

    case "fetchTribes": {
      const res = (await dataApiRequest(baseUrl, "find", {
        ...base,
        collection: "tribes",
        filter: {},
        limit: 200,
      })) as { documents: Record<string, unknown>[] }
      return normalizeDocs(res.documents ?? [])
    }

    case "fetchProjects": {
      const res = (await dataApiRequest(baseUrl, "find", {
        ...base,
        collection: "projects",
        filter: {},
        limit: 200,
      })) as { documents: Record<string, unknown>[] }
      return normalizeDocs(res.documents ?? [])
    }

    case "fetchDashboardSnapshot": {
      const [profiles, tribes, projects] = await Promise.all([
        dataApiRequest(baseUrl, "aggregate", {
          ...base, collection: "profiles",
          pipeline: [{ $count: "count" }],
        }) as Promise<{ documents: { count: number }[] }>,
        dataApiRequest(baseUrl, "aggregate", {
          ...base, collection: "tribes",
          pipeline: [{ $count: "count" }],
        }) as Promise<{ documents: { count: number }[] }>,
        dataApiRequest(baseUrl, "aggregate", {
          ...base, collection: "projects",
          pipeline: [{ $count: "count" }],
        }) as Promise<{ documents: { count: number }[] }>,
      ])

      return {
        totalProfiles: profiles.documents?.[0]?.count ?? 0,
        totalTribes: tribes.documents?.[0]?.count ?? 0,
        totalProjects: projects.documents?.[0]?.count ?? 0,
        recentActivity: [],
      }
    }

    case "fetchProfilesPaginated": {
      const opts = (payload.opts ?? {}) as { cursor?: string; pageSize?: number }
      const skip = opts.cursor ? parseInt(opts.cursor, 10) : 0
      const limit = opts.pageSize ?? 25

      const res = (await dataApiRequest(baseUrl, "find", {
        ...base,
        collection: "profiles",
        filter: {},
        skip,
        limit: limit + 1, // fetch one extra to detect hasMore
      })) as { documents: Record<string, unknown>[] }

      const docs = res.documents ?? []
      const hasMore = docs.length > limit
      const page = hasMore ? docs.slice(0, limit) : docs

      return {
        data: normalizeDocs(page),
        nextCursor: hasMore ? String(skip + limit) : null,
        hasMore,
      }
    }

    case "fetchProjectsPaginated": {
      const opts = (payload.opts ?? {}) as { cursor?: string; pageSize?: number }
      const skip = opts.cursor ? parseInt(opts.cursor, 10) : 0
      const limit = opts.pageSize ?? 25

      const res = (await dataApiRequest(baseUrl, "find", {
        ...base,
        collection: "projects",
        filter: {},
        skip,
        limit: limit + 1,
      })) as { documents: Record<string, unknown>[] }

      const docs = res.documents ?? []
      const hasMore = docs.length > limit
      const page = hasMore ? docs.slice(0, limit) : docs

      return {
        data: normalizeDocs(page),
        nextCursor: hasMore ? String(skip + limit) : null,
        hasMore,
      }
    }

    case "fetchProjectPositions": {
      const projectId = payload.projectId as string | undefined
      const res = (await dataApiRequest(baseUrl, "find", {
        ...base,
        collection: "positions",
        filter: projectId ? { project_id: projectId } : {},
        limit: 200,
      })) as { documents: Record<string, unknown>[] }
      return normalizeDocs(res.documents ?? [])
    }

    case "fetchProjectHiringSnapshot": {
      const projectId = payload.projectId as string | undefined
      const matchStage = projectId ? { $match: { project_id: projectId } } : { $match: {} }

      const res = (await dataApiRequest(baseUrl, "aggregate", {
        ...base,
        collection: "positions",
        pipeline: [
          matchStage,
          {
            $facet: {
              total: [{ $count: "count" }],
              open: [{ $match: { status: "open" } }, { $count: "count" }],
              filled: [{ $match: { status: "filled" } }, { $count: "count" }],
              positions: [{ $limit: 100 }],
            },
          },
        ],
      })) as { documents: Record<string, unknown>[] }

      const facets = res.documents?.[0] as Record<string, { count?: number }[]> | undefined

      return {
        totalPositions: facets?.total?.[0]?.count ?? 0,
        openPositions: facets?.open?.[0]?.count ?? 0,
        filledPositions: facets?.filled?.[0]?.count ?? 0,
        positions: normalizeDocs((facets?.positions ?? []) as Record<string, unknown>[]),
      }
    }

    case "fetchFundraisingSnapshot": {
      const [campaigns, donors, donations, goals] = await Promise.all([
        dataApiRequest(baseUrl, "find", { ...base, collection: "fundraising_campaigns", filter: {}, limit: 200 }) as Promise<{ documents: Record<string, unknown>[] }>,
        dataApiRequest(baseUrl, "find", { ...base, collection: "fundraising_donors", filter: {}, limit: 500 }) as Promise<{ documents: Record<string, unknown>[] }>,
        dataApiRequest(baseUrl, "find", { ...base, collection: "fundraising_donations", filter: {}, limit: 1000 }) as Promise<{ documents: Record<string, unknown>[] }>,
        dataApiRequest(baseUrl, "find", { ...base, collection: "fundraising_goals", filter: {}, limit: 100 }) as Promise<{ documents: Record<string, unknown>[] }>,
      ])

      const donationDocs = donations.documents ?? []
      const goalDocs = goals.documents ?? []
      const totalRaised = donationDocs.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
      const totalGoal = goalDocs.reduce((sum, g) => sum + (Number(g.target_amount) || 0), 0)

      return {
        campaigns: normalizeDocs(campaigns.documents ?? []),
        donors: normalizeDocs(donors.documents ?? []),
        donations: normalizeDocs(donationDocs),
        goals: normalizeDocs(goalDocs),
        totalRaised,
        totalGoal,
      }
    }

    case "upsertFundraisingCampaign": {
      const input = payload.input as Record<string, unknown>
      const res = await dataApiRequest(baseUrl, "updateOne", {
        ...base,
        collection: "fundraising_campaigns",
        filter: input.id ? { _id: { $oid: input.id } } : { name: input.name },
        update: { $set: input },
        upsert: true,
      })
      return res
    }

    case "upsertFundraisingDonor": {
      const input = payload.input as Record<string, unknown>
      const res = await dataApiRequest(baseUrl, "updateOne", {
        ...base,
        collection: "fundraising_donors",
        filter: input.id ? { _id: { $oid: input.id } } : { email: input.email },
        update: { $set: input },
        upsert: true,
      })
      return res
    }

    case "upsertFundraisingDonation": {
      const input = payload.input as Record<string, unknown>
      const res = await dataApiRequest(baseUrl, "updateOne", {
        ...base,
        collection: "fundraising_donations",
        filter: input.id ? { _id: { $oid: input.id } } : { donor_id: input.donor_id, campaign_id: input.campaign_id, created_at: input.created_at },
        update: { $set: input },
        upsert: true,
      })
      return res
    }

    case "upsertFundraisingGoal": {
      const input = payload.input as Record<string, unknown>
      const res = await dataApiRequest(baseUrl, "updateOne", {
        ...base,
        collection: "fundraising_goals",
        filter: input.id ? { _id: { $oid: input.id } } : { name: input.name },
        update: { $set: input },
        upsert: true,
      })
      return res
    }

    case "importProfiles": {
      const profiles = (payload.profiles ?? []) as Record<string, unknown>[]
      if (profiles.length === 0) return { saved: [], counts: { inserted: 0, updated: 0 } }

      const res = (await dataApiRequest(baseUrl, "insertMany", {
        ...base,
        collection: "profiles",
        documents: profiles,
      })) as { insertedIds: string[] }

      return {
        saved: normalizeDocs(profiles.map((p, i) => ({ ...p, _id: res.insertedIds?.[i] ?? "" }))),
        counts: { inserted: res.insertedIds?.length ?? 0, updated: 0 },
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds },
      429,
      rateLimit,
    )
  }

  // MongoDB backend is not yet configured for production use.
  // Return a clear message instead of failing silently.
  const authResult = await requireSupabaseAuth(req, {
    errorBody: { error: "A valid Supabase bearer token is required for this route." },
  })
  if (!authResult.auth) {
    return new NextResponse(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }

  try {
    const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
    if (!parsedBody.ok) {
      return jsonResponse({ error: parsedBody.error }, parsedBody.status, rateLimit)
    }

    const bodyResult = PostBodySchema.safeParse(parsedBody.value)
    if (!bodyResult.success) {
      return jsonResponse(
        { error: "Invalid request payload.", details: bodyResult.error.flatten() },
        400,
        rateLimit,
      )
    }

    const { action, _connectionString, ...payload } = bodyResult.data

    // Validate action
    if (!VALID_ACTIONS.has(action)) {
      return jsonResponse({ error: `Unsupported action: ${action}` }, 400, rateLimit)
    }

    // Preserve backward compatibility: ping can succeed without full env wiring.
    if (action === "ping" && !process.env.MONGODB_DATA_API_KEY) {
      return jsonResponse({ data: { ok: true, configured: false } }, 200, rateLimit)
    }

    if (!process.env.MONGODB_DATA_API_KEY) {
      return jsonResponse(
        {
          error: "MongoDB backend is not configured. Supabase is the active backend. " +
            "To enable MongoDB, set MONGODB_DATA_API_KEY and MONGODB_DATA_API_URL environment variables.",
          code: "BACKEND_NOT_CONFIGURED",
        },
        501,
        rateLimit,
      )
    }

    const serverConnectionString = process.env.MONGODB_URL?.trim() || _connectionString?.trim()
    if (!serverConnectionString) {
      return jsonResponse(
        {
          error: "MongoDB backend is not configured. Set MONGODB_URL alongside MONGODB_DATA_API_KEY.",
          code: "BACKEND_NOT_CONFIGURED",
        },
        501,
        rateLimit,
      )
    }

    const baseUrl = deriveDataApiUrl(serverConnectionString)
    if (!baseUrl) {
      return jsonResponse({ error: "Invalid MongoDB connection string format in server config." }, 500, rateLimit)
    }

    // Execute action
    const result = await mongoDataApi(baseUrl, serverConnectionString, action, payload)

    return jsonResponse({ data: result }, 200, rateLimit)
  } catch (err) {
    console.error("[mongodb/proxy] error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return jsonResponse({ error: message }, 500, rateLimit)
  }
}
