-- ============================================================
-- Communities Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create communities table
create table if not exists public.communities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  password      text not null,
  admin_id      uuid references auth.users(id) on delete cascade not null,
  co_admin_ids  uuid[] default '{}',
  created_at    timestamptz default now()
);

-- 2. Create community_members table
create table if not exists public.community_members (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  created_at    timestamptz default now(),
  unique (community_id, user_id)
);

-- 3. Add community_id to tours
alter table public.tours
  add column if not exists community_id uuid references public.communities(id) on delete cascade;

-- 4. RLS policies for communities
alter table public.communities enable row level security;

create policy "Communities lesbar für alle authentifizierten"
  on public.communities for select
  to authenticated
  using (true);

create policy "Admin kann Community erstellen"
  on public.communities for insert
  to authenticated
  with check (auth.uid() = admin_id);

create policy "Admin kann Community bearbeiten"
  on public.communities for update
  to authenticated
  using (
    auth.uid() = admin_id or
    auth.uid() = any(co_admin_ids)
  );

create policy "Admin kann Community löschen"
  on public.communities for delete
  to authenticated
  using (auth.uid() = admin_id);

-- 5. RLS policies for community_members
alter table public.community_members enable row level security;

create policy "Mitglieder sind sichtbar für Community-Mitglieder"
  on public.community_members for select
  to authenticated
  using (true);

create policy "User kann Community beitreten"
  on public.community_members for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "User kann Community verlassen"
  on public.community_members for delete
  to authenticated
  using (auth.uid() = user_id);

-- 6. Create initial community "Reise Offroad Yuppies"
-- NOTE: Replace YOUR_USER_ID with your actual user ID from auth.users
-- You can find it in Supabase Dashboard → Authentication → Users
-- Or run: select id from auth.users limit 5;

do $$
declare
  v_community_id uuid;
  v_admin_id uuid;
begin
  -- Get first user as admin (replace if needed)
  select id into v_admin_id from auth.users order by created_at limit 1;

  -- Insert community
  insert into public.communities (name, password, admin_id)
  values ('Reise Offroad Yuppies', 'OffroadGang', v_admin_id)
  returning id into v_community_id;

  -- Assign all existing tours to this community
  update public.tours set community_id = v_community_id;

  -- Add admin as community member
  insert into public.community_members (community_id, user_id)
  values (v_community_id, v_admin_id)
  on conflict do nothing;

  raise notice 'Community created with ID: %', v_community_id;
end $$;

-- ============================================================
-- Site Admin & Community Approval
-- ============================================================

-- Site admin table (only site admins can approve new communities)
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.site_admins enable row level security;
create policy "Jeder kann site_admins lesen" on public.site_admins for select to authenticated using (true);

-- Add Ivan as site admin (replace with actual user id)
-- You need to run this after finding Ivan's user ID:
-- INSERT INTO public.site_admins (user_id) VALUES ('IVAN_USER_ID_HERE');

-- Approval column on communities
alter table public.communities add column if not exists approved boolean default false;

-- Pending communities table for approval requests
create table if not exists public.community_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  password      text not null,
  requested_by  uuid references auth.users(id) on delete cascade not null,
  username      text not null,
  status        text default 'pending',  -- 'pending', 'approved', 'rejected'
  created_at    timestamptz default now()
);
alter table public.community_requests enable row level security;
create policy "Jeder kann Requests lesen" on public.community_requests for select to authenticated using (true);
create policy "User kann Request erstellen" on public.community_requests for insert to authenticated with check (auth.uid() = requested_by);
create policy "Admin kann Requests ändern" on public.community_requests for update to authenticated using (true) with check (true);

-- Allow site admins to manage site_admins table
create policy "Admin kann site_admins hinzufügen" on public.site_admins for insert to authenticated with check (true);
create policy "Admin kann site_admins entfernen" on public.site_admins for delete to authenticated using (true);
