# Branded Supabase (locally hosted)

Your own **branded, locally hosted** Supabase instance: Auth, PostgREST, Realtime, Studio, Storage, and Edge Functions running on your machine or server under your control.

- **Branded**: Use your own domain, Studio login (DASHBOARD_USERNAME / DASHBOARD_PASSWORD), and app URLs. Optionally rebrand Studio later with a custom image.
- **Locally hosted**: All services run in Docker on this machine (or a server you control). No data leaves your infrastructure.

## Prerequisites

- **Docker** and **Docker Compose** (e.g. [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) on Windows)
- **Git**
- **Resources**: Minimum 4 GB RAM, 2 cores, 50 GB disk (see [Supabase self-hosting requirements](https://supabase.com/docs/guides/self-hosting/docker#system-requirements))

## Quick start

### 1. Create and populate this directory

From the **LinkedOut repo root** (parent of `branded-supabase`), run:

```powershell
.\scripts\branded-supabase-setup.ps1
```

This clones the official Supabase Docker setup into `branded-supabase/` and copies an example `.env`. If the script is not available, follow [Manual setup](#manual-setup) below.

### 2. Configure secrets and branding

Edit `branded-supabase/.env` (never commit this file):

- **Required**: Replace all placeholder secrets. Use the script under `branded-supabase/utils/generate-keys.sh` (e.g. in Git Bash or WSL) or generate manually:
  - `POSTGRES_PASSWORD` – e.g. `openssl rand -base64 32`
  - `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET` – use [Supabase key generator](https://supabase.com/docs/guides/self-hosting/docker#generate-and-configure-api-keys) or the repo’s `utils/generate-keys.sh`
  - `DASHBOARD_PASSWORD` – Studio login (required; avoid numbers-only)
  - Other keys listed in the official [configuring and securing](https://supabase.com/docs/guides/self-hosting/docker#configuring-and-securing-supabase) guide.

- **Branding / URLs** (for “your” Supabase):
  - `SITE_URL` – Your app’s URL (e.g. `http://localhost:3000` for LinkedOut dev, or `https://app.yourdomain.com`)
  - `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` – Public URL of this Supabase API (e.g. `http://localhost:8000` locally, or `https://api.yourdomain.com`)
  - `DASHBOARD_USERNAME` – Optional; default is `supabase`. Use a name that matches your brand (e.g. your company name).

### 3. Validate the setup

From the repo root, run:

```powershell
pnpm supabase:branded:doctor
```

This validates that `branded-supabase/.env` exists, required secrets are populated, public URLs are valid, and your app `.env.local` is either already aligned or needs syncing.

If you want the app env updated automatically after you finish editing `branded-supabase/.env`, run:

```powershell
pnpm supabase:branded:sync-env
```

That writes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` into the root `.env.local`.

### 4. Start Supabase

```powershell
cd branded-supabase
docker compose up -d
```

Wait until services are healthy: `docker compose ps`. Studio and the API gateway are on **port 8000** by default (e.g. `http://localhost:8000`).

### 5. Connect LinkedOut

In the **LinkedOut** project (parent repo):

1. Copy `.env.example` to `.env.local` if you haven’t already.
2. Run `pnpm supabase:branded:sync-env` if you have not already. Or set the values manually:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from branded-supabase/.env>
   ```
   Use your server hostname or domain instead of `localhost` if Supabase runs elsewhere.

3. Run LinkedOut (`pnpm dev`) and apply [migrations](../../docs/fundraising-migrations-apply.md) as needed. Sign in via **Settings → Open login page**.

## Ports (default)

| Service        | Port | Description                    |
|----------------|------|--------------------------------|
| API / Studio   | 8000 | Kong gateway, Studio, Auth, REST, Realtime, Storage |
| Postgres       | 5432 | Internal (Supavisor on 5432/6543) |

## Branding tips

- **Domain**: For production, set `SITE_URL`, `API_EXTERNAL_URL`, and `SUPABASE_PUBLIC_URL` to your real domains and put a reverse proxy (e.g. Caddy, nginx) in front of port 8000 with TLS.
- **Studio title/logo**: The stock Studio image does not expose a title/logo env var. To fully rebrand the dashboard you would build a custom image from [supabase/studio](https://github.com/supabase/supabase/tree/master/apps/studio) with your branding and use it in `docker-compose.yml`.
- **Auth emails**: Configure SMTP in `.env` for production so sign-up and password-reset emails come from your domain.

## Updating

See [Supabase self-hosting: Updating](https://supabase.com/docs/guides/self-hosting/docker#updating). In short: re-run the setup script to refresh files (or pull the latest `supabase/docker`), rerun `pnpm supabase:branded:doctor`, then `docker compose pull` and `docker compose up -d` in `branded-supabase`.

## Uninstalling

From `branded-supabase/`:

```powershell
docker compose down -v
```

This removes containers and volumes (all DB and storage data). Optionally delete the `branded-supabase` folder.

## Manual setup

If you prefer not to use the setup script:

1. Clone the Supabase repo and copy the Docker files:
   ```powershell
   git clone --depth 1 https://github.com/supabase/supabase
   mkdir branded-supabase
   Copy-Item -Recurse -Force supabase\docker\* branded-supabase\
   Copy-Item supabase\docker\.env.example branded-supabase\.env
   ```
2. Edit `branded-supabase/.env` as in step 2 above.
3. From the repo root, run `pnpm supabase:branded:doctor` and optionally `pnpm supabase:branded:sync-env`.
4. From `branded-supabase`, run `docker compose up -d` and connect LinkedOut as in steps 4-5 above.

## More

- [Supabase: Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [LinkedOut: Branded Supabase self-host (full guide)](../docs/branded-supabase-self-host.md)
