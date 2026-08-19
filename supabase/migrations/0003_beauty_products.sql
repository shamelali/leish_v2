-- Leish v2 — Beauty Product Catalog & Friends-of-Friends Referral System
-- Scope: Beauty FOF startup feature addition to existing leish_v2 platform

-- ── products ────────────────────────────────────────────────────────────
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  brand text,
  image_url text,
  rating numeric(3,2) default 0 check (rating >= 0 and rating <= 5),
  review_count integer default 0,
  is_featured boolean default false,
  stock_count integer default 0,
  min_order integer default 1,
  return_policy text,
  ingredients text,
  is_clean boolean default true,
  is_cruelty_free boolean default true,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS and default policies
alter table public.products enable row level security;

-- Everyone can view products (catalog browsing)
create policy "products_select_public" on public.products
  for select using (true);

-- Admins can manage products
create policy "products_manage_admin" on public.products
  for all using (public.is_admin())
  with check (public.is_admin());

-- ── product_reviews ────────────────────────────────────────────────────
create table if not exists public.product_reviews (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating numeric(3,2) not null check (rating >= 1 and rating <= 5),
  title text,
  comment text,
  verified_purchase boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.product_reviews enable row level security;

-- Users can view all reviews; users can only create their own reviews
create policy "product_reviews_select_public" on public.product_reviews
  for select using (true);

create policy "product_reviews_insert_own" on public.product_reviews
  for insert with check (user_id = auth.uid());

create policy "product_reviews_update_own" on public.product_reviews
  for update using (user_id = auth.uid());

create policy "product_reviews_delete_own" on public.product_reviews
  for delete using (user_id = auth.uid());

-- ── referrals ──────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id uuid primary key default uuid_generate_v4(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'pending',
  check (status in ('pending', 'completed', 'cancelled')),
  reward_amount numeric(10,2) default 0 check (reward_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.referrals enable row level security;

-- Users can view their own referrals and referee's status
create policy "referrals_select_own" on public.referrals
  for select using (referrer_id = auth.uid() or referee_id = auth.uid());

create policy "referrals_insert_own" on public.referrals
  for insert with check (referrer_id = auth.uid());

create policy "referrals_update_own_status" on public.referrals
  for update using (referrer_id = auth.uid())
  with check (referrer_id = auth.uid());

-- Indexes for performance
create index referrals_referrer_id_idx on public.referrals(referrer_id);
create index referrals_referee_id_idx on public.referrals(referee_id);
create index referrals_product_id_idx on public.referrals(product_id);
create index products_category_idx on public.products(category);
create index products_is_featured_idx on public.products(is_featured);