# 🏍️ MotoRoute

Motorrad-Touren gemeinsam entdecken und planen.  
Eine Single-Page-App ohne Build-Step – einfach die Dateien auf einen Webserver legen und loslegen.

🌐 **Live:** [offroadtours.netlify.app](https://offroadtours.netlify.app)

---

## Features

### Rider Groups
Nutzer können mehreren Rider Groups angehören. Jede Gruppe hat eigene Touren, einen Planungsbereich und eine Mediengalerie. Beim Login kann eine bevorzugte „Home Rider Group" gesetzt werden, auf die automatisch weitergeleitet wird.

### Touren & Karte
- Passwortgeschützte Gruppen-Touren mit Admin- und Co-Admin-Rolle
- GPX-Upload, interaktive Leaflet-Karte (OpenStreetMap), Routen-Download
- Ziel, Distanz, Treffpunkt (mit Uhrzeit und Google-Maps-Link), Beschreibung – vom Admin editierbar
- Kompakter Tour-Kalender in der Übersicht mit Monats- und Wochenansicht

### Check-ins & Wetter
- Mitglieder können sich für Touren an- oder abmelden
- Automatische Wettervorschau für die Tourtage via Open-Meteo (kein API-Key nötig)
- Koordinaten werden aus dem Treffpunkt-Maps-Link extrahiert (inkl. Auflösung von goo.gl-Kurzlinks)

### Echtzeit-Chat
- Gruppen-Chat pro Tour (Supabase Realtime)
- Community-Chat im Planungsbereich

### Planungsbereich
- Gemeinschaftliche Jahres- und Monatskalender mit Kalenderwochen (KW)
- Abfragen / Polls mit Datumsauswahl und Voter-Avataren
- Planungstermine werden farbig im Kalender hervorgehoben
- Badge-System: neue Inhalte werden in den Tabs angezeigt

### Mediengalerie
- Fotos und Videos je Tour und Community
- Sortierung nach Tour oder Gesamtgalerie

### Info-Tab
- Alle Tour-Details auf einen Blick
- Banner für Änderungen seit dem letzten Besuch

### PWA-Support
- Installierbar als Progressive Web App (Manifest + Service Worker)

### Admin-Werkzeuge (Seitenadmin)
- Rider Groups verwalten: erstellen, bearbeiten, Mitglieder entfernen
- Reihenfolge der Rider Groups per Drag & Drop ändern
- Nutzerverwaltung

---

## Projektstruktur

```
motoroute/
├── index.html              Entry point
├── .gitignore
├── README.md
├── css/
│   ├── styles.css          Alle Basis-Styles (CSS-Variablen, Dark Theme)
│   └── theme-premium.css   Premium-Theme-Overrides
└── js/
    ├── config.js           Supabase-Client & Konstanten
    ├── state.js            Globaler App-State & Leaflet-Variablen
    ├── utils.js            Hilfsfunktionen (esc, toast, setBtn, _timeAgo, …)
    ├── api.js              Alle Supabase DB-Calls
    ├── auth.js             Login · Register · Logout
    ├── map.js              Leaflet-Karte · GPX parsen / zeichnen / download
    ├── render.js           HTML-Rendering (pure functions)
    ├── events.js           DOM-Event-Handler
    ├── app.js              Router · render() · init() · Realtime-Subscriptions
    └── pwa.js              PWA-Registrierung (Service Worker)
```

---

## Deployment

Das Projekt benötigt **keinen Build-Step**. Einfach alle Dateien auf einen statischen Webserver hochladen:

- **GitHub Pages** – Repository → Settings → Pages → Branch `main` / Root
- **Netlify / Vercel** – Ordner direkt deployen (Drag & Drop)
- **Beliebiger Webserver** – Apache, Nginx, etc.

> ⚠️ Die App muss über **HTTPS** ausgeliefert werden, da Supabase HTTPS-Origins voraussetzt.

---

## Konfiguration

Supabase URL und Anon-Key werden in `js/config.js` gesetzt:

```js
const SUPABASE_URL  = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_ANON = 'DEIN-ANON-KEY';
```

Das Datenbank-Schema (Tabellen, RLS-Policies, Migrationen) wird direkt über das Supabase-Dashboard verwaltet.

---

## Technik-Stack

| Bereich | Technologie |
|---|---|
| Frontend | Vanilla JS (ES2020), kein Framework, kein Build-Tool |
| Styling | CSS Custom Properties, Dark Theme |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Karte | Leaflet.js + OpenStreetMap |
| Wetter | Open-Meteo API (kostenlos, kein Key) |
| Hosting | Statischer Webserver / GitHub Pages |
