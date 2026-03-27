-- =============================================================================
-- Government-in-the-Loop: Closing 15 Critical Gaps
-- Moves the Factory from "Tribal Vacuum" to "Sovereign Peer Entity"
-- =============================================================================

begin;

-- ===========================================================================
-- GAP 1: Government Entity Registry
-- ===========================================================================

create table if not exists public.government_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type text not null default 'federal'
    check (entity_type in ('federal','state','local','tribal','international','regulatory','judicial','legislative')),
  jurisdiction text not null,
  parent_entity_id uuid references public.government_entities(id),
  country_code text default 'US',
  agency_code text,
  api_endpoint text,
  compliance_domains text[] default '{}',
  contact_email text,
  contact_phone text,
  website_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gov_entities_type_idx on government_entities(entity_type);
create index if not exists gov_entities_jurisdiction_idx on government_entities(jurisdiction);
create index if not exists gov_entities_parent_idx on government_entities(parent_entity_id);

alter table government_entities enable row level security;
create policy gov_entities_read on government_entities
  for select to authenticated using (true);
create policy gov_entities_write on government_entities
  for all to authenticated
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Seed core federal entities
insert into public.government_entities (name, entity_type, jurisdiction, country_code, agency_code, compliance_domains, website_url) values
  ('Internal Revenue Service', 'federal', 'US-Federal', 'US', 'IRS', array['tax','financial_reporting'], 'https://www.irs.gov'),
  ('Securities and Exchange Commission', 'federal', 'US-Federal', 'US', 'SEC', array['securities','financial_reporting','corporate_governance'], 'https://www.sec.gov'),
  ('Federal Aviation Administration', 'federal', 'US-Federal', 'US', 'FAA', array['aviation','drones','airspace'], 'https://www.faa.gov'),
  ('Department of Labor', 'federal', 'US-Federal', 'US', 'DOL', array['labor','employment','workplace_safety','ai_literacy'], 'https://www.dol.gov'),
  ('Federal Trade Commission', 'federal', 'US-Federal', 'US', 'FTC', array['consumer_protection','antitrust','data_privacy','dark_patterns'], 'https://www.ftc.gov'),
  ('Department of Commerce / BIS', 'federal', 'US-Federal', 'US', 'BIS', array['export_control','sanctions','technology_transfer'], 'https://www.bis.doc.gov'),
  ('OFAC - Treasury', 'federal', 'US-Federal', 'US', 'OFAC', array['sanctions','asset_freeze','embargo'], 'https://ofac.treasury.gov'),
  ('USPTO', 'federal', 'US-Federal', 'US', 'USPTO', array['patents','trademarks','intellectual_property'], 'https://www.uspto.gov'),
  ('USCIS', 'federal', 'US-Federal', 'US', 'USCIS', array['immigration','visa','naturalization'], 'https://www.uscis.gov'),
  ('Nuclear Regulatory Commission', 'federal', 'US-Federal', 'US', 'NRC', array['nuclear','energy','smr_licensing'], 'https://www.nrc.gov'),
  ('NIST', 'federal', 'US-Federal', 'US', 'NIST', array['standards','ai_safety','cybersecurity_framework'], 'https://www.nist.gov'),
  ('State Department', 'federal', 'US-Federal', 'US', 'STATE', array['diplomacy','export_control','travel_advisory'], 'https://www.state.gov')
on conflict do nothing;

-- Government contacts
create table if not exists public.government_contacts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.government_entities(id) on delete cascade,
  role text not null,
  name text,
  email text,
  phone text,
  authority_level text default 'standard',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists gov_contacts_entity_idx on government_contacts(entity_id);

alter table government_contacts enable row level security;
create policy gov_contacts_read on government_contacts
  for select to authenticated using (true);

-- ===========================================================================
-- GAP 2: Regulatory Filing / Reporting Pipeline
-- ===========================================================================

create table if not exists public.regulatory_filings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid references public.government_entities(id),
  filing_type text not null
    check (filing_type in ('tax_return','sec_filing','business_license','compliance_report','annual_report','permit_application','foia_request','public_comment','regulatory_response','other')),
  jurisdiction text not null,
  title text not null,
  description text,
  due_date date,
  status text not null default 'drafting'
    check (status in ('drafting','review','submitted','acknowledged','processing','approved','rejected','amended','archived')),
  document_refs jsonb default '[]',
  submitted_at timestamptz,
  response_received_at timestamptz,
  response_summary text,
  agent_assisted boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reg_filings_user_idx on regulatory_filings(user_id);
