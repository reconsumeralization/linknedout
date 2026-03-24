import { describe, expect, it } from "vitest"
import {
  buildLinkedinConversationSummaries,
  buildLinkedinMessageDraft,
  buildLinkedinPostPlan,
  buildNetworkAnalysisFromWorkspace,
  buildPostAnalyticsFromShareAudit,
  buildDerivedProfileDetails,
  buildProfileRecommendationsFromWorkspace,
  buildProfileViewAnalytics,
  buildSkillInsights,
  buildTribeCreationInsights,
  buildWorkspaceProfileConnections,
  buildWorkspaceGroupSearchResults,
  buildWorkspaceCompanySearchResults,
  buildWorkspaceJobListings,
  buildWorkspaceCompanyEmployees,
  createLinkedinTools,
  filterProfilesForSkillsAnalysis,
  planTribeFormationGroups,
  pickProfileDetailFields,
} from "@/lib/linkedin/linkedin-tools"

const profiles = [
  {
    id: "p-1",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    headline: "Senior Data Engineer",
    company: "Acme",
    location: "Remote",
    industry: "Technology",
    connections: 900,
    skills: ["Python", "SQL", "Machine Learning"],
    matchScore: 91,
    seniority: "Senior",
    createdAt: "2025-05-01T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
  },
  {
    id: "p-2",
    firstName: "Grace",
    lastName: "Hopper",
    fullName: "Grace Hopper",
    headline: "Staff Platform Engineer",
    company: "Acme",
    location: "New York",
    industry: "Technology",
    connections: 1200,
    skills: ["Python", "Go", "Distributed Systems"],
    matchScore: 95,
    seniority: "Staff",
    createdAt: "2024-12-15T00:00:00.000Z",
    updatedAt: "2026-02-14T00:00:00.000Z",
  },
  {
    id: "p-3",
    firstName: "Katherine",
    lastName: "Johnson",
    fullName: "Katherine Johnson",
    headline: "Product Manager",
    company: "Orbit",
    location: "Austin",
    industry: "SaaS",
    connections: 500,
    skills: ["Roadmapping", "SQL", "Analytics"],
    matchScore: 82,
    seniority: "Mid",
    createdAt: "2024-06-10T00:00:00.000Z",
    updatedAt: "2025-07-20T00:00:00.000Z",
  },
]

