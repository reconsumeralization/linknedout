#!/usr/bin/env node
/**
 * Invoke SENTINEL KPI webhook cron endpoint (for local use, OS schedulers, or Docker).
 * Reads: SENTINEL_CRON_SECRET, SENTINEL_CRON_APP_URL, SENTINEL_CRON_DRY_RUN, SENTINEL_CRON_MAX_OWNERS, SENTINEL_CRON_LOOKBACK_HOURS.
 * Usage: node scripts/sentinel-cron-invoke.mjs
 */

const base = (process.env.SENTINEL_CRON_APP_URL || "http://localhost:3000").replace(/\/$/, "")
const secret = process.env.SENTINEL_CRON_SECRET || ""
const dryRun = process.env.SENTINEL_CRON_DRY_RUN === "true"
const maxOwners = Math.min(500, Math.max(1, parseInt(process.env.SENTINEL_CRON_MAX_OWNERS || "50", 10) || 50))
const lookbackHours = Math.min(168, Math.max(1, parseInt(process.env.SENTINEL_CRON_LOOKBACK_HOURS || "24", 10) || 24))

if (!secret) {
  console.error("[sentinel-cron-invoke] SENTINEL_CRON_SECRET is not set. Set it in .env.local or the environment.")
  process.exit(1)
}

const url = `${base}/api/sentinel/cron`
const body = JSON.stringify({ dryRun, maxOwners, lookbackHours })

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-cron-secret": secret,
  },
  body,
})
  .then((res) => {
    return res.text().then((text) => {
      try {
        const json = JSON.parse(text)
        if (!res.ok) {
          console.error("[sentinel-cron-invoke] Non-OK response:", res.status, json)
          process.exit(1)
        }
        console.log(JSON.stringify(json, null, 2))
      } catch {
        if (!res.ok) {
          console.error("[sentinel-cron-invoke] Non-OK response:", res.status, text)
          process.exit(1)
        }
        console.log(text)
      }
    })
  })
  .catch((err) => {
    console.error("[sentinel-cron-invoke] Request failed:", err.message)
    process.exit(1)
  })
