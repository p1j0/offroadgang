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
