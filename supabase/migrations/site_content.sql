-- ============================================================
--  site_content.sql
--  Editable info / changelog pages, manageable by site admins
-- ============================================================

create table if not exists public.site_content (
  key         text primary key,           -- e.g. 'info', 'changelog'
  content     text not null default '',   -- markdown
  updated_at  timestamptz default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_content enable row level security;

-- Everyone (even unauthenticated future visitors) can read
drop policy if exists "Jeder kann site_content lesen" on public.site_content;
create policy "Jeder kann site_content lesen"
  on public.site_content for select
  to authenticated
  using (true);

-- Only site_admins can insert / update
drop policy if exists "Site-Admin kann site_content schreiben" on public.site_content;
create policy "Site-Admin kann site_content schreiben"
  on public.site_content for insert
  to authenticated
  with check (exists (
    select 1 from public.site_admins where user_id = auth.uid()
  ));

drop policy if exists "Site-Admin kann site_content aktualisieren" on public.site_content;
create policy "Site-Admin kann site_content aktualisieren"
  on public.site_content for update
  to authenticated
  using (exists (
    select 1 from public.site_admins where user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.site_admins where user_id = auth.uid()
  ));

-- Seed initial rows so site admins have something to edit
insert into public.site_content (key, content) values
  ('info', '# Über MotoRoute

Willkommen bei MotoRoute! Diese App hilft Motorrad-Tourern, Routen zu planen und sich innerhalb ihrer Community auszutauschen.

_Dieser Text kann von Seitenadmins bearbeitet werden._'),
  ('changelog', '# Änderungsprotokoll

## Version 1.14 — April 2026
- 🗺️ TET Atlas direkt aus der Community-Homepage erreichbar
- ℹ️ Neue Info- und Changelog-Seite

## Version 1.13
- Erste produktive Version mit PWA-Unterstützung

_Dieser Text kann von Seitenadmins bearbeitet werden._')
on conflict (key) do nothing;
