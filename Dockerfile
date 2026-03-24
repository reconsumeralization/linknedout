# syntax=docker/dockerfile:1
# ──────────────────────────────────────────────────────────────────────────────
# LinkedOut — Next.js multi-stage Docker build
#
# Pin to an exact digest for reproducible, supply-chain-safe builds:
#   docker buildx imagetools inspect node:22-alpine3.21 --format '{{.Manifest.Digest}}'
# Then replace the FROM tag with:
#   FROM node:22-alpine3.21@sha256:<digest> AS deps
#
# Build-time args (NEXT_PUBLIC_* are embedded in the JS bundle at build time):
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
#     -t linkedout .
#
# Runtime secrets go in .env.local — never baked into the image.
# ──────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22-alpine3.21
ARG PNPM_VERSION=9

# ── Stage 1: dependency install ───────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

# dumb-init: proper PID 1 — forwards signals and reaps zombie processes
RUN apk add --no-cache dumb-init

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Copy manifest + lockfile first — maximise layer cache hits
COPY package.json pnpm-lock.yaml ./
# pnpm patches must be present before install
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are baked into the JS bundle.
# Receive from --build-arg / docker-compose build.args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user — same UID/GID used in build stage for chown
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy dumb-init from deps stage
COPY --from=deps /usr/bin/dumb-init /usr/bin/dumb-init

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone bundle (.next/standalone) and pre-built static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

USER nextjs

EXPOSE 3000

# Lightweight liveness probe — no authentication required, just confirms Node is responding
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ > /dev/null || exit 1

# dumb-init wraps node so SIGTERM is properly forwarded and handled
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
