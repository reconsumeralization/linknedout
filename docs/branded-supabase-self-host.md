# Branded, locally hosted Supabase

This guide walks you through running **your own branded Supabase** on your machine or server and connecting LinkedOut to it. You get the full stack (Auth, PostgREST, Realtime, Studio, Storage, Edge Functions) under your control, with your URLs and Studio credentials.

## Why self-host?

- **Data stays on your infrastructure** – no Supabase Cloud dependency.
- **Branded** – use your domain, Studio login name, and (with optional custom Studio image) your logo and product name.
- **LinkedOut works the same** – point `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at your instance and run migrations as usual.

## Prerequisites

- **Docker** and **Docker Compose** ([Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) on Windows).
- **Git**.
- **Resources**: minimum 4 GB RAM, 2 cores, 50 GB disk. See [Supabase system requirements](https://supabase.com/docs/guides/self-hosting/docker#system-requirements).

## 1. Create the branded Supabase directory

From the **LinkedOut repository root**:

```powershell
.\scripts\branded-supabase-setup.ps1
```

This script:

- Clones the official [supabase/supabase](https://github.com/supabase/supabase) repo (Docker files only).
- Copies the Docker setup into `branded-supabase/`.
- Creates `branded-supabase/.env` from the official `.env.example` if `.env` does not exist.

If you prefer not to use the script, see **Manual setup** in [branded-supabase/README.md](../branded-supabase/README.md).

## 2. Configure secrets and branding

Edit **`branded-supabase/.env`** (do not commit this file).

### Required secrets

Replace every placeholder. Options:

- **Quick (Linux/macOS or WSL/Git Bash):**  
  From `branded-supabase/`, run:  
  `sh ./utils/generate-keys.sh`  
  then review and adjust `.env` as needed.

- **Manual:** Follow [Supabase: Configuring and securing](https://supabase.com/docs/guides/self-hosting/docker#configuring-and-securing-supabase). At minimum:
  - `POSTGRES_PASSWORD` – e.g. `openssl rand -base64 32` (use letters and numbers to avoid URL issues).
  - `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET` – generate via the [key generator](https://supabase.com/docs/guides/self-hosting/docker#generate-and-configure-api-keys) or the repo’s `utils/generate-keys.sh`.
  - `DASHBOARD_PASSWORD` – Studio login; must include at least one letter.
  - Other keys listed in the official guide (e.g. `LOGFLARE_*`, `PG_META_CRYPTO_KEY`, `VAULT_ENC_KEY`, `SECRET_KEY_BASE`, S3/MinIO keys if used).

### Branding and URLs

Set these so the instance is “yours” and works with your app:

| Variable | Example (local) | Example (production) |
|----------|------------------|----------------------|
| `SITE_URL` | `http://localhost:3000` | `https://app.yourdomain.com` |
| `API_EXTERNAL_URL` | `http://localhost:8000` | `https://api.yourdomain.com` |
| `SUPABASE_PUBLIC_URL` | `http://localhost:8000` | `https://api.yourdomain.com` |
| `DASHBOARD_USERNAME` | `supabase` or e.g. `acme` | Your brand name (Studio login) |

- **Local:** Use `localhost` and port `8000` for the API/gateway so LinkedOut can reach it.
- **Production:** Use your real domain and put a reverse proxy (e.g. Caddy, nginx) with TLS in front of the service on port 8000.

Optional: for custom Studio title/logo you would build a custom image from [supabase/studio](https://github.com/supabase/supabase/tree/master/apps/studio) and use it in `docker-compose.yml`; the default image does not expose branding env vars.

## 3. Validate before boot

From the repo root, run:

```powershell
pnpm supabase:branded:doctor
```

This checks:

- `branded-supabase/.env` exists and contains the required secrets and URLs.
- URL values are absolute `http`/`https` addresses.
- The app `.env.local` matches the branded Supabase URL and anon key, or clearly reports drift.
- `docker compose config` is valid, and whether any branded Supabase services are already running.

If you want the app env updated automatically, run:

```powershell
pnpm supabase:branded:sync-env
```

That syncs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` into the root `.env.local`.

## 4. Start Supabase

```powershell
cd branded-supabase
docker compose up -d
```

Wait until services are healthy:

```powershell
docker compose ps
```

Studio and the API gateway are on **port 8000** (e.g. `http://localhost:8000`). Log in with `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD`.

## 5. Connect LinkedOut

In the **LinkedOut** project (repo root):

1. Ensure `.env.local` exists (copy from `.env.example` if needed).
2. Run `pnpm supabase:branded:sync-env` after `.env` changes, or set the values manually:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from branded-supabase/.env>
   ```
   For production, use your public Supabase URL and the same `ANON_KEY` from your branded instance.
3. Run the app: `pnpm dev`.
4. Apply migrations (e.g. [fundraising migrations](./fundraising-migrations-apply.md)) as required. You can run SQL in Studio (SQL Editor) or use the Supabase CLI against your self-hosted URL.
5. In the app, go to **Settings → Open login page** and sign up or sign in.

## 6. Production checklist

- [ ] Strong, unique values for all secrets in `.env`; no default/placeholder keys.
- [ ] SMTP configured in `.env` so Auth sends sign-up/password-reset emails from your domain.
- [ ] `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` set to your real domains.
- [ ] Reverse proxy in front of the Supabase gateway with TLS (HTTPS).
- [ ] Backups for the Postgres data (e.g. `volumes/db/data` or your DB backup strategy).
- [ ] Firewall: expose only the proxy (e.g. 443); do not expose Postgres or internal ports.

## Updating

To pull the latest Supabase Docker setup and images:

1. Re-run the setup script from the repo root (or manually update the contents of `branded-supabase/` from the official [supabase/docker](https://github.com/supabase/supabase/tree/master/docker)).
2. Re-run `pnpm supabase:branded:doctor` from the repo root so secret, URL, and app-env drift is caught before restart.
3. From `branded-supabase/`:  
   `docker compose pull`  
   then  
   `docker compose down && docker compose up -d`  
   (See [Supabase: Updating](https://supabase.com/docs/guides/self-hosting/docker#updating).)

## Uninstalling

From `branded-supabase/`:

```powershell
docker compose down -v
```

This removes containers and volumes (all DB and storage data). Optionally delete the `branded-supabase` directory.

## See also

- [branded-supabase/README.md](../branded-supabase/README.md) – Quick reference and manual setup.
- [Supabase: Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker) – Official guide.
- [Setup and onboarding](./setup-and-onboarding.md) – LinkedOut setup options (cloud vs local vs branded).
