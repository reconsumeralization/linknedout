# LinkedOut – Remote Setup Guide (AnyDesk)

Use this guide when setting up the LinkedOut application on a remote machine via AnyDesk.

For non-remote setups (cloud Supabase, branded self-host, Mac/Linux, Docker variants), use the canonical guide: `docs/setup-and-onboarding.md`.

---

## Prerequisites (install on the remote machine first)

| Tool | Version | Download / Install |
|------|---------|-------------------|
| **Node.js** | 18+ (LTS recommended) | https://nodejs.org |
| **pnpm** | Latest | `npm install -g pnpm` |
| **Docker Desktop** | Latest | https://www.docker.com/products/docker-desktop |
| **Git** | Latest | https://git-scm.com/downloads |

---

## Quick Setup (recommended)

1. **Copy the project** to the remote machine (e.g. via OneDrive sync, USB, or clone from your repo).

2. **Open PowerShell** in the project folder and run the full onboarding script:
   ```powershell
   pnpm local:full:onboard
   ```
   This will:
   - Check Docker, pnpm, and other tools
   - Set up Supabase local services
   - Create `.env.local` if needed
   - Run database migrations and create a test user

3. **Start the app**:
   ```powershell
   pnpm dev
   ```
   Open http://localhost:3000 in a browser.

---

## Manual Setup (if the script fails)

### 1. Install dependencies
```powershell
pnpm install
```

### 2. Configure environment
```powershell
# Copy the example env file
Copy-Item .env.example .env.local

# Edit .env.local and set at minimum:
# - POSTGRES_PASSWORD (generate: openssl rand -base64 32)
# - NEXT_PUBLIC_SUPABASE_URL (your Supabase project URL)
# - NEXT_PUBLIC_SUPABASE_ANON_KEY (your Supabase anon key)
# - OPENAI_API_KEY (for AI features)
```

### 3. Start Docker (if using local Supabase)
- Ensure Docker Desktop is running.
- Start the database:
  ```powershell
  pnpm supabase:db:start
  ```

### 4. Run the app
```powershell
pnpm dev
```

---

## Alternative: Docker-only setup

If you prefer everything in Docker:

```powershell
pnpm docker:onboard   # One-time setup
pnpm docker:up       # Start app + DB
```

Then open http://localhost:3000.

---

## Hosted Supabase (cloud or any non-local database)

Apply the **same SQL migrations** as in [`supabase/migrations/`](supabase/migrations) to every environment where the app runs (for example the Portfolio panel expects tables from `20260332000000_multi_company_orchestration.sql`). Typical options:

- **Supabase CLI** (linked project): `supabase db push` from a machine with your project ref and credentials.
- **Supabase Dashboard**: SQL Editor — run migration files in timestamp order when you cannot use the CLI.
- **CI/CD**: run migrations as a deploy step so production never drifts from the repo.

After migrations, sign in as a user; optional local demo rows are loaded by [`supabase/seed.sql`](supabase/seed.sql) when you use `supabase db reset` with seeding enabled in [`supabase/config.toml`](supabase/config.toml).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `pnpm: command not found` | Run `npm install -g pnpm` |
| Docker not reachable | Start Docker Desktop and wait for it to be ready |
| Port 3000 in use | Change port: `pnpm dev -- -p 3001` |
| Supabase connection failed | Check `.env.local` has correct `NEXT_PUBLIC_SUPABASE_*` values |
| PowerShell script execution blocked | Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |

---

## One-liner (after prerequisites are installed)

```powershell
cd "C:\path\to\linknedout"
pnpm install
pnpm local:full:onboard
pnpm dev
```

Replace `C:\path\to\linknedout` with the actual project path on the remote machine.
