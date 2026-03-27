import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("SYNC_MAX_BODY_BYTES", 128_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SYNC_RATE_LIMIT_MAX",
  "SYNC_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                        */
/* ------------------------------------------------------------------ */

const OperationTypeSchema = z.enum([
  "insert",
  "update",
  "delete",
  "upsert",
])

const StateTypeSchema = z.enum([
  "profile",
  "tribe",
  "connections",
  "settings",
  "activity",
  "messages",
])

const QueueEntrySchema = z.object({
  operationType: OperationTypeSchema,
  payload: z.record(z.unknown()),
  targetTable: z.string().min(1).max(120),
  priority: z.number().min(0).max(100).optional().default(0),
  createdOfflineAt: z.string().datetime(),
})

const FlushQueueSchema = z.object({
  action: z.literal("flush_queue"),
  entries: z.array(QueueEntrySchema).min(1).max(500),
})

const TakeSnapshotSchema = z.object({
  action: z.literal("take_snapshot"),
  stateType: StateTypeSchema,
  stateKey: z.string().min(1).max(512),
})

const ResolveConflictSchema = z.object({
  action: z.literal("resolve_conflict"),
  conflictId: z.string().min(1).max(120),
  resolution: z.enum(["local_wins", "remote_wins", "merged", "manual"]),
})

const GetSyncStatusSchema = z.object({
  action: z.literal("get_sync_status"),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  FlushQueueSchema,
  TakeSnapshotSchema,
  ResolveConflictSchema,
  GetSyncStatusSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `sync:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

function userClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function serviceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                        */
/* ------------------------------------------------------------------ */

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
    )
  }

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponse({ ok: false, error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const parsed = PostRequestSchema.safeParse(parsedBody.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request payload.",
        details: parsed.error.flatten(),
      },
      400,
      rateLimit,
    )
  }

  const input: PostRequest = parsed.data
  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for this action." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const accessToken = authResult.auth.accessToken
  const userId = authResult.auth.userId

  /* ---- flush_queue ---- */
  if (input.action === "flush_queue") {
    const supabase = userClient(accessToken)

    const rows = input.entries.map((entry) => ({
      user_id: userId,
      operation_type: entry.operationType,
      payload: entry.payload,
      target_table: entry.targetTable,
      priority: entry.priority,
      created_offline_at: entry.createdOfflineAt,
      status: "pending",
    }))

    const { data, error } = await supabase
      .from("latency_buffer_queue")
      .insert(rows)
      .select("*")

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, queued: data?.length ?? 0, entries: data },
      200,
      rateLimit,
    )
  }

  /* ---- take_snapshot ---- */
  if (input.action === "take_snapshot") {
    const supabase = userClient(accessToken)
    const svc = serviceClient()

    // Query the relevant table for latest state using service client
    const { data: currentState, error: stateErr } = await svc
      .from(input.stateType === "profile" ? "profiles" :
            input.stateType === "tribe" ? "tribes" :
            input.stateType === "connections" ? "connections" :
            input.stateType === "settings" ? "user_settings" :
            input.stateType === "activity" ? "activity_log" :
            "messages")
      .select("*")
      .eq(input.stateType === "activity" ? "user_id" : "id", input.stateKey)
      .limit(1)
      .single()

    if (stateErr) {
      return jsonResponse({ ok: false, error: stateErr.message }, 400, rateLimit)
    }

    // Upsert into shadow_state_snapshots
    const { data: snapshot, error: snapErr } = await supabase
      .from("shadow_state_snapshots")
      .upsert(
        {
          user_id: userId,
          state_type: input.stateType,
          state_key: input.stateKey,
          state_data: currentState,
          snapshot_at: new Date().toISOString(),
        },
        { onConflict: "user_id,state_type,state_key" },
      )
      .select("*")
      .single()

    if (snapErr) {
      return jsonResponse({ ok: false, error: snapErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, snapshot },
      200,
      rateLimit,
    )
  }

  /* ---- resolve_conflict ---- */
  if (input.action === "resolve_conflict") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("sync_conflict_log")
      .update({
        resolution: input.resolution,
        resolved_by_user_id: userId,
        resolved_at: new Date().toISOString(),
        status: "resolved",
      })
      .eq("id", input.conflictId)
      .select("*")
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, conflict: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_sync_status ---- */
  if (input.action === "get_sync_status") {
    const supabase = userClient(accessToken)

    // Pending queue count
    const { count: pendingCount, error: pendingErr } = await supabase
      .from("latency_buffer_queue")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending")

    if (pendingErr) {
      return jsonResponse({ ok: false, error: pendingErr.message }, 400, rateLimit)
    }

    // Unresolved conflict count
    const { count: conflictCount, error: conflictErr } = await supabase
      .from("sync_conflict_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "unresolved")

    if (conflictErr) {
      return jsonResponse({ ok: false, error: conflictErr.message }, 400, rateLimit)
    }

    // Stale snapshot count (snapshots older than 24 hours)
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: staleCount, error: staleErr } = await supabase
      .from("shadow_state_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .lt("snapshot_at", staleThreshold)

    if (staleErr) {
      return jsonResponse({ ok: false, error: staleErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        syncStatus: {
          pendingQueueCount: pendingCount ?? 0,
          unresolvedConflictCount: conflictCount ?? 0,
          staleSnapshotCount: staleCount ?? 0,
        },
      },
      200,
      rateLimit,
    )
  }

  return jsonResponse({ ok: false, error: "Unknown action." }, 400, rateLimit)
}
