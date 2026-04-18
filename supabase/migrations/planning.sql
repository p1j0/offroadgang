-- ============================================================
-- Planning Page Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Community polls
create table if not exists public.community_polls (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  username      text not null,
  question      text not null,
  options       jsonb not null default '[]',   -- [{id, text}]
  multi         boolean default false,          -- allow multiple choices
  closed        boolean default false,
  created_at    timestamptz default now()
);

-- Poll votes (one row per user per poll)
create table if not exists public.community_poll_votes (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid references public.community_polls(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  username    text not null,
  option_ids  jsonb not null default '[]',     -- array of voted option IDs
  created_at  timestamptz default now(),
  unique(poll_id, user_id)
);

-- Community chat (separate from tour chat)
create table if not exists public.community_messages (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  username      text not null,
  text          text not null,
  created_at    timestamptz default now()
);

-- Community changelog
create table if not exists public.community_changelog (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  username      text not null,
  field         text not null,
  old_value     text default '',
  new_value     text default '',
  created_at    timestamptz default now()
);

-- RLS: community_polls
alter table public.community_polls enable row level security;
create policy "Mitglieder können Polls lesen"   on public.community_polls for select to authenticated using (true);
create policy "Admin kann Poll erstellen"        on public.community_polls for insert to authenticated with check (auth.uid() = user_id);
create policy "Admin kann Poll schließen"        on public.community_polls for update to authenticated using (auth.uid() = user_id);
create policy "Admin kann Poll löschen"          on public.community_polls for delete to authenticated using (auth.uid() = user_id);

-- RLS: community_poll_votes
alter table public.community_poll_votes enable row level security;
create policy "Jeder kann Votes lesen"          on public.community_poll_votes for select to authenticated using (true);
create policy "User kann abstimmen"             on public.community_poll_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "User kann Vote ändern"           on public.community_poll_votes for update to authenticated using (auth.uid() = user_id);
create policy "User kann Vote löschen"          on public.community_poll_votes for delete to authenticated using (auth.uid() = user_id);

-- RLS: community_messages
alter table public.community_messages enable row level security;
create policy "Mitglieder können Nachrichten lesen"    on public.community_messages for select to authenticated using (true);
create policy "Mitglieder können Nachrichten senden"   on public.community_messages for insert to authenticated with check (auth.uid() = user_id);

-- RLS: community_changelog
alter table public.community_changelog enable row level security;
create policy "Mitglieder können Log lesen"    on public.community_changelog for select to authenticated using (true);
create policy "Log eintragen"                  on public.community_changelog for insert to authenticated with check (auth.uid() = user_id);

-- ============================================================
-- Jahresplanung extension (run after initial planning.sql)
-- ============================================================

-- Add poll_type and year to community_polls
alter table public.community_polls
  add column if not exists poll_type text default 'general',   -- 'general' | 'yearly'
  add column if not exists poll_year  int  default null;       -- e.g. 2026

-- Options for yearly polls also have date_start / date_end
-- These are stored as JSON inside the options jsonb:
-- [{ id, text, date_start, date_end }]
-- No schema change needed — already jsonb.
