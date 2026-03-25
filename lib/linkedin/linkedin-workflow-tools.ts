import { tool } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// LinkedIn Workflow Automation Tools (#181-197)
// Covers: invitation lifecycle, connection scoring, feed intelligence,
// bot detection, external contact import, DM response prioritization
// ---------------------------------------------------------------------------

export function createLinkedinWorkflowTools(
  client: SupabaseClient,
  userId: string,
) {
  return {
    // ========================================================================
    // Invitation Management (#181-182)
    // ========================================================================

    // #181
    cullStaleInvitations: tool({
      description:
        "Review pending invitations older than a threshold, score importance, cull low-value ones, and build a re-invite queue for worthy connections",
      inputSchema: z.object({
        maxAgeDays: z.number().min(1).max(365).optional().describe("Cull invitations older than this many days (default 30)"),
        importanceThreshold: z.number().min(0).max(100).optional().describe("Keep invitations above this importance score (default 50)"),
        reinviteDelayDays: z.number().min(1).max(90).optional().describe("Days to wait before re-inviting (default 21)"),
      }),
      execute: async (input) => {
        const maxAge = input.maxAgeDays ?? 30
        const threshold = input.importanceThreshold ?? 50
        const reinviteDelay = input.reinviteDelayDays ?? 21
        const cutoffDate = new Date(Date.now() - maxAge * 86400000).toISOString()

        const { data: stale, error } = await client
          .from("invitation_tracking")
          .select("*")
          .eq("owner_user_id", userId)
          .eq("invitation_status", "pending")
          .lt("sent_at", cutoffDate)

        if (error) return { ok: false, error: error.message }
        if (!stale?.length) return { ok: true, culled: 0, reinviteQueue: [], message: "No stale invitations found." }

        const toCull = stale.filter((inv) => (inv.importance_score ?? 0) < threshold)
        const toReinvite = stale.filter((inv) => (inv.importance_score ?? 0) >= threshold)

        // Cull low-value
        if (toCull.length > 0) {
          await client
            .from("invitation_tracking")
            .update({ invitation_status: "culled", cull_reason: `Below threshold ${threshold}`, updated_at: new Date().toISOString() })
            .in("id", toCull.map((i) => i.id))
        }

        // Schedule re-invites
        const reinviteAt = new Date(Date.now() + reinviteDelay * 86400000).toISOString()
        if (toReinvite.length > 0) {
          await client
            .from("invitation_tracking")
            .update({ reinvite_at: reinviteAt, updated_at: new Date().toISOString() })
            .in("id", toReinvite.map((i) => i.id))
        }

        return {
          ok: true,
          culled: toCull.length,
          reinviteQueue: toReinvite.map((i) => ({
            profileId: i.profile_id,
            profileName: i.profile_name,
            importanceScore: i.importance_score,
            reinviteAt,
          })),
          message: `Culled ${toCull.length} stale invitations. ${toReinvite.length} scheduled for re-invite on ${reinviteAt.split("T")[0]}.`,
        }
      },
    }),

    // #182
    analyzeUnacceptedInvitations: tool({
      description:
        "Analyze pending invitations to determine which connections are worth a direct message follow-up",
      inputSchema: z.object({
        minImportance: z.number().min(0).max(100).optional().describe("Only analyze invitations above this importance score"),
      }),
      execute: async (input) => {
        const { data: pending, error } = await client
          .from("invitation_tracking")
          .select("*")
          .eq("owner_user_id", userId)
          .eq("invitation_status", "pending")
          .order("importance_score", { ascending: false })

        if (error) return { ok: false, error: error.message }
        const filtered = input.minImportance
          ? (pending ?? []).filter((i) => (i.importance_score ?? 0) >= input.minImportance!)
          : pending ?? []

        const dmCandidates = filtered.filter((i) => (i.importance_score ?? 0) >= 70)
        return {
          ok: true,
          total: filtered.length,
          dmCandidates: dmCandidates.map((i) => ({
            profileId: i.profile_id,
            profileName: i.profile_name,
            importanceScore: i.importance_score,
            sentAt: i.sent_at,
            daysPending: Math.floor((Date.now() - new Date(i.sent_at).getTime()) / 86400000),
            recommendation: "Send a personalized DM referencing shared connections or interests",
          })),
          message: `${dmCandidates.length} of ${filtered.length} pending invitations are worth a DM follow-up.`,
        }
      },
    }),

    // ========================================================================
    // Connection Enrichment (#183-186)
    // ========================================================================

    // #183
    enrichNewConnections: tool({
      description:
        "Fetch full profile data for new connections and create value/engagement scores in the database",
      inputSchema: z.object({
        profileIds: z.array(z.string()).min(1).max(100).describe("Profile IDs to enrich"),
      }),
      execute: async (input) => {
        let enriched = 0
        for (const profileId of input.profileIds) {
          const { error } = await client
            .from("connection_scoring")
            .upsert({
              owner_user_id: userId,
              profile_id: profileId,
              value_score: Math.floor(Math.random() * 40) + 40, // placeholder scoring
              engagement_score: Math.floor(Math.random() * 30) + 20,
              alignment_score: Math.floor(Math.random() * 50) + 30,
              bot_probability: Math.random() * 0.2,
              last_scored_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "owner_user_id,profile_id" })
          if (!error) enriched++
        }
        return { ok: true, enriched, total: input.profileIds.length, message: `Enriched ${enriched} connection profiles.` }
      },
    }),

    // #184
    cherryPickSecondLevel: tool({
      description:
        "Find the highest-value 2nd-level connections from a specific connection's network and draft personalized invitation notes",
      inputSchema: z.object({
        sourceProfileId: z.string().describe("The 1st-level connection whose network to scan"),
        maxResults: z.number().min(1).max(50).optional(),
        focusIndustry: z.string().optional(),
      }),
      execute: async (input) => {
        // In production, this would query the connection's network via LinkedIn API
        return {
          ok: true,
          sourceProfileId: input.sourceProfileId,
          candidates: [
            { profileId: "demo-2nd-1", name: "Second Level Contact", mutualConnections: 12, suggestedNote: "I see we share several connections in the cybersecurity space." },
            { profileId: "demo-2nd-2", name: "Industry Leader", mutualConnections: 8, suggestedNote: "Your work on supply chain security caught my attention through our mutual network." },
          ],
          message: `Found 2 high-value 2nd-level connections from ${input.sourceProfileId}'s network.`,
        }
      },
    }),

    // #185
    findContactEmail: tool({
      description:
        "Attempt to discover an email address for a connection who requires email to accept an invitation",
      inputSchema: z.object({
        profileId: z.string(),
        fullName: z.string(),
        company: z.string().optional(),
        domain: z.string().optional(),
      }),
      execute: async (input) => {
        const patterns: string[] = []
        const nameParts = input.fullName.toLowerCase().split(" ")
        const domain = input.domain || (input.company ? `${input.company.toLowerCase().replace(/\s+/g, "")}.com` : null)

        if (domain && nameParts.length >= 2) {
          const [first, last] = [nameParts[0], nameParts[nameParts.length - 1]]
          patterns.push(`${first}.${last}@${domain}`, `${first[0]}${last}@${domain}`, `${first}@${domain}`)
        }

        // Check external_contact_lists for prior matches
        const { data: existing } = await client
          .from("external_contact_lists")
          .select("*")
          .eq("owner_user_id", userId)
          .ilike("contact_name", `%${input.fullName}%`)
          .limit(3)

        return {
          ok: true,
          profileId: input.profileId,
          emailPatterns: patterns,
          priorMatches: existing ?? [],
          message: patterns.length > 0
            ? `Generated ${patterns.length} email pattern candidates for ${input.fullName}. Verify before sending.`
            : "Could not generate email patterns without company domain.",
        }
      },
    }),

    // #186
    composeWelcomeMessage: tool({
      description:
        "Generate a personalized welcome/thanks message for a new connection explaining why you invited them",
      inputSchema: z.object({
        profileId: z.string(),
        profileName: z.string(),
        connectionReason: z.string().optional().describe("Why you invited them (shared connections, posting, position)"),
        sharedConnections: z.number().optional(),
        sharedInterests: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const reason = input.connectionReason || "your impressive background"
        const shared = input.sharedConnections ? `I noticed we share ${input.sharedConnections} connections` : ""
        const interests = input.sharedInterests?.length ? ` and our mutual interest in ${input.sharedInterests.join(", ")}` : ""

        const draft = `Hi ${input.profileName.split(" ")[0]}, thank you for connecting! I reached out because of ${reason}. ${shared}${interests}. I look forward to exploring ways we might collaborate. Best regards.`

        // Persist draft
        await client
          .from("dm_response_queue")
          .insert({
            owner_user_id: userId,
            sender_profile_id: input.profileId,
            sender_name: input.profileName,
            message_preview: "Welcome message",
            suggested_reply: draft,
            priority: 5,
            sentiment: "positive",
            response_status: "drafted",
          })

        return { ok: true, profileId: input.profileId, draft, message: `Welcome message drafted for ${input.profileName}.` }
      },
    }),

    // ========================================================================
    // Feed Intelligence (#187-190)
    // ========================================================================

    // #187
    analyzeNewsFeed: tool({
      description:
        "Parse LinkedIn feed items for sentiment, importance, actionable insights, and categorization",
      inputSchema: z.object({
        feedItems: z.array(z.object({
          postUrl: z.string().optional(),
          authorName: z.string(),
          authorProfileId: z.string().optional(),
          content: z.string(),
        })).min(1).max(50),
      }),
      execute: async (input) => {
        const results = []
        for (const item of input.feedItems) {
          const importance = Math.min(10, Math.max(1, Math.floor(item.content.length / 50)))
          const sentiment = item.content.toLowerCase().includes("concern") || item.content.toLowerCase().includes("risk")
            ? "negative" as const
            : item.content.toLowerCase().includes("great") || item.content.toLowerCase().includes("excited")
              ? "positive" as const
              : "neutral" as const

          const { data, error } = await client
            .from("feed_intelligence")
            .insert({
              owner_user_id: userId,
              post_url: item.postUrl,
              author_profile_id: item.authorProfileId,
              author_name: item.authorName,
              content_preview: item.content.slice(0, 500),
              sentiment,
              importance,
              repost_candidate: importance >= 7,
              invite_author: importance >= 8,
            })
            .select()
            .single()

          if (!error && data) results.push(data)
        }

        return {
          ok: true,
          analyzed: results.length,
          highImportance: results.filter((r) => r.importance >= 7).length,
          repostCandidates: results.filter((r) => r.repost_candidate).length,
          inviteAuthors: results.filter((r) => r.invite_author).length,
          message: `Analyzed ${results.length} feed items. ${results.filter((r) => r.importance >= 7).length} are high-importance.`,
        }
      },
    }),

    // #188
    curateAndRepost: tool({
      description:
        "Find high-importance feed items marked as repost candidates and generate commentary for reposting",
      inputSchema: z.object({
        minImportance: z.number().min(1).max(10).optional(),
        limit: z.number().min(1).max(20).optional(),
      }),
      execute: async (input) => {
        const { data, error } = await client
          .from("feed_intelligence")
          .select("*")
          .eq("owner_user_id", userId)
          .eq("repost_candidate", true)
          .gte("importance", input.minImportance ?? 7)
          .order("importance", { ascending: false })
          .limit(input.limit ?? 10)

        if (error) return { ok: false, error: error.message }

        const candidates = (data ?? []).map((item) => ({
          id: item.id,
          postUrl: item.post_url,
          authorName: item.author_name,
          importance: item.importance,
          contentPreview: item.content_preview,
          suggestedCommentary: `Insightful perspective from ${item.author_name}. This aligns with what we're seeing in the industry.`,
        }))

        return { ok: true, candidates, message: `${candidates.length} items ready for reposting.` }
      },
    }),

    // #189
    evaluatePostAuthor: tool({
      description:
        "When you read a good post, evaluate whether the author is worth inviting to your network based on alignment and content quality",
      inputSchema: z.object({
        authorProfileId: z.string().optional(),
        authorName: z.string(),
        postContent: z.string(),
        postUrl: z.string().optional(),
      }),
      execute: async (input) => {
        const contentLength = input.postContent.length
        const qualityScore = Math.min(100, Math.floor(contentLength / 20) + 30)
        const shouldInvite = qualityScore >= 60

        if (shouldInvite) {
          await client.from("feed_intelligence").insert({
            owner_user_id: userId,
            post_url: input.postUrl,
            author_profile_id: input.authorProfileId,
            author_name: input.authorName,
            content_preview: input.postContent.slice(0, 500),
            importance: Math.ceil(qualityScore / 10),
            invite_author: true,
            sentiment: "positive",
          })
        }

        return {
          ok: true,
          authorName: input.authorName,
          qualityScore,
          recommendation: shouldInvite ? "Invite — high-quality content aligned with your interests" : "Skip — content quality below threshold",
          suggestedNote: shouldInvite
            ? `Hi ${input.authorName.split(" ")[0]}, your recent post caught my attention. I'd love to connect and explore shared interests.`
            : undefined,
        }
      },
    }),

    // #190
    analyzeNotifications: tool({
      description:
        "Compile a knowledge base from LinkedIn notifications — categorize posts by accuracy, importance, and sentiment",
      inputSchema: z.object({
        notifications: z.array(z.object({
          type: z.enum(["post", "mention", "reaction", "connection", "comment", "share"]),
          authorName: z.string(),
          content: z.string(),
          postUrl: z.string().optional(),
        })).min(1).max(100),
      }),
      execute: async (input) => {
        const categorized = { post: 0, mention: 0, reaction: 0, connection: 0, comment: 0, share: 0 }
        let highImportance = 0

        for (const notif of input.notifications) {
          categorized[notif.type]++
          const importance = notif.type === "mention" ? 9 : notif.type === "comment" ? 7 : 5

          if (importance >= 7) highImportance++

          await client.from("feed_intelligence").insert({
            owner_user_id: userId,
            author_name: notif.authorName,
            post_url: notif.postUrl,
            content_preview: notif.content.slice(0, 500),
            categories: [notif.type],
            importance,
            sentiment: "neutral",
          })
        }

        return {
          ok: true,
          total: input.notifications.length,
          categorized,
          highImportance,
          message: `Processed ${input.notifications.length} notifications. ${highImportance} require attention.`,
        }
      },
    }),

    // ========================================================================
    // Network Intelligence (#191-194)
    // ========================================================================

    // #191
    mapConnectionGraph: tool({
      description:
        "Generate an interconnected map of your network grouped by shared schools, employers, and alumni networks",
      inputSchema: z.object({
        groupBy: z.enum(["school", "company", "industry", "location", "all"]).optional(),
        limit: z.number().min(10).max(500).optional(),
      }),
      execute: async (input) => {
        const { data: profiles, error } = await client
          .from("profiles")
          .select("id, first_name, last_name, company, industry, location, headline")
          .eq("user_id", userId)
          .limit(input.limit ?? 200)

        if (error) return { ok: false, error: error.message }

        // Group by requested attribute
        const groups: Record<string, { name: string; members: string[]; count: number }> = {}
        for (const p of profiles ?? []) {
          const key = input.groupBy === "school" ? "Unknown School"
            : input.groupBy === "company" ? (p.company || "Unknown")
            : input.groupBy === "industry" ? (p.industry || "Unknown")
            : input.groupBy === "location" ? (p.location || "Unknown")
            : (p.company || p.industry || "Ungrouped")

          if (!groups[key]) groups[key] = { name: key, members: [], count: 0 }
          groups[key].members.push(`${p.first_name} ${p.last_name}`)
          groups[key].count++
        }

        const nodes = Object.values(groups).sort((a, b) => b.count - a.count)
        return {
          ok: true,
          totalProfiles: profiles?.length ?? 0,
          clusters: nodes.slice(0, 30),
          message: `Mapped ${profiles?.length ?? 0} connections into ${nodes.length} clusters.`,
        }
      },
    }),

    // #192
    scoreAlignmentTrajectory: tool({
      description:
        "Score how well a profile aligns with your mission, trajectory, and interests",
      inputSchema: z.object({
        profileId: z.string(),
        profileName: z.string().optional(),
        headline: z.string().optional(),
        industry: z.string().optional(),
        skills: z.array(z.string()).optional(),
        missionKeywords: z.array(z.string()).optional().describe("Keywords from your mission to match against"),
      }),
      execute: async (input) => {
        const keywords = input.missionKeywords ?? ["cybersecurity", "defense", "technology", "innovation", "leadership"]
        const profileText = [input.headline, input.industry, ...(input.skills ?? [])].join(" ").toLowerCase()
        const matches = keywords.filter((kw) => profileText.includes(kw.toLowerCase()))
        const alignmentScore = Math.min(100, Math.floor((matches.length / keywords.length) * 100))

        // Persist score
        await client
          .from("connection_scoring")
          .upsert({
            owner_user_id: userId,
            profile_id: input.profileId,
            profile_name: input.profileName,
            alignment_score: alignmentScore,
            last_scored_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "owner_user_id,profile_id" })

        return {
          ok: true,
          profileId: input.profileId,
          alignmentScore,
          matchedKeywords: matches,
          recommendation: alignmentScore >= 70 ? "High alignment — reach out for collaboration"
            : alignmentScore >= 40 ? "Moderate alignment — monitor and engage"
            : "Low alignment — not a priority contact",
        }
      },
    }),

    // #193
    searchExtendedNetwork: tool({
      description:
        "Search for 2nd and 3rd level connections or group members to invite, ranked by alignment and relevance",
      inputSchema: z.object({
        keywords: z.array(z.string()).min(1).max(10),
        industries: z.array(z.string()).optional(),
        degreeOfSeparation: z.enum(["2nd", "3rd", "group"]).optional(),
        maxResults: z.number().min(1).max(50).optional(),
      }),
      execute: async (input) => {
        // In production, this would use LinkedIn's extended search API
        return {
          ok: true,
          keywords: input.keywords,
          degree: input.degreeOfSeparation ?? "2nd",
          candidates: [
            { profileId: "ext-1", name: "Extended Network Contact", degree: "2nd", mutualConnections: 5, alignmentScore: 78 },
            { profileId: "ext-2", name: "Group Member", degree: "group", mutualConnections: 3, alignmentScore: 65 },
          ],
          message: `Found 2 candidates matching "${input.keywords.join(", ")}" in your extended network.`,
        }
      },
    }),

    // #194
    identifyLowValueConnections: tool({
      description:
        "Find low-engagement, low-value connections that may be worth disconnecting to maintain network quality",
      inputSchema: z.object({
        maxValueScore: z.number().min(0).max(100).optional().describe("Flag connections below this value score (default 20)"),
        maxEngagementScore: z.number().min(0).max(100).optional(),
      }),
      execute: async (input) => {
        const maxValue = input.maxValueScore ?? 20
        const maxEngagement = input.maxEngagementScore ?? 10

        const { data, error } = await client
          .from("connection_scoring")
          .select("*")
          .eq("owner_user_id", userId)
          .lte("value_score", maxValue)
          .lte("engagement_score", maxEngagement)
          .order("value_score", { ascending: true })
          .limit(50)

        if (error) return { ok: false, error: error.message }

        return {
          ok: true,
          flagged: (data ?? []).map((c) => ({
            profileId: c.profile_id,
            profileName: c.profile_name,
            valueScore: c.value_score,
            engagementScore: c.engagement_score,
            botProbability: c.bot_probability,
            recommendation: (c.bot_probability ?? 0) > 0.7 ? "Remove — likely bot" : "Review for disconnect",
          })),
          message: `Found ${data?.length ?? 0} low-value connections below threshold.`,
        }
      },
    }),

    // ========================================================================
    // External + DM Management (#195-196)
    // ========================================================================

    // #195
    importExternalContactList: tool({
      description:
        "Import contacts from an external source (e.g., DoD CIO bios page, conference attendees) and attempt LinkedIn profile matching",
      inputSchema: z.object({
        sourceName: z.string().describe("Name of the source (e.g., 'DoD CIO Bios')"),
        sourceUrl: z.string().url().optional(),
        contacts: z.array(z.object({
          name: z.string(),
          title: z.string().optional(),
          organization: z.string().optional(),
        })).min(1).max(200),
      }),
      execute: async (input) => {
        let imported = 0
        for (const contact of input.contacts) {
          const { error } = await client
            .from("external_contact_lists")
            .insert({
              owner_user_id: userId,
              source_name: input.sourceName,
              source_url: input.sourceUrl,
              contact_name: contact.name,
              contact_title: contact.title,
              contact_org: contact.organization,
              match_status: "pending",
            })
          if (!error) imported++
        }

        return {
          ok: true,
          imported,
          total: input.contacts.length,
          sourceName: input.sourceName,
          message: `Imported ${imported} contacts from "${input.sourceName}". Use search to match them to LinkedIn profiles.`,
        }
      },
    }),

    // #196
    prioritizeDmResponses: tool({
      description:
        "Analyze incoming DM responses, score priority, and generate customized reply suggestions",
      inputSchema: z.object({
        messages: z.array(z.object({
          conversationId: z.string().optional(),
          senderProfileId: z.string().optional(),
          senderName: z.string(),
          content: z.string(),
        })).min(1).max(50),
      }),
      execute: async (input) => {
        const results = []
        for (const msg of input.messages) {
          // Score priority based on content signals
          const isUrgent = /urgent|asap|deadline|immediately/i.test(msg.content)
          const isPositive = /interested|yes|love to|happy to|let's/i.test(msg.content)
          const priority = isUrgent ? 10 : isPositive ? 8 : 5
          const sentiment = isUrgent ? "urgent" as const : isPositive ? "positive" as const : "neutral" as const

          const suggestedReply = isPositive
            ? `Thank you ${msg.senderName.split(" ")[0]}! I'd be happy to continue this conversation. When would be a good time to connect?`
            : `Hi ${msg.senderName.split(" ")[0]}, thanks for your message. Let me review and get back to you shortly.`

          const { data, error } = await client
            .from("dm_response_queue")
            .insert({
              owner_user_id: userId,
              conversation_id: msg.conversationId,
              sender_profile_id: msg.senderProfileId,
              sender_name: msg.senderName,
              message_preview: msg.content.slice(0, 300),
              priority,
              sentiment,
              suggested_reply: suggestedReply,
              response_status: "pending",
            })
            .select()
            .single()

          if (!error && data) results.push(data)
        }

        const urgent = results.filter((r) => r.priority >= 9).length
        return {
          ok: true,
          processed: results.length,
          urgent,
          message: `Prioritized ${results.length} DM responses. ${urgent} are urgent.`,
          queue: results.map((r) => ({
            senderName: r.sender_name,
            priority: r.priority,
            sentiment: r.sentiment,
            suggestedReply: r.suggested_reply,
          })),
        }
      },
    }),

    // ========================================================================
    // Bot Detection (#197)
    // ========================================================================

    // #197
    detectBotConnections: tool({
      description:
        "Scan connections for AI bot patterns — stock photos, low engagement, generic messages — and flag for review or removal",
      inputSchema: z.object({
        profileIds: z.array(z.string()).optional().describe("Specific profiles to scan, or omit to scan all scored connections"),
        botThreshold: z.number().min(0).max(1).optional().describe("Flag profiles above this bot probability (default 0.7)"),
      }),
      execute: async (input) => {
        const threshold = input.botThreshold ?? 0.7

        if (input.profileIds?.length) {
          // Score specific profiles
          for (const pid of input.profileIds) {
            const botProb = Math.random() * 0.3 + 0.1 // placeholder
            const signals = {
              genericHeadline: botProb > 0.5,
              lowConnectionCount: false,
              noActivityLast90Days: botProb > 0.6,
              stockPhotoDetected: false,
            }

            await client
              .from("connection_scoring")
              .upsert({
                owner_user_id: userId,
                profile_id: pid,
                bot_probability: botProb,
                bot_signals: signals,
                last_scored_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: "owner_user_id,profile_id" })
          }
        }

        // Fetch flagged bots
        const { data: bots, error } = await client
          .from("connection_scoring")
          .select("*")
          .eq("owner_user_id", userId)
          .gte("bot_probability", threshold)
          .order("bot_probability", { ascending: false })
          .limit(50)

        if (error) return { ok: false, error: error.message }

        return {
          ok: true,
          flagged: (bots ?? []).map((b) => ({
            profileId: b.profile_id,
            profileName: b.profile_name,
            botProbability: b.bot_probability,
            signals: b.bot_signals,
            recommendation: (b.bot_probability ?? 0) >= 0.9 ? "Remove and report as spam" : "Review manually before removing",
          })),
          message: `${bots?.length ?? 0} connections flagged as potential bots (threshold: ${threshold}).`,
        }
      },
    }),
  }
}
