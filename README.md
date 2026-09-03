# Masa Oyunları

Echtzeit-Multiplayer-Webapp für klassische türkische Brett-/Tischspiele (Okey, Tavla).

Stack: React 19 + Vite + Zustand + Tailwind 4 (Frontend), Express + Socket.io (Backend), ein Node-Prozess bedient beides.

## Lokal starten

**Voraussetzungen:** Node.js (>=18)

1. Abhängigkeiten installieren:
   `npm install`
2. `.env.example` nach `.env` kopieren und bei Bedarf anpassen.
3. Dev-Server starten:
   `npm run dev`

App läuft standardmäßig auf http://localhost:3000

## Build & Produktion

```
npm run build
npm run start
```

## Deployment

**Option A – monolithisch (einfachste, Standard):** Ein Node-Prozess bedient
Frontend und Backend zusammen. Braucht Hosting mit persistentem Node-Prozess
und WebSocket-Support, z.B. Render, Railway oder Fly.io. `VITE_SERVER_URL`
bleibt leer.

**Option B – getrennt (Frontend auf Firebase Hosting, Backend separat):**

1. Backend (Express + Socket.io) auf Render/Railway/Fly deployen wie in Option A.
2. `.firebaserc` anpassen: eigene Firebase-Projekt-ID statt
   `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` eintragen.
3. `VITE_SERVER_URL` auf die Backend-URL setzen (z.B. beim Build als Env-Var),
   damit das Frontend den Socket zum richtigen Server öffnet.
4. Bauen und deployen:
   ```
   npm run build
   firebase deploy --only hosting
   ```
   (`firebase.json` ist bereits vorbereitet: `dist` als Public-Ordner, SPA-Rewrite
   auf `index.html`, `server.cjs` wird vom Hosting ausgeschlossen.)

Reines statisches Hosting (Firebase Hosting allein, ohne separaten Backend-Server)
reicht nicht aus, solange Socket.io für Echtzeit-Updates genutzt wird – Firebase
Hosting selbst hält keine WebSocket-Verbindungen offen.

## Hinweis

Lobbys und das Leaderboard werden aktuell im Arbeitsspeicher gehalten (kein
persistenter Speicher) – bei Server-Neustart gehen die Daten verloren.
