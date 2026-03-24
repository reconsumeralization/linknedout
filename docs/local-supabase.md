# Local Supabase Setup

This project can run entirely against a local Supabase stack.

For a DB-only container managed in-repo (without `supabase start`), see:

- [Local Supabase DB Container](./local-supabase-db-container.md)

## Prerequisites

1. Install Docker Desktop.
2. Install Supabase CLI.

## One-time setup

From the project root:

```powershell
pnpm supabase:local:start
```

This will:

1. Initialize Supabase config (if missing).
2. Start local Supabase services.
3. Write these keys into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Apply schema locally

The baseline schema is included as migration:

- `supabase/migrations/20260228123000_baseline_schema.sql`

To reset and re-apply local schema:

```powershell
pnpm supabase:local:reset
```

## Useful commands

```powershell
pnpm local:up
pnpm local:check
pnpm local:down
pnpm supabase:local:status
pnpm supabase:local:env
pnpm supabase:local:test-user
pnpm supabase:local:stop
```

`local:up` runs:
1. `supabase:local:start`
2. `supabase:local:reset`
3. `supabase:local:test-user`

## Run app with local Supabase

```powershell
pnpm dev
```

## Run authenticated smoke checks locally

```powershell
pnpm supabase:local:test-user
pnpm smoke:auth:skipbuild
```

The test-user command writes these values into `.env.local`:

- `SUPABASE_EMAIL_TEST_USER`
- `SUPABASE_EMAIL_TEST_PASSWORD`
- `TEST_SUPABASE_BEARER_TOKEN`

## Notes

- Local Supabase URLs are HTTP (`http://127.0.0.1:54321`) by default.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- For authenticated smoke tests, set:
  - `TEST_SUPABASE_BEARER_TOKEN`
  - or `SUPABASE_EMAIL_TEST_USER` + `SUPABASE_EMAIL_TEST_PASSWORD`
