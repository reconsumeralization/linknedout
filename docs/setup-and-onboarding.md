# Setup and Onboarding

This guide helps you get LinkedOut running with Supabase (cloud or local/Docker) and connect your LinkedIn data.

**Quick start:** Copy `.env.example` → `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, run `pnpm dev`, then sign in via Settings → Login.

**AI Assistant:** From the Dashboard or Settings page, open the AI Assistant and ask e.g. "Help me set up Supabase and the entire stack" or "Walk me through Supabase Cloud setup". The assistant has access to official Supabase documentation links and can guide you step by step. It can search your app data (profiles, tribes, projects, CSV) and use built-in web search (no API key) to research topics and cite sources—combining external results with your CRM and talent data.

## 1. Prerequisites

- **Node.js** 18+ and **pnpm**
- **Docker Desktop** (optional, for Docker stack or local Supabase)
- A **Supabase** account (free tier works) or local Supabase

## 2. Supabase: Choose Your Path

LinkedOut uses Supabase for auth and (optionally) for profiles, tribes, and projects. Pick one:

### Option A: Supabase Cloud (fastest)

1. Go to [supabase.com](https://supabase.com) and create a project.
2. In **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Copy `.env.example` to `.env.local` and set:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Run the app: `pnpm dev`. Open [http://localhost:3000](http://localhost:3000), go to **Settings → Open login page**, and sign up / sign in.

5. **Apply the same SQL migrations as this repo** to your cloud project (`supabase/migrations/`), e.g. `supabase db push` with a linked project, your CI pipeline, or the Supabase SQL Editor in timestamp order. Features such as the Portfolio panel depend on tables created there (for example `20260332000000_multi_company_orchestration.sql`). Optional local demo rows: `supabase/seed.sql` with `[db.seed]` in `supabase/config.toml`. See also [SETUP-REMOTE.md](../SETUP-REMOTE.md) (hosted Supabase section).

### Option B: Local Supabase (full stack on your machine)

1. Install [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.
2. From the project root, you can either run a single combined command or the individual steps:

   ```powershell
   # One-shot local Supabase + schema + test user + Docker app stack (recommended)
   pnpm local:full:onboard
   ```

   Partial/recovery variants:

   ```powershell
   # Refresh local Supabase + schema + test user, but do not touch Docker
   pnpm local:full:onboard:skip-docker

   # Re-run Docker onboarding against existing Supabase/.env state
   pnpm local:full:onboard:skip-supabase
   ```

   Or, if you prefer manual control:

   ```powershell
   pnpm supabase:local:start
   pnpm supabase:local:reset
   pnpm supabase:local:test-user
   pnpm docker:onboard
   ```

3. This starts local Supabase and writes `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` into `.env.local`, applies the schema, creates a test user, then brings up the Docker app stack and waits for healthchecks.
4. `pnpm local:full:onboard` now prints a preflight summary first (pnpm/supabase/docker/daemon/POSTGRES_PASSWORD), then hard-fails on any step error so the final success summary only appears when the full chain completed.
5. `-SkipSupabase` skips local Supabase start/reset/test-user steps; `-SkipDocker` skips Docker onboarding and compose checks.
6. Run the app (if not already via Docker): `pnpm dev`. Sign in with the test user email/password from `.env.local` (or create a user in Supabase Studio).
7. `.env.local` now contains local test credentials and a bearer token; keep it uncommitted and local-only.

See [Local Supabase Setup](./local-supabase.md) for details.

### Option C: Docker stack (app + Postgres in containers)

Use this for a production-style run (app and Postgres in Docker).

1. Copy `.env.example` to `.env.local`.
2. Set a strong Postgres password (the helper script can do this for you):

   ```powershell
   # Option A: let the helper scripts manage POSTGRES_PASSWORD in .env.local
   # (recommended for local/dev)
   pnpm supabase:db:start

   # Option B: set it yourself
   # Generate: openssl rand -base64 32
   POSTGRES_PASSWORD=your-generated-password
   ```

3. **Auth:** The app in Docker still needs Supabase **auth**. Either:
   - Use **Supabase Cloud** for auth: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (from a cloud project), or
   - Run **local Supabase** (Option B) on the host and point the app to it by setting `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` to your local Supabase URL.
4. Start the stack (app + Postgres + local security-cron) and wait for healthchecks:

   ```powershell
   pnpm docker:onboard
   ```

5. App: [http://127.0.0.1:3000](http://127.0.0.1:3000). Postgres: `127.0.0.1:54322`.  
   The `security-cron` sidecar inside Docker will periodically refresh `config/security-patterns.json` using your local `.env.local` (`OPENAI_API_KEY`, `SECURITY_PATTERNS_OPENAI_MODEL`, `SECURITY_PATTERNS_INTERVAL_SECONDS`).

See [Docker Stack](./docker-stack.md) for more.

### Option D: Branded, locally hosted Supabase (recommended for “your own” instance)

Run the full Supabase stack (Auth, PostgREST, Realtime, Studio, etc.) on your own machine or server with your branding and URLs. LinkedOut provides a one-script setup and full guide:

- **Quick:** From the repo root run `.\scripts\branded-supabase-setup.ps1`, configure `branded-supabase\.env`, validate with `pnpm supabase:branded:doctor`, start Supabase with `docker compose up -d` in `branded-supabase`, then sync app env with `pnpm supabase:branded:sync-env`.
- **Full guide:** [Branded Supabase self-host](./branded-supabase-self-host.md) – prerequisites, secrets, branding, connecting LinkedOut, production checklist.

### Option E: Self-hosted Supabase with Docker (manual)

Run the full Supabase stack in your own infrastructure using the official Docker setup only. Official guide: [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker).

1. **Prerequisites:** Docker and Docker Compose. Minimum 4 GB RAM, 2 cores, 50 GB disk (see [system requirements](https://supabase.com/docs/guides/self-hosting/docker#system-requirements)).

2. **Install Supabase:**
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   mkdir supabase-project
   cp -rf supabase/docker/* supabase-project
   cp supabase/docker/.env.example supabase-project/.env
   cd supabase-project
   docker compose pull
   ```

