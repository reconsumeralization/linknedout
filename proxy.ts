import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Paths (or path prefixes) that should never be served. Returns 404 to avoid
 * leaking info or allowing probe requests (e.g. .env, .git, wp-admin).
 */
const BLOCKED_PATH_PREFIXES = [
  "/.env",
  "/.git",
  "/wp-admin",
  "/wp-login",
  "/.aws",
  "/.docker",
]

function isBlockedPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+/g, "/")
  if (normalized.includes("..")) return true
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (normalized.startsWith(prefix.toLowerCase())) return true
  }
  return false
}

/**
 * Optional CSP report-only header. Set NEXT_CSP_REPORT_ONLY to a report-uri URL
 * or leave unset to omit. Use to tune a future enforcing CSP without breaking the app.
 */
function getCspReportOnlyHeader(): Record<string, string> {
  const raw = process.env.NEXT_CSP_REPORT_ONLY?.trim()
  if (!raw || /[\s;\"\n\r]/.test(raw)) return {}
  return {
    "Content-Security-Policy-Report-Only": `default-src 'self'; report-uri ${raw}`,
  }
}

const REPORT_ONLY_HEADER = getCspReportOnlyHeader()

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (isBlockedPath(pathname)) {
    return new NextResponse(null, { status: 404 })
  }

  // Attach a unique request ID for tracing across logs and API responses.
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-request-id", requestId)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("x-request-id", requestId)
  for (const [key, value] of Object.entries(REPORT_ONLY_HEADER)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: [
    /*
     * Match all pathnames except _next/static, _next/image, favicon, public files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?)$).*)",
  ],
}