create index if not exists reg_filings_status_idx on regulatory_filings(status);
create index if not exists reg_filings_due_idx on regulatory_filings(due_date);
create index if not exists reg_filings_type_idx on regulatory_filings(filing_type);

alter table regulatory_filings enable row level security;
create policy reg_filings_owner on regulatory_filings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Filing templates per jurisdiction
create table if not exists public.filing_templates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  filing_type text not null,
  template_name text not null,
  required_fields jsonb not null default '[]',
  template_data jsonb default '{}',
  regulatory_body text,
  submission_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists filing_templates_jurisdiction_idx on filing_templates(jurisdiction, filing_type);

alter table filing_templates enable row level security;
create policy filing_templates_read on filing_templates
  for select to authenticated using (true);

-- ===========================================================================
-- GAP 3: Permit / License Lifecycle Management
-- ===========================================================================

create table if not exists public.sovereign_permits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permit_type text not null
    check (permit_type in ('business_license','professional_license','drone_permit','energy_permit','building_permit','export_license','data_processing','financial_services','broadcast','other')),
  issuing_authority uuid references public.government_entities(id),
  issuing_authority_name text,
  jurisdiction text not null,
  permit_number text,
  issue_date date,
  expiry_date date,
  renewal_status text default 'active'
    check (renewal_status in ('active','expiring_soon','expired','renewal_pending','revoked','suspended')),
  conditions jsonb default '[]',
  document_ref text,
  auto_renew boolean default false,
  renewal_reminder_days integer default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists permits_user_idx on sovereign_permits(user_id);
create index if not exists permits_expiry_idx on sovereign_permits(expiry_date);
create index if not exists permits_status_idx on sovereign_permits(renewal_status);

alter table sovereign_permits enable row level security;
create policy permits_owner on sovereign_permits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- GAP 4: FOIA / Public Records Interface
-- ===========================================================================

create table if not exists public.foia_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_agency uuid references public.government_entities(id),
  target_agency_name text not null,
  request_text text not null,
  request_category text default 'general'
    check (request_category in ('general','law_enforcement','financial','environmental','health','defense','immigration','technology','other')),
  status text not null default 'drafted'
    check (status in ('drafted','filed','acknowledged','processing','partial_response','fulfilled','appealed','denied','withdrawn')),
  tracking_number text,
  filed_at timestamptz,
  acknowledgment_at timestamptz,
  response_due timestamptz,
  documents_received integer default 0,
  pages_received integer default 0,
  fees_charged numeric default 0,
  appeal_deadline timestamptz,
  response_summary text,
  document_refs jsonb default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists foia_user_idx on foia_requests(user_id);
create index if not exists foia_status_idx on foia_requests(status);
create index if not exists foia_agency_idx on foia_requests(target_agency);

alter table foia_requests enable row level security;
create policy foia_owner on foia_requests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- GAP 5: Sanctions / Export Control Screening
-- ===========================================================================

create table if not exists public.sanctions_screening_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_screened text not null,
  entity_type text default 'organization'
    check (entity_type in ('individual','organization','vessel','aircraft','crypto_wallet','other')),
  screening_type text not null
    check (screening_type in ('ofac_sdn','ofac_consolidated','eu_sanctions','un_sanctions','bis_entity_list','bis_denied_persons','pax_silica_audit','custom')),
  match_result text not null default 'clear'
    check (match_result in ('clear','potential_match','confirmed_match','false_positive','pending_review')),
  match_details jsonb default '{}',
  risk_level text default 'low'
    check (risk_level in ('low','medium','high','critical','blocked')),
  screened_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  notes text
);
create index if not exists sanctions_user_idx on sanctions_screening_log(user_id);
create index if not exists sanctions_result_idx on sanctions_screening_log(match_result);
create index if not exists sanctions_entity_idx on sanctions_screening_log(entity_screened);

