/** @type {import('next').NextConfig} */

const distDir = process.env.NEXT_DIST_DIR

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
]

const nextConfig = {
  ...(distDir ? { distDir } : {}),
  // Standalone output for Docker self-hosting: set NEXT_OUTPUT=standalone.
  // Vercel: leave NEXT_OUTPUT unset for default optimized output.
  ...(process.env.NEXT_OUTPUT ? { output: process.env.NEXT_OUTPUT } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
  transpilePackages: [
    "deck.gl",
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/geo-layers",
    "@deck.gl/react",
    "maplibre-gl",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

// Bundle analyzer — install @next/bundle-analyzer and run: ANALYZE=true next build
let finalConfig = nextConfig
if (process.env.ANALYZE === "true") {
  try {
    const { default: bundleAnalyzer } = await import("@next/bundle-analyzer")
    finalConfig = bundleAnalyzer({ enabled: true })(nextConfig)
  } catch {
    console.warn("@next/bundle-analyzer not installed — skipping. Run: pnpm add -D @next/bundle-analyzer")
  }
}

export default finalConfig
