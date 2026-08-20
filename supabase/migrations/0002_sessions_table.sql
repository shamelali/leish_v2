-- ── sessions ────────────────────────────────────────────────────────────
-- JTI (JWT ID) blacklist table. Every access/refresh token includes a
-- unique JTI. Logout sets revoked=true; token verification checks this
-- flag so stale tokens are rejected immediately.
create table public.sessions (
  jti          text primary key,
  user_id      text not null references public.profiles(id) on delete cascade,
  revoked      boolean not null default false,
  expires_at   timestamptz not null
);

create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_revoked_idx on public.sessions(revoked) where revoked = true;