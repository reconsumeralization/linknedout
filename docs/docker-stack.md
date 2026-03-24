# Docker Stack

This repo includes a production-style local Docker stack for the app and PostgreSQL.

## Quick start

1. Set `POSTGRES_PASSWORD` in your shell or `.env` file.
2. Optionally set build-time public vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL`
3. Start the stack:

```bash
pnpm docker:up
```

## Common commands

```bash
pnpm docker:build
pnpm docker:up
pnpm docker:status
pnpm docker:logs
pnpm docker:down
pnpm docker:reset
```

## Endpoints

- App: `http://127.0.0.1:3000`
- Postgres: `127.0.0.1:54322`

## Notes

- `POSTGRES_PASSWORD` is required by compose now; startup fails fast if missing.
- App health is checked by compose (`wget` against `http://127.0.0.1:3000/`).
- Build context excludes CI `.next-*` artifacts via `.dockerignore` for faster builds.