3. **Configure and secure:** Edit `supabase-project/.env`. **Do not** use the default placeholders.
   - Set `POSTGRES_PASSWORD` (letters and numbers recommended to avoid URL encoding issues).
   - Generate and set `ANON_KEY`, `SERVICE_ROLE_KEY`, and `JWT_SECRET`. You can run `sh ./utils/generate-keys.sh` in the project directory to generate them, or use the [key generator](https://supabase.com/docs/guides/self-hosting/docker#generate-and-configure-api-keys) in the docs.
   - Set `DASHBOARD_PASSWORD` (and optionally `DASHBOARD_USERNAME`) for Studio access.
   - For local use: set `SITE_URL` (e.g. `http://localhost:3000` for your app), `API_EXTERNAL_URL` and `SUPABASE_PUBLIC_URL` (e.g. `http://localhost:8000` where the API gateway will listen).

4. **Start Supabase:**
   ```bash
   docker compose up -d
   ```
   Wait until services are healthy (`docker compose ps`). Studio and the API gateway are on port **8000** by default.

5. **Connect LinkedOut:** In your LinkedOut project, copy `.env.example` to `.env.local` and set:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<the ANON_KEY from supabase-project/.env>
   ```
   Use your server hostname or IP instead of `localhost` if Supabase runs on another machine.

6. Run the app (`pnpm dev`), open Settings → Open login page, and sign up/sign in. Auth, REST, Realtime, and Storage are provided by your self-hosted stack.

For a **branded** setup (your domain, your Studio login, one-script install), use [Branded Supabase self-host](./branded-supabase-self-host.md) and the `scripts\branded-supabase-setup.ps1` script instead.

For production, configure SMTP for auth emails, use strong secrets, and consider a secrets manager. See [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker) for full options (S3, auth config, etc.).

## 3. Sign in

- Open the app → **Settings** (or **Dashboard** if you see the setup checklist).
- Click **Open login page** or **Open auth center**.
- Sign up or sign in with email/password (Supabase Auth).
- After sign-in, Email, Network Insights, SENTINEL, and Agent Control use your session.

## 4. Add your data

- **CSV:** In **AI Assistant**, upload a LinkedIn connections or search export CSV. The app will parse profiles and suggest tribes.
- **Supabase:** If you use Supabase (cloud or local) with the project’s schema, profiles/tribes/projects sync from your database. Run migrations and seed data as needed (see repo migrations in `supabase/migrations`).

## 5. Connect LinkedIn (optional)

To use **Sign In with LinkedIn** and **Share on LinkedIn** from the app:

1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/apps).
2. In the app, add **Sign In with LinkedIn** and (optional) **Share on LinkedIn** products.
3. Under **Auth** → **OAuth 2.0 settings**, add a redirect URL, e.g.  
   `http://localhost:3000/api/linkedin/oauth?action=callback`
4. Copy **Client ID** and **Client Secret** into `.env.local`:

   ```env
   LINKEDIN_CLIENT_ID=your-client-id
   LINKEDIN_CLIENT_SECRET=your-client-secret
   LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/oauth?action=callback
   ```

5. In the app, go to **Settings → LinkedIn consumer auth** and click **Connect LinkedIn** or **Connect with Share**.

Scopes: `openid profile email` for sign-in; add `w_member_social` for posting from LinkedOut.

## 6. Optional: Email (Gmail / Outlook)

For the Email workspace, configure Google or Microsoft OAuth in `.env.local` (see `.env.example`). Then use **Settings** and the Email view to connect your mailbox.

## Summary checklist

| Step | Action |
|------|--------|
| 1 | Copy `.env.example` → `.env.local` |
| 2 | Set Supabase URL + anon key (cloud or from local Supabase) |
| 3 | (App Docker) Set `POSTGRES_PASSWORD`; run `pnpm docker:up` |
| 4 | (Local Supabase) Run `pnpm supabase:local:start` and `supabase:local:reset` |
| 4b | (Self-hosted Supabase) Clone supabase/supabase, configure `.env`, run `docker compose up -d`; set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in app `.env.local` |
| 4c | (Branded Supabase) Run `pnpm supabase:branded:doctor`, then `pnpm supabase:branded:sync-env` after editing `branded-supabase/.env` |
| 5 | Run app: `pnpm dev` or use Docker |
| 6 | Sign in via Settings → Open login page |
| 7 | Add data: upload CSV in AI Assistant or use Supabase data |
| 8 | (Optional) Connect LinkedIn in Settings |
| 9 | (Optional) Configure email OAuth for Email workspace |

For more: [.env.example](../.env.example), [Local Supabase Setup](./local-supabase.md), [Docker Stack](./docker-stack.md), [Supabase Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker).
