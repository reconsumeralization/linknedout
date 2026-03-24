# Supabase Features and LinkedOut Front-Ends

LinkedOut uses **Supabase** for backend services and exposes every capability through **our own branded front-ends** tied to product functionality—no need to rely on the Supabase Dashboard for day-to-day use.

## Feature map


| Supabase feature | LinkedOut front-end                                                              | Notes                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Auth**         | Login (`/login`), Auth center (`/auth`), Sign-in gates on protected views        | Email/password, magic link, OAuth (Google, GitHub), password reset. Branded with app name and tagline.         |
| **Database**     | **Profiles CRM**, **Tribe Builder**, **Projects**, **Fundraising**, **Data hub** | Domain UIs for profiles, tribes, projects, campaigns/donors/donations/goals. Data hub links to all data areas. |
| **Storage**      | **Files & assets** (Storage panel)                                               | Branded panel: list, upload, delete files in app bucket (e.g. campaign assets, avatars).                       |
| **Realtime**     | Used under the hood                                                              | Live updates in fundraising and other panels; no separate “Realtime” UI.                                       |


## Data areas (database)

- **Profiles** – Contacts and talent (`profiles` and related tables).
- **Tribes** – Teams and tribes (`tribes`).
- **Projects** – Initiatives and positions (`projects`, `project_positions`, `project_applications`).
- **Fundraising** – Campaigns, donors, donations, goals, outreach (`fundraising_`*, `fundraising_outreach_*`).

Other Supabase-backed tables (email, agents, sentinel, LinkedIn, etc.) are used by their own panels (Email, Agent Control, SENTINEL, LinkedOut).

## Branding

- **Central config:** `lib/branding.ts` — `APP_NAME`, `APP_TAGLINE`, `APP_DESCRIPTION`.
- **Shared header:** `components/branded-panel-header.tsx` — used on Profiles, Tribes, Projects, Fundraising, Data hub, Storage.
- **Layout/sidebar:** Document title and sidebar use the same branding.

## AI agents and tools

- **Chat** (`app/api/chat/route.ts`): `VIEW_PAGE_CONTEXT` includes every app view (dashboard, chat, profiles, tribes, projects, fundraising, data, storage, email, analytics, linkedout, network, agents, globe, sentinel, settings). The AI receives the current page and prioritized tools/intents so responses and tool use are context-aware.
- **Assistant drawer** (`components/assistant-drawer.tsx`): Uses the same view set for labels, icons, descriptions, and suggested prompts (including Data hub, Fundraising, Storage).
- **CRM & Talent** in chat: The context treats profiles, tribes, projects, linkedout, fundraising, data, and storage as part of CRM & Talent so the AI can suggest actions across these panels.

## Storage setup

To enable **Files & assets**, run the storage migration so the app bucket and RLS exist:

- **Migration:** `supabase/migrations/20260305200000_storage_linkedout_assets.sql`
- Creates bucket `linkedout-assets` (private, 5MB limit, common MIME types) and RLS for authenticated users.
- Apply via Supabase Dashboard → SQL editor, or via CLI: `supabase db push` (or your pipeline).

## Adding new Supabase-backed features

1. Add tables/migrations and RLS as needed.
2. Add data access in `lib/supabase-data.ts` (or a dedicated lib).
3. Add a **branded** panel that uses `BrandedPanelHeader` and your UI.
4. Add the view to the sidebar and `app/page.tsx` `ActiveView` / `renderPanel()`.
5. Optionally add a card on the **Data hub** that links to the new panel.

