-- =============================================================================
-- Labor of Love Marketplace: Non-Scalable Human Experiences
-- Post-work economy where success = Fulfillment Yield, not Profit
-- =============================================================================

-- 1. MARKETPLACE LISTINGS: Offerings of non-scalable human experiences
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  listing_type text not null default 'custom',
    -- 'philosophy_session' | 'handcrafted_art' | 'physical_mentorship' |
    -- 'live_performance' | 'culinary_experience' | 'custom'
  title text not null,
  description text not null,
  delivery_method text not null default 'video_call',
    -- 'in_person' | 'video_call' | 'shipped_physical' | 'hybrid'
  location text,
  latitude numeric,
  longitude numeric,
  max_capacity integer,
  price_tokens numeric,
  price_usd numeric,
  fulfillment_yield numeric default 0,
    -- seller's self-reported satisfaction with offering this experience (0-100)
  authenticity_proof jsonb default '{}'::jsonb,
    -- { artifactVerified?: boolean, photoUrls?: string[], videoUrl?: string }
  human_alpha_required text[] default '{}',
    -- skills/qualities needed to appreciate this experience
  status text not null default 'draft',
    -- 'draft' | 'active' | 'paused' | 'sold_out' | 'archived'
  avg_rating numeric,
  rating_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_listings_type_status_idx on marketplace_listings(listing_type, status);
create index if not exists mkt_listings_seller_idx on marketplace_listings(seller_user_id);
create index if not exists mkt_listings_location_idx on marketplace_listings(latitude, longitude)
  where latitude is not null and longitude is not null;

alter table public.marketplace_listings enable row level security;
create policy "Anyone can browse active listings" on marketplace_listings
  for select using (status = 'active' or auth.uid() = seller_user_id);
create policy "Sellers manage own listings" on marketplace_listings
  for all using (auth.uid() = seller_user_id);

-- 2. MARKETPLACE ORDERS: Purchase/booking records
create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
    -- 'pending' | 'confirmed' | 'in_progress' | 'delivered' | 'completed' | 'disputed' | 'refunded'
  payment_method text not null default 'tokens',
    -- 'tokens' | 'usd' | 'barter'
  amount_tokens numeric,
  amount_usd numeric,
  fulfillment_date timestamptz,
  buyer_fulfillment_yield numeric,
    -- buyer's fulfillment score for this experience (0-100)
  seller_fulfillment_yield numeric,
    -- seller's fulfillment from delivering this experience (0-100)
  review_text text,
  rating numeric,
    -- 1-5 stars
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mkt_orders_buyer_idx on marketplace_orders(buyer_user_id);
create index if not exists mkt_orders_seller_idx on marketplace_orders(seller_user_id);
create index if not exists mkt_orders_status_idx on marketplace_orders(status);

alter table public.marketplace_orders enable row level security;
create policy "Parties can view their orders" on marketplace_orders
  for select using (auth.uid() = buyer_user_id or auth.uid() = seller_user_id);
create policy "Buyers can create orders" on marketplace_orders
  for insert with check (auth.uid() = buyer_user_id);
create policy "Parties can update their orders" on marketplace_orders
  for update using (auth.uid() = buyer_user_id or auth.uid() = seller_user_id);

-- 3. FULFILLMENT YIELD SCORES: Aggregated per-user fulfillment metrics
create table if not exists public.fulfillment_yield_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_experiences_sold integer default 0,
  total_experiences_bought integer default 0,
  avg_seller_fulfillment numeric default 0,
  avg_buyer_fulfillment numeric default 0,
  combined_fulfillment_yield numeric default 0,
    -- weighted average of selling + buying fulfillment
  top_domains text[] default '{}',
  last_activity_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.fulfillment_yield_scores enable row level security;
create policy "Users can read fulfillment scores" on fulfillment_yield_scores
  for select using (true);
create policy "Users manage own scores" on fulfillment_yield_scores
  for all using (auth.uid() = user_id);

-- 4. FUNCTION: Update fulfillment scores after order completion
create or replace function public.update_fulfillment_yield()
returns trigger
language plpgsql security definer
as $$
begin
  -- Update buyer's score
  if NEW.status = 'completed' and NEW.buyer_fulfillment_yield is not null then
    insert into fulfillment_yield_scores (user_id, total_experiences_bought, avg_buyer_fulfillment, combined_fulfillment_yield, last_activity_at, updated_at)
    values (NEW.buyer_user_id, 1, NEW.buyer_fulfillment_yield, NEW.buyer_fulfillment_yield, now(), now())
    on conflict (user_id) do update set
      total_experiences_bought = fulfillment_yield_scores.total_experiences_bought + 1,
      avg_buyer_fulfillment = (
        (fulfillment_yield_scores.avg_buyer_fulfillment * fulfillment_yield_scores.total_experiences_bought + NEW.buyer_fulfillment_yield)
        / (fulfillment_yield_scores.total_experiences_bought + 1)
      ),
      combined_fulfillment_yield = (
        (fulfillment_yield_scores.avg_seller_fulfillment + (
          (fulfillment_yield_scores.avg_buyer_fulfillment * fulfillment_yield_scores.total_experiences_bought + NEW.buyer_fulfillment_yield)
          / (fulfillment_yield_scores.total_experiences_bought + 1)
        )) / 2
      ),
      last_activity_at = now(),
      updated_at = now();
  end if;

  -- Update seller's score
  if NEW.status = 'completed' and NEW.seller_fulfillment_yield is not null then
    insert into fulfillment_yield_scores (user_id, total_experiences_sold, avg_seller_fulfillment, combined_fulfillment_yield, last_activity_at, updated_at)
    values (NEW.seller_user_id, 1, NEW.seller_fulfillment_yield, NEW.seller_fulfillment_yield, now(), now())
    on conflict (user_id) do update set
      total_experiences_sold = fulfillment_yield_scores.total_experiences_sold + 1,
      avg_seller_fulfillment = (
        (fulfillment_yield_scores.avg_seller_fulfillment * fulfillment_yield_scores.total_experiences_sold + NEW.seller_fulfillment_yield)
        / (fulfillment_yield_scores.total_experiences_sold + 1)
      ),
      combined_fulfillment_yield = (
        ((
          (fulfillment_yield_scores.avg_seller_fulfillment * fulfillment_yield_scores.total_experiences_sold + NEW.seller_fulfillment_yield)
          / (fulfillment_yield_scores.total_experiences_sold + 1)
        ) + fulfillment_yield_scores.avg_buyer_fulfillment) / 2
      ),
      last_activity_at = now(),
      updated_at = now();
  end if;

  return NEW;
end;
$$;

create trigger marketplace_order_fulfillment_trigger
  after update on marketplace_orders
  for each row
  when (NEW.status = 'completed' and OLD.status != 'completed')
  execute function update_fulfillment_yield();
