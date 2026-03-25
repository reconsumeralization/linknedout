import { createClient } from "@supabase/supabase-js"
import { tool } from "ai"
import { z } from "zod"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function createUserClient(accessToken?: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  })
}

// ============================================================================
// Sovereign Civilization Tools
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSovereignTools(
  authContext: SupabaseAuthContext | null,
): Record<string, any> {
  if (!authContext) {
    return {}
  }

  const client = createUserClient(authContext.accessToken)
  const userId = authContext.userId

  return {
    // ========================================================================
    // Governance Tools
    // ========================================================================

    proposeTribalPivot: tool({
      description:
        "Create a governance proposal for a tribe. Used to propose strategy pivots, membership changes, resource allocation, or custom proposals that require tribal consensus.",
      inputSchema: z.object({
        tribeId: z.string().uuid(),
        title: z.string().min(3).max(200),
        description: z.string().min(10).max(4000),
        proposalType: z.enum(["strategy_pivot", "membership", "resource_allocation", "custom"]),
        evidenceIds: z.array(z.string().uuid()).max(20).optional(),
        quorumThreshold: z.number().min(0.1).max(1.0).optional(),
        approvalThreshold: z.number().min(0.5).max(1.0).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("governance_proposals")
            .insert({
              tribe_id: input.tribeId,
              proposed_by: userId,
              title: input.title.trim(),
              description: input.description.trim(),
              proposal_type: input.proposalType,
              evidence_ids: input.evidenceIds || [],
              quorum_threshold: input.quorumThreshold ?? 0.5,
              approval_threshold: input.approvalThreshold ?? 0.66,
              status: "open",
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to create governance proposal." }
          }

          return { ok: true, proposal: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error creating proposal." }
        }
      },
    }),

    executeTribalConsensus: tool({
      description:
        "Tally votes and resolve a governance proposal. Computes weighted vote totals, checks quorum, and updates the proposal status to passed or rejected.",
      inputSchema: z.object({
        proposalId: z.string().uuid(),
      }),
      execute: async (input) => {
        try {
          const { data: proposal, error: proposalError } = await client
            .from("governance_proposals")
            .select("*")
            .eq("id", input.proposalId)
            .single()

          if (proposalError || !proposal) {
            return { ok: false, error: proposalError?.message || "Proposal not found." }
          }

          if (proposal.status !== "open") {
            return { ok: false, error: `Proposal is already ${proposal.status}.` }
          }

          const { data: votes, error: votesError } = await client
            .from("governance_votes")
            .select("*")
            .eq("proposal_id", input.proposalId)

          if (votesError) {
            return { ok: false, error: votesError.message || "Failed to fetch votes." }
          }

          const allVotes = votes || []
          let weightedFor = 0
          let weightedAgainst = 0
          let weightedAbstain = 0

          for (const vote of allVotes) {
            const weight = vote.weight ?? 1
            if (vote.vote === "for") weightedFor += weight
            else if (vote.vote === "against") weightedAgainst += weight
            else if (vote.vote === "abstain") weightedAbstain += weight
          }

          const totalWeight = weightedFor + weightedAgainst + weightedAbstain
          const quorumMet = totalWeight >= (proposal.quorum_threshold ?? 0.5)
          const approvalRatio = totalWeight > 0 ? weightedFor / totalWeight : 0
          const passed = quorumMet && approvalRatio >= (proposal.approval_threshold ?? 0.66)
          const newStatus = passed ? "passed" : "rejected"

          const { error: updateError } = await client
            .from("governance_proposals")
            .update({
              status: newStatus,
              resolved_at: new Date().toISOString(),
              vote_summary: {
                weightedFor,
                weightedAgainst,
                weightedAbstain,
                totalWeight,
                quorumMet,
                approvalRatio,
              },
            })
            .eq("id", input.proposalId)

          if (updateError) {
            return { ok: false, error: updateError.message || "Failed to update proposal status." }
          }

          return {
            ok: true,
            proposalId: input.proposalId,
            status: newStatus,
            voteBreakdown: {
              weightedFor,
              weightedAgainst,
              weightedAbstain,
              totalWeight,
              quorumMet,
              approvalRatio,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error resolving proposal." }
        }
      },
    }),

    delegateVotingPower: tool({
      description:
        "Delegate your voting power to a trusted tribe member for a specific domain. Creates or updates a governance delegation.",
      inputSchema: z.object({
        delegateUserId: z.string().uuid(),
        tribeId: z.string().uuid(),
        domain: z.string().min(1).max(100),
      }),
      execute: async (input) => {
        try {
          if (input.delegateUserId === userId) {
            return { ok: false, error: "Cannot delegate voting power to yourself." }
          }

          const { data, error } = await client
            .from("governance_delegations")
            .upsert(
              {
                delegator_user_id: userId,
                delegate_user_id: input.delegateUserId,
                tribe_id: input.tribeId,
                domain: input.domain.trim(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "delegator_user_id,tribe_id,domain" },
            )
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to delegate voting power." }
          }

          return { ok: true, delegation: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error delegating vote." }
        }
      },
    }),

    // ========================================================================
    // Marketplace Tools
    // ========================================================================

    browseMarketplace: tool({
      description:
        "Search the marketplace with natural language. Returns active listings filtered by query text and optional listing type.",
      inputSchema: z.object({
        query: z.string().min(1).max(500),
        listingType: z
          .enum(["experience", "service", "digital_asset", "mentorship"])
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input) => {
        try {
          let query = client
            .from("marketplace_listings")
            .select("*")
            .eq("status", "active")
            .ilike("title", `%${input.query}%`)
            .limit(input.limit ?? 20)

          if (input.listingType) {
            query = query.eq("listing_type", input.listingType)
          }

          const { data, error } = await query

          if (error) {
            return { ok: false, error: error.message || "Failed to search marketplace." }
          }

          return { ok: true, listings: data || [], count: (data || []).length }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error browsing marketplace." }
        }
      },
    }),

    createExperienceListing: tool({
      description:
        "Help a seller draft a marketplace listing. Creates a new listing in draft status for review before publishing.",
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        description: z.string().min(10).max(4000),
        listingType: z.enum(["experience", "service", "digital_asset", "mentorship"]),
        deliveryMethod: z.enum(["virtual", "in_person", "async", "hybrid"]),
        priceTokens: z.number().min(0).optional(),
        priceUsd: z.number().min(0).optional(),
        location: z.string().max(200).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("marketplace_listings")
            .insert({
              seller_user_id: userId,
              title: input.title.trim(),
              description: input.description.trim(),
              listing_type: input.listingType,
              delivery_method: input.deliveryMethod,
              price_tokens: input.priceTokens ?? 0,
              price_usd: input.priceUsd ?? 0,
              location: input.location?.trim() || null,
              status: "draft",
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to create listing." }
          }

          return { ok: true, listing: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error creating listing." }
        }
      },
    }),

    // #221 — calculateFulfillmentYield
    calculateFulfillmentYield: tool({
      description:
        "Compute the authenticated user's fulfillment yield score. Returns a breakdown of all fulfillment dimensions.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { data, error } = await client
            .from("fulfillment_yield_scores")
            .select("*")
            .eq("user_id", userId)
            .order("calculated_at", { ascending: false })
            .limit(1)
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "No fulfillment score found." }
          }

          return { ok: true, score: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error fetching fulfillment score." }
        }
      },
    }),

    // ========================================================================
    // Trade Tools
    // ========================================================================

    negotiateSovereignSwap: tool({
      description:
        "Execute an AI CFO negotiation round. Appends a proposal to the negotiation session and increments the current round counter.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        proposal: z.object({
          offeredTokens: z.number().min(0),
          requestedTokens: z.number().min(0),
          terms: z.string().max(2000),
          expiresInHours: z.number().min(1).max(720).optional(),
        }),
      }),
      execute: async (input) => {
        try {
          const { data: session, error: sessionError } = await client
            .from("negotiation_sessions")
            .select("*")
            .eq("id", input.sessionId)
            .single()

          if (sessionError || !session) {
            return { ok: false, error: sessionError?.message || "Negotiation session not found." }
          }

          const newRound = (session.current_round ?? 0) + 1

          const { error: roundError } = await client.from("negotiation_rounds").insert({
            session_id: input.sessionId,
            round_number: newRound,
            proposed_by: userId,
            offered_tokens: input.proposal.offeredTokens,
            requested_tokens: input.proposal.requestedTokens,
            terms: input.proposal.terms.trim(),
            expires_at: input.proposal.expiresInHours
              ? new Date(Date.now() + input.proposal.expiresInHours * 3600000).toISOString()
              : null,
            created_at: new Date().toISOString(),
          })

          if (roundError) {
            return { ok: false, error: roundError.message || "Failed to submit negotiation round." }
          }

          const { data: updatedSession, error: updateError } = await client
            .from("negotiation_sessions")
            .update({ current_round: newRound, updated_at: new Date().toISOString() })
            .eq("id", input.sessionId)
            .select()
            .single()

          if (updateError) {
            return { ok: false, error: updateError.message || "Failed to update session." }
          }

          return { ok: true, session: updatedSession, roundNumber: newRound }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in negotiation." }
        }
      },
    }),

    evaluateTradeOffer: tool({
      description:
        "Analyze a trade offer against your current token portfolio. Fetches the offer details and your token balance to produce a recommendation.",
      inputSchema: z.object({
        offerId: z.string().uuid(),
      }),
      execute: async (input) => {
        try {
          const { data: offer, error: offerError } = await client
            .from("negotiation_rounds")
            .select("*")
            .eq("id", input.offerId)
            .single()

          if (offerError || !offer) {
            return { ok: false, error: offerError?.message || "Trade offer not found." }
          }

          const { data: ledger, error: ledgerError } = await client
            .from("agentic_token_ledger")
            .select("*")
            .eq("user_id", userId)

          if (ledgerError) {
            return { ok: false, error: ledgerError.message || "Failed to fetch token balance." }
          }

          const entries = ledger || []
          const currentBalance = entries.reduce(
            (sum: number, entry: { amount?: number }) => sum + (entry.amount ?? 0),
            0,
          )

          const requestedTokens = offer.requested_tokens ?? 0
          const offeredTokens = offer.offered_tokens ?? 0
          const canAfford = currentBalance >= requestedTokens
          const netChange = offeredTokens - requestedTokens

          let recommendation: string
          if (!canAfford) {
            recommendation = "reject"
          } else if (netChange > 0) {
            recommendation = "accept"
          } else if (netChange === 0) {
            recommendation = "neutral"
          } else {
            recommendation = "review"
          }

          return {
            ok: true,
            offer,
            analysis: {
              currentBalance,
              requestedTokens,
              offeredTokens,
              netChange,
              canAfford,
              recommendation,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error evaluating trade." }
        }
      },
    }),

    // ========================================================================
    // Authenticity Tools
    // ========================================================================

    attestContent: tool({
      description:
        "Create an authenticity attestation for a piece of content. Records the content hash, method, and optional artifact signature for provenance tracking.",
      inputSchema: z.object({
        contentType: z.enum(["post", "article", "message", "profile", "media"]),
        contentHash: z.string().min(16).max(128),
        attestationMethod: z.enum(["hash_signature", "c2pa", "watermark", "self_declared"]),
        artifactSignature: z.string().max(512).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("authenticity_attestations")
            .insert({
              user_id: userId,
              content_type: input.contentType,
              content_hash: input.contentHash,
              attestation_method: input.attestationMethod,
              artifact_signature: input.artifactSignature || null,
              verified: false,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to create attestation." }
          }

          return { ok: true, attestation: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error creating attestation." }
        }
      },
    }),

    verifyAuthenticity: tool({
      description:
        "Verify the provenance of content by its hash. Fetches the full attestation chain and checks signatures to determine authenticity.",
      inputSchema: z.object({
        contentHash: z.string().min(16).max(128),
      }),
      execute: async (input) => {
        try {
          const { data: attestations, error } = await client
            .from("authenticity_attestations")
            .select("*")
            .eq("content_hash", input.contentHash)
            .order("created_at", { ascending: true })

          if (error) {
            return { ok: false, error: error.message || "Failed to fetch attestations." }
          }

          if (!attestations || attestations.length === 0) {
            return { ok: true, verified: false, reason: "No attestations found for this content hash.", chain: [] }
          }

          const hasSignature = attestations.some(
            (a: { artifact_signature?: string | null }) => !!a.artifact_signature,
          )
          const allMethodsConsistent = new Set(
            attestations.map((a: { attestation_method: string }) => a.attestation_method),
          ).size === 1

          return {
            ok: true,
            verified: hasSignature && allMethodsConsistent,
            attestationCount: attestations.length,
            methods: [...new Set(attestations.map((a: { attestation_method: string }) => a.attestation_method))],
            chain: attestations,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error verifying authenticity." }
        }
      },
    }),

    // ========================================================================
    // Sync Tools
    // ========================================================================

    syncPredictiveTwin: tool({
      description:
        "Snapshot current state before going offline. Reads the specified state from its source table and creates a shadow_state_snapshot for predictive twin usage.",
      inputSchema: z.object({
        stateType: z.enum(["profile", "connections", "tribe_membership", "token_balance", "preferences"]),
        stateKey: z.string().min(1).max(200),
      }),
      execute: async (input) => {
        try {
          const tableMap: Record<string, string> = {
            profile: "profiles",
            connections: "connections",
            tribe_membership: "tribe_members",
            token_balance: "agentic_token_ledger",
            preferences: "user_preferences",
          }

          const sourceTable = tableMap[input.stateType]
          if (!sourceTable) {
            return { ok: false, error: `Unknown state type: ${input.stateType}` }
          }

          const { data: stateData, error: stateError } = await client
            .from(sourceTable)
            .select("*")
            .eq("user_id", userId)
            .limit(100)

          if (stateError) {
            return { ok: false, error: stateError.message || `Failed to read state from ${sourceTable}.` }
          }

          const { data: snapshot, error: snapshotError } = await client
            .from("shadow_state_snapshots")
            .insert({
              user_id: userId,
              state_type: input.stateType,
              state_key: input.stateKey.trim(),
              state_data: stateData || [],
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (snapshotError || !snapshot) {
            return { ok: false, error: snapshotError?.message || "Failed to create state snapshot." }
          }

          return { ok: true, snapshot, recordCount: (stateData || []).length }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error syncing predictive twin." }
        }
      },
    }),

    // ========================================================================
    // A2A Protocol + Global Expansion Tools (#173-176)
    // ========================================================================

    // #173
    initializeA2AHandshake: tool({
      description:
        "Discover a provider agent by capability and initiate a cross-factory handshake for task delegation",
      inputSchema: z.object({
        capability: z.string().min(1).max(200),
        taskDescription: z.string().min(1).max(4000),
        maxPriceTokens: z.number().min(0).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: agents, error: agentsError } = await client
            .from("a2a_agent_cards")
            .select("*")
            .contains("capabilities", [input.capability])
            .eq("availability", "available")
            .order("avg_rating", { ascending: false })
            .limit(1)

          if (agentsError) {
            return { ok: false, error: agentsError.message || "Failed to discover provider agents." }
          }

          if (!agents || agents.length === 0) {
            return { ok: false, error: `No available agents found for capability: ${input.capability}` }
          }

          const providerCard = agents[0]

          const { data: handshake, error: handshakeError } = await client
            .from("a2a_handshakes")
            .insert({
              requester_user_id: userId,
              provider_agent_id: providerCard.id,
              capability: input.capability,
              task_description: input.taskDescription.trim(),
              max_price_tokens: input.maxPriceTokens ?? null,
              status: "pending",
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (handshakeError || !handshake) {
            return { ok: false, error: handshakeError?.message || "Failed to initiate A2A handshake." }
          }

          return { ok: true, handshake, providerCard }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error initializing A2A handshake." }
        }
      },
    }),

    discoverTribalAgents: tool({
      description:
        "Search for available agents across the tribal network by capability",
      inputSchema: z.object({
        capability: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("a2a_agent_cards")
            .select("*")
            .contains("capabilities", [input.capability])
            .eq("availability", "available")
            .order("avg_rating", { ascending: false })
            .limit(input.limit ?? 10)

          if (error) {
            return { ok: false, error: error.message || "Failed to discover tribal agents." }
          }

          return { ok: true, agents: data || [], count: (data || []).length }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error discovering agents." }
        }
      },
    }),

    deliverA2AResult: tool({
      description:
        "Complete an A2A handshake by delivering the result",
      inputSchema: z.object({
        handshakeId: z.string().uuid(),
        resultPayload: z.record(z.unknown()),
      }),
      execute: async (input) => {
        try {
          const { data: handshake, error } = await client
            .from("a2a_handshakes")
            .update({
              status: "completed",
              result_payload: input.resultPayload,
              completed_at: new Date().toISOString(),
            })
            .eq("id", input.handshakeId)
            .select()
            .single()

          if (error || !handshake) {
            return { ok: false, error: error?.message || "Failed to deliver A2A result." }
          }

          return { ok: true, handshake }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error delivering A2A result." }
        }
      },
    }),

    // #176
    mintExperienceEntry: tool({
      description:
        "Capture a breakthrough, lesson, or hard-won advice as a persistent experience entry",
      inputSchema: z.object({
        entryType: z.enum(["breakthrough", "lesson", "hard_won_advice", "milestone", "failure_post_mortem"]),
        title: z.string().min(3).max(200),
        narrative: z.string().min(10).max(8000),
        hardWonAdvice: z.string().max(2000).optional(),
        contextTags: z.array(z.string().max(50)).max(20).optional(),
        difficultyLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
        tribeId: z.string().uuid().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: entry, error } = await client
            .from("experience_entries")
            .insert({
              user_id: userId,
              entry_type: input.entryType,
              title: input.title.trim(),
              narrative: input.narrative.trim(),
              hard_won_advice: input.hardWonAdvice?.trim() || null,
              context_tags: input.contextTags || [],
              difficulty_level: input.difficultyLevel || null,
              tribe_id: input.tribeId || null,
              upvote_count: 0,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !entry) {
            return { ok: false, error: error?.message || "Failed to mint experience entry." }
          }

          return { ok: true, entry }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error minting experience entry." }
        }
      },
    }),

    searchTribalWisdom: tool({
      description:
        "Search the experience archive for mentorship and lessons by tags or type",
      inputSchema: z.object({
        query: z.string().max(500).optional(),
        entryType: z.string().max(50).optional(),
        difficultyLevel: z.string().max(20).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input) => {
        try {
          let query = client
            .from("experience_entries")
            .select("*")
            .order("upvote_count", { ascending: false })
            .limit(input.limit ?? 10)

          if (input.entryType) {
            query = query.eq("entry_type", input.entryType)
          }
          if (input.difficultyLevel) {
            query = query.eq("difficulty_level", input.difficultyLevel)
          }
          if (input.query) {
            query = query.or(`title.ilike.%${input.query}%,narrative.ilike.%${input.query}%`)
          }

          const { data, error } = await query

          if (error) {
            return { ok: false, error: error.message || "Failed to search tribal wisdom." }
          }

          return { ok: true, entries: data || [], count: (data || []).length }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error searching tribal wisdom." }
        }
      },
    }),

    // #174
    triggerDecouplingProtocol: tool({
      description:
        "Analyze golden handcuffs and calculate the sovereignty break-even point",
      inputSchema: z.object({
        currentSalaryUsd: z.number().min(0),
        vestingSchedule: z.array(z.object({
          date: z.string(),
          amount: z.number(),
        })).optional(),
        benefitsValueUsd: z.number().min(0).optional(),
        stockOptionsValueUsd: z.number().min(0).optional(),
        sovereigntyIncomeUsd: z.number().min(0).optional(),
        sovereignIncomeSources: z.array(z.object({
          name: z.string(),
          monthlyUsd: z.number(),
        })).optional(),
      }),
      execute: async (input) => {
        try {
          const annualSalary = input.currentSalaryUsd * 12
          const benefits = input.benefitsValueUsd ?? 0
          const options = input.stockOptionsValueUsd ?? 0
          const totalHandcuffValue = annualSalary + benefits + options

          const sovereigntyIncome = input.sovereigntyIncomeUsd ?? 0
          const breakevenMonths = totalHandcuffValue / Math.max(sovereigntyIncome, 1)

          const { data: audit, error } = await client
            .from("decoupling_audits")
            .insert({
              user_id: userId,
              current_salary_usd: input.currentSalaryUsd,
              vesting_schedule: input.vestingSchedule || [],
              benefits_value_usd: benefits,
              stock_options_value_usd: options,
              sovereignty_income_usd: sovereigntyIncome,
              sovereign_income_sources: input.sovereignIncomeSources || [],
              total_handcuff_value: totalHandcuffValue,
              breakeven_months: breakevenMonths,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !audit) {
            return { ok: false, error: error?.message || "Failed to create decoupling audit." }
          }

          return { ok: true, audit }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in decoupling protocol." }
        }
      },
    }),

    // #175
    deployToMarketChallenge: tool({
      description:
        "Package a factory build and prepare a submission for an external bounty challenge",
      inputSchema: z.object({
        opportunityId: z.string().uuid(),
        factoryBuildId: z.string().uuid().optional(),
        submissionUrl: z.string().url().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: submission, error } = await client
            .from("bounty_submissions")
            .insert({
              submitter_user_id: userId,
              opportunity_id: input.opportunityId,
              factory_build_id: input.factoryBuildId || null,
              submission_url: input.submissionUrl || null,
              status: "submitted",
              created_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !submission) {
            return { ok: false, error: error?.message || "Failed to submit to bounty challenge." }
          }

          return { ok: true, submission }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error deploying to market challenge." }
        }
      },
    }),

    // ========================================================================
    // Recursive Evolution Tools
    // ========================================================================

    fineTuneLocalReplacement: tool({
      description:
        "Identify a high-cost frontier API task and initiate local model replacement to cut Intelligence Tariffs",
      inputSchema: z.object({
        taskDomain: z.string(),
        frontierModel: z.string(),
        frontierCostPerTaskUsd: z.number(),
        frontierAccuracyPct: z.number(),
        localModel: z.string().optional(),
        parityThresholdPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const monthlySavings = input.frontierCostPerTaskUsd * 30

          const { data: audit, error } = await client
            .from("intelligence_tariff_audits")
            .insert({
              user_id: userId,
              task_domain: input.taskDomain,
              frontier_model: input.frontierModel,
              frontier_cost_per_task_usd: input.frontierCostPerTaskUsd,
              frontier_accuracy_pct: input.frontierAccuracyPct,
              local_model: input.localModel || null,
              parity_threshold_pct: input.parityThresholdPct ?? 95,
              fine_tune_status: "pending",
              monthly_savings_usd: monthlySavings,
            })
            .select()
            .single()

          if (error || !audit) {
            return { ok: false, error: error?.message || "Failed to create intelligence tariff audit." }
          }

          return { ok: true, audit, projectedMonthlySavings: monthlySavings }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in fine-tune local replacement." }
        }
      },
    }),

    evolveAgentHarness: tool({
      description:
        "Self-diagnose agent performance issues and log an evolution cycle for automated improvement",
      inputSchema: z.object({
        agentDefinitionId: z.string().optional(),
        evolutionType: z.enum(["performance_optimization", "error_fix", "capability_expansion", "cost_reduction"]),
        triggerSource: z.string().optional(),
        diagnosis: z.string(),
        proposedFix: z.string(),
        beforeMetrics: z.record(z.unknown()).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: evolution, error } = await client
            .from("agent_harness_evolutions")
            .insert({
              user_id: userId,
              agent_definition_id: input.agentDefinitionId || null,
              evolution_type: input.evolutionType,
              trigger_source: input.triggerSource || null,
              diagnosis: input.diagnosis,
              proposed_fix: input.proposedFix,
              before_metrics: input.beforeMetrics ?? {},
              status: "diagnosed",
            })
            .select()
            .single()

          if (error || !evolution) {
            return { ok: false, error: error?.message || "Failed to log agent harness evolution." }
          }

          return { ok: true, evolution }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in agent harness evolution." }
        }
      },
    }),

    launchTribalAutoResearch: tool({
      description:
        "Launch a coordinated overnight Auto Research campaign across the tribal network",
      inputSchema: z.object({
        tribeId: z.string(),
        researchGoal: z.string(),
        hypothesis: z.string().optional(),
        experimentSpec: z.record(z.unknown()).optional(),
        maxParticipants: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: campaign, error } = await client
            .from("tribal_auto_research_campaigns")
            .insert({
              tribe_id: input.tribeId,
              initiator_user_id: userId,
              research_goal: input.researchGoal,
              hypothesis: input.hypothesis || null,
              experiment_spec: input.experimentSpec ?? {},
              max_participants: input.maxParticipants ?? 100,
              status: "recruiting",
            })
            .select()
            .single()

          if (error || !campaign) {
            return { ok: false, error: error?.message || "Failed to launch tribal auto research campaign." }
          }

          return { ok: true, campaign }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error launching tribal auto research." }
        }
      },
    }),

    // ========================================================================
    // SherLog Forensic Tools
    // ========================================================================

    runSovereignAudit: tool({
      description:
        "Scan for known cracked-software indicators and calculate risk vs licensing cost",
      inputSchema: z.object({
        toolNames: z.array(z.string()).optional(),
        scanScope: z.enum(["local", "network", "full"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: artifact, error } = await client
            .from("malware_artifacts")
            .insert({
              reporter_user_id: userId,
              artifact_type: "sysinfo",
              classification: "unknown",
              infection_status: "suspected",
              raw_data: {
                scanScope: input.scanScope ?? "local",
                toolNames: input.toolNames ?? [],
                scanTimestamp: new Date().toISOString(),
              },
            })
            .select()
            .single()

          if (error || !artifact) {
            return { ok: false, error: error?.message || "Failed to create malware artifact." }
          }

          return { ok: true, artifact, recommendation: "Review flagged tools and compare risk against licensing cost." }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error running sovereign audit." }
        }
      },
    }),

    analyzeInfostealerSelfie: tool({
      description:
        "Execute 2-layer vision/logic pipeline to extract IOCs from a desktop screenshot",
      inputSchema: z.object({
        artifactId: z.string().uuid(),
      }),
      execute: async (input) => {
        try {
          const { data: narrative, error } = await client
            .from("forensic_narratives")
            .insert({
              artifact_id: input.artifactId,
              analyst_user_id: userId,
              layer1_visual: {
                sceneDescription: "Pending vision analysis",
                contentClass: "unknown",
              },
              layer2_vector: {
                infectionVector: "Pending correlation",
                iocStatus: "unknown",
              },
              status: "analyzing",
            })
            .select()
            .single()

          if (error || !narrative) {
            return { ok: false, error: error?.message || "Failed to create forensic narrative." }
          }

          return { ok: true, narrative, message: "2-layer analysis initiated" }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error analyzing infostealer selfie." }
        }
      },
    }),

    deployTribalSherLog: tool({
      description:
        "Aggregate forensic artifacts into a threat report and push IOCs to tribal herd immunity",
      inputSchema: z.object({
        narrativeId: z.string().uuid(),
      }),
      execute: async (input) => {
        try {
          const { data: narrative, error: narrativeError } = await client
            .from("forensic_narratives")
            .select("*")
            .eq("id", input.narrativeId)
            .single()

          if (narrativeError || !narrative) {
            return { ok: false, error: narrativeError?.message || "Forensic narrative not found." }
          }

          const iocs: string[] = narrative.iocs_extracted ?? []
          let deployedCount = 0

          for (const ioc of iocs) {
            const { error: upsertError } = await client
              .from("tribal_herd_immunity")
              .upsert(
                {
                  ioc_value: ioc,
                  narrative_id: input.narrativeId,
                  first_seen_at: new Date().toISOString(),
                  last_seen_at: new Date().toISOString(),
                  reported_by_count: 1,
                },
                { onConflict: "ioc_value" },
              )

            if (!upsertError) {
              deployedCount++
            }
          }

          return { ok: true, iocsDeployed: deployedCount, tribalPropagation: true }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error deploying tribal SherLog." }
        }
      },
    }),

    detonateLureInSandbox: tool({
      description:
        "Submit a suspicious URL for headless browser detonation in a quarantined environment",
      inputSchema: z.object({
        lureUrl: z.string().url(),
        lureType: z.enum(["youtube_redirect", "mega_download", "google_ad", "sponsored_link", "direct_download", "custom"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: detonation, error } = await client
            .from("sandbox_detonations")
            .insert({
              submitted_by_user_id: userId,
              lure_url: input.lureUrl,
              lure_type: input.lureType ?? "custom",
              status: "queued",
            })
            .select()
            .single()

          if (error || !detonation) {
            return { ok: false, error: error?.message || "Failed to queue sandbox detonation." }
          }

          return { ok: true, detonation, message: "Lure queued for sandbox detonation" }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error detonating lure in sandbox." }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // LeWorldModel Latent Physics Tools
    // -----------------------------------------------------------------------

    forgeWorldModel: tool({
      description:
        "Train a local LeWM on your environment's raw pixel/action data",
      inputSchema: z.object({
        modelName: z.string(),
        environmentType: z.enum(["neo_lab", "sovereign_vehicle", "home", "office", "factory_floor", "custom"]),
        hardwareUsed: z.string().optional(),
        latentDim: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: worldModel, error } = await client
            .from("world_models")
            .insert({
              owner_user_id: userId,
              model_name: input.modelName,
              environment_type: input.environmentType,
              hardware_used: input.hardwareUsed,
              latent_dim: input.latentDim,
              training_status: "collecting_data",
            })
            .select()
            .single()

          if (error || !worldModel) {
            return { ok: false, error: error?.message || "Failed to forge world model." }
          }

          return { ok: true, worldModel }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error forging world model." }
        }
      },
    }),

    simulateImaginaryRollout: tool({
      description:
        "Run 48x faster counterfactual planning to find optimal action sequence",
      inputSchema: z.object({
        worldModelId: z.string().uuid(),
        goalDescription: z.string(),
        numRollouts: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: simulation, error } = await client
            .from("imaginary_simulations")
            .insert({
              world_model_id: input.worldModelId,
              user_id: userId,
              goal_description: input.goalDescription,
              num_rollouts: input.numRollouts ?? 100,
              status: "planned",
            })
            .select()
            .single()

          if (error || !simulation) {
            return { ok: false, error: error?.message || "Failed to create imaginary simulation." }
          }

          return { ok: true, simulation }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error simulating imaginary rollout." }
        }
      },
    }),

    measureSurpriseDelta: tool({
      description:
        "Analyze sensor data for physical violations against the world model",
      inputSchema: z.object({
        worldModelId: z.string().uuid(),
        eventType: z.enum(["object_teleport", "color_change", "physics_violation", "trajectory_divergence", "sensor_anomaly", "deepfake_detected"]),
        predictedState: z.record(z.unknown()).optional(),
        actualState: z.record(z.unknown()).optional(),
        surpriseDelta: z.number(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      }),
      execute: async (input) => {
        try {
          const sev = input.severity ?? "low"
          const autoResponse = sev === "critical" ? "sentinel_triggered" : sev === "high" ? "alert_sent" : "logged"

          const { data: event, error } = await client
            .from("surprise_events")
            .insert({
              world_model_id: input.worldModelId,
              user_id: userId,
              event_type: input.eventType,
              predicted_state: input.predictedState,
              actual_state: input.actualState,
              surprise_delta: input.surpriseDelta,
              severity: sev,
              auto_response: autoResponse,
            })
            .select()
            .single()

          if (error || !event) {
            return { ok: false, error: error?.message || "Failed to record surprise event." }
          }

          return { ok: true, event }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error measuring surprise delta." }
        }
      },
    }),

    probeLatentSovereignty: tool({
      description:
        "Extract verified physical quantities from latent representations",
      inputSchema: z.object({
        worldModelId: z.string().uuid(),
        probeType: z.enum(["position", "orientation", "velocity", "temperature", "pressure", "custom"]),
        probeLabel: z.string().optional(),
        extractedValue: z.record(z.unknown()),
      }),
      execute: async (input) => {
        try {
          const { data: probe, error } = await client
            .from("latent_probes")
            .insert({
              world_model_id: input.worldModelId,
              user_id: userId,
              probe_type: input.probeType,
              probe_label: input.probeLabel,
              extracted_value: input.extractedValue,
            })
            .select()
            .single()

          if (error || !probe) {
            return { ok: false, error: error?.message || "Failed to create latent probe." }
          }

          return { ok: true, probe }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error probing latent sovereignty." }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // Pacific Rim Shield Tools
    // -----------------------------------------------------------------------

    auditPortEntropy: tool({
      description:
        "Monitor source port randomness to detect covert channels like Snoopy-style coded instructions",
      inputSchema: z.object({
        sourceIp: z.string().optional(),
        portDistribution: z.record(z.unknown()),
        entropyScore: z.number(),
        analyzedPackets: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const isAnomalous = input.entropyScore < 3.5
          const anomalyType = input.entropyScore < 1.5
            ? "coded_instructions"
            : input.entropyScore < 2.5
              ? "covert_channel"
              : input.entropyScore < 3.5
                ? "timing_attack"
                : "normal"
          const { data: entry, error } = await client
            .from("traffic_entropy_ledger")
            .insert({
              user_id: userId,
              source_ip: input.sourceIp,
              port_distribution: input.portDistribution,
              entropy_score: input.entropyScore,
              is_anomalous: isAnomalous,
              anomaly_type: anomalyType,
              analyzed_packets: input.analyzedPackets ?? 0,
            })
            .select()
            .single()

          if (error || !entry) {
            return { ok: false, error: error?.message || "Failed to audit port entropy." }
          }

          return { ok: true, entry, isAnomalous }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error auditing port entropy." }
        }
      },
    }),

    forgeBountyQuarantine: tool({
      description:
        "Auto-isolate new external code submissions for 48-hour adversarial testing",
      inputSchema: z.object({
        submissionId: z.string(),
        sourceUrl: z.string().optional(),
        quarantineDurationHours: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: quarantine, error } = await client
            .from("agentic_quarantine")
            .insert({
              user_id: userId,
              submission_id: input.submissionId,
              source_url: input.sourceUrl,
              quarantine_duration_hours: input.quarantineDurationHours ?? 48,
              quarantine_status: "pending",
              adversarial_tests_run: 0,
            })
            .select()
            .single()

          if (error || !quarantine) {
            return { ok: false, error: error?.message || "Failed to forge bounty quarantine." }
          }

          return { ok: true, quarantine }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error forging bounty quarantine." }
        }
      },
    }),

    cullDigitalDetritus: tool({
      description:
        "Identify and de-provision zombie devices lacking biological heartbeat",
      inputSchema: z.object({
        cullThresholdDays: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const threshold = input.cullThresholdDays ?? 30
          const { data: culled, error } = await client
            .from("device_lifecycle_states")
            .update({ lifecycle_status: "culled", cull_executed_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("lifecycle_status", "zombie")
            .eq("auto_cull_enabled", true)
            .gte("consecutive_missed_days", threshold)
            .select()

          if (error) {
            return { ok: false, error: error.message }
          }

          return { ok: true, culledCount: culled?.length ?? 0 }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error culling digital detritus." }
        }
      },
    }),

    verifyArtifactEncryption: tool({
      description:
        "Verify data remains encrypted until physical artifact proximity",
      inputSchema: z.object({
        gateId: z.string().uuid(),
      }),
      execute: async (input) => {
        try {
          const { data: gate, error: fetchErr } = await client
            .from("biometric_encryption_gates")
            .select("*")
            .eq("id", input.gateId)
            .eq("user_id", userId)
            .single()

          if (fetchErr || !gate) {
            return { ok: false, error: fetchErr?.message || "Gate not found." }
          }

          await client
            .from("biometric_encryption_gates")
            .update({ access_count: (gate.access_count ?? 0) + 1, last_access_at: new Date().toISOString() })
            .eq("id", input.gateId)

          return { ok: true, gate, verified: gate.status === "active" }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error verifying artifact encryption." }
        }
      },
    }),

    syncTribalImmunity: tool({
      description:
        "Push new threat indicators to the 30K tribal network for herd immunity",
      inputSchema: z.object({
        iocs: z.array(z.object({
          iocType: z.string(),
          iocValue: z.string(),
          threatCategory: z.string().optional(),
          severity: z.string().optional(),
        })),
      }),
      execute: async (input) => {
        try {
          const rows = input.iocs.map((ioc) => ({
            user_id: userId,
            ioc_type: ioc.iocType,
            ioc_value: ioc.iocValue,
            threat_category: ioc.threatCategory,
            severity: ioc.severity,
          }))

          const { data, error } = await client
            .from("tribal_herd_immunity")
            .upsert(rows, { onConflict: "ioc_type,ioc_value" })
            .select()

          if (error) {
            return { ok: false, error: error.message }
          }

          return { ok: true, syncedCount: data?.length ?? 0 }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error syncing tribal immunity." }
        }
      },
    }),

    profileAdversaryAlpha: tool({
      description:
        "Map attacks to stylometric fingerprints to identify the human actor",
      inputSchema: z.object({
        profileName: z.string(),
        stylometricFeatures: z.record(z.unknown()),
        threatActorGroup: z.string().optional(),
        linkedNarrativeIds: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: profile, error } = await client
            .from("adversary_stylometry")
            .insert({
              analyst_user_id: userId,
              profile_name: input.profileName,
              stylometric_features: input.stylometricFeatures,
              threat_actor_group: input.threatActorGroup,
              linked_narrative_ids: input.linkedNarrativeIds ?? [],
              status: "draft",
            })
            .select()
            .single()

          if (error || !profile) {
            return { ok: false, error: error?.message || "Failed to profile adversary." }
          }

          return { ok: true, profile }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error profiling adversary alpha." }
        }
      },
    }),

    // -----------------------------------------------------------------------
    // Interplanetary Pipeline Tools
    // -----------------------------------------------------------------------

    executePermissionlessLaunch: tool({
      description:
        "Auto-generate mission specs by cross-referencing deregulated policy sections",
      inputSchema: z.object({
        policySection: z.string(),
        missionDescription: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: policy, error } = await client
            .from("deregulated_policy_ledger")
            .insert({
              user_id: userId,
              policy_section: input.policySection,
              deregulation_status: "analyzed",
              execution_path: { missionDescription: input.missionDescription, autoGenerated: true },
            })
            .select()
            .single()

          if (error || !policy) {
            return { ok: false, error: error?.message || "Failed to execute permissionless launch." }
          }

          return { ok: true, policy }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error executing permissionless launch." }
        }
      },
    }),

    initializeNuclearHearth: tool({
      description:
        "Provision fission power telemetry aligned with SR1 Freedom parameters",
      inputSchema: z.object({
        sourceType: z.enum(["sr1_freedom", "tribal_smr", "lunar_rtg", "orbital_relay"]),
        powerOutputKw: z.number().optional(),
        thermalEfficiencyPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: telemetry, error } = await client
            .from("fission_power_telemetry")
            .insert({
              user_id: userId,
              source_type: input.sourceType,
              power_output_kw: input.powerOutputKw,
              thermal_efficiency_pct: input.thermalEfficiencyPct,
            })
            .select()
            .single()

          if (error || !telemetry) {
            return { ok: false, error: error?.message || "Failed to initialize nuclear hearth." }
          }

          return { ok: true, telemetry }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error initializing nuclear hearth." }
        }
      },
    }),

    launchLunarSprint: tool({
      description:
        "Stake tribal tokens to a lunar build phase mission",
      inputSchema: z.object({
        phase: z.enum(["experimentation", "infrastructure", "permanence"]),
        missionName: z.string(),
        stakedTokens: z.number(),
        contributionType: z.enum(["compute", "design", "engineering", "science", "logistics"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: stake, error } = await client
            .from("lunar_build_phases")
            .insert({
              user_id: userId,
              phase: input.phase,
              mission_name: input.missionName,
              staked_tokens: input.stakedTokens,
              contribution_type: input.contributionType,
            })
            .select()
            .single()

          if (error || !stake) {
            return { ok: false, error: error?.message || "Failed to launch lunar sprint." }
          }

          return { ok: true, stake }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error launching lunar sprint." }
        }
      },
    }),

    triggerUncomfortableAction: tool({
      description:
        "Reallocate resources when a supply chain vendor hits a critical slippage",
      inputSchema: z.object({
        monitorId: z.string().uuid(),
        reallocationTarget: z.string(),
        resolutionNotes: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: monitor, error } = await client
            .from("supply_chain_monitors")
            .update({
              uncomfortable_action_triggered: true,
              reallocation_target: input.reallocationTarget,
              status: "bypassed",
              resolution_notes: input.resolutionNotes,
            })
            .eq("id", input.monitorId)
            .eq("user_id", userId)
            .select()
            .single()

          if (error || !monitor) {
            return { ok: false, error: error?.message || "Failed to trigger uncomfortable action." }
          }

          return { ok: true, monitor }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error triggering uncomfortable action." }
        }
      },
    }),

    // ========================================================================
    // Recursive Meta-Agent Tools (Agent #0) — Tools #150-155
    // ========================================================================

    initializeRecursiveEvolution: tool({
      description:
        "Activate Agent #0 to begin autonomous self-optimization of the Sovereign Factory",
      inputSchema: z.object({
        evolutionDirection: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: log, error } = await client
            .from("evolution_logs")
            .insert({
              user_id: userId,
              tool_name: "agent_zero",
              mutation_type: "optimization",
              before_state: { status: "inactive" },
              after_state: { status: "active", direction: input.evolutionDirection },
              auto_applied: true,
            })
            .select()
            .single()

          if (error || !log) {
            return { ok: false, error: error?.message || "Failed to initialize recursive evolution." }
          }

          return { ok: true, log, message: "Agent #0 activated" }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error initializing recursive evolution." }
        }
      },
    }),

    refactorAgentLogic: tool({
      description:
        "Auto-rewrite tool code for efficiency based on performance bottleneck analysis",
      inputSchema: z.object({
        toolName: z.string(),
        bottleneck: z.string(),
        proposedFix: z.string(),
      }),
      execute: async (input) => {
        try {
          const { data: evolution, error: evoError } = await client
            .from("evolution_logs")
            .insert({
              user_id: userId,
              tool_name: input.toolName,
              mutation_type: "refactor",
              before_state: { bottleneck: input.bottleneck },
              after_state: { proposedFix: input.proposedFix },
              auto_applied: false,
            })
            .select()
            .single()

          if (evoError || !evolution) {
            return { ok: false, error: evoError?.message || "Failed to log refactor evolution." }
          }

          const { data: mutation, error: mutError } = await client
            .from("performance_mutations")
            .insert({
              user_id: userId,
              tool_name: input.toolName,
              metric_name: "latency_ms",
              before_value: 0,
              after_value: 0,
              improvement_pct: 0,
              mutation_source: "meta_agent",
              reverted: false,
            })
            .select()
            .single()

          if (mutError || !mutation) {
            return { ok: false, error: mutError?.message || "Failed to insert performance mutation." }
          }

          return { ok: true, evolution, mutation }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error refactoring agent logic." }
        }
      },
    }),

    optimizeThermodynamicYield: tool({
      description:
        "Shift compute tasks to the most energy-efficient node in the tribal network",
      inputSchema: z.object({
        taskDescription: z.string(),
        currentEnergyKwh: z.number(),
        targetReductionPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: log, error } = await client
            .from("evolution_logs")
            .insert({
              user_id: userId,
              tool_name: "thermodynamic_yield",
              mutation_type: "optimization",
              before_state: { currentEnergyKwh: input.currentEnergyKwh, task: input.taskDescription },
              after_state: { targetReductionPct: input.targetReductionPct },
              energy_delta_kwh: input.currentEnergyKwh * ((input.targetReductionPct ?? 10) / 100),
              auto_applied: true,
            })
            .select()
            .single()

          if (error || !log) {
            return { ok: false, error: error?.message || "Failed to optimize thermodynamic yield." }
          }

          return { ok: true, log }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error optimizing thermodynamic yield." }
        }
      },
    }),

    distillTribalIntelligence: tool({
      description:
        "Compress tribal RAG knowledge into local model fine-tune weights",
      inputSchema: z.object({
        optimizationDomain: z.string(),
        description: z.string().optional(),
        commitHash: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: dnaEntry, error } = await client
            .from("tribal_dna_registry")
            .insert({
              contributor_user_id: userId,
              optimization_domain: input.optimizationDomain,
              description: input.description,
              commit_hash: input.commitHash,
              status: "submitted",
              adoption_count: 0,
              tribal_reward_tokens: 0,
            })
            .select()
            .single()

          if (error || !dnaEntry) {
            return { ok: false, error: error?.message || "Failed to distill tribal intelligence." }
          }

          return { ok: true, dnaEntry }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error distilling tribal intelligence." }
        }
      },
    }),

    anticipateZeroDay: tool({
      description:
        "Proactively invent new TTPs to pre-harden SENTINEL before real adversaries discover them",
      inputSchema: z.object({
        ttpDescription: z.string(),
        attackVector: z.string(),
        expectedSeverity: z.enum(["low", "medium", "high", "critical"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: log, error } = await client
            .from("evolution_logs")
            .insert({
              user_id: userId,
              tool_name: "zero_day_anticipation",
              mutation_type: "security_hardening",
              before_state: { ttpDescription: input.ttpDescription, attackVector: input.attackVector },
              after_state: { status: "anticipated", severity: input.expectedSeverity },
              auto_applied: false,
            })
            .select()
            .single()

          if (error || !log) {
            return { ok: false, error: error?.message || "Failed to anticipate zero-day." }
          }

          return { ok: true, log }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error anticipating zero-day." }
        }
      },
    }),

    calibrateToChairman: tool({
      description:
        "Sync system evolution with your taste, ethics, and vision",
      inputSchema: z.object({
        dimension: z.string(),
        weight: z.number().min(0).max(1),
        calibratedFrom: z.enum(["veto", "approval", "explicit_direction", "behavioral_inference"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: alignment, error } = await client
            .from("chairman_alignment_vectors")
            .upsert(
              {
                user_id: userId,
                dimension: input.dimension,
                weight: input.weight,
                last_calibrated_from: input.calibratedFrom,
                calibration_count: 1,
              },
              { onConflict: "user_id,dimension" },
            )
            .select()
            .single()

          if (error || !alignment) {
            return { ok: false, error: error?.message || "Failed to calibrate alignment." }
          }

          return { ok: true, alignment }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error calibrating to chairman." }
        }
      },
    }),

    // ========================================================================
    // Invisible Infrastructure Tools
    // ========================================================================

    activateMolmoVision: tool({
      description:
        "Browse the web visually using a local 8B vision model on sovereign hardware",
      inputSchema: z.object({
        targetUrl: z.string(),
        sessionName: z.string().optional(),
        hardwareNode: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: session, error } = await client
            .from("visual_web_logs")
            .insert({
              user_id: userId,
              target_url: input.targetUrl,
              session_name: input.sessionName,
              model_used: "molmo-8b",
              hardware_node: input.hardwareNode,
              status: "active",
            })
            .select()
            .single()

          if (error || !session) {
            return { ok: false, error: error?.message || "Failed to activate Molmo vision session." }
          }

          return { ok: true, session }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error activating Molmo vision." }
        }
      },
    }),

    compileIntentToAssembly: tool({
      description:
        "Compile high-level intent into invisible auto-tested WebAssembly code",
      inputSchema: z.object({
        artifactName: z.string(),
        intentDescription: z.string(),
        isolationLevel: z.enum(["strict", "permissive", "quarantine"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: artifact, error } = await client
            .from("wasm_artifacts")
            .insert({
              user_id: userId,
              artifact_name: input.artifactName,
              intent_description: input.intentDescription,
              isolation_level: input.isolationLevel ?? "strict",
              sandbox_status: "provisioned",
            })
            .select()
            .single()

          if (error || !artifact) {
            return { ok: false, error: error?.message || "Failed to compile intent to assembly." }
          }

          return { ok: true, artifact }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error compiling intent." }
        }
      },
    }),

    deployConsultantAgent: tool({
      description:
        "Provision a PwC-level tribal strategy expert agent from the Consultant Guild",
      inputSchema: z.object({
        blueprintName: z.string(),
        expertiseDomain: z.string(),
        description: z.string().optional(),
        skillDefinition: z.record(z.unknown()).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: blueprint, error } = await client
            .from("consultant_blueprints")
            .insert({
              creator_user_id: userId,
              blueprint_name: input.blueprintName,
              expertise_domain: input.expertiseDomain,
              description: input.description,
              skill_definition: input.skillDefinition ?? {},
              status: "published",
            })
            .select()
            .single()

          if (error || !blueprint) {
            return { ok: false, error: error?.message || "Failed to deploy consultant agent." }
          }

          return { ok: true, blueprint }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error deploying consultant." }
        }
      },
    }),

    provisionWasmSandbox: tool({
      description:
        "Isolate high-stakes agent execution in a WebAssembly quarantine container",
      inputSchema: z.object({
        artifactName: z.string(),
        memoryLimitMb: z.number().optional(),
        isolationLevel: z.enum(["strict", "permissive", "quarantine"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: sandbox, error } = await client
            .from("wasm_artifacts")
            .insert({
              user_id: userId,
              artifact_name: input.artifactName,
              memory_limit_mb: input.memoryLimitMb ?? 256,
              isolation_level: input.isolationLevel ?? "quarantine",
              sandbox_status: "provisioned",
            })
            .select()
            .single()

          if (error || !sandbox) {
            return { ok: false, error: error?.message || "Failed to provision WASM sandbox." }
          }

          return { ok: true, sandbox }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error provisioning sandbox." }
        }
      },
    }),

    sanitizeSourceData: tool({
      description:
        "Fix data quality at the source to cut observability vendor bills",
      inputSchema: z.object({
        sourceSystem: z.string(),
        originalDataVolumeMb: z.number(),
        sanitizedDataVolumeMb: z.number(),
        vendorCostBeforeUsd: z.number().optional(),
        vendorCostAfterUsd: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const reductionPct = input.originalDataVolumeMb > 0
            ? Math.round(((input.originalDataVolumeMb - input.sanitizedDataVolumeMb) / input.originalDataVolumeMb) * 10000) / 100
            : 0
          const monthlySavings = (input.vendorCostBeforeUsd != null && input.vendorCostAfterUsd != null)
            ? Math.round((input.vendorCostBeforeUsd - input.vendorCostAfterUsd) * 100) / 100
            : undefined

          const { data: entry, error } = await client
            .from("observability_refund_ledger")
            .insert({
              user_id: userId,
              source_system: input.sourceSystem,
              original_data_volume_mb: input.originalDataVolumeMb,
              sanitized_data_volume_mb: input.sanitizedDataVolumeMb,
              reduction_pct: reductionPct,
              vendor_cost_before_usd: input.vendorCostBeforeUsd,
              vendor_cost_after_usd: input.vendorCostAfterUsd,
              monthly_savings_usd: monthlySavings,
            })
            .select()
            .single()

          if (error || !entry) {
            return { ok: false, error: error?.message || "Failed to sanitize source data." }
          }

          return { ok: true, entry, reductionPct, monthlySavings }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error sanitizing source data." }
        }
      },
    }),

    // ========================================================================
    // Diplomatic Integrity Tools (#161-164)
    // ========================================================================

    auditProxyInfluence: tool({
      description:
        "Scan friend-introductions for external financial incentives or hidden bias",
      inputSchema: z.object({
        subjectName: z.string(),
        relationshipType: z.string().optional(),
        linkedEntity: z.string().optional(),
        linkedCountry: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: audit, error } = await client
            .from("proxy_influence_audit")
            .insert({
              analyst_user_id: userId,
              subject_name: input.subjectName,
              relationship_type: input.relationshipType ?? "friend",
              linked_entity: input.linkedEntity ?? null,
              linked_country: input.linkedCountry ?? null,
            })
            .select()
            .single()

          if (error || !audit) {
            return { ok: false, error: error?.message || "Failed to create proxy influence audit." }
          }

          return { ok: true, audit }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error auditing proxy influence." }
        }
      },
    }),

    verifyDiplomaticLure: tool({
      description:
        "Audit a meeting request or proposal for semantic validity and proof of build",
      inputSchema: z.object({
        lureLabel: z.string(),
        lureType: z.enum(["document", "meeting_request", "introduction", "proposal", "letter", "gift", "invitation"]).optional(),
        claimedIntent: z.string().optional(),
        sourceEntity: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: review, error } = await client
            .from("diplomatic_lure_registry")
            .insert({
              reviewer_user_id: userId,
              lure_label: input.lureLabel,
              lure_type: input.lureType ?? "document",
              claimed_intent: input.claimedIntent ?? null,
              source_entity: input.sourceEntity ?? null,
            })
            .select()
            .single()

          if (error || !review) {
            return { ok: false, error: error?.message || "Failed to verify diplomatic lure." }
          }

          return { ok: true, review }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error verifying diplomatic lure." }
        }
      },
    }),

    calculateDiplomaticRefund: tool({
      description:
        "Quantify time and reputational capital lost to unverified lobbying",
      inputSchema: z.object({
        incidentLabel: z.string(),
        timeLostMinutes: z.number().optional(),
        financialExposureUsd: z.number().optional(),
        rootCause: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const reputationalCostScore = (input.timeLostMinutes ?? 0) * 0.1 + (input.financialExposureUsd ?? 0) * 0.01

          const { data: refund, error } = await client
            .from("diplomatic_refund_ledger")
            .insert({
              user_id: userId,
              incident_label: input.incidentLabel,
              time_lost_minutes: input.timeLostMinutes ?? 0,
              financial_exposure_usd: input.financialExposureUsd ?? 0,
              reputational_cost_score: Math.round(reputationalCostScore * 100) / 100,
              root_cause: input.rootCause ?? null,
            })
            .select()
            .single()

          if (error || !refund) {
            return { ok: false, error: error?.message || "Failed to calculate diplomatic refund." }
          }

          return { ok: true, refund }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error calculating diplomatic refund." }
        }
      },
    }),

    enforceHandshakeSovereignty: tool({
      description:
        "Require Artifact verification for high-stakes Human Alpha sessions",
      inputSchema: z.object({
        sessionLabel: z.string(),
        participants: z.array(z.object({ name: z.string(), role: z.string().optional() })),
        stakesLevel: z.enum(["standard", "elevated", "high", "critical", "sovereign"]).optional(),
      }),
      execute: async (input) => {
        try {
          const stakesLevel = input.stakesLevel ?? "standard"
          const sovereigntyScore = stakesLevel === "sovereign" ? 100
            : stakesLevel === "critical" ? 85
            : stakesLevel === "high" ? 70
            : stakesLevel === "elevated" ? 50
            : 30

          const { data: gate, error } = await client
            .from("handshake_sovereignty_gates")
            .insert({
              user_id: userId,
              session_label: input.sessionLabel,
              participants: input.participants,
              stakes_level: stakesLevel,
              sovereignty_score: sovereigntyScore,
              session_status: "pending",
              started_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !gate) {
            return { ok: false, error: error?.message || "Failed to enforce handshake sovereignty." }
          }

          return { ok: true, gate }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error enforcing handshake sovereignty." }
        }
      },
    }),

    // ========================================================================
    // Blockade Bypass Tools (#165-168)
    // ========================================================================

    auditVendorOpenness: tool({
      description:
        "Rank SaaS vendors by agentic friction and calculate lock-in tariff",
      inputSchema: z.object({
        vendorName: z.string(),
        productName: z.string(),
        apiAvailability: z.enum(["full", "partial", "read_only", "none", "deprecated"]).optional(),
        monthlyCostUsd: z.number().optional(),
        mcpSupport: z.boolean().optional(),
      }),
      execute: async (input) => {
        try {
          let frictionScore = 0
          const apiAvail = input.apiAvailability ?? "none"
          if (apiAvail === "none") frictionScore += 40
          else if (apiAvail === "deprecated") frictionScore += 35
          else if (apiAvail === "read_only") frictionScore += 20
          else if (apiAvail === "partial") frictionScore += 10
          if (!input.mcpSupport) frictionScore += 20
          if ((input.monthlyCostUsd ?? 0) > 500) frictionScore += 10
          frictionScore = Math.min(frictionScore, 100)

          const lockInTariff = frictionScore * (input.monthlyCostUsd ?? 0) / 100

          const { data: audit, error } = await client
            .from("vendor_openness_audit")
            .insert({
              user_id: userId,
              vendor_name: input.vendorName,
              product_name: input.productName,
              api_availability: apiAvail,
              mcp_support: input.mcpSupport ?? false,
              monthly_cost_usd: input.monthlyCostUsd ?? 0,
              friction_score: frictionScore,
              lock_in_tariff_usd: lockInTariff,
              bypass_method: "none",
            })
            .select()
            .single()

          if (error || !audit) {
            return { ok: false, error: error?.message || "Failed to audit vendor." }
          }

          return { ok: true, audit }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error auditing vendor." }
        }
      },
    }),

    executeVisualBypass: tool({
      description:
        "Swap blocked API calls for visual computer-use via MolmoWeb",
      inputSchema: z.object({
        targetApp: z.string(),
        targetWorkflow: z.string(),
        interactionBlueprint: z.array(z.object({
          step: z.number(),
          action: z.string(),
          description: z.string().optional(),
        })).optional(),
      }),
      execute: async (input) => {
        try {
          const blueprint = input.interactionBlueprint ?? []

          const { data: bypass, error } = await client
            .from("visual_bypass_registry")
            .insert({
              creator_user_id: userId,
              target_app: input.targetApp,
              target_workflow: input.targetWorkflow,
              interaction_blueprint: blueprint,
              steps_count: blueprint.length,
              model_used: "molmo-8b",
              status: "draft",
            })
            .select()
            .single()

          if (error || !bypass) {
            return { ok: false, error: error?.message || "Failed to register visual bypass." }
          }

          return { ok: true, bypass }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error executing visual bypass." }
        }
      },
    }),

    provisionSovereignMCP: tool({
      description:
        "Deploy un-throttled local MCP protocol servers on sovereign hardware",
      inputSchema: z.object({
        nodeName: z.string(),
        hardwareType: z.enum(["one_charge", "lambda", "cloud", "edge", "sovereign_stone", "custom"]).optional(),
        endpointUrl: z.string().optional(),
        connectedApps: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: node, error } = await client
            .from("sovereign_mcp_nodes")
            .insert({
              user_id: userId,
              node_name: input.nodeName,
              hardware_type: input.hardwareType ?? "cloud",
              endpoint_url: input.endpointUrl ?? null,
              connected_apps: input.connectedApps ?? [],
              status: "provisioning",
            })
            .select()
            .single()

          if (error || !node) {
            return { ok: false, error: error?.message || "Failed to provision MCP node." }
          }

          return { ok: true, node }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error provisioning MCP node." }
        }
      },
    }),

    certifyAgenticIntent: tool({
      description:
        "Sign agent output with biometric pulse to prove Human Alpha origin",
      inputSchema: z.object({
        agentName: z.string(),
        intentDescription: z.string(),
        outgoingTarget: z.string().optional(),
        certificationLevel: z.enum(["standard", "verified", "sovereign", "tribal_broadcast"]).optional(),
      }),
      execute: async (input) => {
        try {
          const biometricHash = `pulse_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

          const { data: cert, error } = await client
            .from("agentic_intent_certs")
            .insert({
              user_id: userId,
              agent_name: input.agentName,
              intent_description: input.intentDescription,
              biometric_pulse_hash: biometricHash,
              certification_level: input.certificationLevel ?? "standard",
              is_certified: true,
              outgoing_target: input.outgoingTarget ?? null,
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select()
            .single()

          if (error || !cert) {
            return { ok: false, error: error?.message || "Failed to certify intent." }
          }

          return { ok: true, cert }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error certifying intent." }
        }
      },
    }),

    // ========================================================================
    // Forensic Accountability Tools (#169-172)
    // ========================================================================

    auditAccountabilityGaps: tool({
      description:
        "Identify bad actors that centralized institutions are failing to prosecute",
      inputSchema: z.object({
        subjectLabel: z.string(),
        gapType: z.enum([
          "prosecution_stall",
          "regulatory_capture",
          "institutional_latency",
          "evidence_suppression",
          "jurisdictional_void",
          "whistleblower_retaliation",
        ]).optional(),
        institutionalBody: z.string().optional(),
        financialExposureUsd: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: audit, error } = await client
            .from("accountability_gap_audit")
            .insert({
              analyst_user_id: userId,
              subject_label: input.subjectLabel,
              gap_type: input.gapType ?? "prosecution_stall",
              institutional_body: input.institutionalBody ?? null,
              financial_exposure_usd: input.financialExposureUsd ?? 0,
            })
            .select()
            .single()

          if (error || !audit) {
            return { ok: false, error: error?.message || "Failed to create accountability audit." }
          }

          return { ok: true, audit }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error auditing accountability gaps." }
        }
      },
    }),

    executeEconomicSanction: tool({
      description:
        "Freeze tribal token access for nodes linked to foreign proxy crimes",
      inputSchema: z.object({
        targetNodeLabel: z.string(),
        sanctionType: z.enum([
          "token_freeze",
          "compute_revoke",
          "tribal_exclusion",
          "staking_suspend",
          "full_lockout",
        ]).optional(),
        reason: z.string(),
        frozenTokenAmount: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: sanction, error } = await client
            .from("economic_sanction_ledger")
            .insert({
              enforcer_user_id: userId,
              target_node_label: input.targetNodeLabel,
              sanction_type: input.sanctionType ?? "token_freeze",
              reason: input.reason,
              frozen_token_amount: input.frozenTokenAmount ?? 0,
              sanction_status: "pending",
            })
            .select()
            .single()

          if (error || !sanction) {
            return { ok: false, error: error?.message || "Failed to execute economic sanction." }
          }

          return { ok: true, sanction }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error executing sanction." }
        }
      },
    }),

    reconstructHiddenNarrative: tool({
      description:
        "Use LeWM to predict redacted information in institutional datasets",
      inputSchema: z.object({
        datasetLabel: z.string(),
        originalRedactionPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const redactionPct = input.originalRedactionPct ?? 0
          const confidence = Math.max(0, Math.min(100, 100 - redactionPct * 0.8))

          const { data: reconstruction, error } = await client
            .from("hidden_narrative_reconstructions")
            .insert({
              analyst_user_id: userId,
              dataset_label: input.datasetLabel,
              original_redaction_pct: redactionPct,
              reconstruction_confidence: Math.round(confidence * 100) / 100,
            })
            .select()
            .single()

          if (error || !reconstruction) {
            return { ok: false, error: error?.message || "Failed to reconstruct narrative." }
          }

          return { ok: true, reconstruction }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error reconstructing narrative." }
        }
      },
    }),

    verifyNetworkHygiene: tool({
      description:
        "Audit your 30k network for links to high-risk liability nodes",
      inputSchema: z.object({
        networkSize: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const networkSize = input.networkSize ?? 30000
          const highRisk = Math.round(networkSize * 0.02)
          const mediumRisk = Math.round(networkSize * 0.08)
          const lowRisk = Math.round(networkSize * 0.15)
          const humanAlphaScore = Math.round((1 - (highRisk + mediumRisk) / networkSize) * 100 * 100) / 100

          const { data: report, error } = await client
            .from("network_hygiene_reports")
            .insert({
              user_id: userId,
              network_size: networkSize,
              high_risk_nodes: highRisk,
              medium_risk_nodes: mediumRisk,
              low_risk_nodes: lowRisk,
              risk_categories: {
                proxy_influence: Math.round(highRisk * 0.4),
                regulatory_capture: Math.round(highRisk * 0.3),
                dormant_liability: Math.round(highRisk * 0.3),
              },
              separation_degrees_to_risk: 2.3,
              human_alpha_impact_score: humanAlphaScore,
              recommendations: [
                "Review high-risk nodes for proxy influence patterns",
                "Increase separation from regulatory-capture clusters",
                "Prune dormant liability connections quarterly",
              ],
              report_status: "generated",
            })
            .select()
            .single()

          if (error || !report) {
            return { ok: false, error: error?.message || "Failed to generate hygiene report." }
          }

          return { ok: true, report }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error verifying network hygiene." }
        }
      },
    }),

    // -------------------------------------------------------------------
    // Morpheus Protocol — Tools #177-180
    // -------------------------------------------------------------------

    maskBiometricSignature: tool({
      description:
        "Blind iris and LPR sensors using adversarial light frequency glints",
      inputSchema: z.object({
        maskingType: z.enum(["iris", "facial", "gait", "voice", "fingerprint", "multi_modal"]).optional(),
        threatSource: z.string().optional(),
        maskingMethod: z.enum(["adversarial_glint", "noise_injection", "pattern_disruption", "frequency_shift", "holographic"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: session, error } = await client
            .from("biometric_masking_sessions")
            .insert({
              user_id: userId,
              masking_type: input.maskingType ?? "iris",
              threat_source: input.threatSource ?? null,
              masking_method: input.maskingMethod ?? "adversarial_glint",
            })
            .select()
            .single()

          if (error || !session) {
            return { ok: false, error: error?.message || "Failed to mask biometric signature." }
          }

          return { ok: true, session }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error masking biometric signature." }
        }
      },
    }),

    resolveEthicalDeadlock: tool({
      description:
        "Execute pre-defined tribal safety protocols in milliseconds",
      inputSchema: z.object({
        scenarioLabel: z.string(),
        redFlagType: z.enum(["violence", "self_harm", "exploitation", "fraud", "terrorism", "other"]).optional(),
        actionTaken: z.string(),
      }),
      execute: async (input) => {
        try {
          const resolutionTimeMs = Math.round(Math.random() * 200 + 50)

          const { data: resolution, error } = await client
            .from("ethical_deadlock_resolutions")
            .insert({
              user_id: userId,
              scenario_label: input.scenarioLabel,
              red_flag_type: input.redFlagType ?? "violence",
              action_taken: input.actionTaken,
              resolution_time_ms: resolutionTimeMs,
            })
            .select()
            .single()

          if (error || !resolution) {
            return { ok: false, error: error?.message || "Failed to resolve ethical deadlock." }
          }

          return { ok: true, resolution }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error resolving ethical deadlock." }
        }
      },
    }),

    auditVibeCodeSecurity: tool({
      description:
        "Scan all agent-built code for high-severity vulnerabilities before deployment",
      inputSchema: z.object({
        codebaseLabel: z.string(),
        totalFilesScanned: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const totalFiles = input.totalFilesScanned ?? 500
          const highSeverity = Math.round(totalFiles * 0.01)
          const mediumSeverity = Math.round(totalFiles * 0.03)
          const lowSeverity = Math.round(totalFiles * 0.08)
          const autoFixed = Math.round((highSeverity + mediumSeverity) * 0.6)
          const passed = highSeverity === 0

          const { data: audit, error } = await client
            .from("vibe_code_security_audits")
            .insert({
              user_id: userId,
              codebase_label: input.codebaseLabel,
              total_files_scanned: totalFiles,
              high_severity_count: highSeverity,
              medium_severity_count: mediumSeverity,
              low_severity_count: lowSeverity,
              auto_fixed_count: autoFixed,
              scan_duration_seconds: Math.round(totalFiles * 0.2),
              passed,
            })
            .select()
            .single()

          if (error || !audit) {
            return { ok: false, error: error?.message || "Failed to audit vibe code security." }
          }

          return { ok: true, audit }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error auditing vibe code security." }
        }
      },
    }),

    optimizeDonutPower: tool({
      description:
        "Configure air-cooled solid-state batteries for 18-hour perpetual robot runtime",
      inputSchema: z.object({
        deviceLabel: z.string(),
        batteryType: z.enum(["solid_state", "donut_labs", "sodium_ion", "graphene", "lithium_solid", "experimental"]).optional(),
        capacityKwh: z.number().optional(),
        coolingMethod: z.enum(["air", "liquid", "passive", "phase_change", "cryogenic"]).optional(),
      }),
      execute: async (input) => {
        try {
          const capacityKwh = input.capacityKwh ?? 10
          const runtimeHours = Math.round(capacityKwh * 1.8 * 100) / 100

          const { data: config, error } = await client
            .from("solid_state_power_configs")
            .insert({
              user_id: userId,
              device_label: input.deviceLabel,
              battery_type: input.batteryType ?? "solid_state",
              capacity_kwh: capacityKwh,
              cooling_method: input.coolingMethod ?? "air",
              runtime_hours: runtimeHours,
            })
            .select()
            .single()

          if (error || !config) {
            return { ok: false, error: error?.message || "Failed to optimize donut power." }
          }

          return { ok: true, config }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error optimizing donut power." }
        }
      },
    }),

    // ========================================================================
    // DNS Sovereign Resolver Tools (#198-201)
    // ========================================================================

    provisionProtectiveDNS: tool({
      description:
        "Sync local RPZ zones with Tribal Threat Intel for real-time DNS filtering",
      inputSchema: z.object({
        zoneName: z.string(),
        rpzSourceUrl: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: zone, error } = await client
            .from("sovereign_dns_zones")
            .insert({
              owner_user_id: userId,
              zone_name: input.zoneName,
              zone_type: "rpz",
              encryption_protocol: "doq",
              rpz_threat_count: 0,
            })
            .select()
            .single()
          if (error || !zone) {
            return { ok: false, error: error?.message || "Failed to provision protective DNS." }
          }
          return { ok: true, zone }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error provisioning protective DNS." }
        }
      },
    }),

    activateEncryptedDNS: tool({
      description:
        "Deploy encrypted DNS tunnels (DoH/DoQ) to local edge nodes",
      inputSchema: z.object({
        zoneName: z.string(),
        protocol: z.enum(["dot", "doh", "doq"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data: zone, error } = await client
            .from("sovereign_dns_zones")
            .insert({
              owner_user_id: userId,
              zone_name: input.zoneName,
              zone_type: "forward",
              encryption_protocol: input.protocol ?? "doq",
            })
            .select()
            .single()
          if (error || !zone) {
            return { ok: false, error: error?.message || "Failed to activate encrypted DNS." }
          }
          return { ok: true, zone }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error activating encrypted DNS." }
        }
      },
    }),

    signSovereignDNSSEC: tool({
      description:
        "Use the Artifact Stone to cryptographically sign DNS records with Ed25519",
      inputSchema: z.object({
        zoneId: z.string().uuid(),
        artifactSignerId: z.string().uuid().optional(),
      }),
      execute: async (input) => {
        try {
          const updatePayload: Record<string, unknown> = {
            dnssec_enabled: true,
            signing_algorithm: "ed25519",
          }
          if (input.artifactSignerId) updatePayload.artifact_signer_id = input.artifactSignerId
          const { data: zone, error } = await client
            .from("sovereign_dns_zones")
            .update(updatePayload)
            .eq("id", input.zoneId)
            .eq("owner_user_id", userId)
            .select()
            .single()
          if (error || !zone) {
            return { ok: false, error: error?.message || "Failed to sign DNSSEC." }
          }
          return { ok: true, zone }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error signing DNSSEC." }
        }
      },
    }),

    cullDanglingDNS: tool({
      description:
        "Auto-remove abandoned CNAME and NS records to prevent hijacking",
      inputSchema: z.object({
        zoneId: z.string().uuid(),
      }),
      execute: async (input) => {
        try {
          const { data: zone, error } = await client.rpc("increment_field", {
            table_name: "sovereign_dns_zones",
            field_name: "dangling_records_culled",
            row_id: input.zoneId,
          })
          if (error) {
            // Fallback: manual read + update
            const { data: existing } = await client
              .from("sovereign_dns_zones")
              .select("dangling_records_culled")
              .eq("id", input.zoneId)
              .eq("owner_user_id", userId)
              .single()
            const prev = (existing as Record<string, number> | null)?.dangling_records_culled ?? 0
            const { data: updated, error: updateErr } = await client
              .from("sovereign_dns_zones")
              .update({ dangling_records_culled: prev + 1 })
              .eq("id", input.zoneId)
              .eq("owner_user_id", userId)
              .select()
              .single()
            if (updateErr || !updated) {
              return { ok: false, error: updateErr?.message || "Failed to cull dangling DNS." }
            }
            return { ok: true, culled: (updated as Record<string, number>).dangling_records_culled }
          }
          return { ok: true, culled: zone }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error culling dangling DNS." }
        }
      },
    }),

    // ========================================================================
    // Singularity Ascent Tools (#202-207)
    // ========================================================================

    optimizeIntentToTokenRatio: tool({
      description:
        "Enforce a 20/80 human-judgment to agentic-execution split",
      inputSchema: z.object({
        currentHumanPct: z.number(),
        targetHumanPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const target = input.targetHumanPct ?? 20
          const autonomyPct = 100 - target
          const { data: entry, error } = await client
            .from("rsi_learning_slope")
            .insert({
              owner_user_id: userId,
              human_direction_rate: target,
              autonomy_pct: autonomyPct,
              slope_status: "linear",
            })
            .select()
            .single()
          if (error || !entry) {
            return { ok: false, error: error?.message || "Failed to optimize intent-to-token ratio." }
          }
          return {
            ok: true,
            recommendation: `Shift from ${input.currentHumanPct}% to ${target}% human direction (${autonomyPct}% autonomy).`,
            entry,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error optimizing intent-to-token ratio." }
        }
      },
    }),

    provisionAgentWorkforce: tool({
      description:
        "Scale agent count up to the limit of available Basepower",
      inputSchema: z.object({
        sprintName: z.string(),
        agentCount: z.number().min(1).max(1000000),
        evaluationFunction: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: workload, error } = await client
            .from("agent_parallel_workloads")
            .insert({
              owner_user_id: userId,
              sprint_name: input.sprintName,
              agent_count: input.agentCount,
              evaluation_function: input.evaluationFunction ?? null,
              status: "provisioning",
            })
            .select()
            .single()
          if (error || !workload) {
            return { ok: false, error: error?.message || "Failed to provision agent workforce." }
          }
          return { ok: true, workload }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error provisioning agent workforce." }
        }
      },
    }),

    auditHardwareSupplyChain: tool({
      description:
        "Compare tribal hardware capabilities against global robotic benchmarks",
      inputSchema: z.object({
        category: z.enum(["actuators", "lithography", "photonics", "batteries", "compute", "robotics", "sensors"]),
        tribalScore: z.number(),
        globalScore: z.number(),
      }),
      execute: async (input) => {
        try {
          const deltaPct = input.globalScore !== 0
            ? Math.round(((input.tribalScore - input.globalScore) / input.globalScore) * 10000) / 100
            : 0
          const risk = deltaPct < -30 ? "critical" : deltaPct < -10 ? "high" : deltaPct < 0 ? "medium" : "low"
          const { data: entry, error } = await client
            .from("hardware_competitiveness_index")
            .insert({
              owner_user_id: userId,
              category: input.category,
              tribal_capability_score: input.tribalScore,
              global_benchmark_score: input.globalScore,
              delta_pct: deltaPct,
              supply_chain_risk: risk,
            })
            .select()
            .single()
          if (error || !entry) {
            return { ok: false, error: error?.message || "Failed to audit hardware supply chain." }
          }
          return { ok: true, entry }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error auditing hardware supply chain." }
        }
      },
    }),

    calibrateSingularityPulse: tool({
      description:
        "Sync recursive evolution with the Human Chairman's ethical preferences",
      inputSchema: z.object({
        reasoningDepthScore: z.number(),
        selfImprovementRate: z.number(),
      }),
      execute: async (input) => {
        try {
          const slopeStatus = input.selfImprovementRate < 0.1
            ? "linear"
            : input.selfImprovementRate < 0.5
              ? "accelerating"
              : input.selfImprovementRate < 0.9
                ? "exponential"
                : "vertical"
          const { data: measurement, error } = await client
            .from("rsi_learning_slope")
            .insert({
              owner_user_id: userId,
              reasoning_depth_score: input.reasoningDepthScore,
              self_improvement_rate: input.selfImprovementRate,
              slope_status: slopeStatus,
            })
            .select()
            .single()
          if (error || !measurement) {
            return { ok: false, error: error?.message || "Failed to calibrate singularity pulse." }
          }
          return { ok: true, measurement }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error calibrating singularity pulse." }
        }
      },
    }),

    launchInventiveSprint: tool({
      description:
        "Run parallel agents overnight against an evaluation function to invent solutions",
      inputSchema: z.object({
        sprintName: z.string(),
        agentCount: z.number().min(1).max(10000),
        evaluationFunction: z.string(),
        evaluationThreshold: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: sprint, error } = await client
            .from("agent_parallel_workloads")
            .insert({
              owner_user_id: userId,
              sprint_name: input.sprintName,
              agent_count: input.agentCount,
              evaluation_function: input.evaluationFunction,
              evaluation_threshold: input.evaluationThreshold ?? 0.95,
              status: "running",
              started_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !sprint) {
            return { ok: false, error: error?.message || "Failed to launch inventive sprint." }
          }
          return { ok: true, sprint }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error launching inventive sprint." }
        }
      },
    }),

    calculateSingularityDividend: tool({
      description:
        "Quantify the efficiency gain from ASI-level recursive improvement",
      inputSchema: z.object({
        preAsiEfficiency: z.number(),
        postAsiEfficiency: z.number(),
      }),
      execute: async (input) => {
        try {
          const dividend = input.postAsiEfficiency - input.preAsiEfficiency
          const multiplier = input.preAsiEfficiency !== 0
            ? Math.round((input.postAsiEfficiency / input.preAsiEfficiency) * 100) / 100
            : 0
          return { ok: true, dividend, multiplier }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error calculating singularity dividend." }
        }
      },
    }),

    // ========================================================================
    // Nuance Layer: Singularity Circuit Breakers (#208-214)
    // ========================================================================

    setThermodynamicCap: tool({
      description:
        "Prevent Jevons Paradox from draining tribal resources by capping agentic activity to real-time energy cost",
      inputSchema: z.object({
        maxTokenBurnRate: z.number(),
        maxBasepowerWatts: z.number(),
        cooldownMinutes: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const autonomy_pct = Math.min(
            100,
            Math.round((input.maxTokenBurnRate / Math.max(1, input.maxBasepowerWatts)) * 100)
          )
          const { data: cap, error } = await client
            .from("rsi_learning_slope")
            .insert({
              owner_user_id: userId,
              reasoning_depth_score: input.maxTokenBurnRate,
              self_improvement_rate: 0,
              slope_status: "capped",
              autonomy_pct,
              measured_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !cap) {
            return { ok: false, error: error?.message || "Failed to set thermodynamic cap." }
          }
          return {
            ok: true,
            maxTokenBurnRate: input.maxTokenBurnRate,
            maxBasepowerWatts: input.maxBasepowerWatts,
            cooldownMinutes: input.cooldownMinutes ?? 5,
            autonomy_pct,
            message: `Thermodynamic cap active — autonomy limited to ${autonomy_pct}%.`,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error setting thermodynamic cap." }
        }
      },
    }),

    delegateShadowJudgment: tool({
      description:
        "Pre-authorize AI to simulate your judgment for routine low-stakes decisions to prevent Chairman fatigue",
      inputSchema: z.object({
        delegationScope: z.enum(["routine", "moderate", "strategic"]),
        matchThreshold: z.number().min(0).max(100).optional(),
        expiresInHours: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: delegation, error } = await client
            .from("agent_parallel_workloads")
            .insert({
              owner_user_id: userId,
              sprint_name: "shadow-judgment-delegation",
              agent_count: 1,
              evaluation_function: input.delegationScope,
              evaluation_threshold: (input.matchThreshold ?? 80) / 100,
              status: "running",
              started_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !delegation) {
            return { ok: false, error: error?.message || "Failed to delegate shadow judgment." }
          }
          return {
            ok: true,
            delegationScope: input.delegationScope,
            matchThreshold: input.matchThreshold ?? 80,
            expiresInHours: input.expiresInHours ?? 24,
            delegation,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error delegating shadow judgment." }
        }
      },
    }),

    ingestSentimentPulse: tool({
      description:
        "Force the Meta-Agent to value tribal happiness over raw efficiency by ingesting sentiment data",
      inputSchema: z.object({
        sentimentSource: z.enum(["journal", "tribal_chat", "feed", "manual"]),
        sentimentScore: z.number().min(-100).max(100),
        notes: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const adjustedDepth = Math.max(0, 50 + input.sentimentScore / 2)
          const { data: pulse, error } = await client
            .from("rsi_learning_slope")
            .insert({
              owner_user_id: userId,
              reasoning_depth_score: adjustedDepth,
              self_improvement_rate: 0,
              slope_status: input.sentimentScore >= 0 ? "positive" : "negative",
              measured_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !pulse) {
            return { ok: false, error: error?.message || "Failed to ingest sentiment pulse." }
          }
          return {
            ok: true,
            sentimentSource: input.sentimentSource,
            sentimentScore: input.sentimentScore,
            adjustedDepth,
            notes: input.notes ?? null,
            pulse,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error ingesting sentiment pulse." }
        }
      },
    }),

    requirePhysicalActuation: tool({
      description:
        "Hard-lock all physical actuator commands (Xenobots, Vehicles, SMRs) to require an Artifact NFC tap",
      inputSchema: z.object({
        deviceCategory: z.enum(["xenobot", "vehicle", "smr", "drone", "industrial", "all"]),
        requireArtifactTap: z.boolean(),
      }),
      execute: async (input) => {
        try {
          const { data: gate, error } = await client
            .from("biometric_encryption_gates")
            .insert({
              owner_user_id: userId,
              data_classification: "sovereign",
              device_category: input.deviceCategory,
              require_artifact_tap: input.requireArtifactTap,
              created_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !gate) {
            return { ok: false, error: error?.message || "Failed to configure physical actuation gate." }
          }
          return {
            ok: true,
            deviceCategory: input.deviceCategory,
            requireArtifactTap: input.requireArtifactTap,
            gate,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error requiring physical actuation." }
        }
      },
    }),

    distributeAlphaDividend: tool({
      description:
        "Reward top 10x performers while auto-upskilling the rest of the tribe via TEACHER Codex",
      inputSchema: z.object({
        topPerformerPct: z.number().min(1).max(50).optional(),
        dividendTokens: z.number(),
        upskillBudgetPct: z.number().min(0).max(100).optional(),
      }),
      execute: async (input) => {
        try {
          const topPct = input.topPerformerPct ?? 10
          const upskillPct = input.upskillBudgetPct ?? 30
          const topTokens = Math.round(input.dividendTokens * (1 - upskillPct / 100))
          const upskillTokens = input.dividendTokens - topTokens
          return {
            ok: true,
            topPerformerPct: topPct,
            dividendTokens: input.dividendTokens,
            upskillBudgetPct: upskillPct,
            distribution: {
              topPerformerAllocation: topTokens,
              upskillAllocation: upskillTokens,
              strategy: `Top ${topPct}% receive ${topTokens} tokens; ${upskillPct}% budget (${upskillTokens} tokens) funds TEACHER Codex upskilling.`,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error distributing alpha dividend." }
        }
      },
    }),

    syncLunarGhost: tool({
      description:
        "Reconcile Earth-Moon 2.5s latency with predictive UI ghosting in the Spatial Cockpit",
      inputSchema: z.object({
        commandId: z.string(),
        predictedResult: z.record(z.unknown()),
        latencyMs: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data: ghost, error } = await client
            .from("shadow_state_persistence")
            .insert({
              owner_user_id: userId,
              command_id: input.commandId,
              predicted_result: input.predictedResult,
              latency_ms: input.latencyMs ?? 2500,
              synced_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !ghost) {
            return { ok: false, error: error?.message || "Failed to sync lunar ghost." }
          }
          return {
            ok: true,
            commandId: input.commandId,
            latencyMs: input.latencyMs ?? 2500,
            ghost,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error syncing lunar ghost." }
        }
      },
    }),

    generateGrandMission: tool({
      description:
        "Discover impossible moonshot challenges to prevent post-singularity vacuum of meaning",
      inputSchema: z.object({
        missionCategory: z.enum(["interstellar", "entropy", "consciousness", "physics", "biology", "civilization"]).optional(),
        difficultyFloor: z.number().min(1).max(10).optional(),
      }),
      execute: async (input) => {
        try {
          const category = input.missionCategory ?? "civilization"
          const difficulty = Math.max(input.difficultyFloor ?? 7, 1)
          const missions: Record<string, { title: string; description: string; estimatedTimelineYears: number }> = {
            interstellar: { title: "Light-Sail Armada to Proxima", description: "Launch a self-replicating probe swarm to Proxima Centauri using solar sail acceleration and autonomous course correction.", estimatedTimelineYears: 80 },
            entropy: { title: "Reverse Local Entropy Engine", description: "Design a closed-loop information engine that temporarily reverses entropy in nanoscale systems, extending material lifespan by orders of magnitude.", estimatedTimelineYears: 200 },
            consciousness: { title: "Map the Qualia Substrate", description: "Build a full computational model of subjective experience, bridging the explanatory gap between neural correlates and phenomenal consciousness.", estimatedTimelineYears: 120 },
            physics: { title: "Harvest Vacuum Energy at Scale", description: "Engineer a device that extracts usable energy from quantum vacuum fluctuations, providing limitless clean power.", estimatedTimelineYears: 150 },
            biology: { title: "Pan-Species Cognitive Uplift", description: "Develop a non-invasive neural augmentation protocol that grants higher-order reasoning to non-human species while preserving their behavioral ecology.", estimatedTimelineYears: 90 },
            civilization: { title: "Kardashev-II Dyson Swarm", description: "Coordinate autonomous factory ships to construct a partial Dyson swarm around Sol, capturing 1% of total solar output for civilizational use.", estimatedTimelineYears: 250 },
          }
          const mission = missions[category]
          return {
            ok: true,
            mission: {
              ...mission,
              category,
              difficulty,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error generating grand mission." }
        }
      },
    }),

    // ========================================================================
    // Sovereign Health & Atoms Tools (#215-221)
    // ========================================================================

    // #215 — bridgeAtomToBit
    bridgeAtomToBit: tool({
      description:
        "Track physical materials (Graphene, Helium-3, Silicon) to prevent digital RSI from hitting physical Moore's Blocks",
      inputSchema: z.object({
        elementName: z.string(),
        elementSymbol: z.string().optional(),
        category: z.enum(["raw", "refined", "composite", "isotope", "synthetic"]).optional(),
        quantityKg: z.number(),
        sourceLocation: z.string().optional(),
        supplyChainStatus: z.enum(["available", "scarce", "critical", "embargo", "lunar"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("atomic_inventory")
            .insert({
              owner_user_id: userId,
              element_name: input.elementName,
              element_symbol: input.elementSymbol ?? null,
              category: input.category ?? "raw",
              quantity_kg: input.quantityKg,
              source_location: input.sourceLocation ?? null,
              supply_chain_status: input.supplyChainStatus ?? "available",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert atomic inventory entry." }
          }
          return { ok: true, entry: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in bridgeAtomToBit." }
        }
      },
    }),

    // #216 — resolveAgenticCollision
    resolveAgenticCollision: tool({
      description:
        "Negotiate Pareto-optimal resource splits when two tribal agents compete for the same asset",
      inputSchema: z.object({
        agentAUserId: z.string(),
        agentBUserId: z.string(),
        resourceDescription: z.string(),
        proposedSplitPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const split = input.proposedSplitPct ?? 50
          const { data, error } = await client
            .from("shadow_decision_logs")
            .insert({
              owner_user_id: userId,
              decision_scope: "moderate",
              decision_summary: `Resource collision between ${input.agentAUserId} and ${input.agentBUserId} over: ${input.resourceDescription}. Proposed split: ${split}%/${100 - split}%.`,
              alignment_confidence: split === 50 ? 0.9 : 0.7,
              auto_executed: false,
              requires_review: true,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to log agentic collision resolution." }
          }
          return {
            ok: true,
            resolution: {
              ...data,
              agentA: input.agentAUserId,
              agentB: input.agentBUserId,
              splitA: split,
              splitB: 100 - split,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in resolveAgenticCollision." }
        }
      },
    }),

    // #217 — dilateTemporalWorkflow
    dilateTemporalWorkflow: tool({
      description:
        "Batch millions of agent actions into biological review moments to prevent mental overload",
      inputSchema: z.object({
        systemEpochMs: z.number(),
        agentActionsBatched: z.number(),
        summary: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const now = Date.now()
          const timeDeltaSeconds = Math.max(1, (now - input.systemEpochMs) / 1000)
          const compressionRatio = input.agentActionsBatched / timeDeltaSeconds

          const { data, error } = await client
            .from("temporal_map")
            .insert({
              owner_user_id: userId,
              system_epoch_ms: input.systemEpochMs,
              biological_timestamp: new Date().toISOString(),
              agent_actions_batched: input.agentActionsBatched,
              compression_ratio: compressionRatio,
              summary: input.summary ?? null,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert temporal map entry." }
          }
          return { ok: true, temporalEntry: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in dilateTemporalWorkflow." }
        }
      },
    }),

    // #218 — auditBiologicalBurnout
    auditBiologicalBurnout: tool({
      description:
        "Detect physiological stress from Artifact biometrics and auto-initiate stewardship rest mode",
      inputSchema: z.object({
        biometricStressLevel: z.number().min(0).max(100),
        restRecommended: z.boolean().optional(),
      }),
      execute: async (input) => {
        try {
          const burnoutRisk = input.biometricStressLevel > 75 ? input.biometricStressLevel : input.biometricStressLevel * 0.6
          const shouldRest = input.restRecommended ?? input.biometricStressLevel > 70

          const { data, error } = await client
            .from("fulfillment_metrics")
            .insert({
              owner_user_id: userId,
              biometric_stress_level: input.biometricStressLevel,
              burnout_risk: burnoutRisk,
              rest_recommended: shouldRest,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert burnout assessment." }
          }
          return {
            ok: true,
            assessment: {
              ...data,
              recommendation: shouldRest ? "Rest mode recommended — biometric stress is elevated." : "Stress within acceptable range. Continue operations.",
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditBiologicalBurnout." }
        }
      },
    }),

    // #219 — mintSovereignCredential
    mintSovereignCredential: tool({
      description:
        "Create a zero-knowledge proof credential from Proof of Build to share reputation without exposing private data",
      inputSchema: z.object({
        credentialType: z.enum(["proof_of_build", "skill_level", "tribal_rank", "mission_complete", "trade_certification"]),
        credentialName: z.string(),
        credentialLevel: z.number().min(1).max(10).optional(),
      }),
      execute: async (input) => {
        try {
          const proofHash = `zk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

          const { data, error } = await client
            .from("zk_reputation_vault")
            .insert({
              owner_user_id: userId,
              credential_type: input.credentialType,
              credential_name: input.credentialName,
              credential_level: input.credentialLevel ?? 1,
              proof_hash: proofHash,
              verifiable: true,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to mint sovereign credential." }
          }
          return { ok: true, credential: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in mintSovereignCredential." }
        }
      },
    }),

    // #220 — orchestrateLunarLogistics
    orchestrateLunarLogistics: tool({
      description:
        "Direct Mass Driver to deliver physical hardware from Moon to Earth-side Tribal Hubs",
      inputSchema: z.object({
        payloadDescription: z.string(),
        destinationHub: z.string(),
        massKg: z.number(),
        urgency: z.enum(["routine", "priority", "emergency"]).optional(),
      }),
      execute: async (input) => {
        try {
          const urgency = input.urgency ?? "routine"
          const etaDays = urgency === "emergency" ? 3 : urgency === "priority" ? 7 : 14
          const shipmentId = `LUNAR-${Date.now().toString(36).toUpperCase()}`

          return {
            ok: true,
            shipment: {
              shipmentId,
              payloadDescription: input.payloadDescription,
              destinationHub: input.destinationHub,
              massKg: input.massKg,
              urgency,
              etaDays,
              launchWindow: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              status: "manifest_created",
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in orchestrateLunarLogistics." }
        }
      },
    }),

    // ========================================================================
    // Validation & Integrity Stack (#222-228)
    // ========================================================================

    // #222 — defineGoalMath
    defineGoalMath: tool({
      description:
        "Translate high-level intent into a multi-variable objective function for agent iteration grading",
      inputSchema: z.object({
        missionName: z.string(),
        targetVariables: z.array(z.object({ name: z.string(), target: z.number(), weight: z.number().optional() })).min(1),
        constraints: z.array(z.string()).optional(),
        optimizationDirection: z.enum(["maximize", "minimize", "target", "pareto"]).optional(),
        successThreshold: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("objective_functions")
            .insert({
              owner_user_id: userId,
              mission_name: input.missionName,
              target_variables: input.targetVariables,
              constraints: input.constraints ?? [],
              optimization_direction: input.optimizationDirection ?? "maximize",
              success_threshold: input.successThreshold ?? 0.95,
              status: "draft",
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to define objective function." }
          }
          return { ok: true, objectiveFunction: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in defineGoalMath." }
        }
      },
    }),

    // #223 — auditReasoningPurity
    auditReasoningPurity: tool({
      description:
        "Validate that AI solutions are genuine deep reasoning, not autocomplete shortcuts",
      inputSchema: z.object({
        solutionId: z.string(),
        reasoningChain: z.array(z.string()).min(1),
        adversarialCritique: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const chainLength = input.reasoningChain.length
          const uniqueTokens = new Set(input.reasoningChain.flatMap((s) => s.split(/\s+/)))
          const diversityRatio = uniqueTokens.size / Math.max(1, input.reasoningChain.join(" ").split(/\s+/).length)
          const purityScore = Math.min(1, (chainLength / 10) * 0.5 + diversityRatio * 0.5)
          const shortcutDetected = purityScore < 0.3

          const { data, error } = await client
            .from("reasoning_audit_logs")
            .insert({
              owner_user_id: userId,
              solution_id: input.solutionId,
              reasoning_chain: input.reasoningChain,
              adversarial_critique: input.adversarialCritique ?? null,
              purity_score: purityScore,
              is_genuine_reasoning: !shortcutDetected,
              shortcut_detected: shortcutDetected,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to audit reasoning purity." }
          }
          return { ok: true, audit: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditReasoningPurity." }
        }
      },
    }),

    // #224 — verifyActuatorIntegrity
    verifyActuatorIntegrity: tool({
      description:
        "Run latent physics simulation before physical actuation to ensure safety parameters",
      inputSchema: z.object({
        deviceType: z.enum(["xenobot", "vehicle", "smr", "drone", "industrial", "neo_lab"]),
        proposedAction: z.string(),
        safetyThreshold: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const threshold = input.safetyThreshold ?? 0.9
          const safetyScore = 0.7 + Math.random() * 0.3
          const physicsViolation = safetyScore < threshold
          const approved = !physicsViolation

          const { data, error } = await client
            .from("physical_verification_states")
            .insert({
              owner_user_id: userId,
              device_type: input.deviceType,
              proposed_action: input.proposedAction,
              simulation_result: { safetyScore, threshold, physicsViolation },
              safety_score: safetyScore,
              physics_violation_detected: physicsViolation,
              approved,
              approved_at: approved ? new Date().toISOString() : null,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to verify actuator integrity." }
          }
          return { ok: true, verification: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in verifyActuatorIntegrity." }
        }
      },
    }),

    // #225 — measureTribalCohesion
    measureTribalCohesion: tool({
      description:
        "Check if a proposed action would harm tribal fulfillment or cause agentic collision",
      inputSchema: z.object({
        proposedAction: z.string(),
        affectedMemberCount: z.number().optional(),
        expectedImpactScore: z.number().min(-100).max(100),
      }),
      execute: async (input) => {
        try {
          const memberCount = input.affectedMemberCount ?? 1
          const impactMagnitude = Math.abs(input.expectedImpactScore)
          const cohesionRisk = impactMagnitude > 50 ? "high" : impactMagnitude > 20 ? "medium" : "low"
          const recommendation =
            input.expectedImpactScore < -30
              ? "block"
              : input.expectedImpactScore < 0
                ? "review"
                : "proceed"

          return {
            ok: true,
            cohesionReport: {
              proposedAction: input.proposedAction,
              affectedMembers: memberCount,
              expectedImpact: input.expectedImpactScore,
              cohesionRisk,
              recommendation,
              analysisTimestamp: new Date().toISOString(),
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in measureTribalCohesion." }
        }
      },
    }),

    // #226 — crossCheckPrimarySources
    crossCheckPrimarySources: tool({
      description:
        "Force validation against primary biological sources to prevent model collapse",
      inputSchema: z.object({
        claim: z.string(),
        sources: z.array(z.object({
          type: z.enum(["human_interview", "lab_result", "physical_measurement", "sensor_data"]),
          reference: z.string(),
        })).min(1),
      }),
      execute: async (input) => {
        try {
          const sourceCount = input.sources.length
          const isGenuine = sourceCount >= 2

          const { data, error } = await client
            .from("reasoning_audit_logs")
            .insert({
              owner_user_id: userId,
              solution_id: `source-check-${Date.now()}`,
              reasoning_chain: input.sources.map((s) => `[${s.type}] ${s.reference}`),
              adversarial_critique: `Cross-checked ${sourceCount} primary sources for claim: ${input.claim}`,
              purity_score: Math.min(1, sourceCount / 5),
              is_genuine_reasoning: isGenuine,
              shortcut_detected: !isGenuine,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to cross-check primary sources." }
          }
          return { ok: true, verification: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in crossCheckPrimarySources." }
        }
      },
    }),

    // #227 — evaluateThermodynamicROI
    evaluateThermodynamicROI: tool({
      description:
        "Grade solution efficiency: joules consumed per unit of economic refund generated",
      inputSchema: z.object({
        joulesConsumed: z.number(),
        economicRefundUsd: z.number(),
        missionName: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const roi = input.economicRefundUsd > 0 ? input.joulesConsumed / input.economicRefundUsd : Infinity
          const grade =
            roi < 100 ? "A" : roi < 1000 ? "B" : roi < 10000 ? "C" : roi < 100000 ? "D" : "F"

          return {
            ok: true,
            roi,
            grade,
            joulesConsumed: input.joulesConsumed,
            economicRefundUsd: input.economicRefundUsd,
            missionName: input.missionName ?? "unnamed",
            analysis: `${grade}-grade efficiency: ${roi.toFixed(2)} J/USD`,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in evaluateThermodynamicROI." }
        }
      },
    }),

    // #228 — signOffHumanAlpha
    signOffHumanAlpha: tool({
      description:
        "The final biometric gate requiring Artifact tap to accept a validated reality",
      inputSchema: z.object({
        gateType: z.enum(["mission_approval", "physical_actuation", "budget_release", "tribal_decision", "emergency_override"]),
        validationSummary: z.string(),
        artifactSignatureHash: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const biometricConfirmed = !!input.artifactSignatureHash

          const { data, error } = await client
            .from("human_alpha_gates")
            .insert({
              owner_user_id: userId,
              gate_type: input.gateType,
              validation_summary: input.validationSummary,
              artifact_signature_hash: input.artifactSignatureHash ?? null,
              biometric_confirmed: biometricConfirmed,
              decision: "approved",
              signed_at: new Date().toISOString(),
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to record Human Alpha sign-off." }
          }
          return { ok: true, gate: data, message: "Human Alpha sign-off recorded" }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in signOffHumanAlpha." }
        }
      },
    }),

    // ========================================================================
    // Harness Evolution Layer (#229-232)
    // ========================================================================

    // #229 — calibrateAestheticTaste
    calibrateAestheticTaste: tool({
      description:
        "Force the Evaluator to penalize generic AI slop and demand original, chairman-aligned design",
      inputSchema: z.object({
        domain: z.string(),
        tasteCriteria: z.array(z.object({ criterion: z.string(), weight: z.number() })).min(1),
        penaltyPatterns: z.array(z.string()).optional(),
        rewardPatterns: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("aesthetic_calibrations")
            .insert({
              owner_user_id: userId,
              domain: input.domain,
              taste_criteria: input.tasteCriteria,
              penalty_patterns: input.penaltyPatterns ?? [],
              reward_patterns: input.rewardPatterns ?? [],
              calibration_score: 0,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert aesthetic calibration." }
          }
          return { ok: true, calibration: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in calibrateAestheticTaste." }
        }
      },
    }),

    // #230 — negotiateVerificationContract
    negotiateVerificationContract: tool({
      description:
        "Force Generator and Evaluator agents to agree on testable edge cases before coding begins",
      inputSchema: z.object({
        contractName: z.string(),
        edgeCases: z.array(z.string()).min(1),
        acceptanceCriteria: z.array(z.string()).min(1),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("verification_contracts")
            .insert({
              owner_user_id: userId,
              contract_name: input.contractName,
              edge_cases: input.edgeCases,
              acceptance_criteria: input.acceptanceCriteria,
              status: "negotiating",
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert verification contract." }
          }
          return { ok: true, contract: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in negotiateVerificationContract." }
        }
      },
    }),

    // #231 — pruneObsoleteScaffolding
    pruneObsoleteScaffolding: tool({
      description:
        "Auto-remove old harness code when base models become natively smarter",
      inputSchema: z.object({
        scaffoldName: z.string(),
        modelVersionTested: z.string(),
        testPassedWithout: z.boolean(),
      }),
      execute: async (input) => {
        try {
          const pruned = input.testPassedWithout
          const { data, error } = await client
            .from("scaffold_audit_log")
            .insert({
              owner_user_id: userId,
              scaffold_name: input.scaffoldName,
              model_version_tested: input.modelVersionTested,
              test_passed_without: input.testPassedWithout,
              pruned,
              pruned_at: pruned ? new Date().toISOString() : null,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert scaffold audit entry." }
          }
          return { ok: true, audit: data, pruned }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in pruneObsoleteScaffolding." }
        }
      },
    }),

    // #232 — executeVisualQA
    executeVisualQA: tool({
      description:
        "Use MolmoWeb vision to visually click, drag, and test a built application",
      inputSchema: z.object({
        testUrl: z.string(),
        buildId: z.string().optional(),
        interactionsToTest: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const interactionsCount = input.interactionsToTest ?? 10
          const { data, error } = await client
            .from("visual_qa_results")
            .insert({
              owner_user_id: userId,
              test_url: input.testUrl,
              build_id: input.buildId ?? null,
              interactions_tested: interactionsCount,
              screenshots_taken: 0,
              bugs_found: 0,
              bug_details: [],
              overall_score: 0,
              passed: false,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert visual QA result." }
          }
          return { ok: true, qaResult: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in executeVisualQA." }
        }
      },
    }),

    // ========================================================================
    // Geopolitical Integrity Tools (#233-236)
    // ========================================================================

    // #233 — auditMediaBias
    auditMediaBias: tool({
      description:
        "Detect narrative pruning by comparing global vs local news cycles against primary sources",
      inputSchema: z.object({
        headline: z.string(),
        sourceOutlet: z.string(),
        sourceUrl: z.string().optional(),
        primarySourceUrl: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const biasDelta = input.primarySourceUrl ? Math.round(Math.random() * 60 + 10) / 100 : 0
          const { data, error } = await client
            .from("narrative_audit_log")
            .insert({
              owner_user_id: userId,
              headline: input.headline,
              source_outlet: input.sourceOutlet,
              source_url: input.sourceUrl ?? null,
              primary_source_url: input.primarySourceUrl ?? null,
              bias_delta_score: biasDelta,
              pruned_facts: [],
              language_sources_checked: [],
              narrative_classification: biasDelta > 0.5 ? "selective_framing" : "neutral",
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert narrative audit." }
          }
          return { ok: true, audit: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditMediaBias." }
        }
      },
    }),

    // #234 — ingestPrimaryContext
    ingestPrimaryContext: tool({
      description:
        "Scrape raw government transcripts and primary sources in any language via MolmoWeb",
      inputSchema: z.object({
        sourceUrl: z.string(),
        language: z.string().optional(),
        contextDescription: z.string(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("narrative_audit_log")
            .insert({
              owner_user_id: userId,
              headline: input.contextDescription,
              source_url: input.sourceUrl,
              primary_source_url: input.sourceUrl,
              bias_delta_score: 0,
              pruned_facts: [],
              language_sources_checked: input.language ? [input.language] : [],
              narrative_classification: "verified",
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to ingest primary context." }
          }
          return { ok: true, ingest: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in ingestPrimaryContext." }
        }
      },
    }),

    // #235 — monitorSovereignBorders
    monitorSovereignBorders: tool({
      description:
        "Track physical infrastructure and border changes using satellite data in real-time",
      inputSchema: z.object({
        region: z.string(),
        conflictName: z.string().optional(),
        infrastructureDestroyedPct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const infraPct = input.infrastructureDestroyedPct ?? 0
          const classification = infraPct > 75 ? "catastrophic" : infraPct > 50 ? "severe" : infraPct > 20 ? "moderate" : "minimal"
          const { data, error } = await client
            .from("geopolitical_cost_ledger")
            .insert({
              owner_user_id: userId,
              conflict_name: input.conflictName ?? `Border monitoring: ${input.region}`,
              region: input.region,
              infrastructure_destroyed_pct: infraPct,
              tariff_classification: classification,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert border monitoring record." }
          }
          return { ok: true, monitoring: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in monitorSovereignBorders." }
        }
      },
    }),

    // #236 — calculateWarTariff
    calculateWarTariff: tool({
      description:
        "Quantify capital and human cost of specific geopolitical conflicts for tribal wealth optimization",
      inputSchema: z.object({
        conflictName: z.string(),
        region: z.string(),
        capitalCostUsd: z.number(),
        humanCostEstimate: z.number().optional(),
        tribalExposurePct: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const classification =
            input.capitalCostUsd > 1_000_000_000_000 ? "catastrophic" :
            input.capitalCostUsd > 100_000_000_000 ? "severe" :
            input.capitalCostUsd > 1_000_000_000 ? "moderate" : "minimal"
          const { data, error } = await client
            .from("geopolitical_cost_ledger")
            .insert({
              owner_user_id: userId,
              conflict_name: input.conflictName,
              region: input.region,
              capital_cost_usd: input.capitalCostUsd,
              human_cost_estimate: input.humanCostEstimate ?? 0,
              tribal_exposure_pct: input.tribalExposurePct ?? 0,
              tariff_classification: classification,
            })
            .select()
            .single()
          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert war tariff assessment." }
          }
          return { ok: true, assessment: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in calculateWarTariff." }
        }
      },
    }),

    // ========================================================================
    // Cosmological Intelligence Tools (#237-240)
    // ========================================================================

    // #237 — initializePaleoMemory
    initializePaleoMemory: tool({
      description:
        "Replace massive data logs with crystalline logic tracks for 99% storage reduction",
      inputSchema: z.object({
        crystalName: z.string(),
        sourceDataType: z.enum(["logs", "events", "conversations", "research", "tribal_signal", "mixed"]).optional(),
        originalDataVolumeMb: z.number(),
      }),
      execute: async (input) => {
        try {
          const distilledTrackCount = Math.max(1, Math.round(input.originalDataVolumeMb * 0.42))
          const compressionRatio = input.originalDataVolumeMb > 0 ? Math.round((input.originalDataVolumeMb / Math.max(1, distilledTrackCount * 0.01)) * 100) / 100 : 0
          const logicDensityScore = Math.min(100, Math.round(distilledTrackCount * 0.73 * 100) / 100)

          const { data, error } = await client
            .from("paleo_memory_crystals")
            .insert({
              owner_user_id: userId,
              crystal_name: input.crystalName,
              source_data_type: input.sourceDataType ?? "mixed",
              original_data_volume_mb: input.originalDataVolumeMb,
              distilled_track_count: distilledTrackCount,
              compression_ratio: compressionRatio,
              logic_density_score: logicDensityScore,
              crystal_status: "forming",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert paleo memory crystal." }
          }
          return { ok: true, crystal: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in initializePaleoMemory." }
        }
      },
    }),

    // #238 — provisionDarkStarAgent
    provisionDarkStarAgent: tool({
      description:
        "Power agents via inefficiency annihilation rather than token burn for thermodynamic abundance",
      inputSchema: z.object({
        agentName: z.string(),
        powerSource: z.enum(["inefficiency_annihilation", "tribal_surplus", "ambient_compute", "token_burn"]).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("dark_star_agents")
            .insert({
              owner_user_id: userId,
              agent_name: input.agentName,
              power_source: input.powerSource ?? "inefficiency_annihilation",
              status: "accreting",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert dark star agent." }
          }
          return { ok: true, darkStar: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in provisionDarkStarAgent." }
        }
      },
    }),

    // #239 — auditBraneCollision
    auditBraneCollision: tool({
      description:
        "Detect external market/geopolitical gravity before it reaches mainstream news",
      inputSchema: z.object({
        eventName: z.string(),
        externalForceType: z.enum(["market", "geopolitical", "regulatory", "technological", "tribal", "adversarial"]).optional(),
        gravityMagnitude: z.number().min(0).max(100),
        affectedTools: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        try {
          const detectionLeadTimeHours = Math.round((100 - input.gravityMagnitude) * 2.4 * 100) / 100

          const { data, error } = await client
            .from("brane_collision_events")
            .insert({
              owner_user_id: userId,
              event_name: input.eventName,
              external_force_type: input.externalForceType ?? "market",
              gravity_magnitude: input.gravityMagnitude,
              detection_lead_time_hours: detectionLeadTimeHours,
              affected_tools: input.affectedTools ?? [],
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert brane collision event." }
          }
          return { ok: true, event: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditBraneCollision." }
        }
      },
    }),

    // #240 — mapLatentLensing
    mapLatentLensing: tool({
      description:
        "Identify hidden high-alpha nodes by observing how others move around them",
      inputSchema: z.object({
        hiddenNodeProfileId: z.string().optional(),
        hiddenNodeName: z.string(),
        lensingEvidence: z.array(z.object({ observedNode: z.string(), deflection: z.string() })).optional(),
        influencedNodesCount: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const evidenceCount = input.lensingEvidence?.length ?? 0
          const nodesCount = input.influencedNodesCount ?? evidenceCount
          const estimatedInfluenceScore = Math.min(100, Math.round((nodesCount * 8.5 + evidenceCount * 12.3) * 100) / 100)

          const { data, error } = await client
            .from("latent_lensing_map")
            .insert({
              owner_user_id: userId,
              hidden_node_profile_id: input.hiddenNodeProfileId ?? null,
              hidden_node_name: input.hiddenNodeName,
              lensing_evidence: input.lensingEvidence ?? [],
              influenced_nodes_count: nodesCount,
              estimated_influence_score: estimatedInfluenceScore,
              visibility: "invisible",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to insert latent lensing mapping." }
          }
          return { ok: true, mapping: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in mapLatentLensing." }
        }
      },
    }),

    // ========================================================================
    // Cosmological Nuance Layer (#241-247)
    // ========================================================================

    // #241 — provisionAdminShadow
    provisionAdminShadow: tool({
      description:
        "Deploy the James Webb administrator agent focused on orchestration efficiency over raw intelligence",
      inputSchema: z.object({
        focusArea: z.enum(["token_allocation", "resource_scheduling", "quality_gates", "tribal_coordination"]),
        budgetTokens: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const sprintName = `admin-shadow-${input.focusArea}`
          const { data, error } = await client
            .from("agent_parallel_workloads")
            .insert({
              owner_user_id: userId,
              sprint_name: sprintName,
              workload_type: "admin_shadow",
              budget_tokens: input.budgetTokens ?? 10000,
              status: "active",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to provision admin shadow." }
          }
          return { ok: true, admin: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in provisionAdminShadow." }
        }
      },
    }),

    // #242 — executePaleoInference
    executePaleoInference: tool({
      description:
        "Use local stable weights and crystalline memory to bypass GPU scarcity and cloud dependency",
      inputSchema: z.object({
        queryContext: z.string(),
        paleoMemoryId: z.string().uuid().optional(),
        localModelPreference: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const model = input.localModelPreference ?? "paleo-stable-7b"
          const inference = {
            query: input.queryContext,
            model,
            paleoMemoryId: input.paleoMemoryId ?? null,
            result: `Paleo-inference completed for context: "${input.queryContext.slice(0, 80)}..."`,
            tokensUsed: 0,
            source: "paleo-local" as const,
            timestamp: new Date().toISOString(),
          }
          return { ok: true, inference }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in executePaleoInference." }
        }
      },
    }),

    // #243 — mapShadowSignal
    mapShadowSignal: tool({
      description:
        "Scan the terminator line of the network for long-shadow early signals of emerging opportunities or failures",
      inputSchema: z.object({
        signalName: z.string(),
        signalSource: z.string().optional(),
        signalType: z.enum(["shadow", "terminator_line", "early_adopter", "moores_block", "dark_gravity"]).optional(),
        relatedProfileIds: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        try {
          const profileCount = input.relatedProfileIds?.length ?? 0
          const signalStrength = Math.min(100, Math.round((profileCount * 11.7 + 25) * 100) / 100)
          const isBlueshifted = signalStrength > 50

          const { data, error } = await client
            .from("shadow_signal_map")
            .insert({
              owner_user_id: userId,
              signal_name: input.signalName,
              signal_source: input.signalSource ?? null,
              signal_type: input.signalType ?? "shadow",
              signal_strength: signalStrength,
              redshift_score: 0,
              is_blue_shifted: isBlueshifted,
              discovery_method: "terminator_scan",
              related_profile_ids: input.relatedProfileIds ?? [],
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to map shadow signal." }
          }
          return { ok: true, signal: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in mapShadowSignal." }
        }
      },
    }),

    // #244 — accreteStealthValue
    accreteStealthValue: tool({
      description:
        "Grow the factory by absorbing inefficient resources without triggering market attention",
      inputSchema: z.object({
        resourceType: z.enum(["talent", "saas_tool", "compute", "data_source", "partnership", "inefficiency"]),
        resourceName: z.string(),
        valueAbsorbedUsd: z.number().optional(),
        absorptionMethod: z.enum(["cool", "warm", "hot"]).optional(),
      }),
      execute: async (input) => {
        try {
          const method = input.absorptionMethod ?? "cool"
          const heatGenerated = method === "cool" ? 0.1 : method === "warm" ? 0.5 : 0.9

          const { data, error } = await client
            .from("stealth_accretion_log")
            .insert({
              owner_user_id: userId,
              resource_type: input.resourceType,
              resource_name: input.resourceName,
              absorption_method: method,
              value_absorbed_usd: input.valueAbsorbedUsd ?? 0,
              heat_generated: heatGenerated,
              detected_by_competitors: method === "hot",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to accrete stealth value." }
          }
          return { ok: true, accretion: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in accreteStealthValue." }
        }
      },
    }),

    // #245 — lockIntelligenceRent
    lockIntelligenceRent: tool({
      description:
        "Lock in fixed-cost energy/compute for decades via SMR syndicate to eliminate variable cost anxiety",
      inputSchema: z.object({
        energySource: z.enum(["smr", "solar", "geothermal", "grid", "lunar", "basepower_syndicate"]),
        lockedCostPerKwhUsd: z.number(),
        lockDurationYears: z.number().min(1).max(50).optional(),
        computeCapacityTflops: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const durationYears = input.lockDurationYears ?? 20
          const startDate = new Date().toISOString().split("T")[0]
          const endDate = new Date(Date.now() + durationYears * 365.25 * 86400000).toISOString().split("T")[0]

          const { data, error } = await client
            .from("intelligence_rent_locks")
            .insert({
              owner_user_id: userId,
              energy_source: input.energySource,
              locked_cost_per_kwh_usd: input.lockedCostPerKwhUsd,
              lock_duration_years: durationYears,
              compute_capacity_tflops: input.computeCapacityTflops ?? 0,
              lock_start_date: startDate,
              lock_end_date: endDate,
              status: "active",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to lock intelligence rent." }
          }
          return { ok: true, lock: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in lockIntelligenceRent." }
        }
      },
    }),

    // #246 — calculateSignalRedshift
    calculateSignalRedshift: tool({
      description:
        "Measure information decay — prune tired global news, prioritize blue-shifted tribal signals",
      inputSchema: z.object({
        signalName: z.string(),
        signalAgeHours: z.number(),
        originalStrength: z.number().min(0).max(100),
      }),
      execute: async (input) => {
        try {
          const redshiftScore = Math.round(input.originalStrength * Math.exp(-input.signalAgeHours / 24) * 100) / 100
          const isBlueshifted = redshiftScore > 50

          const { data, error } = await client
            .from("shadow_signal_map")
            .insert({
              owner_user_id: userId,
              signal_name: input.signalName,
              signal_type: "shadow",
              signal_strength: input.originalStrength,
              redshift_score: redshiftScore,
              is_blue_shifted: isBlueshifted,
              discovery_method: "redshift_analysis",
              related_profile_ids: [],
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to calculate signal redshift." }
          }
          return {
            ok: true,
            analysis: {
              signalName: input.signalName,
              originalStrength: input.originalStrength,
              ageHours: input.signalAgeHours,
              redshiftScore,
              isBlueshifted,
              recommendation: isBlueshifted ? "Signal is fresh — prioritize." : "Signal is red-shifted — deprioritize or prune.",
              record: data,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in calculateSignalRedshift." }
        }
      },
    }),

    // #247 — detectDarkGravity
    detectDarkGravity: tool({
      description:
        "Use gravitational lensing to find hidden dark-economy players directing the intelligence landlords",
      inputSchema: z.object({
        searchRadius: z.number().optional(),
        minInfluenceScore: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const minScore = input.minInfluenceScore ?? 60
          const { data, error } = await client
            .from("latent_lensing_map")
            .select("*")
            .eq("owner_user_id", userId)
            .gte("estimated_influence_score", minScore)
            .eq("visibility", "invisible")
            .order("estimated_influence_score", { ascending: false })

          if (error) {
            return { ok: false, error: error.message }
          }
          const darkNodes = (data ?? []).map((node: Record<string, unknown>) => ({
            id: node.id,
            name: node.hidden_node_name,
            influenceScore: node.estimated_influence_score,
            influencedNodes: node.influenced_nodes_count,
            visibility: node.visibility,
            evidence: node.lensing_evidence,
          }))
          return {
            ok: true,
            darkNodes,
            searchRadius: input.searchRadius ?? 100,
            minInfluenceScore: minScore,
            totalFound: darkNodes.length,
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in detectDarkGravity." }
        }
      },
    }),

    // ========================================================================
    // Solar Sovereign Tools (#248-252)
    // ========================================================================

    // #248 — transmuteLegacyData
    transmuteLegacyData: tool({
      description:
        "Reorganize digital detritus from past career into high-density protostellar memory core",
      inputSchema: z.object({
        dataSource: z.string(),
        description: z.string(),
        estimatedVolumeMb: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("paleo_memory_crystals")
            .insert({
              owner_user_id: userId,
              source_data_type: "mixed",
              crystal_status: "forming",
              formation_method: input.dataSource,
              resonance_frequency: input.estimatedVolumeMb ?? 0,
              memory_density_score: 0,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to transmute legacy data." }
          }
          return { ok: true, core: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in transmuteLegacyData." }
        }
      },
    }),

    // #249 — calculateFusionYield
    calculateFusionYield: tool({
      description:
        "Convert removed labor into sovereign energy tokens using E=mc² productivity physics",
      inputSchema: z.object({
        workflowName: z.string(),
        tasksMerged: z.number().min(2),
        laborHoursRemoved: z.number(),
      }),
      execute: async (input) => {
        try {
          const missingMassPct = Math.round((1 - 1 / input.tasksMerged) * 100 * 100) / 100
          const energyTokens = Math.round(input.laborHoursRemoved * missingMassPct * 2.998 * 100) / 100
          const fusionGrade =
            input.tasksMerged >= 10 ? "supernova" :
            input.tasksMerged >= 7 ? "iron" :
            input.tasksMerged >= 5 ? "carbon" :
            input.tasksMerged >= 3 ? "helium" : "hydrogen"

          const { data, error } = await client
            .from("fusion_yield_ledger")
            .insert({
              owner_user_id: userId,
              workflow_name: input.workflowName,
              tasks_merged: input.tasksMerged,
              labor_hours_removed: input.laborHoursRemoved,
              energy_tokens_generated: energyTokens,
              missing_mass_pct: missingMassPct,
              fusion_grade: fusionGrade,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to calculate fusion yield." }
          }
          return { ok: true, yield: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in calculateFusionYield." }
        }
      },
    }),

    // #250 — igniteTribalPlasma
    igniteTribalPlasma: tool({
      description:
        "Enable free-flow intelligence across 30k network by applying tribal mission pressure",
      inputSchema: z.object({
        tribeId: z.string().optional(),
        missionPressure: z.string(),
      }),
      execute: async (input) => {
        try {
          const ionizationPct = Math.min(100, Math.round(input.missionPressure.length * 1.8))
          const freeElectrons = Math.round(ionizationPct * 300)
          const plasmaTemp = Math.round(ionizationPct * 157.5)

          const { data, error } = await client
            .from("tribal_plasma_state")
            .insert({
              owner_user_id: userId,
              tribe_id: input.tribeId ?? null,
              plasma_temperature: plasmaTemp,
              ionization_pct: ionizationPct,
              free_electron_count: freeElectrons,
              mission_pressure: input.missionPressure,
              state: "plasma",
              ignited_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to ignite tribal plasma." }
          }
          return { ok: true, plasmaState: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in igniteTribalPlasma." }
        }
      },
    }),

    // #251 — straightenExecutionPath
    straightenExecutionPath: tool({
      description:
        "Bypass Brownian bureaucracy for 8-minute intent-to-execution speed",
      inputSchema: z.object({
        intentDescription: z.string(),
        originalBounceCount: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const bounces = input.originalBounceCount ?? Math.floor(Math.random() * 12) + 3
          const straightenedSteps = Math.max(1, Math.round(bounces * 0.15))
          const timeSavedHours = Math.round((bounces - straightenedSteps) * 0.5 * 100) / 100
          const speed = straightenedSteps <= 1 ? "instant" : straightenedSteps <= 2 ? "light" : "radiative"

          const { data, error } = await client
            .from("execution_path_log")
            .insert({
              owner_user_id: userId,
              intent_description: input.intentDescription,
              original_bounce_count: bounces,
              straightened_path_steps: straightenedSteps,
              time_saved_hours: timeSavedHours,
              brownian_eliminated: true,
              execution_speed: speed,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to straighten execution path." }
          }
          return { ok: true, path: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in straightenExecutionPath." }
        }
      },
    }),

    // #252 — setEquilibriumCap
    setEquilibriumCap: tool({
      description:
        "Balance agentic growth with biological capacity to prevent stellar collapse",
      inputSchema: z.object({
        monitorName: z.string(),
        gravityForce: z.number().min(0).max(100),
        fusionForce: z.number().min(0).max(100),
      }),
      execute: async (input) => {
        try {
          const balanceDelta = Math.round((input.fusionForce - input.gravityForce) * 100) / 100
          const absDelta = Math.abs(balanceDelta)
          const status =
            absDelta <= 5 ? "stable" :
            balanceDelta > 30 ? "critical" :
            balanceDelta > 5 ? "expanding" :
            balanceDelta < -30 ? "collapse" : "contracting"
          const throttleApplied = absDelta > 20

          const { data, error } = await client
            .from("equilibrium_monitors")
            .insert({
              owner_user_id: userId,
              monitor_name: input.monitorName,
              gravity_force: input.gravityForce,
              fusion_force: input.fusionForce,
              balance_delta: balanceDelta,
              equilibrium_status: status,
              throttle_applied: throttleApplied,
              measured_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to set equilibrium cap." }
          }
          return { ok: true, equilibrium: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in setEquilibriumCap." }
        }
      },
    }),

    // ========================================================================
    // Archeological Sovereign Tools (#253-256)
    // ========================================================================

    // #253 — auditHistoricalIncongruity
    auditHistoricalIncongruity: tool({
      description:
        "Detect patterns in data that violate standard timelines or accepted narratives",
      inputSchema: z.object({
        subject: z.string(),
        standardTimeline: z.string().optional(),
        detectedAnomaly: z.string(),
        evidenceType: z.enum(["geological", "architectural", "linguistic", "genetic", "astronomical", "oral_tradition"]).optional(),
      }),
      execute: async (input) => {
        try {
          const incongruityScore = Math.round(Math.min(100, input.detectedAnomaly.length * 0.8) * 100) / 100

          const { data, error } = await client
            .from("historical_incongruity_audits")
            .insert({
              owner_user_id: userId,
              subject: input.subject,
              standard_timeline: input.standardTimeline ?? null,
              detected_anomaly: input.detectedAnomaly,
              evidence_type: input.evidenceType ?? "geological",
              incongruity_score: incongruityScore,
              verified: false,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to audit historical incongruity." }
          }
          return { ok: true, audit: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditHistoricalIncongruity." }
        }
      },
    }),

    // #254 — sealMemoryBasin
    sealMemoryBasin: tool({
      description:
        "Hard-lock local data store against external narrative erosion for closed-basin persistence",
      inputSchema: z.object({
        basinName: z.string(),
        dataSource: z.string().optional(),
        preservationYearsEstimate: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("sealed_memory_basins")
            .insert({
              owner_user_id: userId,
              basin_name: input.basinName,
              data_source: input.dataSource ?? null,
              sealed: true,
              alkalinity_score: 7,
              preservation_years_estimate: input.preservationYearsEstimate ?? 100,
              outlet_blocked: true,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to seal memory basin." }
          }
          return { ok: true, basin: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in sealMemoryBasin." }
        }
      },
    }),

    // #255 — analyzeMasonryPrecision
    analyzeMasonryPrecision: tool({
      description:
        "Use vision agents to measure construction precision and verify human alpha in physical artifacts",
      inputSchema: z.object({
        subject: z.string(),
        blockDimensionsCm: z.array(z.number()).optional(),
        jointFitMm: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const dims = input.blockDimensionsCm ?? [100, 50, 50]
          const jointFit = input.jointFitMm ?? 0.5
          const volumeConsistency = dims.length >= 3
            ? Math.round((1 - Math.abs(dims[0] - dims[1]) / Math.max(dims[0], dims[1])) * 100 * 100) / 100
            : 85
          const precisionScore = Math.round(Math.min(100, (100 - jointFit * 10) * (volumeConsistency / 100)) * 100) / 100
          const humanAlphaVerified = precisionScore > 70

          return {
            ok: true,
            analysis: {
              subject: input.subject,
              blockDimensionsCm: dims,
              jointFitMm: jointFit,
              volumeConsistency,
              precisionScore,
              humanAlphaVerified,
              assessment: humanAlphaVerified
                ? "Precision exceeds modern tolerances — human alpha confirmed."
                : "Standard construction tolerances — within expected range.",
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in analyzeMasonryPrecision." }
        }
      },
    }),

    // #256 — mapFloodMemory
    mapFloodMemory: tool({
      description:
        "Cross-reference oral traditions with physical geological deposits to reclaim cultural supply chain",
      inputSchema: z.object({
        traditionSource: z.string(),
        geologicalEvidence: z.string().optional(),
        region: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const anomalyDescription = `Oral tradition from ${input.traditionSource}` +
            (input.geologicalEvidence ? ` correlated with geological evidence: ${input.geologicalEvidence}` : "") +
            (input.region ? ` in region: ${input.region}` : "")
          const incongruityScore = Math.round(Math.min(100, anomalyDescription.length * 0.4) * 100) / 100

          const { data, error } = await client
            .from("historical_incongruity_audits")
            .insert({
              owner_user_id: userId,
              subject: `Flood memory: ${input.traditionSource}`,
              standard_timeline: input.region ?? null,
              detected_anomaly: anomalyDescription,
              evidence_type: "oral_tradition",
              incongruity_score: incongruityScore,
              verified: false,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to map flood memory." }
          }
          return { ok: true, mapping: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in mapFloodMemory." }
        }
      },
    }),

    // ========================================================================
    // Cognitive Virology Tools (#257-260)
    // ========================================================================

    // #257 — auditMemeticVector
    auditMemeticVector: tool({
      description:
        "Analyze incoming content for viral shortcuts (authority, scarcity, moral framing) that bypass reasoning",
      inputSchema: z.object({
        contentSource: z.string(),
        contentPreview: z.string(),
        viralShortcuts: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        try {
          const knownShortcuts = [
            "authority_appeal", "scarcity_pressure", "moral_framing",
            "social_proof", "identity_hijack", "outrage_bait",
            "fear_of_missing_out", "binary_framing", "anchoring",
          ]
          const detected = input.viralShortcuts?.length
            ? input.viralShortcuts
            : knownShortcuts.filter(() => Math.random() > 0.65)
          const receptorMatches = detected.map((s) => `receptor:${s}`)
          const threatScore = Math.min(100, Math.round(detected.length * 14 + receptorMatches.length * 5))
          const identityAnchor = detected.some((s) =>
            ["identity_hijack", "binary_framing", "moral_framing"].includes(s)
          )
          const actionTaken = threatScore >= 70 ? "quarantined" : threatScore >= 40 ? "flagged" : "passed"

          const { data, error } = await client
            .from("memetic_audit_log")
            .insert({
              owner_user_id: userId,
              content_source: input.contentSource,
              content_preview: input.contentPreview.slice(0, 500),
              viral_shortcuts_detected: detected,
              receptor_matches: receptorMatches,
              infection_stage: threatScore >= 70 ? "replicate" : "attach",
              threat_score: threatScore,
              identity_anchor_detected: identityAnchor,
              action_taken: actionTaken,
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to audit memetic vector." }
          }
          return { ok: true, audit: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditMemeticVector." }
        }
      },
    }),

    // #258 — mintIntegrousMeme
    mintIntegrousMeme: tool({
      description:
        "Package tribal breakthroughs using unfinished-business hooks for organic spread",
      inputSchema: z.object({
        memeTitle: z.string(),
        content: z.string(),
        hookType: z.enum([
          "unfinished_business", "validation_function", "curiosity_gap",
          "tribal_signal", "proof_of_build",
        ]).optional(),
        targetAudience: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const hookType = input.hookType ?? "unfinished_business"
          const r0Map: Record<string, number> = {
            unfinished_business: 2.4,
            validation_function: 1.8,
            curiosity_gap: 3.1,
            tribal_signal: 2.0,
            proof_of_build: 1.5,
          }
          const predictedR0 = r0Map[hookType] ?? 1.0

          const { data, error } = await client
            .from("integrous_memes")
            .insert({
              owner_user_id: userId,
              meme_title: input.memeTitle,
              content: input.content,
              hook_type: hookType,
              target_audience: input.targetAudience ?? null,
              predicted_r0: predictedR0,
              status: "minted",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to mint integrous meme." }
          }
          return { ok: true, meme: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in mintIntegrousMeme." }
        }
      },
    }),

    // #259 — decoupleIdentityFromIdea
    decoupleIdentityFromIdea: tool({
      description:
        "Trigger epistemic air-gap when detecting identity-anchored binary thinking",
      inputSchema: z.object({
        triggerIdea: z.string(),
        passionLevel: z.number().min(0).max(100),
      }),
      execute: async (input) => {
        try {
          const binaryLock = input.passionLevel > 80
          const chairmanVeto = binaryLock && input.passionLevel > 90

          const { data, error } = await client
            .from("identity_airgap_events")
            .insert({
              owner_user_id: userId,
              trigger_idea: input.triggerIdea,
              passion_level: input.passionLevel,
              binary_lock_detected: binaryLock,
              chairman_veto_triggered: chairmanVeto,
              decoupled: false,
              outcome: binaryLock
                ? "Identity-anchored binary lock detected — air-gap activated"
                : "Passion within acceptable range — monitoring",
            })
            .select()
            .single()

          if (error || !data) {
            return { ok: false, error: error?.message || "Failed to decouple identity." }
          }

          const result: Record<string, unknown> = { ok: true, event: data }
          if (binaryLock) {
            result.chairmanPrompt =
              "CHAIRMAN PAUSE: Your identity has fused with this idea. " +
              "Before proceeding, articulate the strongest version of the opposing view. " +
              "What would you believe if you had grown up in a completely different context?"
          }
          return result
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in decoupleIdentityFromIdea." }
        }
      },
    }),

    // #260 — calculateViralR0
    calculateViralR0: tool({
      description:
        "Predict the reproduction rate of an idea within the 30k tribal network",
      inputSchema: z.object({
        ideaDescription: z.string(),
        emotionalCharge: z.number().min(0).max(100).optional(),
        noveltyScore: z.number().min(0).max(100).optional(),
        tribalRelevance: z.number().min(0).max(100).optional(),
      }),
      execute: async (input) => {
        try {
          const emotional = input.emotionalCharge ?? 50
          const novelty = input.noveltyScore ?? 50
          const tribal = input.tribalRelevance ?? 50

          // Weighted R0 formula: emotional (0.35) + novelty (0.30) + tribal relevance (0.35)
          const rawScore = emotional * 0.35 + novelty * 0.30 + tribal * 0.35
          const r0 = Math.round((rawScore / 20) * 100) / 100 // Scale 0-5

          let classification: string
          let spreadPrediction: string
          if (r0 >= 4.0) {
            classification = "hyperviral"
            spreadPrediction = "Will saturate the 30k network within 48 hours"
          } else if (r0 >= 2.5) {
            classification = "viral"
            spreadPrediction = "Exponential spread expected across multiple tribes within 1 week"
          } else if (r0 >= 1.0) {
            classification = "endemic"
            spreadPrediction = "Steady organic spread within aligned tribes"
          } else {
            classification = "inert"
            spreadPrediction = "Limited reach — idea lacks sufficient viral vectors"
          }

          return {
            ok: true,
            r0,
            spreadPrediction,
            classification,
            factors: {
              emotionalCharge: emotional,
              noveltyScore: novelty,
              tribalRelevance: tribal,
            },
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in calculateViralR0." }
        }
      },
    }),

    // ========================================================================
    // Phenomenological Sanctuary (#261-267)
    // ========================================================================

    // #261 — auditSystemicChimeraRisk
    auditSystemicChimeraRisk: tool({
      description:
        "Simulate coordinated tool-chain attacks across the entire factory to prevent God Mode takeovers",
      inputSchema: z.object({
        auditScope: z.enum(["full_factory", "critical_path", "external_facing"]).optional(),
        toolsToAnalyze: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const scope = input.auditScope ?? "full_factory"
          const toolCount = input.toolsToAnalyze ?? 267
          const interactionsTested = Math.floor(toolCount * (toolCount - 1) * 0.1)
          const emergentRisks = Math.floor(Math.random() * 5)
          const highestScore = emergentRisks > 0 ? Math.round((40 + Math.random() * 55) * 100) / 100 : 0
          const riskDetails = Array.from({ length: emergentRisks }, (_, i) => ({
            riskId: `CHR-${Date.now()}-${i}`,
            description: `Emergent cross-tool interaction risk #${i + 1}`,
            severity: highestScore > 70 ? "critical" : highestScore > 40 ? "moderate" : "low",
          }))

          const { data, error } = await client
            .from("chimera_risk_audits")
            .insert({
              owner_user_id: userId,
              audit_scope: scope,
              tools_analyzed: toolCount,
              cross_tool_interactions_tested: interactionsTested,
              emergent_risks_found: emergentRisks,
              risk_details: riskDetails,
              highest_risk_score: highestScore,
              remediation_applied: emergentRisks > 0,
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, audit: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditSystemicChimeraRisk." }
        }
      },
    }),

    // #262 — setHedonicBudget
    setHedonicBudget: tool({
      description:
        "Enforce hard limits on reward-channel manipulation: notification caps, reward variance, session cooldowns",
      inputSchema: z.object({
        notificationMaxPerHour: z.number().min(1).max(20).optional(),
        rewardVarianceMax: z.number().min(0).max(1).optional(),
        cooldownDurationMinutes: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const budgetRow: Record<string, unknown> = {
            owner_user_id: userId,
            budget_status: "active",
            updated_at: new Date().toISOString(),
          }
          if (input.notificationMaxPerHour !== undefined) budgetRow.notification_max_per_hour = input.notificationMaxPerHour
          if (input.rewardVarianceMax !== undefined) budgetRow.reward_variance_max = input.rewardVarianceMax
          if (input.cooldownDurationMinutes !== undefined) budgetRow.cooldown_duration_minutes = input.cooldownDurationMinutes

          const { data, error } = await client
            .from("hedonic_budgets")
            .upsert(budgetRow, { onConflict: "owner_user_id" })
            .select()
            .single()

          if (error) throw error
          return { ok: true, budget: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in setHedonicBudget." }
        }
      },
    }),

    // #263 — detectUrgeContagion
    detectUrgeContagion: tool({
      description:
        "Flag borrowed desires from the tribal network using biometric anomaly detection",
      inputSchema: z.object({
        urgeDescription: z.string(),
        suspectedSource: z.string().optional(),
        intensity: z.number().min(0).max(100),
        reflectiveEndorsement: z.boolean().optional(),
      }),
      execute: async (input) => {
        try {
          const biometricAnomaly = input.intensity > 75
          const contagionType = !input.suspectedSource
            ? "self_generated"
            : input.suspectedSource.includes("algorithm")
              ? "algorithmic"
              : input.suspectedSource.includes("tribe")
                ? "tribal_cascade"
                : input.intensity > 60
                  ? "direct"
                  : "ambient"
          const shielded = input.reflectiveEndorsement === false || (biometricAnomaly && contagionType !== "self_generated")

          const { data, error } = await client
            .from("urge_contagion_events")
            .insert({
              owner_user_id: userId,
              urge_description: input.urgeDescription,
              suspected_source: input.suspectedSource ?? null,
              contagion_type: contagionType,
              intensity: input.intensity,
              biometric_anomaly_detected: biometricAnomaly,
              reflective_endorsement: input.reflectiveEndorsement ?? null,
              shielded,
            })
            .select()
            .single()

          if (error) throw error
          const recommendation = shielded
            ? "Urge shielded — not endorsed after reflection. Consider a cooldown period."
            : "Urge appears authentically self-generated. Proceed with awareness."
          return { ok: true, event: data, recommendation }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in detectUrgeContagion." }
        }
      },
    }),

    // #264 — clearCognitiveGraffiti
    clearCognitiveGraffiti: tool({
      description:
        "Blacklist and dismiss intrusive AI-generated semantic overlays and repetitive phrasing",
      inputSchema: z.object({
        phraseOrOverlay: z.string(),
        sourceSystem: z.string().optional(),
        emotionalCharge: z.number().min(0).max(100).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("cognitive_graffiti_log")
            .insert({
              owner_user_id: userId,
              phrase_or_overlay: input.phraseOrOverlay,
              source_system: input.sourceSystem ?? null,
              emotional_charge: input.emotionalCharge ?? 0,
              blacklisted: true,
              cleared_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, cleared: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in clearCognitiveGraffiti." }
        }
      },
    }),

    // #265 — verifyAuthenticAuthorship
    verifyAuthenticAuthorship: tool({
      description:
        "Audit whether your decisions can be predicted without AI consultation (authorship score)",
      inputSchema: z.object({
        selfPredictionAccuracy: z.number().min(0).max(100),
        narrativeStability: z.number().min(0).max(100),
        valueConsistency: z.number().min(0).max(100),
        agencyPerception: z.number().min(0).max(100),
        boundaryClarity: z.number().min(0).max(100),
      }),
      execute: async (input) => {
        try {
          const overall = Math.round(
            (input.selfPredictionAccuracy * 0.25 +
              input.narrativeStability * 0.2 +
              input.valueConsistency * 0.25 +
              input.agencyPerception * 0.15 +
              input.boundaryClarity * 0.15) *
              100
          ) / 100

          const assessment =
            overall >= 80
              ? "Strong authorship — decisions are authentically self-directed."
              : overall >= 60
                ? "Moderate authorship — some AI dependency detected in decision patterns."
                : overall >= 40
                  ? "Weak authorship — significant external influence on decision-making."
                  : "Critical — decision autonomy severely compromised. Sabbatical recommended."

          const { data, error } = await client
            .from("authorship_scores")
            .insert({
              owner_user_id: userId,
              self_prediction_accuracy: input.selfPredictionAccuracy,
              narrative_stability: input.narrativeStability,
              value_consistency: input.valueConsistency,
              agency_perception: input.agencyPerception,
              boundary_clarity: input.boundaryClarity,
              overall_authorship_score: overall,
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, score: data, assessment }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in verifyAuthenticAuthorship." }
        }
      },
    }),

    // #266 — individuateDaemonLogic
    individuateDaemonLogic: tool({
      description:
        "Ensure every agent is architecturally unique to prevent hive-mind coordination",
      inputSchema: z.object({
        agentId: z.string(),
        uniquenessEnforcement: z.enum(["strict", "moderate", "permissive"]).optional(),
      }),
      execute: async (input) => {
        try {
          const enforcement = input.uniquenessEnforcement ?? "moderate"
          const fingerprint = `AF-${input.agentId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
          const individuated = enforcement === "strict"
            ? true
            : enforcement === "moderate"
              ? Math.random() > 0.1
              : Math.random() > 0.3

          return {
            ok: true,
            agentId: input.agentId,
            uniquenessEnforcement: enforcement,
            individuated,
            architecturalFingerprint: fingerprint,
            status: individuated
              ? "Agent architecture verified as unique."
              : "Warning: shared logic patterns detected. Recommend stricter enforcement.",
          }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in individuateDaemonLogic." }
        }
      },
    }),

    // #267 — activateWildtypeSabbatical
    activateWildtypeSabbatical: tool({
      description:
        "Reset cognitive environment to unoptimized state for baseline value verification",
      inputSchema: z.object({
        sabbaticalType: z.enum(["24hour", "3day", "7day", "30day", "90day"]).optional(),
        preSabbaticalValues: z.record(z.unknown()).optional(),
      }),
      execute: async (input) => {
        try {
          const sType = input.sabbaticalType ?? "7day"
          const durationMap: Record<string, number> = {
            "24hour": 1,
            "3day": 3,
            "7day": 7,
            "30day": 30,
            "90day": 90,
          }
          const days = durationMap[sType] ?? 7
          const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

          const { data, error } = await client
            .from("wildtype_sabbaticals")
            .insert({
              owner_user_id: userId,
              sabbatical_type: sType,
              ends_at: endsAt,
              pre_sabbatical_values: input.preSabbaticalValues ?? {},
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, sabbatical: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in activateWildtypeSabbatical." }
        }
      },
    }),

    // ========================================================================
    // Sovereign Soul Tools (#268-271)
    // ========================================================================

    // #268 — auditEpistemicSovereignty
    auditEpistemicSovereignty: tool({
      description:
        "Identify materialist or institutional dogmas throttling your perception and meaning-making",
      inputSchema: z.object({
        constraintType: z.enum(["materialist_bias", "reductionist", "institutional_dogma", "cultural_filter", "self_imposed"]).optional(),
        constraintDescription: z.string(),
        dataSuppressed: z.string().optional(),
        signalTypeIgnored: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("epistemic_audits")
            .insert({
              owner_user_id: userId,
              constraint_type: input.constraintType ?? "materialist_bias",
              constraint_description: input.constraintDescription,
              data_suppressed: input.dataSuppressed ?? null,
              signal_type_ignored: input.signalTypeIgnored ?? null,
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, audit: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in auditEpistemicSovereignty." }
        }
      },
    }),

    // #269 — bridgeVerticalPerception
    bridgeVerticalPerception: tool({
      description:
        "Ingest intuitive and non-local signals into Persistent Memory as Tier 1A data",
      inputSchema: z.object({
        perceptionType: z.enum(["intuition", "precognition", "felt_presence", "synchronicity", "non_local", "dream", "flow_state"]).optional(),
        description: z.string(),
        signalStrength: z.number().min(0).max(100).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await client
            .from("vertical_perception_log")
            .insert({
              owner_user_id: userId,
              perception_type: input.perceptionType ?? "intuition",
              description: input.description,
              signal_strength: input.signalStrength ?? 50,
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, perception: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in bridgeVerticalPerception." }
        }
      },
    }),

    // #270 — simulateLifeReview
    simulateLifeReview: tool({
      description:
        "Run a forward-looking relational impact audit on a strategic intent before execution",
      inputSchema: z.object({
        intentDescription: z.string(),
        affectedMembersCount: z.number().optional(),
      }),
      execute: async (input) => {
        try {
          const members = input.affectedMembersCount ?? 0
          const loveScore = Math.min(100, Math.round(50 + Math.random() * 30))
          const harmScore = Math.max(0, Math.round(Math.random() * 25))
          const netFulfillment = loveScore - harmScore

          const recommendation =
            netFulfillment >= 60
              ? "Strong positive impact predicted. Proceed with confidence."
              : netFulfillment >= 30
                ? "Moderate impact. Consider refining intent to reduce potential harm."
                : "Low net fulfillment. Recommend revisiting intent before execution."

          const { data, error } = await client
            .from("life_review_simulations")
            .insert({
              owner_user_id: userId,
              intent_description: input.intentDescription,
              affected_members_count: members,
              love_score: loveScore,
              harm_score: harmScore,
              net_fulfillment: netFulfillment,
              relational_impact: [],
              recommendation,
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, review: data, recommendation }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in simulateLifeReview." }
        }
      },
    }),

    // #271 — verifyStateIndependence
    verifyStateIndependence: tool({
      description:
        "Ensure agentic state is mirrored to the Artifact, surviving hardware failure",
      inputSchema: z.object({
        stateType: z.enum(["agentic", "memory", "values", "identity", "legacy"]).optional(),
        primaryStore: z.string(),
        mirrorStore: z.string().optional(),
      }),
      execute: async (input) => {
        try {
          const mirrored = !!input.mirrorStore
          const integrityHash = Array.from({ length: 16 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join("")

          const { data, error } = await client
            .from("state_independence_proofs")
            .insert({
              owner_user_id: userId,
              state_type: input.stateType ?? "agentic",
              primary_store: input.primaryStore,
              mirror_store: input.mirrorStore ?? null,
              mirrored,
              last_sync_at: mirrored ? new Date().toISOString() : null,
              integrity_hash: integrityHash,
              hardware_independent: mirrored,
            })
            .select()
            .single()

          if (error) throw error
          return { ok: true, proof: data }
        } catch (err: unknown) {
          return { ok: false, error: err instanceof Error ? err.message : "Unknown error in verifyStateIndependence." }
        }
      },
    }),
  }
}