alter table sanctions_screening_log enable row level security;
create policy sanctions_owner on sanctions_screening_log
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Export control classifications
create table if not exists public.export_control_classifications (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null,
  resource_type text default 'software',
  eccn text,
  jurisdiction text not null default 'US',
  license_required boolean default false,
  license_exception text,
  destination_restrictions text[] default '{}',
  classification_date date,
  classified_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists export_ctrl_resource_idx on export_control_classifications(resource_id);

alter table export_control_classifications enable row level security;
create policy export_ctrl_read on export_control_classifications
  for select to authenticated using (true);

-- ===========================================================================
-- GAP 6: Legislative / Regulatory Change Tracking
-- ===========================================================================

create table if not exists public.regulatory_watch (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  regulatory_body text not null,
  rule_identifier text,
  title text not null,
  summary text,
  full_text_url text,
  effective_date date,
  comment_deadline date,
  impact_domains text[] default '{}',
  impact_severity text default 'low'
    check (impact_severity in ('informational','low','medium','high','critical','existential')),
  status text not null default 'proposed'
    check (status in ('proposed','comment_period','final_rule','enacted','effective','repealed','challenged','stayed')),
  tribal_response text,
  sovereign_constitution_update_needed boolean default false,
  auto_detected boolean default false,
  detected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reg_watch_jurisdiction_idx on regulatory_watch(jurisdiction);
create index if not exists reg_watch_status_idx on regulatory_watch(status);
create index if not exists reg_watch_impact_idx on regulatory_watch(impact_severity);
create index if not exists reg_watch_effective_idx on regulatory_watch(effective_date);

alter table regulatory_watch enable row level security;
create policy reg_watch_read on regulatory_watch
  for select to authenticated using (true);
create policy reg_watch_write on regulatory_watch
  for insert to authenticated
  with check (auth.role() = 'service_role' or true);

-- ===========================================================================
-- GAP 7: Court Case / Legal Proceedings Tracker
-- ===========================================================================

create table if not exists public.legal_proceedings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_number text,
  court text not null,
  jurisdiction text not null,
  case_type text not null
    check (case_type in ('civil','criminal','administrative','arbitration','regulatory','immigration','tax','patent','bankruptcy','appeal','other')),
  caption text not null,
  parties jsonb default '[]',
  status text not null default 'filed'
    check (status in ('pre_filing','filed','discovery','motions','trial','post_trial','appeal','settled','dismissed','closed')),
  our_role text default 'plaintiff'
    check (our_role in ('plaintiff','defendant','petitioner','respondent','intervenor','amicus','observer')),
  attorney_name text,
  attorney_contact text,
  next_deadline date,
  next_event text,
  amount_at_stake numeric,
  documents jsonb default '[]',
  key_dates jsonb default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proceedings_user_idx on legal_proceedings(user_id);
create index if not exists proceedings_status_idx on legal_proceedings(status);
create index if not exists proceedings_type_idx on legal_proceedings(case_type);
create index if not exists proceedings_deadline_idx on legal_proceedings(next_deadline);

alter table legal_proceedings enable row level security;
create policy proceedings_owner on legal_proceedings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- GAP 9: Civic Representatives Registry
-- ===========================================================================

create table if not exists public.civic_representatives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  office text not null,
  jurisdiction text not null,
  district text,
  level text not null default 'federal'
    check (level in ('federal','state','local','tribal')),
  chamber text
    check (chamber in ('senate','house','assembly','council','executive','judicial',null)),
  party text,
  contact_email text,
  contact_phone text,
  office_address text,
  website_url text,
  voting_record_url text,
  policy_positions jsonb default '{}',
  term_start date,
  term_end date,
  committees text[] default '{}',
  ai_policy_stance text,
  crypto_policy_stance text,
  energy_policy_stance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists civic_reps_jurisdiction_idx on civic_representatives(jurisdiction);
create index if not exists civic_reps_level_idx on civic_representatives(level);
create index if not exists civic_reps_office_idx on civic_representatives(office);

alter table civic_representatives enable row level security;
create policy civic_reps_read on civic_representatives
  for select to authenticated using (true);

-- Civic engagement log
create table if not exists public.civic_engagement_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  representative_id uuid references public.civic_representatives(id),
  action_type text not null
    check (action_type in ('email','call','meeting','testimony','public_comment','rally','petition','donation','letter','foia','other')),
  topic text not null,
  description text,
  outcome text,
  follow_up_needed boolean default false,
  follow_up_date date,
  created_at timestamptz not null default now()
);
create index if not exists civic_engagement_user_idx on civic_engagement_log(user_id);
create index if not exists civic_engagement_rep_idx on civic_engagement_log(representative_id);

alter table civic_engagement_log enable row level security;
create policy civic_engagement_owner on civic_engagement_log
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- GAP 10: Immigration / Visa Status Tracking
-- ===========================================================================

create table if not exists public.immigration_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  visa_type text,
  jurisdiction text not null,
  status text not null default 'active'
    check (status in ('active','expired','pending_renewal','revoked','conditional','permanent_resident','citizen','asylum','refugee','other')),
  expiry_date date,
  restrictions jsonb default '[]',
  employer_sponsor text,
  travel_clearance_level text default 'standard'
    check (travel_clearance_level in ('unrestricted','standard','restricted','exit_ban','no_travel')),
  countries_restricted text[] default '{}',
  exit_ban_active boolean default false,
  ghost_founder_activated boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint immigration_user_unique unique (user_id)
);

