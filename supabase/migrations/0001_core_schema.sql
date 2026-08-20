-- Leish v2 — core schema
-- Scope: client-side booking loop only (MUAs, not studios). Studios are
-- deliberately deferred — see docs/ARCHITECTURE.md for the v1 scope cut.

create extension if not exists "uuid-ossp";

-- ── profiles ────────────────────────────────────────────────────────────
-- One row per auth.users row, created by trigger below.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'artist', 'admin')),
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── providers (MUAs) ────────────────────────────────────────────────────
create table public.providers (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slug text unique not null,
  display_name text not null,
  bio text,
  state text,
  district text,
  specialties text[] not null default '{}',
  default_deposit_percent numeric(5,2) not null default 30.00
    check (default_deposit_percent >= 0 and default_deposit_percent <= 100),
  is_active boolean not null default false, -- flips true on admin approval
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index providers_profile_id_idx on public.providers(profile_id);
create index providers_active_idx on public.providers(is_active) where is_active = true;

-- ── services ────────────────────────────────────────────────────────────
create table public.services (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  duration_minutes int not null check (duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index services_provider_id_idx on public.services(provider_id);

-- ── availability ────────────────────────────────────────────────────────
create table public.availability_slots (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_booked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint availability_valid_range check (end_at > start_at)
);

create index availability_provider_time_idx
  on public.availability_slots(provider_id, start_at)
  where is_booked = false;

-- ── bookings ────────────────────────────────────────────────────────────
-- amount / deposit_amount are ALWAYS server-derived. Never trust client input
-- for these columns — see src/lib/actions/bookings.ts.
create table public.bookings (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.providers(id),
  service_id uuid not null references public.services(id),
  slot_id uuid not null references public.availability_slots(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'completed', 'cancelled', 'disputed')),
  amount numeric(10,2) not null,
  deposit_amount numeric(10,2) not null,
  commission_percent numeric(5,2) not null default 12.00,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_client_id_idx on public.bookings(client_id);
create index bookings_provider_id_idx on public.bookings(provider_id);
create index bookings_status_idx on public.bookings(status);

-- Prevent double-booking the same slot at the DB level, not just app logic.
create unique index bookings_slot_unique_idx
  on public.bookings(slot_id)
  where status not in ('cancelled');

-- ── payment_transactions ──────────────────────────────────────────────────
-- Append-only log of every Billplz webhook event received, keyed by bill_id.
-- Keep this even after booking status changes — it's your audit trail for
-- the live-money E2E test and any future dispute.
create table public.payment_transactions (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references public.bookings(id),
  billplz_bill_id text not null unique,
  amount numeric(10,2) not null,
  paid boolean not null default false,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index payment_transactions_booking_id_idx on public.payment_transactions(booking_id);

-- updated_at triggers
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger providers_set_updated_at before update on public.providers
  for each row execute procedure public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute procedure public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ── PDPA Malaysia compliance ────────────────────────────────────────────
-- consent and retention tracking
alter table public.users add column if not exists consent boolean not null default false;
alter table public.users add column if not exists consent_timestamp text;
