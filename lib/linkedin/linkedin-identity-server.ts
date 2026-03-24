/**
 * LinkedIn Consumer identity persistence (Supabase).
 *
 * Table: linkedin_identities (or SUPABASE_LINKEDIN_IDENTITIES_TABLE)
 * Columns: user_id (uuid PK), linkedin_subject (text), display_name (text),
 * picture_url (text), email (text nullable), access_token (text), expires_at (timestamptz),
 * scopes (text), last_introspect_at (timestamptz nullable), introspect_active (boolean nullable),
 * created_at (timestamptz), updated_at (timestamptz).
 * RLS: enable with policy user_id = auth.uid() for SELECT; use service role in callback to upsert.
 */

import {
  fetchUserInfo,
  introspectToken,
  LINKEDIN_SCOPE_SHARE,
  type LinkedInUserInfo,
  type LinkedInTokenResponse,
} from "@/lib/linkedin/linkedin-consumer"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"

const TABLE =
  process.env.SUPABASE_LINKEDIN_IDENTITIES_TABLE || "linkedin_identities"

export type LinkedInIdentityRow = {
  user_id: string
  linkedin_subject: string
  display_name: string | null
  picture_url: string | null
  email: string | null
  access_token: string
  expires_at: string
  scopes: string | null
  last_introspect_at: string | null
  introspect_active: boolean | null
  created_at: string
  updated_at: string
}

/** Safe shape returned to client (no access_token). */
export type LinkedInIdentityPublic = {
  linkedin_subject: string
  display_name: string | null
  picture_url: string | null
  email: string | null
  expires_at: string
  scopes: string | null
  has_share_scope: boolean
  last_introspect_at: string | null
  introspect_active: boolean | null
}

export async function getLinkedInIdentity(
  userId: string
): Promise<LinkedInIdentityPublic | null> {
  const client = getSupabaseServerClient()
  if (!client) return null
  const { data, error } = await client
    .from(TABLE)
    .select(
      "linkedin_subject, display_name, picture_url, email, expires_at, scopes, last_introspect_at, introspect_active"
    )
    .eq("user_id", userId)
    .single()
  if (error || !data) return null
  const d = data as Record<string, unknown>
  return {
    linkedin_subject: String(d.linkedin_subject ?? ""),
    display_name: d.display_name != null ? String(d.display_name) : null,
    picture_url: d.picture_url != null ? String(d.picture_url) : null,
    email: d.email != null ? String(d.email) : null,
    expires_at: String(d.expires_at ?? ""),
    scopes: d.scopes != null ? String(d.scopes) : null,
    has_share_scope: String(d.scopes ?? "").split(/\s+/).includes(LINKEDIN_SCOPE_SHARE),
    last_introspect_at: d.last_introspect_at != null ? String(d.last_introspect_at) : null,
    introspect_active: d.introspect_active as boolean | null,
  }
}

/** Internal: get access token for server-side share. */
export async function getLinkedInAccessToken(
  userId: string
): Promise<{ accessToken: string; linkedinSubject: string } | null> {
  const client = getSupabaseServerClient()
  if (!client) return null
  const { data, error } = await client
    .from(TABLE)
    .select("access_token, linkedin_subject")
    .eq("user_id", userId)
    .single()
  if (error || !data?.access_token) return null
  return {
    accessToken: (data as { access_token: string }).access_token,
    linkedinSubject: (data as { linkedin_subject: string }).linkedin_subject,
  }
}

export async function upsertLinkedInIdentity(
  userId: string,
  token: LinkedInTokenResponse,
  userInfo: LinkedInUserInfo | null
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, error: "Supabase server not configured" }
  }
  if (!token.access_token) {
    return { ok: false, error: "No access token" }
  }

  const sub = userInfo?.sub ?? ""
  const displayName =
    (userInfo?.name ?? [userInfo?.given_name, userInfo?.family_name].filter(Boolean).join(" ")) || null
  const pictureUrl = userInfo?.picture ?? null
  const email = userInfo?.email ?? null
  const scopes = token.scope ?? null
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // default 60 days

  let lastIntrospectAt: string | null = null
  let introspectActive: boolean | null = null
  try {
    const intro = await introspectToken(token.access_token)
    if (intro) {
      lastIntrospectAt = new Date().toISOString()
      introspectActive = intro.active
    }
  } catch {
    // non-fatal
  }

  const now = new Date().toISOString()
  const row = {
    user_id: userId,
    linkedin_subject: sub,
    display_name: displayName,
    picture_url: pictureUrl,
    email,
    access_token: token.access_token,
    expires_at: expiresAt,
    scopes,
    last_introspect_at: lastIntrospectAt,
    introspect_active: introspectActive,
    updated_at: now,
  }

  const { error } = await client.from(TABLE).upsert(row, {
    onConflict: "user_id",
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function deleteLinkedInIdentity(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseServerClient()
  if (!client) return { ok: false, error: "Supabase server not configured" }
  const { error } = await client.from(TABLE).delete().eq("user_id", userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
