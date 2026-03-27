# LinkedOut Security Hardening Program v1

## Baseline
- **Tag**: `v1.0.0-baseline` (commit `0d9562b`)
- **Branch**: `security-hardening-v1`
- **Date**: 2026-03-27
- **Snapshot**: 329 sovereign tools, 8 agents, 67 API routes, 400+ Supabase tables, 24 UI panels

## Success Criteria for "Secure by Default" Release
1. Zero Critical or High findings in final security scan
2. All protected routes return standardized 401/403 responses
3. No database error messages exposed to clients
4. Rate limiting on 100% of routes
5. Input validation (Zod) on 100% of write endpoints
6. All secrets server-side only, never in client bundle
7. CI gates block PRs with secret patterns or missing auth
8. Threat model v1 published and reviewed

## Severity Rubric

| Severity | Definition | SLA |
|----------|-----------|-----|
| **Critical** | Auth bypass, data exfil, RCE, secret leak in client bundle | Fix within 4 hours |
| **High** | Info disclosure (schema/columns), missing auth on write route, service role misuse | Fix within 24 hours |
| **Medium** | Missing rate limit, inconsistent error shapes, missing input validation | Fix within 1 week |
| **Low** | Logging hygiene, docs gaps, test coverage gaps | Fix within 2 weeks |

## Stream Owners

| Stream | Owner | Scope |
|--------|-------|-------|
| **App (API Routes)** | Chairman | Auth, input validation, error handling |
| **Infrastructure** | Chairman + Claude | Vercel config, env vars, CI gates |
| **Database** | Chairman | RLS policies, migrations, functions |
| **Testing** | Claude | Regression tests, benchmark scripts |

## Cadence
- **Weekly**: Security review (Monday) — review open items, triage new findings
- **Daily**: Blocking risk standup — any Critical/High items block all other work

---

## Threat Model v1

### Assets
- User PII (profiles, emails, contacts)
- OAuth tokens (Gmail, Outlook, LinkedIn)
- Supabase service role key
- LLM API keys (OpenAI, Anthropic)
- Agent execution results and sovereign tool outputs

### Threat Actors
- Unauthenticated attacker (internet-facing)
- Authenticated malicious user (cross-tenant)
- Compromised OAuth token
- Prompt injection via LLM chat
- Supply chain (dependency compromise)

### Attack Surfaces
1. **67 API routes** — primary attack surface
2. **LLM chat endpoint** — prompt injection
3. **OAuth callbacks** — CSRF, token theft
4. **Proxy routes** (MongoDB, Notion) — SSRF, data exfil
5. **Cron endpoints** — secret brute-force
6. **Client-side storage** — token theft via XSS

### Mitigations In Place
- Supabase RLS on all 400+ tables
- LLM Guard with pre-tool + pre-response evaluation
- Zod input validation on ~95% of routes
- Rate limiting on ~95% of routes
- Timing-safe secret comparison on cron routes
- OAuth state/CSRF cookies (HttpOnly, SameSite)

### Gaps (This Program Addresses)
- Error message information disclosure (~45 routes)
- 3 routes missing rate limiting
- Inconsistent auth middleware patterns
- No deny-by-default for unknown routes
- No CI secret scanning gate
- No regression tests for auth bypass

---

## 100-Step Backlog

### Phase 1: Freeze & Setup (Steps 1-10) — DONE
- [x] 1. Freeze baseline, tag `v1.0.0-baseline`
- [x] 2. Export git status snapshot
- [x] 3. Create `security-hardening-v1` branch
- [x] 4. Define success criteria
- [x] 5. Define severity rubric
- [x] 6. Create backlog (this document)
- [x] 7. Assign stream owners
- [x] 8. Set weekly review cadence
- [x] 9. Add daily blocking risk item
- [x] 10. Publish threat model v1

