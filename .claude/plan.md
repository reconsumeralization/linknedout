# LinkedOut: User-Provided Keys + Vercel + Supabase Deployment Plan

## Architecture Decision: "Bring Your Own Backend"

Each user provides their own:
- **Supabase URL + Anon Key** (their own Supabase project)
- **OpenAI API Key** (or other AI provider keys)
- Keys are stored in **localStorage** on the client and sent as headers to API routes
- No shared `.env` keys needed for end users — Vercel deployment works with zero env vars
- The app works in "open mode" until the user configures their keys in Settings

## Changes Required

### 1. User Key Storage (`lib/shared/user-keys.ts`) — NEW
- `getUserKeys()` / `setUserKeys()` — read/write from localStorage
- Keys: `supabaseUrl`, `supabaseAnonKey`, `openaiApiKey`
- `hasUserSupabase()` / `hasUserOpenAI()` — check if configured
- Keys sent to API routes via custom headers: `x-user-supabase-url`, `x-user-supabase-anon-key`, `x-user-openai-key`

### 2. Supabase Client (`lib/supabase/supabase.ts`) — MODIFY
- Add `getSupabaseClientFromUserKeys(url, anonKey)` — creates a client from user-provided keys
- Modify `getSupabaseClient()` to fallback: env vars → user keys from localStorage
- Client-side: read from localStorage if env vars missing

### 3. Chat API Route (`app/api/chat/route.ts`) — MODIFY
- Read `x-user-openai-key` header; fallback to `process.env.OPENAI_API_KEY`
- Read `x-user-supabase-url` + `x-user-supabase-anon-key` headers; use for auth context
- If neither env nor header key exists, return 401 with helpful message

### 4. Settings Panel (`components/settings-panel.tsx`) — MODIFY
- Add "Backend Configuration" card at TOP of settings:
  - Supabase URL input
  - Supabase Anon Key input
  - OpenAI API Key input (masked)
  - Test Connection button
  - Save / Clear buttons
- Show green/amber status dots for each
- Remove references to `.env.local` in About section

### 5. Onboarding Card (`components/onboarding-card.tsx`) — MODIFY
- Change "Wire up Supabase" step: instead of "Add to .env.local", say "Enter your Supabase URL and key in Settings"
- Point action to Settings panel instead of /setup external link
- Accept `hasUserKeys` prop to detect user-provided keys

### 6. Vercel Deployment (`vercel.json`) — MODIFY
- Remove required env vars (make them optional)
- App should build and run with zero env vars
- Add `NEXT_PUBLIC_APP_MODE=open` default

### 7. Network Panel & Analytics — FIX
- Check network-panel.tsx for broken "jobs" section
- Ensure all chart data flows work with user-provided Supabase

### 8. All API Routes — MODIFY pattern
- Every route that reads `process.env.OPENAI_API_KEY` must also check `x-user-openai-key` header
- Every route that creates Supabase client must support user-provided URL/key headers
- Create shared helper: `resolveOpenAIKey(req)` and `resolveSupabaseFromRequest(req)`

## File Changes Summary

| File | Action |
|------|--------|
| `lib/shared/user-keys.ts` | CREATE — localStorage key management |
| `lib/supabase/supabase.ts` | MODIFY — add user-key fallback |
| `lib/shared/resolve-request-keys.ts` | CREATE — server-side header extraction |
| `app/api/chat/route.ts` | MODIFY — use resolved keys |
| `components/settings-panel.tsx` | MODIFY — add Backend Config card |
| `components/onboarding-card.tsx` | MODIFY — update Supabase step |
| `components/chat-panel.tsx` | MODIFY — send user keys as headers |
| `vercel.json` | MODIFY — make env vars optional |
| `app/page.tsx` | MODIFY — pass user key state to onboarding |

## Build Order
1. `lib/shared/user-keys.ts` + `lib/shared/resolve-request-keys.ts`
2. Modify `lib/supabase/supabase.ts`
3. Modify `app/api/chat/route.ts` + other API routes
4. Modify `components/settings-panel.tsx`
5. Modify `components/onboarding-card.tsx`
6. Modify `components/chat-panel.tsx` to send headers
7. Update `vercel.json`
8. Fix network/analytics panels
9. TypeScript check + test + commit
