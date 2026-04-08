# LinkedOut

LinkedOut is an AI-powered LinkedIn CRM and tribe intelligence workspace (Supabase-backed auth + data, optional LinkedIn/email integrations).

## Fastest paths

- **Supabase Cloud (recommended for most)**
  - Copy [`.env.example`](c:/Users/Amber/Downloads/OneDrive%20-%20varmsp/Apps/linknedout/.env.example) → `.env.local` and set:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Apply repo migrations in [`supabase/migrations/`](c:/Users/Amber/Downloads/OneDrive%20-%20varmsp/Apps/linknedout/supabase/migrations) to your Supabase project (CLI `supabase link` + `supabase db push`, CI, or SQL editor in timestamp order).
  - Run:

```powershell
pnpm install
pnpm dev
```

- **Windows “full local” (local Supabase + migrations + test user)**
  - Run:

```powershell
pnpm install
pnpm local:full:onboard
pnpm dev
```

  - For AnyDesk / remote machine steps, see [`SETUP-REMOTE.md`](c:/Users/Amber/Downloads/OneDrive%20-%20varmsp/Apps/linknedout/SETUP-REMOTE.md).

## Docs

- Start here: [`docs/setup-and-onboarding.md`](c:/Users/Amber/Downloads/OneDrive%20-%20varmsp/Apps/linknedout/docs/setup-and-onboarding.md)
- Full docs index: [`docs/README.md`](c:/Users/Amber/Downloads/OneDrive%20-%20varmsp/Apps/linknedout/docs/README.md)