alter table immigration_status enable row level security;
create policy immigration_owner on immigration_status
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Border crossing log (Tool #282 provisionTravelShadow)
create table if not exists public.border_crossing_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('entry','exit','transit')),
  country_from text,
  country_to text,
  port_of_entry text,
  crossing_at timestamptz not null default now(),
  device_wipe_executed boolean default false,
  data_cold_stored boolean default false,
  artifact_verified boolean default false,
  risk_level text default 'low',
  notes text
);
create index if not exists border_crossing_user_idx on border_crossing_log(user_id);
create index if not exists border_crossing_date_idx on border_crossing_log(crossing_at);

alter table border_crossing_log enable row level security;
create policy border_crossing_owner on border_crossing_log
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- GAP 13: Compliance Audit Trail (exportable for regulators)
-- ===========================================================================

create table if not exists public.compliance_audit_trail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null
    check (domain in ('tax','securities','labor','privacy','export_control','sanctions','environmental','energy','aviation','immigration','consumer_protection','data_governance','ai_safety','other')),
  action_taken text not null,
  regulation_ref text,
  entity_ref uuid references public.government_entities(id),
  result text not null default 'compliant'
    check (result in ('compliant','non_compliant','remediated','waiver','pending','exemption')),
  evidence_refs jsonb default '[]',
  agent_id text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists compliance_trail_user_idx on compliance_audit_trail(user_id);
create index if not exists compliance_trail_domain_idx on compliance_audit_trail(domain);
create index if not exists compliance_trail_result_idx on compliance_audit_trail(result);
create index if not exists compliance_trail_date_idx on compliance_audit_trail(created_at);

alter table compliance_audit_trail enable row level security;
create policy compliance_trail_owner on compliance_audit_trail
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===========================================================================
-- GAP 14: Whistleblower Protection
-- ===========================================================================

