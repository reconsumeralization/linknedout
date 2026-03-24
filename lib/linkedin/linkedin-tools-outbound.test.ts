import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createClientMock = vi.fn()
const publishLinkedinTextShareForUser = vi.fn()
const recordLinkedinShareAudit = vi.fn()

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

vi.mock("@/lib/linkedin/linkedin-share-server", () => ({
  publishLinkedinTextShareForUser: (...args: unknown[]) =>
    publishLinkedinTextShareForUser(...args),
  recordLinkedinShareAudit: (...args: unknown[]) => recordLinkedinShareAudit(...args),
}))

const ORIGINAL_ENV = { ...process.env }

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
}

function buildAuthContext() {
  return {
    accessToken: "supabase-token",
    userId: "user-1",
    email: "user@example.com",
    issuer: "https://example.supabase.co/auth/v1",
    audiences: ["authenticated"],
    scopes: [],
    tokenClaims: null,
    isSupabaseSession: true,
  }
}

function createOrderedQuery(result: { data: unknown; error: unknown }) {
  const query = {
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    range: vi.fn(async () => result),
  }
  return query
}

describe("linkedin outbound tools", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetEnv()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
  })

  afterEach(() => {
    resetEnv()
  })

  it("publishes postContent through the LinkedIn share helper", async () => {
    publishLinkedinTextShareForUser.mockResolvedValue({
      ok: true,
      ugcPostId: "ugc-123",
      auditId: "audit-1",
      publishedAt: "2026-03-05T12:00:00.000Z",
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.postContent.execute?.(
      {
        content: "Hiring for staff platform engineers.",
        contentType: "post",
        visibility: "public",
        scheduledTime: null,
        hashtags: ["Hiring"],
        mediaUrl: null,
      },
      { toolCallId: "call-post-publish", messages: [] },
    )

    expect(publishLinkedinTextShareForUser).toHaveBeenCalledWith({
      userId: "user-1",
      text: "Hiring for staff platform engineers.\n\n#Hiring",
      visibility: "PUBLIC",
      retryOnRateLimit: false,
      audit: {
        shareType: "text",
        requestLinkUrl: null,
        metadata: {
          source: "tool",
          requestedContentType: "post",
          warnings: [],
        },
      },
    })
    expect(result).toMatchObject({
      ok: true,
      status: "published",
      postId: "ugc-123",
      shareAuditId: "audit-1",
      source: "linkedin",
    })
  })

  it("stores scheduled postContent drafts without publishing immediately", async () => {
    recordLinkedinShareAudit.mockResolvedValue({ auditId: "audit-scheduled" })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.postContent.execute?.(
      {
        content: "Quarterly founder update.",
        contentType: "article",
        visibility: "connections",
        scheduledTime: "2026-03-10T15:00:00.000Z",
        hashtags: null,
        mediaUrl: "https://example.com/update",
      },
      { toolCallId: "call-post-schedule", messages: [] },
    )

    expect(recordLinkedinShareAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        linkedinSubject: "scheduled:user-1",
        responseStatus: 102,
        scheduledAt: "2026-03-10T15:00:00.000Z",
      }),
    )
    expect(publishLinkedinTextShareForUser).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      status: "scheduled",
      shareAuditId: "audit-scheduled",
      contentType: "article",
      publishedFormat: "text",
      visibility: "connections",
    })
  })

  it("returns a workspace-backed manual send draft for sendMessage", async () => {
    const inMock = vi.fn(async () => ({
      data: [
        {
          id: "p-1",
          first_name: "Ada",
          last_name: "Lovelace",
          headline: "Senior Data Engineer",
          company: "Acme",
          location: "Remote",
          industry: "Technology",
          skills: ["Python", "SQL"],
          tribe: "Builder Core",
        },
      ],
      error: null,
    }))
    const draftInsertSingleMock = vi.fn(async () => ({
      data: {
        id: "msg-draft-1",
        profile_id: "p-1",
        channel: "inmail",
        subject: null,
        body_text: "Would love to compare notes on hiring platform engineers this quarter.",
        delivery_status: "draft_ready",
        created_at: "2026-03-05T10:00:00.000Z",
        updated_at: "2026-03-05T10:00:00.000Z",
      },
      error: null,
    }))
    const fromMock = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({ in: inMock })),
        }
      }
      if (table === "linkedin_message_drafts") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: draftInsertSingleMock,
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.sendMessage.execute?.(
      {
        recipientId: "p-1",
        subject: null,
        message: "Would love to compare notes on hiring platform engineers this quarter.",
        isInMail: true,
      },
      { toolCallId: "call-send-message", messages: [] },
    )

    expect(fromMock).toHaveBeenCalledWith("profiles")
    expect(fromMock).toHaveBeenCalledWith("linkedin_message_drafts")
    expect(result).toMatchObject({
      ok: true,
      status: "draft_ready",
      draftId: "msg-draft-1",
      channel: "linkedin_inmail",
      source: "supabase",
      dataQuality: "draft_only",
      persisted: true,
      recipient: {
        id: "p-1",
        name: "Ada Lovelace",
      },
    })
  })

  it("builds getConversations from persisted linkedin draft tables", async () => {
    const draftQuery = createOrderedQuery({
      data: [
        {
          id: "msg-1",
          profile_id: "p-1",
          channel: "message",
          subject: null,
          body_text: "Checking in after our last platform conversation.",
          delivery_status: "draft_ready",
          created_at: "2026-03-05T09:00:00.000Z",
          updated_at: "2026-03-05T09:00:00.000Z",
        },
      ],
      error: null,
    })
    const requestQuery = createOrderedQuery({
      data: [
        {
          id: "req-1",
          profile_id: "p-2",
          note: "Would value your perspective on platform hiring.",
          request_status: "manual_sent",
          sent_at: "2026-03-04T12:00:00.000Z",
          created_at: "2026-03-04T11:00:00.000Z",
          updated_at: "2026-03-04T12:00:00.000Z",
        },
      ],
      error: null,
    })
    const profilesQuery = createOrderedQuery({
      data: [
        {
          id: "p-1",
          first_name: "Ada",
          last_name: "Lovelace",
          headline: "Senior Data Engineer",
          company: "Acme",
          location: "Remote",
          industry: "Technology",
          skills: ["Python"],
          updated_at: "2026-03-05T08:00:00.000Z",
        },
        {
          id: "p-2",
          first_name: "Grace",
          last_name: "Hopper",
          headline: "Staff Platform Engineer",
          company: "Acme",
          location: "New York",
          industry: "Technology",
          skills: ["Go"],
          updated_at: "2026-03-04T08:00:00.000Z",
        },
      ],
      error: null,
    })
    const fromMock = vi.fn((table: string) => {
      if (table === "linkedin_message_drafts") {
        return {
          select: vi.fn(() => draftQuery),
        }
      }
      if (table === "linkedin_connection_requests") {
        return {
          select: vi.fn(() => requestQuery),
        }
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => profilesQuery),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.getConversations.execute?.(
      {
        status: "all",
        limit: 5,
      },
      { toolCallId: "call-get-conversations", messages: [] },
    )

    expect(result).toMatchObject({
      source: "supabase",
      dataQuality: "manual_outreach",
      totalResults: 2,
    })
    if (!result || typeof result !== "object" || !("conversations" in result)) {
      throw new Error("Expected getConversations to return a conversation list.")
    }
    expect(result.conversations).toEqual([
      expect.objectContaining({
        participant: "Ada Lovelace",
        status: "unread",
        pendingDrafts: 1,
        pendingConnectionRequests: 0,
      }),
      expect.objectContaining({
        participant: "Grace Hopper",
        status: "read",
        pendingDrafts: 0,
        pendingConnectionRequests: 0,
      }),
    ])
  })

  it("returns derived getProfileDetails output with requested fields", async () => {
    const inMock = vi.fn(async () => ({
      data: [
        {
          id: "p-1",
          first_name: "Ada",
          last_name: "Lovelace",
          headline: "Senior Data Engineer",
          company: "Acme",
          location: "Remote",
          industry: "Technology",
          skills: ["Python", "SQL"],
          seniority: "Senior",
          tribe: "Builder Core",
          created_at: "2025-05-01T00:00:00.000Z",
          updated_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      error: null,
    }))
    const fromMock = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({ in: inMock })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.getProfileDetails.execute?.(
      {
        profileId: "p-1",
        fields: ["summary", "positions", "education"],
      },
      { toolCallId: "call-profile-details", messages: [] },
    )

    expect(result).toMatchObject({
      source: "supabase",
      dataQuality: "derived",
      profile: {
        id: "p-1",
        summary: expect.stringContaining("Senior Data Engineer at Acme"),
        positions: [
          expect.objectContaining({
            title: "Senior Data Engineer",
            company: "Acme",
          }),
        ],
        education: [
          expect.objectContaining({
            school: "Education not captured in workspace CRM",
          }),
        ],
      },
    })
    if (!result || typeof result !== "object" || !("profile" in result)) {
      throw new Error("Expected getProfileDetails to return a profile payload.")
    }
    expect(result.profile).not.toHaveProperty("title")
  })

  it("designs tribes with required skills represented across the group instead of per-profile hard filtering", async () => {
    const profileRows = [
      {
        id: "p-1",
        first_name: "Ada",
        last_name: "Lovelace",
        headline: "Senior Data Engineer",
        company: "Acme",
        location: "Remote",
        industry: "Technology",
        skills: ["Python", "SQL"],
        match_score: 91,
        connections: 900,
        seniority: "Senior",
        updated_at: "2026-03-05T08:00:00.000Z",
      },
      {
        id: "p-2",
        first_name: "Grace",
        last_name: "Hopper",
        headline: "Staff Platform Engineer",
        company: "Acme",
        location: "New York",
        industry: "Technology",
        skills: ["Go", "Distributed Systems"],
        match_score: 95,
        connections: 1200,
        seniority: "Staff",
        updated_at: "2026-03-05T07:00:00.000Z",
      },
      {
        id: "p-3",
        first_name: "Katherine",
        last_name: "Johnson",
        headline: "Product Manager",
        company: "Orbit",
        location: "Austin",
        industry: "SaaS",
        skills: ["Roadmapping", "Analytics"],
        match_score: 82,
        connections: 500,
        seniority: "Mid",
        updated_at: "2026-03-05T06:00:00.000Z",
      },
    ]
    const profileRangeMock = vi.fn(async () => ({
      data: profileRows,
      error: null,
    }))
    const fromMock = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
            if (options?.head) {
              return Promise.resolve({
                count: profileRows.length,
                error: null,
              })
            }
            return {
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: profileRangeMock,
                })),
              })),
            }
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.designTribesForObjective.execute?.(
      {
        objective: "Launch a platform modernization team",
        desiredTribeCount: 1,
        desiredTribeSize: 2,
        requiredSkills: ["Python", "Go"],
        preferLocations: null,
      },
      { toolCallId: "call-design-tribe", messages: [] },
    )

    expect(result).toMatchObject({
      ok: true,
      effectiveTribeCount: 1,
      candidatePoolSize: 3,
      filtersApplied: {
        requiredSkills: ["Python", "Go"],
      },
    })
    if (!result || typeof result !== "object" || !("designedTribes" in result)) {
      throw new Error("Expected designTribesForObjective to return designed tribes.")
    }
    const designedTribes = result.designedTribes || []
    expect(designedTribes[0]).toMatchObject({
      memberCount: 2,
      missingRequiredSkills: [],
    })
    expect(designedTribes[0]?.profileIds).toHaveLength(2)
    expect(designedTribes[0]?.profileIds).toEqual(expect.arrayContaining(["p-1", "p-2"]))
  })

  it("applies createTribe constraints during persisted formation", async () => {
    const profileRows = [
      {
        id: "p-1",
        first_name: "Ada",
        last_name: "Lovelace",
        headline: "Senior Data Engineer",
        company: "Acme",
        location: "Remote",
        industry: "Technology",
        skills: ["Python", "SQL"],
        match_score: 91,
        connections: 900,
        seniority: "Senior",
      },
      {
        id: "p-2",
        first_name: "Grace",
        last_name: "Hopper",
        headline: "Staff Platform Engineer",
        company: "Acme",
        location: "New York",
        industry: "Technology",
        skills: ["Python", "Go", "Distributed Systems"],
        match_score: 95,
        connections: 1200,
        seniority: "Staff",
      },
      {
        id: "p-3",
        first_name: "Katherine",
        last_name: "Johnson",
        headline: "Product Manager",
        company: "Orbit",
        location: "Austin",
        industry: "SaaS",
        skills: ["Roadmapping", "SQL", "Analytics"],
        match_score: 82,
        connections: 500,
        seniority: "Mid",
      },
      {
        id: "p-4",
        first_name: "Radia",
        last_name: "Perlman",
        headline: "Senior UX Researcher",
        company: "Acme",
        location: "Boston",
        industry: "Technology",
        skills: ["Research", "Python", "Design Systems"],
        match_score: 86,
        connections: 640,
        seniority: "Senior",
      },
    ]
    const inMock = vi.fn(async () => ({
      data: profileRows,
      error: null,
    }))
    const insertedRows: Array<Record<string, unknown>> = []
    const tribeInsertMock = vi.fn((payload: Record<string, unknown>) => {
      insertedRows.push(payload)
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: payload,
            error: null,
          })),
        })),
      }
    })
    const profileUpdateInMock = vi.fn(async () => ({
      error: null,
    }))
    const fromMock = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({ in: inMock })),
          update: vi.fn(() => ({
            in: profileUpdateInMock,
          })),
        }
      }
      if (table === "tribes") {
        return {
          insert: tribeInsertMock,
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.createTribe.execute?.(
      {
        tribeName: "Launch Crew",
        profileIds: ["p-1", "p-2", "p-3", "p-4"],
        tribePurpose: "Launch tiger team",
        tribeSize: 2,
        optimizeFor: "balanced",
        constraints: {
          mustIncludeSkills: ["Python"],
          minSeniorityLevel: "Senior",
          maxOverlapPercent: 80,
        },
      },
      { toolCallId: "call-create-tribe", messages: [] },
    )

    expect(result).toMatchObject({
      ok: true,
      source: "supabase",
      requestedProfiles: 4,
      totalProfiles: 4,
      constraintsApplied: {
        mustIncludeSkills: ["Python"],
        minSeniorityLevel: "Senior",
        tribesCreated: 2,
      },
    })
    expect(insertedRows).toHaveLength(2)
    expect(insertedRows.map((row) => row.name)).toEqual(["Launch Crew 1", "Launch Crew 2"])
    const insertedMembers = insertedRows.map((row) => row.members as Array<Record<string, unknown>>)
    expect(
      insertedMembers.every((members) =>
        members.some((member) => member.skills && Array.isArray(member.skills) && member.skills.includes("Python")),
      ),
    ).toBe(true)
    expect(
      insertedMembers.every((members) =>
        members.some((member) => ["Senior", "Staff", "Lead", "Executive", "Principal"].includes(String(member.seniority))),
      ),
    ).toBe(true)
  })

  it("persists manual linkedin connection request drafts", async () => {
    const inMock = vi.fn(async () => ({
      data: [
        {
          id: "p-2",
          first_name: "Grace",
          last_name: "Hopper",
          headline: "Staff Platform Engineer",
          company: "Acme",
          location: "New York",
          industry: "Technology",
          skills: ["Go", "Distributed Systems"],
        },
      ],
      error: null,
    }))
    const requestInsertSingleMock = vi.fn(async () => ({
      data: {
        id: "req-2",
        profile_id: "p-2",
        note: "Would love to connect around platform hiring.",
        request_status: "draft_ready",
        created_at: "2026-03-05T11:00:00.000Z",
        updated_at: "2026-03-05T11:00:00.000Z",
      },
      error: null,
    }))
    const fromMock = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({ in: inMock })),
        }
      }
      if (table === "linkedin_connection_requests") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: requestInsertSingleMock,
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.sendConnectionRequest.execute?.(
      {
        profileId: "p-2",
        note: "Would love to connect around platform hiring.",
      },
      { toolCallId: "call-send-connection-request", messages: [] },
    )

    expect(fromMock).toHaveBeenCalledWith("linkedin_connection_requests")
    expect(result).toMatchObject({
      ok: true,
      status: "draft_ready",
      requestId: "req-2",
      source: "supabase",
      dataQuality: "draft_only",
      persisted: true,
      recipient: {
        id: "p-2",
        name: "Grace Hopper",
      },
    })
  })

  it("derives getProfileConnections from workspace and LinkedOut signals", async () => {
    const profilesQuery = createOrderedQuery({
      data: [
        {
          id: "p-1",
          first_name: "Ada",
          last_name: "Lovelace",
          headline: "Senior Data Engineer",
          company: "Acme",
          location: "Remote",
          industry: "Technology",
          skills: ["Python", "SQL", "Machine Learning"],
          match_score: 91,
          connections: 900,
          seniority: "Senior",
          tribe: "Builder Core",
          updated_at: "2026-03-05T08:00:00.000Z",
        },
        {
          id: "p-2",
          first_name: "Grace",
          last_name: "Hopper",
          headline: "Staff Platform Engineer",
          company: "Acme",
          location: "New York",
          industry: "Technology",
          skills: ["Python", "Go", "Distributed Systems"],
          match_score: 95,
          connections: 1200,
          seniority: "Staff",
          tribe: "Builder Core",
          updated_at: "2026-03-05T07:00:00.000Z",
        },
        {
          id: "p-3",
          first_name: "Katherine",
          last_name: "Johnson",
          headline: "Product Manager",
          company: "Orbit",
          location: "Austin",
          industry: "SaaS",
          skills: ["Roadmapping", "SQL", "Analytics"],
          match_score: 82,
          connections: 500,
          seniority: "Mid",
          tribe: "Product Guild",
          updated_at: "2026-03-05T06:00:00.000Z",
        },
      ],
      error: null,
    })
    const contactStatesQuery = createOrderedQuery({
      data: [
        {
          profile_id: "p-2",
          objective_id: "obj-1",
          queue_status: "intro",
          score: 82,
          relationship_strength: 76,
          freshness: 68,
          updated_at: "2026-03-05T09:00:00.000Z",
        },
      ],
      error: null,
    })
    const outreachEventsQuery = createOrderedQuery({
      data: [
        {
          profile_id: "p-2",
          event_type: "intro_generated",
          created_at: "2026-03-04T11:00:00.000Z",
        },
      ],
      error: null,
    })
    const fromMock = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => profilesQuery),
        }
      }
      if (table === "linkedout_contact_states") {
        return {
          select: vi.fn(() => contactStatesQuery),
        }
      }
      if (table === "linkedout_outreach_events") {
        return {
          select: vi.fn(() => outreachEventsQuery),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    createClientMock.mockReturnValue({
      from: fromMock,
    })

    const { createLinkedinTools } = await import("@/lib/linkedin/linkedin-tools")
    const tools = createLinkedinTools(buildAuthContext())
    const result = await tools.getProfileConnections.execute?.(
      {
        profileId: "p-1",
        degree: 1,
        limit: 5,
      },
      { toolCallId: "call-profile-connections", messages: [] },
    )

    expect(result).toMatchObject({
      source: "supabase",
      dataQuality: "derived",
      profileId: "p-1",
      profileName: "Ada Lovelace",
    })
    if (!result || typeof result !== "object" || !("connections" in result)) {
      throw new Error("Expected getProfileConnections to return connection rows.")
    }
    expect(result.connections).toEqual([
      expect.objectContaining({
        profileId: "p-2",
        degree: 1,
        queueStatus: "intro",
      }),
    ])
  })
})
