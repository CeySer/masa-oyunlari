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

Lobbys werden im Arbeitsspeicher gehalten (kein persistenter Speicher) – bei
Server-Neustart gehen sie verloren. Das globale Leaderboard ist persistent,
sobald Online-Konten eingerichtet sind (siehe unten) – ohne das bleibt auch
das Leaderboard nur im Arbeitsspeicher.

## Online-Konten einrichten (optional)

Ohne diese Einrichtung läuft die App genau wie bisher: freier Name, kein
Login, alles funktioniert uneingeschränkt ohne Konto. Sobald konfiguriert,
ist die Anmeldung (E-Mail/Passwort oder Google) die verpflichtende
Startseite – auch für das Solo-Testspiel gegen Bots. Nach dem Login wählt man
ein Spielerprofil (ein Konto kann mehrere Profile halten, z.B. eines pro
Familienmitglied, wie bei EduPlay Hub); jedes Profil hat seine eigene
dauerhafte Elo-/Sieg-Statistik, gespeichert in Firestore.

**1. Authentication aktivieren** – Firebase Console → dein Projekt
(`masa-oyunlari-3297c`) → Build → Authentication → "Get started" →
Sign-in method: **E-Mail/Passwort** und **Google** jeweils aktivieren.

**2. Firestore-Datenbank anlegen** – Firebase Console → Build → Firestore
Database → "Create database" → Produktionsmodus, Region frei wählbar.
Danach unter "Rules" folgende Regeln veröffentlichen (nur der Server mit dem
Admin-SDK schreibt, Clients lesen nichts direkt aus Firestore):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**3. Web-App-Konfiguration holen (Client, öffentlich)** – Firebase Console →
Project settings (Zahnrad) → General → "Your apps" → falls noch keine Web-App
existiert, eine anlegen ("</>"-Icon) → die Werte `apiKey`, `authDomain`,
`projectId`, `appId` in `.env.production` (bzw. `.env` lokal) als
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` eintragen (siehe
`.env.example`). Diese Werte sind nicht geheim.

**4. Service-Account-Schlüssel holen (Server, GEHEIM)** – Firebase Console →
Project settings → Service accounts → "Generate new private key" → lädt eine
JSON-Datei herunter. Daraus drei Werte als **Environment-Variablen bei
Render** (Dashboard → dein Service → Environment) eintragen, nicht in eine
Datei im Repo:
- `FIREBASE_PROJECT_ID` = `project_id` aus der JSON
- `FIREBASE_CLIENT_EMAIL` = `client_email` aus der JSON
- `FIREBASE_PRIVATE_KEY` = `private_key` aus der JSON (inkl. der `\n` als
  literale Zeichen einfügen, Render unterstützt mehrzeilige Werte auch direkt)

Die heruntergeladene JSON-Datei danach löschen bzw. nirgends committen.

**5. Neu bauen & deployen** – Frontend neu bauen (`npm run build` mit den
gesetzten `VITE_FIREBASE_*`-Werten) und `firebase deploy --only hosting`;
Backend auf Render neu deployen, damit die neuen Environment-Variablen
greifen.
