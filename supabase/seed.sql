-- Demo portfolio for local development (runs after migrations when using `supabase db reset`
-- with `[db.seed]` enabled in config.toml). Skips if no auth user or a row already exists.

insert into public.company_portfolio (
  owner_user_id,
  company_name,
  company_type,
  domain,
  status,
  autopilot_enabled,
  monthly_revenue_usd,
  monthly_cost_usd,
  health_score
)
select
  u.id,
  'Local Demo Co',
  'saas',
  'demo.local',
  'active',
  true,
  42000,
  18000,
  82
from auth.users u
where not exists (select 1 from public.company_portfolio p where p.company_name = 'Local Demo Co')
order by u.created_at asc
limit 1;
