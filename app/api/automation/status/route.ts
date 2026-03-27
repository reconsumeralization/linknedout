/**
 * Automation Status API
 * Returns the health/status of all heartbeat, cron, and self-improving systems.
 * Used by the dashboard to show the "vital signs" of the sovereign factory.
 */

import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "AUTOMATION_STATUS_RATE_LIMIT_MAX",
  "AUTOMATION_STATUS_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" }

function jsonResponse(payload: unknown, status: number, rl: RateLimitResult): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...createRateLimitHeaders(rl) },
  })
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `automation-status:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface CronSystem {
  name: string
  description: string
  schedule: string
  secretConfigured: boolean
  lastRun: string | null
  status: "active" | "configured" | "unconfigured"
}

export async function GET(req: Request) {
  const rl = await getRateLimit(req)
  if (!rl.allowed) return jsonResponse({ error: "Rate limited" }, 429, rl)

  const auth = await requireSupabaseAuth(req)
  if (auth.response) return auth.response

  const sb = supabaseAdmin()

  // Gather system status in parallel
  const [
    artifactPulse,
    activeAgents,
    stalledAgents,
    integrationHealth,
    recentEvolutions,
    recentIncidents,
  ] = await Promise.all([
    // Artifact pulse status for this user
    sb.from("artifact_sessions")
      .select("last_pulse_at, trust_level, device_type")
      .eq("user_id", auth.auth.userId)
      .order("last_pulse_at", { ascending: false })
      .limit(1)
      .single()
      .then((r) => r.data),

    // Active agent runs
    sb.from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", auth.auth.userId)
      .eq("status", "running"),

    // Stalled agents (running > 30 min)
    sb.from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", auth.auth.userId)
      .eq("status", "running")
      .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),

    // Integration health
    sb.from("integration_configs")
      .select("provider, health_status, enabled, last_health_check")
      .eq("user_id", auth.auth.userId)
      .eq("enabled", true),

    // Recent evolution activity
    sb.from("agent_harness_evolutions")
      .select("id, evolution_type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),

    // Recent sentinel incidents
    sb.from("sentinel_incidents")
      .select("id, title, severity, status, created_at")
      .eq("owner_user_id", auth.auth.userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  // Cron systems status
  const cronSystems: CronSystem[] = [
    {
      name: "Heartbeat Monitor",
      description: "Artifact pulse, integration health, stalled agent recovery",
      schedule: "*/10 * * * *",
      secretConfigured: !!(process.env.HEARTBEAT_CRON_SECRET || process.env.CRON_SECRET),
      lastRun: null,
      status: (process.env.HEARTBEAT_CRON_SECRET || process.env.CRON_SECRET) ? "active" : "unconfigured",
    },
    {
      name: "Evolution Loop",
      description: "Intelligence tariff audit, agent evolution, tribal research, RSI feedback",
      schedule: "0 3 * * *",
      secretConfigured: !!process.env.EVOLUTION_CRON_SECRET,
      lastRun: null,
      status: process.env.EVOLUTION_CRON_SECRET ? "active" : "unconfigured",
    },
    {
      name: "Sentinel Alerting",
      description: "KPI monitoring, threat detection, webhook alerts",
      schedule: "*/15 * * * *",
      secretConfigured: !!process.env.SENTINEL_CRON_SECRET,
      lastRun: null,
      status: process.env.SENTINEL_CRON_SECRET ? "active" : "unconfigured",
    },
    {
      name: "Agent Scheduler",
      description: "Due agent schedule execution, task dispatch",
      schedule: "*/5 * * * *",
      secretConfigured: !!process.env.AGENT_CONTROL_PLANE_CRON_SECRET,
      lastRun: null,
      status: process.env.AGENT_CONTROL_PLANE_CRON_SECRET ? "active" : "unconfigured",
    },
  ]

  // Compute health integrations
  const healthyIntegrations = (integrationHealth.data ?? []).filter((i) => i.health_status === "healthy").length
  const totalIntegrations = integrationHealth.data?.length ?? 0
  const degradedIntegrations = totalIntegrations - healthyIntegrations

  // Compute trust level
  const trustLevel = artifactPulse?.trust_level ?? "unknown"
  const lastPulse = artifactPulse?.last_pulse_at ?? null

  return jsonResponse({
    ok: true,
    timestamp: new Date().toISOString(),
    vitalSigns: {
      trustLevel,
      lastPulse,
      activeAgents: activeAgents.count ?? 0,
      stalledAgents: stalledAgents.count ?? 0,
      healthyIntegrations,
      degradedIntegrations,
      totalIntegrations,
    },
    cronSystems,
    recentEvolutions: recentEvolutions.data ?? [],
    recentIncidents: recentIncidents.data ?? [],
  }, 200, rl)
}
