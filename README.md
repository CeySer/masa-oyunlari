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

Das Backend (Express + Socket.io) und Frontend laufen im selben Node-Prozess und
brauchen daher ein Hosting mit persistenten Node-Prozessen und WebSocket-Support
(z.B. Render, Railway, Fly.io) – reines statisches Hosting (z.B. Firebase Hosting
allein) reicht nicht aus, solange Socket.io für Echtzeit-Updates genutzt wird.

## Hinweis

Lobbys und das Leaderboard werden aktuell im Arbeitsspeicher gehalten (kein
persistenter Speicher) – bei Server-Neustart gehen die Daten verloren.