### Phase 2: Auth Hardening (Steps 11-30)
- [ ] 11. Inventory all API routes + auth mode
- [ ] 12. Mark each route: public / user-auth / service-only
- [ ] 13. Document required scopes/claims per route
- [ ] 14. Add deny-by-default for unknown routes
- [ ] 15. Standardize 401/403 response shapes
- [ ] 16. Centralize auth middleware pattern
- [ ] 17. Remove route-specific auth bypasses
- [ ] 18. Regression tests: unauthenticated access
- [ ] 19. Regression tests: cross-user data access
- [ ] 20. Regression tests: malformed bearer tokens
- [ ] 21. Audit service-role client creation paths
- [ ] 22. Remove anon-key fallbacks in server contexts
- [ ] 23. Require SUPABASE_SERVICE_ROLE_KEY for service ops
- [ ] 24. Ensure server clients have no session persistence
- [ ] 25. Validate user-scoped clients bind to bearer token
- [ ] 26. Unit test: service key never in client bundle
- [ ] 27. Runtime warning if service role missing in prod
- [ ] 28. Route-level guard: misconfigured secrets fail-closed
- [ ] 29. Standardize env resolution order
- [ ] 30. Docs: which env var allowed in which layer

### Phase 3: Input Validation (Steps 31-40)
- [ ] 31. Audit input schemas for all write endpoints
- [ ] 32. Enforce max payload sizes everywhere
- [ ] 33. Add Zod schemas for untyped remnants
- [ ] 34. Add enum allowlists for action-based routes
- [ ] 35. Add key length/bounds checks for IDs
- [ ] 36. Add strict URL validation
- [ ] 37. Reject unknown fields on sensitive endpoints
- [ ] 38. Add anti-abuse checks for high-cost operations
- [ ] 39. Normalize user strings before logging
- [ ] 40. Remove stack traces from error responses

### Phase 4: Rate Limiting (Steps 41-50)
- [ ] 41. Complete rate limit coverage matrix
- [ ] 42. Stricter preset for auth/credential endpoints
- [ ] 43. Standard preset for user CRUD
- [ ] 44. Relaxed preset for read-only endpoints
- [ ] 45. Burst + sustained strategy for expensive endpoints
- [ ] 46. Keying strategy docs (IP + user composite)
- [ ] 47. Tests for rate limit reset + headers
- [ ] 48. Tests for multi-key handling
- [ ] 49. Observability counters for 429s per route
- [ ] 50. Alert threshold for unusual 429 spikes

### Phase 5: Secret Management (Steps 51-60)
- [ ] 51. Finish secret handling in connector flows
- [ ] 52. Browser never sends raw long-lived secrets
- [ ] 53. Move connector secrets to server-side env/vault
- [ ] 54. Encrypt persisted integration secrets at rest
- [ ] 55. Validate secret rotation pathways
- [ ] 56. Add "secret last rotated" metadata
- [ ] 57. Forced-rotation workflow for exposed tokens
- [ ] 58. Preflight endpoint: validate secret presence
- [ ] 59. One-click redaction for sensitive logs
- [ ] 60. Docs runbook for key compromise response

### Phase 6: Proxy Hardening (Steps 61-70)
- [ ] 61. MongoDB proxy: server-owned DSN only in prod
- [ ] 62. Notion proxy: env-first credentials
- [ ] 63. MongoDB: explicit collection allowlist
- [ ] 64. Notion: explicit DB ID allowlist
- [ ] 65. Operation cost controls (pagination, quotas)
- [ ] 66. Schema validation for proxy payloads
- [ ] 67. Audit logging for proxy actions
- [ ] 68. Tests: forbidden actions + malformed payloads
- [ ] 69. Tests: auth-required on proxies
- [ ] 70. Tests: misconfiguration fail-closed

### Phase 7: KV Store Hardening (Steps 71-80)
- [ ] 71. Expand KV for production robustness
- [ ] 72. Key collision isolation (namespacing)
- [ ] 73. Max-entry cap + eviction strategy
- [ ] 74. Background prune scheduler
- [ ] 75. File-backed persistence adapter
- [ ] 76. Atomic batch update API
- [ ] 77. Integration test under load
- [ ] 78. Benchmark: KV read/write/TTL performance
- [ ] 79. Memory usage guardrails
- [ ] 80. Docs: safe KV usage patterns

