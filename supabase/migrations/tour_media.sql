-- ============================================================
-- Tour Media (Cloudinary + YouTube)
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists public.tour_media (
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid references public.tours(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  username      text not null,
  media_type    text not null,          -- 'image' | 'video' | 'youtube'
  url           text not null,          -- Cloudinary URL or YouTube watch URL
  thumbnail_url text default '',        -- Cloudinary thumbnail or YouTube thumbnail
  public_id     text default '',        -- Cloudinary public_id (for deletion)
  caption       text default '',
  file_size     int default 0,          -- bytes (0 for YouTube)
  created_at    timestamptz default now()
);

alter table public.tour_media enable row level security;

create policy "Mitglieder können Media lesen"
  on public.tour_media for select to authenticated using (true);

create policy "User kann Media hochladen"
  on public.tour_media for insert to authenticated
  with check (auth.uid() = user_id);

create policy "User kann eigenes Media löschen"
  on public.tour_media for delete to authenticated
  using (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists idx_tour_media_tour_id on public.tour_media(tour_id);

-- Pinned media (run after initial tour_media table exists)
alter table public.tour_media add column if not exists pinned boolean default false;

-- Allow admins to update pinned status
create policy "Admin kann Media pinnen"
  on public.tour_media for update to authenticated
  using (true)
  with check (true);

-- Sort order for admin drag & drop reordering
alter table public.tour_media add column if not exists sort_order int default 0;

-- ============================================================
-- Community Media (YouTube library per community)
-- ============================================================

create table if not exists public.community_media (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  username      text not null,
  media_type    text not null default 'youtube',
  url           text not null,
  thumbnail_url text default '',
  caption       text default '',
  pinned        boolean default false,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

alter table public.community_media enable row level security;

create policy "Mitglieder können Community Media lesen"
  on public.community_media for select to authenticated using (true);
create policy "User kann Community Media hinzufügen"
  on public.community_media for insert to authenticated with check (auth.uid() = user_id);
create policy "Admin kann Community Media ändern"
  on public.community_media for update to authenticated using (true) with check (true);
create policy "User kann eigenes Community Media löschen"
  on public.community_media for delete to authenticated using (auth.uid() = user_id);

create index if not exists idx_community_media_cid on public.community_media(community_id);
