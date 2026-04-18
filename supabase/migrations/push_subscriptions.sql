-- Push Subscriptions für PWA Web Push Notifications
-- Ausführen in: Supabase Dashboard → SQL Editor → New Query

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  endpoint    text not null,
  p256dh      text,
  auth        text,
  updated_at  timestamptz default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Nur eigene Subscriptions lesen/schreiben
create policy "Eigene Subscription lesen"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Eigene Subscription speichern"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Eigene Subscription aktualisieren"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);

create policy "Eigene Subscription löschen"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
