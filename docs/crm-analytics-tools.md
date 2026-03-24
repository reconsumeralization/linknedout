# CRM Analytics Tools

This app now includes dedicated analytics tools for tribe, group, and CRM profile intelligence.

## Overview

These tools are available through chat, realtime, and MCP (shared `lib/linkedin-tools.ts` registry):

- `analyzeCrmPortfolio`
- `analyzeTribeComposition`
- `analyzeGroupTalentOpportunities`
- `designTribesForObjective`

These are read-only analytics/design tools. They use authenticated Supabase workspace data when available, and return mock output if auth is unavailable.

## Tool Reference

### `analyzeCrmPortfolio`

Purpose:
- Segment CRM profiles by industry, location, seniority, tribe coverage, and skill distribution.
- Identify missing required skills and concentration risk.
- Provide workforce-planning recommendations with network and quality metrics.

Key inputs:
- `tribeId` (optional)
- `keywords` (optional)
- `industry` (optional)
- `location` (optional)
- `requiredSkills` (optional)
- `includeUnassignedOnly` (optional)
- `limit` (optional top-N size)

### `analyzeTribeComposition`

Purpose:
- Score tribe health and composition quality.
- Show seniority/industry/skill mix and required-skill coverage.
- Recommend high-fit profiles to add for gap closure.

Key inputs:
- `tribeId` (optional single-tribe deep dive)
- `requiredSkills` (optional)
- `benchmarkAgainstWorkspace` (optional)
- `limitRecommendations` (optional)

### `analyzeGroupTalentOpportunities`

Purpose:
- Convert topic keywords into talent opportunity clusters.
- Rank CRM profiles by keyword + skill relevance.
- Generate group/community signals and outreach recommendations.

Key inputs:
- `keywords` (required)
- `category` (optional)
- `targetTribeId` (optional; excludes existing members from candidate pool)
- `requiredSkills` (optional)
- `limitProfiles` (optional)

### `designTribesForObjective`

Purpose:
- Propose tribe groupings for a specific objective from workspace CRM profiles.
- Return `profileIds` and scoring summaries without writing to Supabase.
- Feed outputs into `createTribe` / `createTeamFromProfiles` for explicit human-approved creation.

Key inputs:
- `objective` (required)
- `desiredTribeCount` (optional)
- `desiredTribeSize` (optional)
- `requiredSkills` (optional)
- `preferLocations` (optional)

Return highlights:
- `designedTribes[]` with `profileIds`, `memberCount`, `topSkills`
- `avgMatchScore`, `avgConnections`, `avgExperienceYears`
- `requiredSkillCoverage`, `missingRequiredSkills`
- `requestedTribeCount` vs `effectiveTribeCount`
- `candidatePoolSize`, `totalWorkspaceProfiles`, `profileWindowLimit`

## Operational Notes

- Use these tools before mutating teams/projects to improve decision quality.
- For tribe member updates, use `addProfilesToTribe` (not `addMembersToTribe`).
- For role-level hiring fit, pair with `getProjectCrmInsights`.
- If `MCP_ENFORCE_TOOL_ALLOWLIST=true`, add these names to `MCP_ALLOWED_TOOLS`.

## Suggested Analysis Sequence

1. `analyzeCrmPortfolio` for baseline segmentation and skill scarcity.
2. `analyzeTribeComposition` for team-level health and gap closure options.
3. `analyzeGroupTalentOpportunities` to source complementary external candidates and channels.
4. `designTribesForObjective` to produce candidate tribe blueprints, then `createTribe` for selected groups.
