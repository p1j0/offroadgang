-- ============================================================
--  user_seen_state.sql
--  Per-user "seen" markers for badges, banners and site changelog
-- ============================================================

create table if not exists public.user_seen_state (
  user_id   uuid references auth.users(id) on delete cascade not null,
  scope_id  text not null,       -- tour id, community id, or 'site'
  seen_key  text not null,       -- chat, changelog, info, media, plan-chat, ...
  seen_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_id, seen_key)
);

alter table public.user_seen_state enable row level security;

drop policy if exists "User kann eigene seen marker lesen" on public.user_seen_state;
create policy "User kann eigene seen marker lesen"
  on public.user_seen_state for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "User kann eigene seen marker setzen" on public.user_seen_state;
create policy "User kann eigene seen marker setzen"
  on public.user_seen_state for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "User kann eigene seen marker aktualisieren" on public.user_seen_state;
create policy "User kann eigene seen marker aktualisieren"
  on public.user_seen_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_user_seen_state_scope
  on public.user_seen_state (user_id, scope_id);