create table if not exists public.whistleblower_submissions (
  id uuid primary key default gen_random_uuid(),
  -- anonymous: user_id is nullable for anonymous submissions
  user_id uuid references auth.users(id) on delete set null,
  submission_type text not null default 'report'
    check (submission_type in ('report','evidence','tip','retaliation_claim')),
  target_entity text,
  target_entity_type text default 'corporate'
    check (target_entity_type in ('corporate','government','law_enforcement','military','financial','healthcare','other')),
  category text not null
    check (category in ('fraud','corruption','abuse_of_power','safety_violation','discrimination','retaliation','data_breach','environmental','financial_crime','other')),
  description text not null,
  evidence_refs jsonb default '[]',
  severity text default 'medium'
    check (severity in ('low','medium','high','critical','existential')),
  status text not null default 'received'
    check (status in ('received','under_review','verified','forwarded','protected','resolved','dismissed')),
  anonymous boolean default true,
  protection_activated boolean default false,
  retaliation_detected boolean default false,
  forwarded_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whistleblower_status_idx on whistleblower_submissions(status);
create index if not exists whistleblower_category_idx on whistleblower_submissions(category);

alter table whistleblower_submissions enable row level security;
-- Anonymous read: only your own submissions (if not anonymous)
create policy whistleblower_owner on whistleblower_submissions
  for select to authenticated
  using (user_id = auth.uid() or anonymous = true);
create policy whistleblower_insert on whistleblower_submissions
  for insert to authenticated
  with check (true);

-- ===========================================================================
-- SOVEREIGN FUNCTIONS: Government-in-the-Loop Queries
-- ===========================================================================

-- Check expiring permits (heartbeat cron uses this)
create or replace function public.check_expiring_permits(
  p_user_id uuid,
  p_days_ahead integer default 30
)
returns table (
  permit_id uuid,
  permit_type text,
  jurisdiction text,
  expiry_date date,
  days_until_expiry integer,
  renewal_status text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    sp.id as permit_id,
    sp.permit_type,
    sp.jurisdiction,
    sp.expiry_date,
    (sp.expiry_date - current_date)::integer as days_until_expiry,
    sp.renewal_status
  from public.sovereign_permits sp
  where sp.user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and sp.expiry_date <= current_date + (p_days_ahead || ' days')::interval
    and sp.renewal_status not in ('revoked','suspended')
  order by sp.expiry_date asc;
$$;

-- Government compliance summary (for dashboard)
create or replace function public.get_compliance_summary(
  p_user_id uuid
)
returns table (
  domain text,
  total_actions bigint,
  compliant_count bigint,
  non_compliant_count bigint,
  compliance_rate numeric,
  last_audit timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    cat.domain,
    count(*) as total_actions,
    count(*) filter (where cat.result = 'compliant') as compliant_count,
    count(*) filter (where cat.result = 'non_compliant') as non_compliant_count,
    case when count(*) > 0
      then round(count(*) filter (where cat.result in ('compliant','remediated','exemption'))::numeric / count(*)::numeric * 100, 1)
      else 100
    end as compliance_rate,
    max(cat.created_at) as last_audit
  from public.compliance_audit_trail cat
  where cat.user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
  group by cat.domain
  order by compliance_rate asc;
$$;

-- Filing deadline alerts
create or replace function public.get_upcoming_deadlines(
  p_user_id uuid,
  p_days_ahead integer default 30
)
returns table (
  item_type text,
  item_id uuid,
  title text,
  deadline date,
  days_until integer,
  jurisdiction text,
  status text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  -- Regulatory filings
  select
    'filing' as item_type,
    rf.id as item_id,
    rf.title,
    rf.due_date as deadline,
    (rf.due_date - current_date)::integer as days_until,
    rf.jurisdiction,
    rf.status
  from public.regulatory_filings rf
  where rf.user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and rf.due_date <= current_date + (p_days_ahead || ' days')::interval
    and rf.status not in ('approved','archived','submitted')

  union all

  -- Permit expirations
  select
    'permit' as item_type,
    sp.id as item_id,
    sp.permit_type || ' — ' || sp.jurisdiction as title,
    sp.expiry_date as deadline,
    (sp.expiry_date - current_date)::integer as days_until,
    sp.jurisdiction,
    sp.renewal_status as status
  from public.sovereign_permits sp
  where sp.user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and sp.expiry_date <= current_date + (p_days_ahead || ' days')::interval
    and sp.renewal_status not in ('revoked','suspended')

  union all

  -- Legal proceeding deadlines
  select
    'proceeding' as item_type,
    lp.id as item_id,
    lp.caption as title,
    lp.next_deadline as deadline,
    (lp.next_deadline - current_date)::integer as days_until,
    lp.jurisdiction,
    lp.status
  from public.legal_proceedings lp
  where lp.user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and lp.next_deadline <= current_date + (p_days_ahead || ' days')::interval
    and lp.status not in ('settled','dismissed','closed')

  union all

  -- FOIA response deadlines
  select
    'foia' as item_type,
    fr.id as item_id,
    'FOIA: ' || fr.target_agency_name as title,
    fr.response_due::date as deadline,
    (fr.response_due::date - current_date)::integer as days_until,
    'US-Federal' as jurisdiction,
    fr.status
  from public.foia_requests fr
  where fr.user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and fr.response_due <= current_date + (p_days_ahead || ' days')::interval
    and fr.status not in ('fulfilled','denied','withdrawn')

  order by deadline asc;
$$;

-- Revoke public, grant to authenticated
revoke all on function public.check_expiring_permits(uuid, integer) from public;
revoke all on function public.get_compliance_summary(uuid) from public;
revoke all on function public.get_upcoming_deadlines(uuid, integer) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.check_expiring_permits(uuid, integer) to authenticated;
    grant execute on function public.get_compliance_summary(uuid) to authenticated;
    grant execute on function public.get_upcoming_deadlines(uuid, integer) to authenticated;
  end if;
end $$;

commit;
