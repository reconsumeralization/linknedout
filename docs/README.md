# Documentation Index

This index is organized by operator workflow so teams can find the right runbook quickly.

## Start Here

- [Setup and Onboarding](./setup-and-onboarding.md) - local and cloud setup for app, Supabase, and integrations.
- [API Authentication and Route Protection](./API-AUTH.md) - which routes are public vs protected and how auth is enforced.

## Security and Governance

- [AI Security Stack (Master Reference)](./ai-security-stack.md) - single canonical reference: layers, operator quick ref, egress tuning, Guard Diagnostics, product roadmap.
- [Executive Briefing: Trusted AI Autonomy](./executive-briefing-ai-governance.md) - one-page memo + 8-slide speaker script for leadership.
- [MCP Security Hardening](./mcp-security-hardening.md) - control catalog, strict-mode flags, and operational defaults.
- [SENTINEL Control Plane](./sentinel-control-plane.md) - risk/veto pipeline, approvals, incidents, and telemetry model.
- [Supabase Schema and RLS Checklist](./supabase-schema-rls-checklist.md) - table-by-table production checklist for identity, audit, RAG, and CRM data isolation.
- [AEGIS Doctrine](./aegis-doctrine.md) - policy philosophy and constraints.
- [AEGIS Non-Hardware Implementation](./aegis-non-hardware.md) - application-level implementation notes.
- [Agentic Risk Claims 2026](./agentic-risk-claims-2026.md) - threat framing and claims tracking.
- Drill command: `pnpm smoke:sentinel:drill`

## MCP, Realtime, and Tools

- [MCP Integration](./mcp-integration.md) - JSON-RPC surface, auth model, and tool-call behavior.
- [Realtime Tools](./realtime-tools.md) - realtime session/tool loop and secure execution path.
- [Supabase LLM DB Tools](./supabase-llm-db-tools.md) - user-scoped RAG storage/query tools and safeguards.
- [Supabase features and front-ends](./supabase-features-and-frontends.md) - map of Auth, Database, Storage, Data hub, and branded panels; referenced by chat/realtime view context.
- [CRM Analytics Tools](./crm-analytics-tools.md) - tribe/group/CRM analysis tools and usage patterns.

## Local Runtime and Infrastructure

- [Branded Supabase (self-hosted)](./branded-supabase-self-host.md) - your own branded, locally hosted Supabase (one-script setup plus doctor/sync workflow).
- [Local Supabase Setup](./local-supabase.md)
- [Local Supabase DB Container](./local-supabase-db-container.md)
- [Docker Stack](./docker-stack.md)

## Domain Specs and Governance Packs

- [ADGAP MSA Template Clauses](./adgap-msa-template-clauses.md)
- [ADGAP Certification Roadmap](./adgap-certification-roadmap.md)
- [ADGAP C2PA Manifest Example](./adgap-c2pa-manifest-example.json)
- [AgentForge Drone Delivery Spec](./agentforge-drone-delivery-spec.md)

## Planning and Roadmaps

- [AI Security Stack (Master Reference)](./ai-security-stack.md) - includes product roadmap (tribe-at-scale, LinkedIn flows, ops).
- [Agent Control Plane End-to-End Plan](./agent-control-plane-end-to-end-plan.md)
