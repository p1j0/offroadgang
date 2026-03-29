# 🏍️ MotoRoute

Motorrad-Touren gemeinsam entdecken und planen.  
Eine Single-Page-App ohne Build-Step – einfach die Dateien auf einen Webserver legen und loslegen.

Web: https://offroadtours.netlify.app

---

## Features

| Feature | Details |
|---|---|
| 🔐 Auth | Benutzername + Passwort (via Supabase Auth) |
| 🗺️ Karte | OpenStreetMap / Leaflet – GPX hochladen, Route anzeigen & herunterladen |
| 👥 Touren | Passwortgeschützte Gruppen-Touren; Admin-Rolle |
| 💬 Chat | Echtzeit-Gruppenchat pro Tour |
| 📅 Kalender | Planungskalender mit individuellen Terminen |
| 📋 Details | Ziel, Distanz, Beschreibung – vom Admin editierbar |

---

## Projektstruktur

```
motoroute/
├── index.html          Entry point
├── .gitignore
├── README.md
├── css/
│   └── styles.css      Alle Styles (CSS-Variablen, Dark Theme)
└── js/
    ├── config.js       Supabase-Client & Konstanten
    ├── state.js        Globaler State & Leaflet-Variablen
    ├── utils.js        Hilfsfunktionen (esc, toast, setBtn, …)
    ├── api.js          Alle Supabase DB-Calls
    ├── auth.js         Login · Register · Logout
    ├── map.js          Leaflet-Karte · GPX parsen/zeichnen/download
    ├── render.js       HTML-Rendering (pure functions)
    ├── events.js       DOM-Event-Handler
    └── app.js          Router · render() · init()
```

---

## Supabase Setup

### 1. E-Mail-Bestätigung deaktivieren

`Authentication → Providers → Email → "Confirm email"` **ausschalten**

### 2. SQL ausführen (SQL Editor → New Query)

```sql
-- Profiles (Benutzernamen)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profiles lesbar" on public.profiles for select using (true);
create policy "Eigenes Profil erstellen" on public.profiles for insert with check (auth.uid() = id);

-- Touren
create table public.tours (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text default '',
  date date not null, end_date date,
  destination text default '', distance text default '',
  join_password text not null,
  admin_id uuid references auth.users on delete cascade not null,
  gpx_route jsonb, created_at timestamptz default now()
);
alter table public.tours enable row level security;
create policy "Touren lesbar" on public.tours for select to authenticated using (true);
create policy "Tour erstellen" on public.tours for insert to authenticated with check (auth.uid() = admin_id);
create policy "Admin kann updaten" on public.tours for update to authenticated using (auth.uid() = admin_id);

-- Mitglieder
create table public.tour_members (
  tour_id uuid references public.tours on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  joined_at timestamptz default now(),
  primary key (tour_id, user_id)
);
alter table public.tour_members enable row level security;
create policy "Mitglieder lesbar" on public.tour_members for select to authenticated using (true);
create policy "Beitreten" on public.tour_members for insert to authenticated with check (auth.uid() = user_id);

-- Nachrichten
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  username text not null, text text not null,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
create policy "Nachrichten lesbar" on public.messages for select to authenticated using (true);
create policy "Nachricht senden" on public.messages for insert to authenticated with check (auth.uid() = user_id);

-- Planungstermine
create table public.plan_dates (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours on delete cascade not null,
  date date not null, label text default '',
  created_at timestamptz default now()
);
alter table public.plan_dates enable row level security;
create policy "Termine lesbar" on public.plan_dates for select to authenticated using (true);
create policy "Admin fügt Termin hinzu" on public.plan_dates for insert to authenticated
  with check (exists (select 1 from public.tours where id = tour_id and admin_id = auth.uid()));
create policy "Admin löscht Termin" on public.plan_dates for delete to authenticated
  using (exists (select 1 from public.tours where id = tour_id and admin_id = auth.uid()));
```

---

## Deployment

Das Projekt benötigt **keinen Build-Step**. Einfach alle Dateien auf einen statischen Webserver hochladen:

- **GitHub Pages** – Repository → Settings → Pages → Branch `main` / Root
- **Netlify / Vercel** – Ordner direkt deployen (drag & drop)
- **Beliebiger Webserver** – Apache, Nginx, etc.

> ⚠️ Die App muss über HTTPS ausgeliefert werden, da Supabase HTTPS-Origins voraussetzt.

---

## Konfiguration

Supabase URL und Anon-Key werden in `js/config.js` gesetzt:

```js
const SUPABASE_URL  = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_ANON = 'DEIN-ANON-KEY';
```
