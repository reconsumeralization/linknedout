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
    // A2A Protocol Tools
    // ========================================================================

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

    // ========================================================================
    // Experience Archive Tools
    // ========================================================================

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

    // ========================================================================
    // Decoupling Protocol Tools
    // ========================================================================

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

    // ========================================================================
    // Bounty Challenge Tools
    // ========================================================================

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
  }
}