### Phase 8: CI & Release Gates (Steps 81-90)
- [ ] 81. CI gate: secret scan on PRs
- [ ] 82. CI gate: security tests on API changes
- [ ] 83. CI gate: no NEXT_PUBLIC_* secret misuse
- [ ] 84. Static check: hardcoded token patterns
- [ ] 85. Lint rule: forbidden env vars in client code
- [ ] 86. Codeowner review for api/** and security/**
- [ ] 87. Commit template: secret safety reminder
- [ ] 88. Release checklist: security verification
- [ ] 89. Dependency audit: fail on critical vulns
- [ ] 90. SBOM generation for releases

### Phase 9: Production Hardening (Steps 91-95)
- [ ] 91. Production checklist for host/container
- [ ] 92. Non-root runtime + no-new-privileges
- [ ] 93. Drop unnecessary Linux capabilities
- [ ] 94. Read-only filesystem where possible
- [ ] 95. Runtime self-check endpoint for hardening posture

### Phase 10: Monitoring & Signoff (Steps 96-100)
- [ ] 96. Dashboard: auth failures, 429s, proxy errors
- [ ] 97. Anomaly alerts for error bursts
- [ ] 98. Full security regression pass
- [ ] 99. Final pre-release review and signoff
- [ ] 100. Publish Security Hardening v1 report, lock baseline

---

## Route Inventory

| Route | Auth | Rate Limit | Validation | Mode |
|-------|------|-----------|-----------|------|
| `/api/chat` | LLM Guard + optional Supabase | Yes (config) | Zod | public (guarded) |
| `/api/sovereign` | resolveSupabaseAuth | **MISSING** | Zod | user-auth |
| `/api/meta-agent` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/evolution` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/evolution/cron` | cron secret | config | Zod | service-only |
| `/api/heartbeat/cron` | cron secret | **MISSING** | None | service-only |
| `/api/sentinel/cron` | cron secret | config | None | service-only |
| `/api/agents/control-plane` | Bearer + cron | 30/min | Zod | service-only |
| `/api/agents/control-plane/cron` | Bearer + cron | 30/min | Zod | service-only |
| `/api/a2a` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/accountability` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/authenticity` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/blockade` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/bounties` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/decoupling` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/diplomatic` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/drones/compliance` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/experiences` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/governance` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/government` | requireSupabaseAuth | 60/min | None | user-auth |
| `/api/imagination` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/integrations` | requireSupabaseAuth | 90/min | None | user-auth |
| `/api/interplanetary` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/invisible` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/marketplace` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/morpheus` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/network/insights` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/pipeline` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/shield` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/sherlog` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/trade` | requireSupabaseAuth | 60/min | Zod | user-auth |
| `/api/mongodb/proxy` | requireSupabaseAuth | 45/min | Zod | user-auth |
| `/api/notion/proxy` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/email/oauth` | optional Supabase | 30/min | query params | public |
| `/api/linkedin/oauth` | optional Supabase | config | query params | public |
| `/api/linkedin/identity` | resolveSupabaseAuth | **MISSING** | None | user-auth |
| `/api/linkedin/share` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/linkedin/workflow` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/profiles/import` | requireSupabaseAuth | **MISSING** | Zod | user-auth |
| `/api/globe/layers` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/mcp` | MCP OAuth | 180/min | Zod JSON-RPC | service-only |
| `/api/automation/status` | requireSupabaseAuth | config | None | user-auth |
| `/api/realtime/*` | optional Supabase | config | Zod | public (guarded) |
| `/api/email/*` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/fundraising/*` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/linkedout/*` | requireSupabaseAuth | config | Zod | user-auth |
| `/api/auth/ai/status` | None | None | None | public |
| `/api/sync` | requireSupabaseAuth | config | Zod | user-auth |