describe("linkedin-tools helpers", () => {
  it("filters profiles for skills analysis by profile ids, company, and industry", () => {
    const selected = filterProfilesForSkillsAnalysis([...profiles], {
      profileIds: ["p-1", "p-3"],
      companyId: "acme",
      industry: "tech",
    })

    expect(selected.map((profile) => profile.id)).toEqual(["p-1"])
  })

  it("builds top skill insights with recent trend detection", () => {
    const insights = buildSkillInsights([...profiles], {
      now: new Date("2026-03-01T00:00:00.000Z"),
      limit: 3,
    })

    expect(insights).toEqual([
      { name: "Python", frequency: 66.7, avgEndorsements: 50, trending: true },
      { name: "SQL", frequency: 66.7, avgEndorsements: 43, trending: false },
      { name: "Distributed Systems", frequency: 33.3, avgEndorsements: 52, trending: true },
    ])
  })

  it("builds real company employee results from workspace profiles", () => {
    const result = buildWorkspaceCompanyEmployees(
      [...profiles],
      {
        companyId: "Acme",
        department: "engineering",
        seniorityLevel: null,
        limit: 5,
      },
      { now: new Date("2026-03-01T00:00:00.000Z") },
    )

    expect(result).toEqual({
      company: "Acme",
      totalEmployees: 2,
      employees: [
        {
          name: "Grace Hopper",
          title: "Staff Platform Engineer",
          department: "Engineering",
          tenure: "1.3 years in CRM",
          location: "New York",
        },
        {
          name: "Ada Lovelace",
          title: "Senior Data Engineer",
          department: "Engineering",
          tenure: "10 months in CRM",
          location: "Remote",
        },
      ],
    })
  })

  it("aggregates workspace companies for search", () => {
    const companies = buildWorkspaceCompanySearchResults(
      [...profiles],
      {
        name: "ac",
        industry: "tech",
        size: "1-10",
        location: null,
      },
      { now: new Date("2026-03-01T00:00:00.000Z") },
    )

    expect(companies).toEqual([
      {
        id: "company-acme",
        name: "Acme",
        industry: "Technology",
        size: "1-10",
        headquarters: "New York",
        employeeCount: 2,
        growthRate: "200%",
        founded: 2024,
      },
    ])
  })

  it("builds job listings from open project positions", () => {
    const jobs = buildWorkspaceJobListings(
      [
        {
          id: "proj-1",
          name: "Q2 Engineering Hiring",
          description: "Expand the platform team",
          type: "hiring",
          status: "active",
          owner: "Acme",
          tribe: "Remote",
          created_at: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "proj-2",
          name: "Closed Search",
          status: "completed",
          owner: "Orbit",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "pos-1",
          project_id: "proj-1",
          title: "Senior Platform Engineer",
          description: "Build distributed systems and APIs",
          required_skills: ["Go", "Distributed Systems"],
          seniority: "Senior",
          location: "Remote",
          openings: 2,
          status: "open",
          created_at: "2026-02-15T00:00:00.000Z",
        },
        {
          id: "pos-2",
          project_id: "proj-2",
          title: "Product Designer",
          status: "open",
          created_at: "2026-02-20T00:00:00.000Z",
        },
      ],
      {
        keywords: "platform engineer",
        location: "remote",
        company: "acme",
        experienceLevel: "senior",
        jobType: "remote",
      },
      {
        now: new Date("2026-03-01T00:00:00.000Z"),
        applicationsByPosition: new Map([["pos-1", 4]]),
      },
    )

    expect(jobs).toEqual([
      {
        id: "pos-1",
        title: "Senior Platform Engineer",
        company: "Acme",
        location: "Remote",
        posted: "14 days ago",
        applicants: 4,
        salary: "$140K - $190K",
        experienceLevel: "Senior",
      },
    ])
  })

  it("builds profile view analytics from workspace profile activity", () => {
    const analytics = buildProfileViewAnalytics(
      profiles[0],
      [...profiles],
      {
        now: new Date("2026-03-01T00:00:00.000Z"),
        timeRange: "30d",
      },
    )

    expect(analytics.totalViews).toBeGreaterThan(150)
    expect(analytics.searchAppearances).toBeGreaterThan(40)
    expect(analytics.trendDirection).toBe("up")
    expect(analytics.percentChange).toMatch(/^\+\d+%$/)
    expect(analytics.viewerDemographics).toEqual({
      topTitles: ["Engineer", "Product Manager"],
      topCompanies: ["Acme", "Orbit"],
      topLocations: ["Austin", "New York"],
    })
  })

  it("builds a linkedin post plan with hashtags, link fallback, and future scheduling", () => {
    const plan = buildLinkedinPostPlan(
      {
        content: "Shipping our new hiring motion for staff platform roles.",
        contentType: "video",
        visibility: "connections",
        scheduledTime: "2026-03-05T18:00:00.000Z",
        hashtags: ["Hiring", "Platform", "Hiring"],
        mediaUrl: "https://example.com/demo",
      },
      { now: new Date("2026-03-01T00:00:00.000Z") },
    )

    expect(plan).toEqual({
      shareText:
        "Shipping our new hiring motion for staff platform roles.\n\n#Hiring #Platform\n\nhttps://example.com/demo",
      requestedContentType: "video",
      effectiveContentType: "text",
      requestedVisibility: "connections",
      auditVisibility: "connections",
      ugcVisibility: "CONNECTIONS",
      requestLinkUrl: "https://example.com/demo",
      scheduledAt: "2026-03-05T18:00:00.000Z",
      publishNow: false,
      warnings: [
        'Requested contentType "video" will publish as a text post because only text UGC publishing is configured.',
        "Media attachments are published as links because direct LinkedIn media upload is not configured.",
      ],
    })
  })

  it("builds a manual linkedin message draft from workspace recipient data", () => {
    const draft = buildLinkedinMessageDraft(
      { ...profiles[0], tribe: "Builder Core" },
      {
        subject: null,
        message: "Would love to compare notes on platform hiring this quarter.",
        isInMail: true,
      },
    )

    expect(draft.status).toBe("draft_ready")
    expect(draft.channel).toBe("linkedin_inmail")
    expect(draft.recipient).toEqual({
      id: "p-1",
      name: "Ada Lovelace",
      title: "Senior Data Engineer",
      company: "Acme",
      location: "Remote",
    })
    expect(draft.personalizationSignals).toEqual([
      "Acme",
      "Remote",
      "Technology",
      "Builder Core",
      "Python",
    ])
    expect(draft.warnings).toEqual([
      "InMail drafts usually perform better with a subject line.",
    ])
  })

  it("builds conversation summaries from persisted message drafts and requests", () => {
    const conversations = buildLinkedinConversationSummaries(
      [
        {
          id: "msg-1",
          profileId: "p-1",
          channel: "message",
          bodyText: "Following up on our last data-platform discussion.",
          deliveryStatus: "draft_ready",
          createdAt: "2026-03-05T09:00:00.000Z",
          updatedAt: "2026-03-05T09:00:00.000Z",
        },
      ],
      [
        {
          id: "req-1",
          profileId: "p-2",
          note: "Would love to connect about platform hiring.",
          requestStatus: "manual_sent",
          sentAt: "2026-03-04T12:00:00.000Z",
          createdAt: "2026-03-04T11:00:00.000Z",
          updatedAt: "2026-03-04T12:00:00.000Z",
        },
      ],
      profiles,
      { status: "all", limit: 10 },
    )

    expect(conversations).toEqual([
      {
        id: "conv-p-1",
        participant: "Ada Lovelace",
        participantId: "p-1",
        lastMessage: "Following up on our last data-platform discussion.",
        timestamp: "2026-03-05T09:00:00.000Z",
        unread: true,
        status: "unread",
        messageCount: 1,
        pendingDrafts: 1,
        pendingConnectionRequests: 0,
        lastActivityType: "message_draft",
      },
      {
        id: "conv-p-2",
        participant: "Grace Hopper",
        participantId: "p-2",
        lastMessage: "Would love to connect about platform hiring.",
        timestamp: "2026-03-04T12:00:00.000Z",
        unread: false,
        status: "read",
        messageCount: 0,
        pendingDrafts: 0,
        pendingConnectionRequests: 0,
        lastActivityType: "connection_request",
      },
    ])
  })

  it("builds derived workspace profile connections with degree filtering", () => {
    const connections = buildWorkspaceProfileConnections(
      { ...profiles[0], tribe: "Builder Core" },
      [
        { ...profiles[0], tribe: "Builder Core" },
        { ...profiles[1], tribe: "Builder Core" },
        { ...profiles[2], tribe: "Product Guild" },
        {
          id: "p-4",
          firstName: "Barbara",
          lastName: "Liskov",
          fullName: "Barbara Liskov",
          headline: "VP Engineering",
          company: "LaunchPad",
          location: "Remote",
          industry: "Technology",
          connections: 1500,
          skills: ["Python", "Leadership", "Architecture"],
          matchScore: 96,
          seniority: "VP",
          tribe: "Builder Core",
          updatedAt: "2026-03-05T08:00:00.000Z",
        },
      ],
      {
        degree: 1,
        limit: 5,
        contactStates: [
          {
            profileId: "p-4",
            queueStatus: "intro",
            score: 88,
            relationshipStrength: 82,
            freshness: 70,
            updatedAt: "2026-03-05T09:00:00.000Z",
          },
        ],
        outreachEvents: [
          {
            profileId: "p-4",
            eventType: "intro_generated",
            createdAt: "2026-03-04T12:00:00.000Z",
          },
        ],
      },
    )

    expect(connections.totalConnections).toBeGreaterThanOrEqual(2)
    expect(connections.filteredConnections).toBe(2)
    expect(connections.connections).toEqual([
      expect.objectContaining({
        profileId: "p-4",
        degree: 1,
        queueStatus: "intro",
      }),
      expect.objectContaining({
        profileId: "p-2",
        degree: 1,
      }),
    ])
  })

  it("builds post analytics from linkedin share audit rows", () => {
    const analytics = buildPostAnalyticsFromShareAudit(
      [
        {
          responseUgcPostId: "ugc-1",
          shareType: "text",
          visibility: "public",
          requestText: "Hiring senior platform engineers who love APIs and developer tooling.",
          responseStatus: 201,
          createdAt: "2026-02-20T00:00:00.000Z",
        },
        {
          responseUgcPostId: "ugc-2",
          shareType: "image",
          visibility: "connections",
          requestText: "Shipping a new product roadmap for our data platform team.",
          requestLinkUrl: "https://example.com/roadmap",
          responseStatus: 201,
          createdAt: "2026-02-10T00:00:00.000Z",
        },
        {
          responseUgcPostId: "ugc-3",
          shareType: "text",
          visibility: "public",
          requestText: "This failed post should not count.",
          responseStatus: 429,
          createdAt: "2026-02-25T00:00:00.000Z",
        },
      ],
      {
        now: new Date("2026-03-01T00:00:00.000Z"),
        timeRange: "30d",
      },
    )

    expect(analytics.posts).toHaveLength(2)
    expect(analytics.posts[0]).toMatchObject({
      postId: "ugc-1",
      topAudience: "Recruiters",
    })
    expect(analytics.posts[1]).toMatchObject({
      postId: "ugc-2",
      topAudience: "Product leaders",
    })
    expect(analytics.totalImpressions).toBeGreaterThan(800)
    expect(analytics.avgEngagementRate).toMatch(/^\d+\.\d%$/)
  })

  it("builds network analysis clusters from workspace profiles", () => {
    const networkProfiles = [
      { ...profiles[0], tribe: "Builder Core" },
      { ...profiles[1], tribe: "Builder Core" },
      {
        id: "p-4",
        firstName: "Alan",
        lastName: "Turing",
        fullName: "Alan Turing",
        headline: "Principal Platform Engineer",
        company: "Acme",
        location: "Remote",
        industry: "Technology",
        connections: 1400,
        skills: ["Python", "Distributed Systems", "APIs"],
        matchScore: 94,
        seniority: "Principal",
        tribe: "Builder Core",
        createdAt: "2025-02-01T00:00:00.000Z",
        updatedAt: "2026-02-26T00:00:00.000Z",
      },
      {
        id: "p-5",
        firstName: "Margaret",
        lastName: "Hamilton",
        fullName: "Margaret Hamilton",
        headline: "Engineering Director",
        company: "LaunchPad",
        location: "Remote",
        industry: "Technology",
        connections: 1600,
        skills: ["Python", "Leadership", "Systems Design"],
        matchScore: 96,
        seniority: "Director",
        tribe: "Builder Core",
        createdAt: "2024-10-01T00:00:00.000Z",
        updatedAt: "2026-02-24T00:00:00.000Z",
      },
    ]

    const analysis = buildNetworkAnalysisFromWorkspace(networkProfiles[0], networkProfiles, {
      depth: 2,
      filters: null,
    })

    expect(analysis.networkSize).toBe(3)
    expect(analysis.clusters.map((cluster) => cluster.name)).toEqual(
      expect.arrayContaining([
        "Builder Core tribe",
        "Technology circle",
        "Python community",
      ]),
    )
    expect(analysis.networkHealth).toBe("Narrow")
    expect(Number(analysis.influenceScore)).toBeGreaterThan(7)
    expect(analysis.recommendations.length).toBeGreaterThan(0)
  })

  it("builds derived profile recommendations from nearby workspace profiles", () => {
    const networkProfiles = [
      { ...profiles[0], tribe: "Builder Core" },
      { ...profiles[1], tribe: "Builder Core" },
      { ...profiles[2], tribe: "Builder Core" },
      {
        id: "p-6",
        firstName: "Barbara",
        lastName: "Liskov",
        fullName: "Barbara Liskov",
        headline: "VP Engineering",
        company: "Acme",
        location: "Remote",
        industry: "Technology",
        connections: 1800,
        skills: ["Python", "Leadership", "Architecture"],
        matchScore: 97,
        seniority: "VP",
        tribe: "Builder Core",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2026-02-28T00:00:00.000Z",
      },
    ]

    const recommendations = buildProfileRecommendationsFromWorkspace(networkProfiles[0], networkProfiles)

    expect(recommendations.received[0]).toMatchObject({
      from: "Barbara Liskov, VP Engineering",
      relationship: "Manager",
    })
    expect(recommendations.given.length).toBeGreaterThan(0)
    expect(recommendations.totalReceived).toBe(recommendations.received.length)
    expect(recommendations.totalGiven).toBe(recommendations.given.length)
  })

  it("builds derived profile details without empty sections", () => {
    const details = buildDerivedProfileDetails(
      { ...profiles[0], tribe: "Builder Core" },
      { now: new Date("2026-03-01T00:00:00.000Z") },
    )

    expect(details.summary).toContain("Senior Data Engineer at Acme")
    expect(details.currentPosition).toMatchObject({
      title: "Senior Data Engineer",
      company: "Acme",
      isCurrent: true,
    })
    expect(details.positions).toEqual([
      expect.objectContaining({
        title: "Senior Data Engineer",
        company: "Acme",
      }),
    ])
    expect(details.education).toEqual([
      expect.objectContaining({
        school: "Education not captured in workspace CRM",
        degree: "Unavailable",
      }),
    ])
    expect(details.profileViews).toBeGreaterThan(0)
    expect(details.searchAppearances).toBeGreaterThan(0)
    expect(details.notes).toContain("Education details are not stored in this workspace.")
  })

  it("picks requested profile detail fields and ignores unknown fields", () => {
    const detailPayload = {
      id: "p-1",
      name: "Ada Lovelace",
      title: "Senior Data Engineer",
      summary: "Senior Data Engineer at Acme.",
      positions: [{ title: "Senior Data Engineer", company: "Acme" }],
      education: [{ school: "Education not captured in workspace CRM" }],
      skills: ["Python", "SQL"],
    }

    const selected = pickProfileDetailFields(detailPayload, [
      "summary",
      "positions",
      "headline",
      "mysteryField",
    ])

    expect(selected).toEqual({
      profile: {
        id: "p-1",
        summary: "Senior Data Engineer at Acme.",
        positions: [{ title: "Senior Data Engineer", company: "Acme" }],
        title: "Senior Data Engineer",
      },
      ignoredFields: ["mysteryField"],
    })
  })

  it("builds deterministic tribe creation insights from workspace profiles", () => {
    const first = buildTribeCreationInsights(
      [
        { ...profiles[0], tribe: "Builder Core" },
        { ...profiles[1], tribe: "Builder Core" },
        { ...profiles[2], tribe: "Product Guild" },
      ],
      { optimizeFor: "skills" },
    )
    const second = buildTribeCreationInsights(
      [
        { ...profiles[0], tribe: "Builder Core" },
        { ...profiles[1], tribe: "Builder Core" },
        { ...profiles[2], tribe: "Product Guild" },
      ],
      { optimizeFor: "skills" },
    )

    expect(first).toEqual(second)
    expect(first.commonSkills.slice(0, 2)).toEqual(["Python", "SQL"])
    expect(first.cohesion).toBeGreaterThan(6)
    expect(first.complementarity).toBeGreaterThan(6)
    expect(first.skillDist[0]).toEqual({
      name: "Python",
      value: 2,
    })
    expect(first.radarData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "Cohesion" }),
        expect.objectContaining({ metric: "Diversity" }),
      ]),
    )
    expect(first.strengths.length).toBeGreaterThan(0)
  })

  it("plans tribe groups that satisfy required skills and seniority constraints", () => {
    const plan = planTribeFormationGroups(
      [
        { ...profiles[0], tribe: "Builder Core" },
        { ...profiles[1], tribe: "Builder Core" },
        { ...profiles[2], tribe: "Product Guild" },
        {
          id: "p-4",
          firstName: "Radia",
          lastName: "Perlman",
          fullName: "Radia Perlman",
          headline: "Senior UX Researcher",
          company: "Acme",
          location: "Boston",
          industry: "Technology",
          connections: 640,
          skills: ["Research", "Python", "Design Systems"],
          matchScore: 86,
          seniority: "Senior",
          createdAt: "2025-01-10T00:00:00.000Z",
          updatedAt: "2026-02-18T00:00:00.000Z",
        },
      ],
      {
        tribeSize: 2,
        optimizeFor: "balanced",
        constraints: {
          mustIncludeSkills: ["Python"],
          minSeniorityLevel: "Senior",
          maxOverlapPercent: 75,
        },
      },
    )

    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      throw new Error("Expected tribe formation plan to succeed.")
    }
    expect(plan.groups).toHaveLength(2)
    expect(plan.groups.every((group) => group.some((member) => member.skills.includes("Python")))).toBe(true)
    expect(plan.groups.every((group) => group.some((member) => member.seniority === "Senior" || member.seniority === "Staff"))).toBe(true)
    expect(plan.constraintSummary).toMatchObject({
      mustIncludeSkills: ["Python"],
      minSeniorityLevel: "Senior",
      tribesCreated: 2,
    })
  })

  it("fails tribe planning when required skills are unavailable", () => {
    const plan = planTribeFormationGroups([...profiles], {
      tribeSize: 2,
      constraints: {
        mustIncludeSkills: ["Rust"],
      },
    })

    expect(plan).toEqual({
      ok: false,
      error: "Selected profiles do not cover required skills: Rust.",
      hint: "Expand the profile set or remove unsupported mustIncludeSkills constraints.",
    })
  })

  it("builds group search results from workspace tribes", () => {
    const groups = buildWorkspaceGroupSearchResults(
      [
        {
          id: "tribe-1",
          name: "Builder Core",
          description: "Platform engineering leadership circle",
          industry_focus: "Technology",
          common_skills: ["Python", "Distributed Systems"],
          members: [{ id: "p-1" }, { id: "p-2" }, { id: "p-4" }],
          updated_at: "2026-02-28T00:00:00.000Z",
        },
      ],
      [
        { ...profiles[0], tribe: "Builder Core" },
        { ...profiles[1], tribe: "Builder Core" },
      ],
      {
        keywords: "builder",
        category: "leadership",
      },
      { now: new Date("2026-03-01T00:00:00.000Z") },
    )

    expect(groups).toEqual([
      {
        id: "tribe-1",
        name: "Builder Core",
        members: 2,
        postsPerWeek: 5,
        description: "Platform engineering leadership circle",
      },
    ])
  })

  it("returns deterministic mock search and connection data without auth", async () => {
    const tools = createLinkedinTools(null)

    const firstSearch = await tools.searchProfiles.execute?.(
      {
        keywords: "data platform",
        location: null,
        industry: null,
        currentCompany: null,
        pastCompany: null,
        skills: null,
        title: null,
        experienceYears: null,
        limit: 5,
      },
      { toolCallId: "mock-search-1", messages: [] },
    )
    const secondSearch = await tools.searchProfiles.execute?.(
      {
        keywords: "data platform",
        location: null,
        industry: null,
        currentCompany: null,
        pastCompany: null,
        skills: null,
        title: null,
        experienceYears: null,
        limit: 5,
      },
      { toolCallId: "mock-search-2", messages: [] },
    )

    expect(secondSearch).toEqual(firstSearch)
    expect(firstSearch).toMatchObject({
      source: "mock",
      totalResults: expect.any(Number),
    })

    const firstConnections = await tools.getProfileConnections.execute?.(
      {
        profileId: "profile-seed",
        degree: 2,
        limit: 4,
      },
      { toolCallId: "mock-connections-1", messages: [] },
    )
    const secondConnections = await tools.getProfileConnections.execute?.(
      {
        profileId: "profile-seed",
        degree: 2,
        limit: 4,
      },
      { toolCallId: "mock-connections-2", messages: [] },
    )

    expect(secondConnections).toEqual(firstConnections)
    expect(firstConnections).toMatchObject({
      source: "mock",
      dataQuality: "derived",
      connections: expect.any(Array),
    })
  })

  it("returns deterministic mock analytics without auth", async () => {
    const tools = createLinkedinTools(null)

    const firstAnalytics = await tools.getProfileViews.execute?.(
      {
        profileId: "profile-seed",
        timeRange: "30d",
      },
      { toolCallId: "mock-analytics-1", messages: [] },
    )
    const secondAnalytics = await tools.getProfileViews.execute?.(
      {
        profileId: "profile-seed",
        timeRange: "30d",
      },
      { toolCallId: "mock-analytics-2", messages: [] },
    )
    const network = await tools.analyzeNetwork.execute?.(
      {
        centerProfileId: "profile-seed",
        depth: 2,
        filters: null,
      },
      { toolCallId: "mock-network-1", messages: [] },
    )

    expect(secondAnalytics).toEqual(firstAnalytics)
    expect(firstAnalytics).toMatchObject({
      source: "mock",
      dataQuality: "derived",
      totalViews: expect.any(Number),
      searchAppearances: expect.any(Number),
    })
    expect(network).toMatchObject({
      source: "mock",
      dataQuality: "derived",
      networkSize: expect.any(Number),
      clusters: expect.any(Array),
    })
  })
})
