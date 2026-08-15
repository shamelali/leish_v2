-- Leish v2 — Row Level Security
-- Design note: this REPLACES the hand-rolled `app/admin/layout.tsx` role
-- check from v1 (which incorrectly let studio_manager into /admin). RLS is
-- enforced at the DB layer so a UI guard bug can no longer leak data.

alter table public.profiles enable row level security;
alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.payment_transactions enable row level security;

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── profiles ────────────────────────────────────────────────────────────
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- ── providers ───────────────────────────────────────────────────────────
create policy "providers_select_active_public" on public.providers
  for select using (is_active = true or profile_id = auth.uid() or public.is_admin());
create policy "providers_insert_own" on public.providers
  for insert with check (profile_id = auth.uid());
create policy "providers_update_own_or_admin" on public.providers
  for update using (profile_id = auth.uid() or public.is_admin());

-- ── services ────────────────────────────────────────────────────────────
create policy "services_select_public" on public.services
  for select using (
    is_active = true
    or exists (select 1 from public.providers p where p.id = provider_id and p.profile_id = auth.uid())
    or public.is_admin()
  );
create policy "services_write_own" on public.services
  for all using (
    exists (select 1 from public.providers p where p.id = provider_id and p.profile_id = auth.uid())
  );

-- ── availability_slots ──────────────────────────────────────────────────
create policy "availability_select_public" on public.availability_slots
  for select using (true);
create policy "availability_write_own" on public.availability_slots
  for all using (
    exists (select 1 from public.providers p where p.id = provider_id and p.profile_id = auth.uid())
    or public.is_admin()
  );

-- ── bookings ────────────────────────────────────────────────────────────
-- Clients see their own bookings; providers see bookings made against them;
-- admins see everything. No one can UPDATE amount/deposit_amount directly —
-- those are only ever written by the server action / webhook handler using
-- the service-role key, which bypasses RLS by design.
create policy "bookings_select_participant" on public.bookings
  for select using (
    client_id = auth.uid()
    or exists (select 1 from public.providers p where p.id = provider_id and p.profile_id = auth.uid())
    or public.is_admin()
  );
create policy "bookings_insert_own_client" on public.bookings
  for insert with check (client_id = auth.uid());

-- ── payment_transactions ────────────────────────────────────────────────
-- Written only by the webhook handler via service-role key. No client
-- insert/update policy exists on purpose.
create policy "payment_transactions_select_participant" on public.payment_transactions
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.client_id = auth.uid()
             or exists (select 1 from public.providers p where p.id = b.provider_id and p.profile_id = auth.uid()))
    )
    or public.is_admin()
  );
