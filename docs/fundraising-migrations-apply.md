# Apply Fundraising & Outreach Migrations

Use one of the options below to apply the fundraising and outreach migrations so **Fundraising → Outreach** (email/LinkedIn campaigns) works.

## Option A: Supabase Dashboard (Cloud or any Postgres)

1. Open your [Supabase project](https://supabase.com/dashboard) → **SQL Editor** → **New query**.

2. **If you don’t have fundraising tables yet**, run the fundraising migration first:
   - Open `supabase/migrations/20260305180000_fundraising.sql`
   - Copy its full contents into the SQL Editor and click **Run**.

3. **Run the outreach migration** (email/LinkedIn campaigns):
   - Open `supabase/migrations/20260305190000_fundraising_outreach.sql`
   - Copy its full contents into the SQL Editor and click **Run**.

4. In the app: go to **Fundraising** → **Outreach** to create email or LinkedIn campaigns.

---

## Option B: Local Supabase (CLI)

1. **Install Supabase CLI** (if needed):
   - Windows: `winget install Supabase.CLI` or [install from GitHub](https://github.com/supabase/cli#install-the-cli).
   - Or: `npm install -g supabase`.

2. **Start and reset local DB** (applies all migrations, including fundraising and outreach):
   ```powershell
   cd "c:\Users\Amber\Downloads\OneDrive - varmsp\Apps\linknedout"
   pnpm supabase:local:start
   pnpm supabase:local:reset
   ```
   `supabase:local:reset` runs `supabase db reset --local`, which reapplies every migration in `supabase/migrations/`.

3. In the app: go to **Fundraising** → **Outreach** to run email or LinkedIn campaigns.

---

## After Applying

- **Fundraising** sidebar → **Outreach** tab.
- **Email campaign**: create draft → add recipients (donors with email) → Send. Use `{{name}}`, `{{firstName}}`, `{{lastName}}`, `{{campaignName}}` in subject/body.
- **LinkedIn post**: create draft → Post now (requires LinkedIn connected in Settings with Share permission).
