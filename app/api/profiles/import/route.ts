import { normalizeLinkedInUrl } from "@/lib/csv/import-session"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TABLE = "profiles"
const MAX_BODY = getMaxBodyBytesFromEnv("PROFILES_IMPORT_MAX_BODY_BYTES", 64_000)

const ProfileImportSchema = z.object({
  sessionId: z.string().min(1).max(200),
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200).optional(),
  headline: z.string().min(1).max(500),
  company: z.string().min(1).max(300).optional(),
  location: z.string().min(1).max(300).optional(),
  industry: z.string().min(1).max(300).optional(),
  connections: z.number().int().min(0).max(1_000_000).optional(),
  skills: z.array(z.string().min(1).max(200)).max(50),
  matchScore: z.number().min(0).max(100).optional(),
  seniority: z.string().min(1).max(120).optional(),
  tribe: z.string().min(1).max(200).optional(),
  linkedinUrl: z.string().url().max(1_000).optional(),
})

const ImportRequestSchema = z.object({
  profiles: z.array(ProfileImportSchema).min(1).max(50),
})

type ExistingProfileRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  headline?: string | null
  company?: string | null
  linkedin_url?: string | null
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

function buildFallbackKey(input: {
  firstName?: string | null
  first_name?: string | null
  lastName?: string | null
  last_name?: string | null
  headline?: string | null
  company?: string | null
}): string {
  return [
    normalizeText(input.firstName ?? input.first_name),
    normalizeText(input.lastName ?? input.last_name),
    normalizeText(input.headline),
    normalizeText(input.company),
  ].join("|")
}

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireSupabaseAuth(req, { errorBody: { error: "unauthorized" } })
  if (!authResult.auth) return authResult.response

  const client = getSupabaseServerClient()
  if (!client) {
    return jsonResponse({ error: "server_config", message: "Supabase server client is not configured." }, 500)
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY)
  if (!bodyResult.ok) {
    return jsonResponse({ error: "invalid_body", message: bodyResult.error }, bodyResult.status)
  }

  const parsed = ImportRequestSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        error: "validation_error",
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const ownerUserId = authResult.auth.userId
  const { data: existingProfiles, error: existingProfilesError } = await client
    .from(TABLE)
    .select("id, first_name, last_name, headline, company, linkedin_url")
    .eq("owner_user_id", ownerUserId)
    .limit(1000)

  if (existingProfilesError) {
    console.warn("[profiles/import] lookup failed:", existingProfilesError.message)
    return jsonResponse({ error: "lookup_failed", message: existingProfilesError.message }, 500)
  }

  const workingProfiles = [...((existingProfiles ?? []) as ExistingProfileRow[])]
  const timestamp = Date.now()
  const saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }> = []
  let insertedCount = 0
  let updatedCount = 0

  for (let index = 0; index < parsed.data.profiles.length; index++) {
    const profile = parsed.data.profiles[index]
    const normalizedLinkedInUrl = normalizeLinkedInUrl(profile.linkedinUrl)
    const fallbackKey = buildFallbackKey(profile)

    const existingMatch =
      workingProfiles.find((row) => {
        if (!normalizedLinkedInUrl) return false
        return normalizeLinkedInUrl(row.linkedin_url ?? undefined) === normalizedLinkedInUrl
      }) ??
      workingProfiles.find((row) => buildFallbackKey(row) === fallbackKey)

    const payload: Record<string, unknown> = {
      owner_user_id: ownerUserId,
      name: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim(),
      first_name: profile.firstName,
      last_name: profile.lastName ?? "",
      headline: profile.headline,
      company: profile.company ?? null,
      location: profile.location ?? null,
      industry: profile.industry ?? null,
      connections: profile.connections ?? 0,
      connections_count: profile.connections ?? 0,
      skills: profile.skills,
      match_score: profile.matchScore ?? null,
      seniority: profile.seniority ?? null,
      tribe: profile.tribe ?? null,
      linkedin_url: normalizedLinkedInUrl ?? null,
      updated_at: new Date().toISOString(),
    }

    if (existingMatch?.id) {
      const { error: updateError } = await client
        .from(TABLE)
        .update(payload)
        .eq("id", existingMatch.id)
        .eq("owner_user_id", ownerUserId)

      if (updateError) {
        console.warn("[profiles/import] update failed:", updateError.message)
        return jsonResponse({ error: "update_failed", message: updateError.message }, 500)
      }

      updatedCount += 1
      saved.push({
        sessionId: profile.sessionId,
        profileId: existingMatch.id,
        action: "updated",
      })

      const matchIndex = workingProfiles.findIndex((row) => row.id === existingMatch.id)
      if (matchIndex >= 0) {
        workingProfiles[matchIndex] = {
          id: existingMatch.id,
          first_name: profile.firstName,
          last_name: profile.lastName ?? "",
          headline: profile.headline,
          company: profile.company ?? null,
          linkedin_url: normalizedLinkedInUrl ?? null,
        }
      }
      continue
    }

    const insertedId = `crm-import-${timestamp}-${index}`
    const insertPayload = {
      ...payload,
      id: insertedId,
      created_at: new Date().toISOString(),
    }

    const { error: insertError } = await client.from(TABLE).insert(insertPayload)
    if (insertError) {
      console.warn("[profiles/import] insert failed:", insertError.message)
      return jsonResponse({ error: "insert_failed", message: insertError.message }, 500)
    }

    insertedCount += 1
    workingProfiles.push({
      id: insertedId,
      first_name: profile.firstName,
      last_name: profile.lastName ?? "",
      headline: profile.headline,
      company: profile.company ?? null,
      linkedin_url: normalizedLinkedInUrl ?? null,
    })
    saved.push({
      sessionId: profile.sessionId,
      profileId: insertedId,
      action: "inserted",
    })
  }

  return jsonResponse({
    ok: true,
    saved,
    counts: {
      inserted: insertedCount,
      updated: updatedCount,
    },
  })
}
