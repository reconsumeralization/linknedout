# Local Supabase DB Container (Repo-Managed)

This project includes a repo-managed Docker Compose stack for a **DB-only** Supabase-compatible Postgres container.

Use this when you want local DB control without running the full Supabase CLI stack.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)

## What this provides

- Postgres container on `127.0.0.1:54322`
- Minimal Supabase compatibility bootstrap:
  - `auth` schema
  - `auth.users` table
  - `auth.uid()`, `auth.role()`, `auth.jwt()` helpers
  - `anon`, `authenticated`, `service_role` roles
- Auto-apply SQL migrations from `supabase/migrations` on first init/reset

## What this does **not** provide

- No GoTrue auth API (`/auth/v1`)
- No PostgREST API (`/rest/v1`)
- No Realtime, Storage, or Studio

For full local Supabase services, use [Local Supabase Setup](./local-supabase.md).

## Commands

```powershell
pnpm supabase:db:start
pnpm supabase:db:status
pnpm supabase:db:psql
pnpm supabase:db:logs
pnpm supabase:db:reset
pnpm supabase:db:stop
pnpm supabase:db:env
```

`supabase:db:start` and `supabase:db:reset` update `.env.local` with:

- `SUPABASE_DB_CONTAINER_URL`
- `SUPABASE_DB_CONTAINER_HOST`
- `SUPABASE_DB_CONTAINER_PORT`
- `SUPABASE_DB_CONTAINER_USER`
- `SUPABASE_DB_CONTAINER_PASSWORD`
- `SUPABASE_DB_CONTAINER_DATABASE`

## Implementation files

- Compose: `supabase/docker/docker-compose.db.yml`
- Init SQL: `supabase/docker/init/00-supabase-compat.sql`
- Init migration runner: `supabase/docker/init/10-apply-migrations.sh`
- Control script: `scripts/supabase-db-container.ps1`
