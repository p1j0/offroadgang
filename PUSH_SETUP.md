# PWA Push Notifications – Setup Anleitung

## Deine VAPID Keys (bereits generiert!)

```
PUBLIC KEY (in config.js eingetragen):
BFU6H4JSsYeG8nWKdpGBlp8yDfG0bMp7tVgT64nCV2kn8_yXzhn7TuC-HONtffEcRNtDE3r5P1UafTrnyGBaQAY

PRIVATE KEY (PEM – NUR im Supabase Secret speichern, niemals ins Git!):
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIAo/N/dP1sf5jhcMN0iW7onD6ew//qHNspYQbTpW6hQooAoGCCqGSM49
AwEHoUQDQgAEVTofglKxh4bydYp2kYGWnzIN8bRsynu1WBPricJXaSfz/JfOGftO
4L4c42198RxE20MTevk/VRp9OufIYFpABg==
-----END EC PRIVATE KEY-----
```

⚠️ Diese Keys sind für deine Installation spezifisch. Nicht teilen, nicht ins GitHub!

---

## Schritt 1 – Supabase SQL ausführen

Im Supabase Dashboard → **SQL Editor → New Query**:

```sql
-- Datei: supabase/migrations/push_subscriptions.sql
-- (Inhalt der Datei einfügen und ausführen)
```

---

## Schritt 2 – Supabase Secrets setzen

Im Supabase Dashboard → **Settings → Edge Functions → Secrets → Add Secret**:

| Name | Wert |
|------|------|
| `VAPID_PRIVATE_KEY` | Den PEM-Key oben (Newlines als `\n` ersetzen, also alles in eine Zeile) |
| `VAPID_PUBLIC_KEY`  | `BFU6H4JSsYeG8nWKdpGBlp8yDfG0bMp7tVgT64nCV2kn8_yXzhn7TuC-HONtffEcRNtDE3r5P1UafTrnyGBaQAY` |
| `VAPID_SUBJECT`     | `mailto:deine@email.de` (deine E-Mail) |

**VAPID_PRIVATE_KEY einzeilig** (alles zwischen BEGIN und END, Newlines durch `\n` ersetzen):
```
-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIAo/N/dP1sf5jhcMN0iW7onD6ew//qHNspYQbTpW6hQooAoGCCqGSM49\nAwEHoUQDQgAEVTofglKxh4bydYp2kYGWnzIN8bRsynu1WBPricJXaSfz/JfOGftO\n4L4c42198RxE20MTevk/VRp9OufIYFpABg==\n-----END EC PRIVATE KEY-----
```

---

## Schritt 3 – Edge Function deployen

Voraussetzung: [Supabase CLI](https://supabase.com/docs/guides/cli) installiert.

```bash
# Einmalig einloggen
supabase login

# Im Projektverzeichnis (motoroute_clean/)
supabase link --project-ref kkoeeyqxubtcqvonckss

# Function deployen
supabase functions deploy send-push --no-verify-jwt
```

Nach dem Deploy ist die Function erreichbar unter:
```
https://kkoeeyqxubtcqvonckss.supabase.co/functions/v1/send-push
```

---

## Schritt 4 – App deployen (Netlify)

Den ZIP wie gewohnt auf Netlify deployen. Der neue `sw.js` und `manifest.json` müssen im Root liegen (sind sie bereits).

---

## Schritt 5 – Testen

### Push-Subscription aktivieren (Browser):
1. App öffnen (auf echtem Gerät oder Desktop Chrome)
2. Profil → "Push-Benachrichtigungen aktivieren" → Erlauben
3. In Supabase → Table Editor → `push_subscriptions` prüfen ob ein Eintrag erscheint

### Test-Push senden (z.B. via curl):
```bash
curl -X POST https://kkoeeyqxubtcqvonckss.supabase.co/functions/v1/send-push \
  -H "Authorization: Bearer DEIN_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_ids": ["DEINE_USER_UUID"],
    "title": "MotoRoute Test 🏍️",
    "body": "Push funktioniert!",
    "url": "/"
  }'
```

Den **Service Role Key** findest du in Supabase → **Settings → API → service_role** (geheim halten!).
Die **User UUID** findest du in Supabase → **Authentication → Users**.

---

## Schritt 6 – Push aus der App auslösen

Die Edge Function kann jetzt von beliebigen Stellen aufgerufen werden, z.B.:
- Wenn jemand im Chat schreibt → alle anderen Mitglieder benachrichtigen
- Wenn ein Admin eine Tour ändert → Mitglieder informieren

Beispiel in `api.js`:
```javascript
async function sendPushToUsers(userIds, title, body, url = '/') {
  await fetch(
    'https://kkoeeyqxubtcqvonckss.supabase.co/functions/v1/send-push',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_ids: userIds, title, body, url })
    }
  );
}
```

⚠️ Den Service Role Key **nicht** im Frontend einbetten! Stattdessen Push-Calls über eine zweite Supabase Edge Function tunneln die nur der eingeloggte User aufrufen darf.

---

## iOS Einschränkung (EU)

Für deutsche iPhones gilt leider: iOS 17.4+ in der EU unterstützt PWA Push nicht. 
Mitglieder mit iPhone erhalten stattdessen weiterhin E-Mail-Benachrichtigungen.
Android-Nutzer und Desktop bekommen Push ohne Einschränkungen.
