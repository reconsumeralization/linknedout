import { getNetworkInsightsWithAccessToken } from "@/lib/network/network-insights-supabase"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store, max-age=0",
} as const

function parseTimeRange(value: string | null): "30d" | "90d" | "180d" {
  if (value === "30d" || value === "180d") {
    return value
  }
  return "90d"
}

function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: HEADERS })
}

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const authResult = await requireSupabaseAuth(request, {
    errorBody: { ok: false, error: "Unauthorized. Supabase bearer token required." },
  })
  if (!authResult.auth) {
    return authResult.response
  }
  const authContext = authResult.auth

  try {
    const timeRange = parseTimeRange(request.nextUrl.searchParams.get("timeRange"))
    const { dataset, live } = await getNetworkInsightsWithAccessToken(authContext.accessToken, {
      allowServiceFallback: false,
      timeRange,
    })

    return json({
      ok: true,
      source: live ? "supabase" : "supabase-empty",
      data: dataset,
      timeRange,
      timestamp: Date.now(),
    })
  } catch (err) {
    console.error("[network/insights] Failed to fetch:", err)
    return json(
      {
        ok: false,
        error: "Unable to load network insights.",
      },
      500,
    )
  }
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  })
}
