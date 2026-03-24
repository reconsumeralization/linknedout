-- Critical workflow verification + workflow-shaped egress telemetry
-- Adds auditable verification lifecycle columns and egress-shape metadata.

alter table public.mcp_tool_audit_events
  add column if not exists critical_workflow_class text not null default 'none',
  add column if not exists verification_required boolean not null default false,
  add column if not exists verification_state text not null default 'not_required',
  add column if not exists verification_target_tool text,
  add column if not exists verification_subject text,
  add column if not exists verification_due_at timestamptz,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists egress_payload_bytes integer,
  add column if not exists egress_attachment_count integer,
  add column if not exists egress_thread_message_count integer,
  add column if not exists egress_shape_approval_required boolean not null default false;

alter table public.mcp_tool_audit_events
  drop constraint if exists mcp_tool_audit_events_critical_workflow_class_check;
alter table public.mcp_tool_audit_events
  add constraint mcp_tool_audit_events_critical_workflow_class_check
  check (critical_workflow_class in ('none', 'destructive', 'egress'));

alter table public.mcp_tool_audit_events
  drop constraint if exists mcp_tool_audit_events_verification_state_check;
alter table public.mcp_tool_audit_events
  add constraint mcp_tool_audit_events_verification_state_check
  check (verification_state in ('not_required', 'pending', 'passed', 'failed'));

create index if not exists mcp_tool_audit_verification_owner_session_idx
  on public.mcp_tool_audit_events (owner_user_id, session_id, verification_state, created_at desc);

create index if not exists mcp_tool_audit_critical_workflow_class_idx
  on public.mcp_tool_audit_events (critical_workflow_class, created_at desc);

create index if not exists mcp_tool_audit_egress_shape_approval_idx
  on public.mcp_tool_audit_events (egress_shape_approval_required, created_at desc);
