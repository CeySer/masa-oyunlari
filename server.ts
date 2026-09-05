import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
  },
});

const PORT = Number(process.env.PORT) || 3000;

// --- Firebase Admin (accounts + persistent leaderboard) -------------------
// Optional: without these env vars the server runs exactly as before
// (anonymous names, in-memory-only leaderboard) - real accounts are only
// required for online multiplayer once this is configured. See README.md
// for how to obtain a service account key from the Firebase Console.
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;

// The private key is the fiddly one to get through a hosting dashboard's env
// var UI intact - copy/pasting it as plain text easily loses real newlines
// or picks up stray surrounding quotes, which breaks PEM parsing. Prefer
// FIREBASE_PRIVATE_KEY_BASE64 (the key, base64-encoded - immune to all of
// that) when set; otherwise fall back to FIREBASE_PRIVATE_KEY with some
// defensive cleanup of the most common paste mistakes.
function resolveFirebasePrivateKey(): string | undefined {
  const b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (b64) {
    try {
      return Buffer.from(b64.trim(), 'base64').toString('utf8');
    } catch {
      return undefined;
    }
  }
  let raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  raw = raw.trim();
  // Strip accidental wrapping quotes (easy to paste in by mistake).
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  return raw.replace(/\\n/g, '\n');
}

const FIREBASE_PRIVATE_KEY = resolveFirebasePrivateKey();

const firebaseAdminEnabled = Boolean(FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);

let firebaseApp: App | null = null;
let db: Firestore | null = null;

if (firebaseAdminEnabled) {
  firebaseApp = initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
  });
  db = getFirestore(firebaseApp);
  console.log('Firebase Admin initialisiert - Online-Konten & persistente Rangliste aktiv.');
} else {
  console.log('Firebase Admin NICHT konfiguriert - Online-Multiplayer-Login ist deaktiviert (siehe README.md).');
}

async function verifyIdToken(idToken?: string): Promise<{ uid: string; name: string } | null> {
  if (!firebaseApp || !idToken) return null;
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken);
    return { uid: decoded.uid, name: decoded.name || decoded.email || 'Spieler' };
  } catch (err) {
    console.warn('ID-Token-Verifizierung fehlgeschlagen:', (err as Error).message);
    return null;
  }
}

interface PlayerProfile {
  id: string;
  ownerUid: string;
  name: string;
  color: string;
  elo: number;
  wins: number;
  losses: number;
  games: number;
  createdAt: number;
}

const MAX_PROFILES_PER_ACCOUNT = 6;

// Verifies that `profileId` exists and actually belongs to `uid` - never
// trust a client-supplied profileId without this check, since it decides
// which persistent identity/leaderboard entry a game session writes to.
async function verifyProfileOwnership(uid: string, profileId?: string): Promise<PlayerProfile | null> {
  if (!db || !profileId) return null;
  try {
    const doc = await db.collection('profiles').doc(profileId).get();
    if (!doc.exists) return null;
    const data = doc.data() as any;
    if (data.ownerUid !== uid) return null;
    return { id: doc.id, ...data } as PlayerProfile;
  } catch (err) {
    console.warn('Profil-Prüfung fehlgeschlagen:', (err as Error).message);
    return null;
  }
}

interface Player {
  id: string;
  name: string;
  isBot?: boolean;
  // Okey match score. Traditional Okey scoring: everyone starts at
  // OKEY_STARTING_SCORE and only LOSES points, never gains any - each hand's
  // losers are docked per declare_win below, the winner's own score doesn't
  // move. The match keeps dealing further hands until somebody's score
  // drops to 0 or below, at which point the two players left with the most
  // points are the overall winners of the match.
  score: number;
  elo: number;
  profileId?: string;
}

const OKEY_STARTING_SCORE = 20;

interface Lobby {
  id: string;
  host: string;
  gameType: 'okey' | 'tavla';
  players: Player[];
  tvSocket: string | null;
  status: 'waiting' | 'playing' | 'finished';
  gameState: any;
  targetScore: number;
  authRequired?: boolean;
  // Okey only: true once someone's score has dropped to 0 or below - the
  // whole multi-hand match is over then (not just the current hand), and
  // 'next_round' refuses to deal again. See declare_win.
  matchOver?: boolean;
  // The Firebase uid that created this lobby (when authRequired) - lets
  // other profiles under the SAME account discover an open lobby without
  // needing the code/link (see broadcastAccountLobbyStatus/subscribe_account).
  ownerUid?: string;
}

// Every socket signed into account `uid` joins this room (see
// 'subscribe_account'), so a lobby that account opens can be pushed to every
// other device/profile signed into it in real time.
function accountRoom(uid: string) {
  return `account:${uid}`;
}

// Tells every OTHER device signed into the same account whether this lobby
// is currently joinable without a code - called at every point a lobby's
// player count or status can change. A no-op for lobbies with no owner
// (Firebase not configured, or a TV-only lobby).
function broadcastAccountLobbyStatus(lobby: Lobby) {
  if (!lobby.ownerUid) return;
  const maxPlayers = lobby.gameType === 'tavla' ? 2 : 4;
  const humanHost = lobby.players.find(p => !p.isBot);
  io.to(accountRoom(lobby.ownerUid)).emit('account_lobby_status', {
    lobbyId: lobby.id,
    gameType: lobby.gameType,
    open: lobby.status === 'waiting' && lobby.players.length < maxPlayers,
    playerCount: lobby.players.length,
    maxPlayers,
    hostName: humanHost?.name || 'Spieler',
  });
}

const lobbies = new Map<string, Lobby>();

// Persistent leaderboard, keyed by player-PROFILE id (not the Firebase
// account uid) since one account can now hold several profiles (e.g. one per
// family member), each with its own stats - exactly like the profile stats
// live on the "profiles" Firestore collection. Backed by Firestore when
// Firebase Admin is configured; otherwise it just lives in memory like
// before and resets on restart.
const globalLeaderboard: Record<string, { id: string; name: string; elo: number; wins: number; losses: number; games: number }> = {};

async function loadLeaderboardFromFirestore() {
  if (!db) return;
  try {
    const snapshot = await db.collection('profiles').orderBy('elo', 'desc').limit(100).get();
    snapshot.forEach((doc) => {
      const data = doc.data() as any;
      globalLeaderboard[doc.id] = {
        id: doc.id,
        name: data.name,
        elo: data.elo,
        wins: data.wins,
        losses: data.losses,
        games: data.games,
      };
    });
    console.log(`Rangliste aus Firestore geladen (${snapshot.size} Einträge).`);
  } catch (err) {
    console.warn('Rangliste konnte nicht aus Firestore geladen werden:', (err as Error).message);
  }
}

function bumpLeaderboardEntry(profileId: string, name: string, opts: { won: boolean }) {
  const entry = globalLeaderboard[profileId] || { id: profileId, name, elo: 1200, wins: 0, losses: 0, games: 0 };
  entry.name = name; // keep the display name fresh in case it changed
  entry.games += 1;
  if (opts.won) {
    entry.wins += 1;
    entry.elo += 25;
  } else {
    entry.losses += 1;
    entry.elo = Math.max(800, entry.elo - 15);
  }
  globalLeaderboard[profileId] = entry;

  if (db) {
    const { id, ...rest } = entry;
    db.collection('profiles').doc(profileId).set(rest, { merge: true }).catch((err) => {
      console.warn('Rangliste konnte nicht in Firestore gespeichert werden:', (err as Error).message);
    });
  }
}

function createLobby(hostSocketId: string, gameType: 'okey' | 'tavla' = 'okey'): string {
  const lobbyId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newLobby: Lobby = {
    id: lobbyId,
    host: hostSocketId,
    gameType,
    players: [],
    tvSocket: null,
    status: 'waiting',
    gameState: null,
    targetScore: 3,
  };
  lobbies.set(lobbyId, newLobby);
  return lobbyId;
}

function addLog(lobby: Lobby, text: string) {
  if (!lobby.gameState) return;
  if (!lobby.gameState.logs) lobby.gameState.logs = [];
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  lobby.gameState.logs.unshift({ id: Math.random().toString(36).substring(2, 9), text, time });
  if (lobby.gameState.logs.length > 25) lobby.gameState.logs.pop();
}

// OKEY LOGIC
function initOkeyGame(lobby: Lobby) {
  const colors = ['red', 'black', 'blue', 'yellow'];
  let tiles: Array<{ id: number; color: string; value: number }> = [];
  let idCounter = 1;
  
  // 2 sets of 1-13 in 4 colors = 104 tiles + 2 false okeys = 106 tiles
  for (let c = 0; c < 2; c++) {
    colors.forEach(color => {
      for (let value = 1; value <= 13; value++) {
        tiles.push({ id: idCounter++, color, value });
      }
    });
    tiles.push({ id: idCounter++, color: 'fake', value: 0 });
  }

  // Fisher-Yates shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  const players = lobby.players;
  const hands: Record<string, any[]> = {};
  
  // Randomly select starting player who gets 15 tiles, others get 14
  const firstPlayerIndex = Math.floor(Math.random() * players.length);
  
  players.forEach((p, index) => {
    const count = index === firstPlayerIndex ? 15 : 14;
    hands[p.id] = tiles.splice(0, count);
  });

  // Pick indicator tile (gösterge)
  const indicator = tiles.pop() || { id: 999, color: 'red', value: 1 };

  lobby.gameState = {
    gameType: 'okey',
    hands,
    pile: tiles,
    indicator,
    turnIndex: firstPlayerIndex,
    discardPiles: players.reduce((acc, p) => ({ ...acc, [p.id]: [] }), {} as Record<string, any[]>),
    winner: null,
    logs: [],
  };
  lobby.status = 'playing';

  addLog(lobby, `🎮 Spiel gestartet! ${players[firstPlayerIndex].name} ist am Zug.`);
  broadcastGameState(lobby);
  checkAndTriggerBotTurn(lobby);
}

// OKEY WIN VALIDATION
type OkeyTile = { id: number; color: string; value: number };

function isJokerTile(tile: OkeyTile, indicator: OkeyTile | null | undefined): boolean {
  if (tile.color === 'fake') return true;
  if (!indicator) return false;
  const jokerValue = (indicator.value % 13) + 1;
  return tile.color === indicator.color && tile.value === jokerValue;
}

// Checks whether `tiles` (excluding jokers, which are passed separately as a count)
// can be split into valid runs (3+ consecutive values, same color) and sets
// (3-4 tiles, same value, distinct colors), using `jokerCount` wildcards to fill gaps.
// Standard Okey win: exactly 14 tiles across groups of size 3 or 4.
function canFormGroups(tiles: OkeyTile[], jokerCount: number): boolean {
  if (tiles.length + jokerCount === 0) return true;
  if (tiles.length + jokerCount < 3) return false;

  // Try forming a set (same value, distinct colors) starting from the first real tile.
  if (tiles.length > 0) {
    const first = tiles[0];
    const sameValue = tiles.filter(t => t.value === first.value);
    const distinctColors = new Set(sameValue.map(t => t.color));
    if (distinctColors.size === sameValue.length) {
      // Try set sizes from largest (4) to smallest (3) using real tiles + jokers
      for (let size = Math.min(4, sameValue.length + jokerCount); size >= 3; size--) {
        const realNeeded = Math.min(size, sameValue.length);
        const jokersNeeded = size - realNeeded;
        if (jokersNeeded > jokerCount) continue;
        const used = new Set(sameValue.slice(0, realNeeded).map(t => t.id));
        const remaining = tiles.filter(t => !used.has(t.id));
        if (canFormGroups(remaining, jokerCount - jokersNeeded)) return true;
      }
    }

    // Try forming a run (consecutive values, same color) that contains the first tile.
    // A run's positions are 1-13, except the "1" tile may also stand for the
    // single position right above 13 (so yellow 11-12-13-1 is a valid run) -
    // but it never wraps further (13-1-2 is not valid). A position of 14
    // matches a tile whose printed value is 1; every other position matches
    // its own printed value.
    //
    // Unlike sets (capped at 4 - there are only 4 colors), runs have no
    // upper size limit other than "how many consecutive values exist": per
    // the official rules, a run is "three or more consecutive tiles of the
    // same colour" - e.g. a same-color 9-10-11-12-13 run of 5 is one single
    // valid group, not something that must be chopped into a 3 and a 4.
    const sameColor = tiles.filter(t => t.color === first.color);
    const matchAt = (pos: number, used: Set<number>) =>
      sameColor.find(t => t.value === (pos === 14 ? 1 : pos) && !used.has(t.id));

    // The anchor tile can represent its own value, and - only when it's a 1 -
    // can also represent the extended top position (14).
    const effectiveValues = first.value === 1 ? [1, 14] : [first.value];
    const maxRunSize = Math.min(13, tiles.length + jokerCount);

    for (const anchorValue of effectiveValues) {
      for (let size = 3; size <= maxRunSize; size++) {
        // Try every window of length `size` that includes anchorValue.
        for (let start = anchorValue - size + 1; start <= anchorValue; start++) {
          const end = start + size - 1;
          if (start < 1 || end > 14) continue;

          let jokersNeeded = 0;
          const used = new Set<number>();
          for (let pos = start; pos <= end; pos++) {
            const match = matchAt(pos, used);
            if (match) used.add(match.id);
            else jokersNeeded++;
          }
          if (jokersNeeded <= jokerCount) {
            const remaining = tiles.filter(t => !used.has(t.id));
            if (canFormGroups(remaining, jokerCount - jokersNeeded)) return true;
          }
        }
      }
    }
  }

  return false;
}

function isValidRunSetHand(tiles: OkeyTile[], indicator: OkeyTile | null | undefined): boolean {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter(t => isJokerTile(t, indicator));
  const rest = tiles.filter(t => !isJokerTile(t, indicator));
  return canFormGroups(rest, jokers.length);
}

// "Çift" (pairs) win: 7 pairs of matching value+color tiles, jokers fill any pair.
function isValidPairsHand(tiles: OkeyTile[], indicator: OkeyTile | null | undefined): boolean {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter(t => isJokerTile(t, indicator));
  const rest = tiles.filter(t => !isJokerTile(t, indicator));

  const counts = new Map<string, number>();
  rest.forEach(t => {
    const key = `${t.color}-${t.value}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let neededJokers = 0;
  for (const count of counts.values()) {
    if (count === 1) neededJokers += 1;
    else if (count !== 2) return false; // 3+ of the same tile can't form pairs alone
  }
  return neededJokers <= jokers.length;
}

type WinType = 'runset' | 'pairs';

// Given a 15-tile hand, checks if discarding any one tile leaves a valid
// winning hand. Also reports which kind of hand it was (sets/runs vs. the
// "Çift" seven-pairs variant) and whether the winning discard is the joker
// itself - both feed into the point scoring in the 'declare_win' handler.
function findWinningDiscard(
  hand: OkeyTile[],
  indicator: OkeyTile | null | undefined
): { tile: OkeyTile; type: WinType } | null {
  for (let i = 0; i < hand.length; i++) {
    const remaining = [...hand.slice(0, i), ...hand.slice(i + 1)];
    if (isValidRunSetHand(remaining, indicator)) {
      return { tile: hand[i], type: 'runset' };
    }
    if (isValidPairsHand(remaining, indicator)) {
      return { tile: hand[i], type: 'pairs' };
    }
  }
  return null;
}

// TAVLA (BACKGAMMON) LOGIC
function initTavlaGame(lobby: Lobby) {
  // Standard 2-player backgammon setup
  // Board has 24 points: index 0 to 23
  // White moves 0 -> 23, Black moves 23 -> 0
  const board = Array(24).fill(null).map(() => ({ count: 0, color: null as 'white' | 'black' | null }));

  // Initial setup:
  // Point 0 (2 white), Point 11 (5 white), Point 16 (3 white), Point 18 (5 white)
  // Point 23 (2 black), Point 12 (5 black), Point 7 (3 black), Point 5 (5 black)
  board[0] = { count: 2, color: 'white' };
  board[11] = { count: 5, color: 'white' };
  board[16] = { count: 3, color: 'white' };
  board[18] = { count: 5, color: 'white' };

  board[23] = { count: 2, color: 'black' };
  board[12] = { count: 5, color: 'black' };
  board[7] = { count: 3, color: 'black' };
  board[5] = { count: 5, color: 'black' };

  const players = lobby.players.slice(0, 2); // Tavla is 2 players max
  const firstTurn = Math.floor(Math.random() * players.length);

  lobby.gameState = {
    gameType: 'tavla',
    board,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    turnIndex: firstTurn,
    dice: [] as number[],
    movesRemaining: [] as number[],
    playerColors: {
      [players[0].id]: 'white',
      [players[1]?.id || 'bot']: 'black',
    },
    diceRolled: false,
    winner: null,
    logs: [],
  };
  lobby.status = 'playing';

  broadcastGameState(lobby);
  checkAndTriggerBotTurn(lobby);
}

// Applies a single checker move if legal, mutating the board/bar in place.
// Shared by the human move_checker handler and the bot AI so both follow
// exactly the same rules.
function applyTavlaMove(gs: any, color: 'white' | 'black', fromIndex: number, dieValue: number): boolean {
  const direction = color === 'white' ? 1 : -1;
  const toIndex = fromIndex + dieValue * direction;
  if (toIndex < 0 || toIndex >= 24) return false;

  const sourcePoint = gs.board[fromIndex];
  const destPoint = gs.board[toIndex];
  if (!sourcePoint || sourcePoint.count <= 0 || sourcePoint.color !== color) return false;
  // Legal target: empty, own color, or exactly 1 enemy checker (hit)
  if (!(destPoint.count === 0 || destPoint.color === color || destPoint.count === 1)) return false;

  sourcePoint.count -= 1;
  if (sourcePoint.count === 0) sourcePoint.color = null;

  if (destPoint.count === 1 && destPoint.color !== color) {
    const enemyColor = destPoint.color!;
    gs.bar[enemyColor] += 1;
    destPoint.count = 1;
    destPoint.color = color;
  } else {
    destPoint.count += 1;
    destPoint.color = color;
  }
  return true;
}

// BOT AI CONTROLLER
function checkAndTriggerBotTurn(lobby: Lobby) {
  if (lobby.status !== 'playing' || !lobby.gameState) return;
  const gs = lobby.gameState;
  const currentPlayer = lobby.players[gs.turnIndex];
  
  if (!currentPlayer || !currentPlayer.isBot) return;

  // Bot thinking delay for real TV / multiplayer feel
  setTimeout(() => {
    if (lobby.status !== 'playing' || !lobby.gameState) return;
    const activePlayer = lobby.players[lobby.gameState.turnIndex];
    if (!activePlayer || !activePlayer.isBot) return;

    if (lobby.gameType === 'okey') {
      executeOkeyBotTurn(lobby, activePlayer);
    } else if (lobby.gameType === 'tavla') {
      executeTavlaBotTurn(lobby, activePlayer);
    }
  }, 1000);
}

function executeOkeyBotTurn(lobby: Lobby, botPlayer: Player) {
  const gs = lobby.gameState;
  if (!gs || lobby.status !== 'playing') return;
  if (!gs.hands[botPlayer.id]) {
    gs.hands[botPlayer.id] = [];
  }
  if (!gs.discardPiles[botPlayer.id]) {
    gs.discardPiles[botPlayer.id] = [];
  }

  const hand = gs.hands[botPlayer.id];

  // 1. Fill hand if less than 14
  while (hand.length < 14 && gs.pile.length > 0) {
    hand.push(gs.pile.pop()!);
  }

  // 2. Draw 15th tile if hand has 14
  if (hand.length === 14) {
    const prevIndex = (gs.turnIndex - 1 + lobby.players.length) % lobby.players.length;
    const prevPlayer = lobby.players[prevIndex];
    const prevDiscard = prevPlayer ? gs.discardPiles[prevPlayer.id] : null;
    const topDiscard = prevDiscard && prevDiscard.length > 0 ? prevDiscard[prevDiscard.length - 1] : null;

    let drewFromDiscard = false;
    if (topDiscard && topDiscard.color !== 'fake') {
      const match = hand.some(t => t.value === topDiscard.value || t.color === topDiscard.color);
      if (match && Math.random() > 0.3) {
        hand.push(prevDiscard.pop());
        drewFromDiscard = true;
        addLog(lobby, `📥 ${botPlayer.name} hat einen Stein vom Ablagestapel genommen.`);
      }
    }

    if (!drewFromDiscard) {
      if (gs.pile.length > 0) {
        hand.push(gs.pile.pop());
        addLog(lobby, `📥 ${botPlayer.name} hat einen Stein vom Stapel gezogen.`);
      } else {
        addLog(lobby, `⚠️ Keine Steine mehr auf dem Stapel!`);
        lobby.status = 'finished';
        broadcastGameState(lobby);
        return;
      }
    }

    broadcastGameState(lobby);

    // Schedule discard step after short delay
    setTimeout(() => {
      executeOkeyBotDiscard(lobby, botPlayer);
    }, 700);
    return;
  }

  // 3. Discard if 15 or more
  if (hand.length >= 15) {
    executeOkeyBotDiscard(lobby, botPlayer);
  }
}

function executeOkeyBotDiscard(lobby: Lobby, botPlayer: Player) {
  const gs = lobby.gameState;
  if (!gs || lobby.status !== 'playing') return;
  const hand = gs.hands[botPlayer.id];
  if (!hand || hand.length < 15) return;

  // Pick candidate to discard: fake okey or orphan tile
  let discardIndex = hand.findIndex(t => t.color === 'fake');
  if (discardIndex === -1) {
    discardIndex = Math.floor(Math.random() * hand.length);
  }

  const discardedTile = hand.splice(discardIndex, 1)[0];
  if (!gs.discardPiles[botPlayer.id]) {
    gs.discardPiles[botPlayer.id] = [];
  }
  gs.discardPiles[botPlayer.id].push(discardedTile);
  addLog(lobby, `📤 ${botPlayer.name} hat ${discardedTile.color === 'fake' ? 'Sahte Okey' : discardedTile.color.toUpperCase() + ' ' + discardedTile.value} abgeworfen.`);

  // Advance turn
  gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;

  broadcastGameState(lobby);
  checkAndTriggerBotTurn(lobby);
}

function executeTavlaBotTurn(lobby: Lobby, botPlayer: Player) {
  const gs = lobby.gameState;
  // 1. Roll dice if not rolled
  if (!gs.diceRolled) {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    gs.dice = [d1, d2];
    gs.movesRemaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    gs.diceRolled = true;
    broadcastGameState(lobby);

    // Continue bot move after roll
    setTimeout(() => {
      executeTavlaBotTurn(lobby, botPlayer);
    }, 1000);
    return;
  }

  // 2. Try to play one remaining die value (first legal checker found for it).
  const color: 'white' | 'black' | undefined = gs.playerColors[botPlayer.id];
  let moved = false;
  if (color) {
    for (let i = 0; i < gs.movesRemaining.length; i++) {
      const dieValue = gs.movesRemaining[i];
      for (let from = 0; from < 24; from++) {
        if (applyTavlaMove(gs, color, from, dieValue)) {
          gs.movesRemaining.splice(i, 1);
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
  }

  if (moved) {
    broadcastGameState(lobby);
    if (gs.movesRemaining.length > 0) {
      setTimeout(() => {
        executeTavlaBotTurn(lobby, botPlayer);
      }, 700);
      return;
    }
  }

  // 3. No more legal moves (or none possible) - end turn
  gs.diceRolled = false;
  gs.dice = [];
  gs.movesRemaining = [];
  gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;
  broadcastGameState(lobby);
  checkAndTriggerBotTurn(lobby);
}

function broadcastGameState(lobby: Lobby) {
  const gs = lobby.gameState;
  if (!gs) return;

  const publicState = {
    gameType: lobby.gameType,
    turnIndex: gs.turnIndex,
    pileCount: gs.pile ? gs.pile.length : 0,
    indicator: gs.indicator || null,
    discardPiles: gs.discardPiles || {},
    board: gs.board || null,
    bar: gs.bar || null,
    off: gs.off || null,
    playerColors: gs.playerColors || null,
    dice: gs.dice || [],
    movesRemaining: gs.movesRemaining || [],
    diceRolled: gs.diceRolled || false,
    winner: gs.winner || null,
    logs: gs.logs || [],
  };

  io.to(lobby.id).emit('lobby_updated', lobby);
  io.to(lobby.id).emit('game_state_updated', publicState);

  if (gs.hands) {
    lobby.players.forEach(p => {
      if (!p.isBot) {
        io.to(p.id).emit('hand_updated', gs.hands[p.id] || []);
      }
    });
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial leaderboard
  socket.emit('leaderboard_updated', Object.values(globalLeaderboard));

  // --- Player profiles (one Firebase account can hold several, e.g. one per
  // family member - selecting one decides the identity/leaderboard entry
  // used for games, similar to the profile picker in EduPlay Hub). ---------
  socket.on('list_profiles', async ({ idToken }, callback) => {
    if (!callback) return;
    if (!firebaseAdminEnabled || !db) {
      callback({ success: false, error: 'Konten sind auf diesem Server nicht eingerichtet.' });
      return;
    }
    const verified = await verifyIdToken(idToken);
    if (!verified) {
      callback({ success: false, error: 'auth_required' });
      return;
    }
    try {
      const snapshot = await db.collection('profiles').where('ownerUid', '==', verified.uid).get();
      const profiles = snapshot.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      callback({ success: true, profiles });
    } catch (err) {
      console.warn('Profile konnten nicht geladen werden:', (err as Error).message);
      callback({ success: false, error: 'Profile konnten nicht geladen werden.' });
    }
  });

  socket.on('create_profile', async ({ idToken, name, color }, callback) => {
    if (!callback) return;
    if (!firebaseAdminEnabled || !db) {
      callback({ success: false, error: 'Konten sind auf diesem Server nicht eingerichtet.' });
      return;
    }
    const verified = await verifyIdToken(idToken);
    if (!verified) {
      callback({ success: false, error: 'auth_required' });
      return;
    }
    const trimmedName = String(name || '').trim().slice(0, 24);
    if (!trimmedName) {
      callback({ success: false, error: 'Bitte einen Namen eingeben.' });
      return;
    }
    try {
      const existing = await db.collection('profiles').where('ownerUid', '==', verified.uid).get();
      if (existing.size >= MAX_PROFILES_PER_ACCOUNT) {
        callback({ success: false, error: `Maximal ${MAX_PROFILES_PER_ACCOUNT} Profile pro Konto.` });
        return;
      }
      const nameTaken = existing.docs.some((doc) => (doc.data().name || '').trim().toLowerCase() === trimmedName.toLowerCase());
      if (nameTaken) {
        callback({ success: false, error: 'Dieser Profilname wird bei dir schon verwendet.' });
        return;
      }
      const docRef = db.collection('profiles').doc();
      const profile: PlayerProfile = {
        id: docRef.id,
        ownerUid: verified.uid,
        name: trimmedName,
        color: typeof color === 'string' && color ? color : '#d4a24e',
        elo: 1200,
        wins: 0,
        losses: 0,
        games: 0,
        createdAt: Date.now(),
      };
      const { id, ...data } = profile;
      await docRef.set(data);
      globalLeaderboard[profile.id] = { id: profile.id, name: profile.name, elo: profile.elo, wins: 0, losses: 0, games: 0 };
      callback({ success: true, profile });
    } catch (err) {
      console.warn('Profil konnte nicht erstellt werden:', (err as Error).message);
      callback({ success: false, error: 'Profil konnte nicht erstellt werden.' });
    }
  });

  socket.on('update_profile', async ({ idToken, profileId, name, color }, callback) => {
    if (!callback) return;
    if (!firebaseAdminEnabled || !db) {
      callback({ success: false, error: 'Konten sind auf diesem Server nicht eingerichtet.' });
      return;
    }
    const verified = await verifyIdToken(idToken);
    if (!verified) {
      callback({ success: false, error: 'auth_required' });
      return;
    }
    const profile = await verifyProfileOwnership(verified.uid, profileId);
    if (!profile) {
      callback({ success: false, error: 'invalid_profile' });
      return;
    }
    const update: Partial<PlayerProfile> = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim().slice(0, 24);
    if (typeof color === 'string' && color) update.color = color;

    if (update.name && update.name.toLowerCase() !== profile.name.toLowerCase()) {
      const existing = await db.collection('profiles').where('ownerUid', '==', verified.uid).get();
      const nameTaken = existing.docs.some(
        (doc) => doc.id !== profileId && (doc.data().name || '').trim().toLowerCase() === update.name!.toLowerCase()
      );
      if (nameTaken) {
        callback({ success: false, error: 'Dieser Profilname wird bei dir schon verwendet.' });
        return;
      }
    }

    try {
      await db.collection('profiles').doc(profileId).set(update, { merge: true });
      if (globalLeaderboard[profileId] && update.name) {
        globalLeaderboard[profileId].name = update.name;
      }
      callback({ success: true });
    } catch (err) {
      console.warn('Profil konnte nicht aktualisiert werden:', (err as Error).message);
      callback({ success: false, error: 'Profil konnte nicht aktualisiert werden.' });
    }
  });

  socket.on('delete_profile', async ({ idToken, profileId }, callback) => {
    if (!callback) return;
    if (!firebaseAdminEnabled || !db) {
      callback({ success: false, error: 'Konten sind auf diesem Server nicht eingerichtet.' });
      return;
    }
    const verified = await verifyIdToken(idToken);
    if (!verified) {
      callback({ success: false, error: 'auth_required' });
      return;
    }
    const profile = await verifyProfileOwnership(verified.uid, profileId);
    if (!profile) {
      callback({ success: false, error: 'invalid_profile' });
      return;
    }
    try {
      await db.collection('profiles').doc(profileId).delete();
      delete globalLeaderboard[profileId];
      callback({ success: true });
    } catch (err) {
      console.warn('Profil konnte nicht gelöscht werden:', (err as Error).message);
      callback({ success: false, error: 'Profil konnte nicht gelöscht werden.' });
    }
  });

  socket.on('create_tv_lobby', ({ gameType, name }, callback) => {
    const type = gameType === 'tavla' ? 'tavla' : 'okey';
    const lobbyId = createLobby(socket.id, type);
    const lobby = lobbies.get(lobbyId)!;
    lobby.tvSocket = socket.id;

    if (callback) callback({ success: true, lobbyId, lobby });
    io.to(lobbyId).emit('lobby_updated', lobby);
  });

  socket.on('create_lobby', async ({ gameType, name, idToken, profileId }, callback) => {
    const type = gameType === 'tavla' ? 'tavla' : 'okey';

    let profile: PlayerProfile | null = null;
    let playerName = name || 'Host';
    let ownerUid: string | undefined;

    // Every lobby now requires a verified account with a chosen player
    // profile once the server has Firebase configured - login (and picking
    // a profile) is the mandatory front door, exactly like EduPlay Hub.
    // Without FIREBASE_* env vars set, the server keeps working exactly as
    // before (anonymous name, no login) so local/dev setups aren't blocked.
    if (firebaseAdminEnabled) {
      const verified = await verifyIdToken(idToken);
      if (!verified) {
        if (callback) callback({ success: false, error: 'auth_required' });
        return;
      }
      profile = await verifyProfileOwnership(verified.uid, profileId);
      if (!profile) {
        if (callback) callback({ success: false, error: 'invalid_profile' });
        return;
      }
      playerName = profile.name;
      ownerUid = verified.uid;
    }

    const lobbyId = createLobby(socket.id, type);
    const lobby = lobbies.get(lobbyId)!;
    lobby.authRequired = firebaseAdminEnabled;
    lobby.ownerUid = ownerUid;

    // Auto-join host as player 1
    const hostPlayer: Player = {
      id: socket.id,
      name: playerName,
      score: OKEY_STARTING_SCORE,
      elo: profile?.elo || 1200,
      profileId: profile?.id,
    };
    lobby.players.push(hostPlayer);
    socket.join(lobbyId);

    if (callback) callback({ success: true, lobbyId, player: hostPlayer, lobby });
    io.to(lobbyId).emit('lobby_updated', lobby);
    // Let other profiles under the same account know this lobby just
    // opened, so their Home screen can offer a direct "Beitreten" button.
    broadcastAccountLobbyStatus(lobby);
  });

  // Joins this socket to its account's notification room so it learns in
  // real time about lobbies opened by OTHER profiles under the same
  // account (see broadcastAccountLobbyStatus) - and immediately reports any
  // that are already open right now.
  socket.on('subscribe_account', async ({ idToken }, callback) => {
    if (!firebaseAdminEnabled) {
      if (callback) callback({ success: false });
      return;
    }
    const verified = await verifyIdToken(idToken);
    if (!verified) {
      if (callback) callback({ success: false });
      return;
    }
    socket.join(accountRoom(verified.uid));

    const maxPlayersFor = (l: Lobby) => (l.gameType === 'tavla' ? 2 : 4);
    const openLobbies = Array.from(lobbies.values())
      .filter(l => l.ownerUid === verified.uid && l.status === 'waiting' && l.players.length < maxPlayersFor(l))
      .map(l => ({
        lobbyId: l.id,
        gameType: l.gameType,
        open: true,
        playerCount: l.players.length,
        maxPlayers: maxPlayersFor(l),
        hostName: l.players.find(p => !p.isBot)?.name || 'Spieler',
      }));

    if (callback) callback({ success: true, openLobbies });
  });

  socket.on('join_lobby', async ({ lobbyId, name, role, idToken, profileId }, callback) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
      if (callback) callback({ success: false, error: 'Lobby nicht gefunden!' });
      return;
    }

    socket.join(lobbyId);

    if (role === 'tv') {
      lobby.tvSocket = socket.id;
      if (callback) callback({ success: true, lobby });
      io.to(lobbyId).emit('lobby_updated', lobby);
      if (lobby.gameState) {
        broadcastGameState(lobby);
      }
    } else {
      let profile: PlayerProfile | null = null;
      let playerName = name;

      // Lobbies created with a verified account require every joining human
      // to also be verified with a profile - the client-supplied name is not
      // trusted here, the profile's own name is used instead.
      if (lobby.authRequired) {
        const verified = await verifyIdToken(idToken);
        if (!verified) {
          if (callback) callback({ success: false, error: 'auth_required' });
          return;
        }
        profile = await verifyProfileOwnership(verified.uid, profileId);
        if (!profile) {
          if (callback) callback({ success: false, error: 'invalid_profile' });
          return;
        }
        playerName = profile.name;
      }

      // Check if player already in lobby (match by profileId when available,
      // since the socket id changes on every reconnect)
      let existingPlayer = lobby.players.find(p => (profile && p.profileId === profile.id) || p.id === socket.id || p.name === playerName);
      if (existingPlayer) {
        existingPlayer.id = socket.id; // update socket id
      } else {
        if (lobby.players.length >= (lobby.gameType === 'tavla' ? 2 : 4)) {
          if (callback) callback({ success: false, error: 'Lobby ist voll!' });
          return;
        }
        existingPlayer = {
          id: socket.id,
          name: playerName || `Spieler ${lobby.players.length + 1}`,
          score: OKEY_STARTING_SCORE,
          elo: profile?.elo || 1200,
          profileId: profile?.id,
        };
        lobby.players.push(existingPlayer);
      }

      if (callback) callback({ success: true, player: existingPlayer, lobby });
      io.to(lobbyId).emit('lobby_updated', lobby);
      broadcastAccountLobbyStatus(lobby);

      if (lobby.gameState) {
        broadcastGameState(lobby);
      }
    }
  });

  socket.on('add_bot', ({ lobbyId }, callback) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return;

    const maxPlayers = lobby.gameType === 'tavla' ? 2 : 4;
    if (lobby.players.length >= maxPlayers) {
      if (callback) callback({ success: false, error: 'Lobby ist bereits voll!' });
      return;
    }

    const botNames = ['Bot Can', 'Bot Elif', 'Bot Mehmet', 'Bot Zeynep'];
    const usedNames = new Set(lobby.players.map(p => p.name));
    const availableName = botNames.find(n => !usedNames.has(n)) || `Bot ${lobby.players.length + 1}`;

    const botPlayer: Player = {
      id: `bot_${Math.random().toString(36).substring(2, 7)}`,
      name: availableName,
      isBot: true,
      score: OKEY_STARTING_SCORE,
      elo: 1000,
    };

    lobby.players.push(botPlayer);
    if (callback) callback({ success: true, bot: botPlayer, lobby });
    io.to(lobbyId).emit('lobby_updated', lobby);
    broadcastAccountLobbyStatus(lobby);
  });

  socket.on('remove_bot', ({ lobbyId, botId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return;
    lobby.players = lobby.players.filter(p => p.id !== botId);
    io.to(lobbyId).emit('lobby_updated', lobby);
    broadcastAccountLobbyStatus(lobby);
  });

  socket.on('leave_game', ({ lobbyId }, callback) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
      if (callback) callback({ success: true });
      return;
    }

    const playerIdx = lobby.players.findIndex(p => p.id === socket.id);
    if (playerIdx !== -1) {
      const leavingPlayer = lobby.players[playerIdx];

      if (lobby.status === 'playing') {
        leavingPlayer.isBot = true;
        if (!leavingPlayer.name.includes('(Bot)')) {
          leavingPlayer.name = `${leavingPlayer.name} (Bot)`;
        }
        addLog(lobby, `🚪 ${leavingPlayer.name} hat das Spiel verlassen. Bot übernimmt!`);

        broadcastGameState(lobby);
        io.to(lobbyId).emit('lobby_updated', lobby);

        if (lobby.gameState && lobby.gameState.turnIndex === playerIdx) {
          checkAndTriggerBotTurn(lobby);
        }
      } else {
        lobby.players.splice(playerIdx, 1);
        io.to(lobbyId).emit('lobby_updated', lobby);
        broadcastAccountLobbyStatus(lobby);
      }
    }

    socket.leave(lobbyId);
    if (callback) callback({ success: true });
  });

  socket.on('start_game', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.players.length < 1) return;

    // Fresh match: everyone starts at the same score, even if this lobby
    // previously played a match to completion (matchOver) and is being
    // restarted rather than continued via 'next_round'.
    lobby.matchOver = false;
    lobby.players.forEach(p => { p.score = OKEY_STARTING_SCORE; });

    // Auto-fill missing seats with bots if fewer than target max players
    const maxRequired = lobby.gameType === 'okey' ? 4 : 2;
    const botNames = ['Bot Can', 'Bot Elif', 'Bot Mehmet', 'Bot Zeynep'];
    while (lobby.players.length < maxRequired) {
      const usedNames = new Set(lobby.players.map(p => p.name));
      const name = botNames.find(n => !usedNames.has(n)) || `Bot ${lobby.players.length + 1}`;
      lobby.players.push({
        id: `bot_${Math.random().toString(36).substring(2, 7)}`,
        name,
        isBot: true,
        score: OKEY_STARTING_SCORE,
        elo: 1000,
      });
    }

    if (lobby.gameType === 'okey') {
      initOkeyGame(lobby);
    } else {
      initTavlaGame(lobby);
    }
    broadcastGameState(lobby);
    broadcastAccountLobbyStatus(lobby);
  });

  // OKEY ACTIONS
  socket.on('draw_tile', ({ lobbyId, source }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'okey') return;

    const gs = lobby.gameState;
    const currentPlayer = lobby.players[gs.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const hand = gs.hands[currentPlayer.id];
    if (!hand || hand.length >= 15) return;

    let tile = null;
    if (source === 'pile' && gs.pile.length > 0) {
      tile = gs.pile.pop();
      addLog(lobby, `📥 ${currentPlayer.name} hat 1 Stein vom Stapel gezogen.`);
    } else if (source === 'discard') {
      const prevIndex = (gs.turnIndex - 1 + lobby.players.length) % lobby.players.length;
      const prevPlayer = lobby.players[prevIndex];
      const prevDiscard = gs.discardPiles[prevPlayer.id];
      if (prevDiscard && prevDiscard.length > 0) {
        tile = prevDiscard.pop();
        addLog(lobby, `📥 ${currentPlayer.name} hat einen Stein vom Ablagestapel von ${prevPlayer.name} genommen.`);
      }
    }

    if (tile) {
      hand.push(tile);
      broadcastGameState(lobby);
    } else if (source === 'pile' && gs.pile.length === 0) {
      // No tiles left anywhere to draw - the round ends in a draw (no winner).
      addLog(lobby, `⚠️ Der Stapel ist leer. Runde endet unentschieden.`);
      lobby.status = 'finished';
      // No points change on a draw, so the match itself never ends here.
      lobby.matchOver = false;
      io.to(lobbyId).emit('lobby_updated', lobby);
      io.to(lobbyId).emit('game_ended', { winner: null, players: lobby.players, reason: 'pile_empty', matchOver: false });
    }
  });

  socket.on('discard_tile', ({ lobbyId, tileId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'okey') return;

    const gs = lobby.gameState;
    const currentPlayer = lobby.players[gs.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const hand = gs.hands[currentPlayer.id];
    if (!hand || hand.length !== 15) return;

    const tileIdx = hand.findIndex(t => Number(t.id) === Number(tileId));
    if (tileIdx !== -1) {
      const tile = hand.splice(tileIdx, 1)[0];
      gs.discardPiles[currentPlayer.id].push(tile);
      addLog(lobby, `📤 ${currentPlayer.name} hat ${tile.color === 'fake' ? 'Sahte Okey' : tile.color.toUpperCase() + ' ' + tile.value} abgeworfen.`);

      // Next turn
      gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;
      broadcastGameState(lobby);

      checkAndTriggerBotTurn(lobby);
    }
  });

  socket.on('declare_win', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'okey') return;

    const gs = lobby.gameState;
    const winner = lobby.players[gs.turnIndex];
    if (!winner || winner.id !== socket.id) return;

    const hand = gs.hands[winner.id];
    if (!hand || hand.length !== 15) return;

    const result = findWinningDiscard(hand, gs.indicator);
    if (!result) {
      socket.emit('win_rejected', {
        message: 'Deine Steine bilden noch keine gültige Okey-Hand (Reihen/Sätze zu je 3+ oder 7 Paare). Weiterspielen!',
      });
      return;
    }
    const { tile: winningDiscard, type: winType } = result;

    // Remove the tile that completes the winning hand from play (it's the "extra" 15th tile).
    const idx = hand.findIndex(t => t.id === winningDiscard.id);
    if (idx !== -1) hand.splice(idx, 1);

    // Traditional Okey scoring: the winner's own score never moves - only
    // the OTHER players lose points. An ordinary sets/runs win costs each
    // loser 2 points; winning with seven pairs, or by discarding the joker
    // itself (a much harder way to go out), costs each loser 4.
    const jokerDiscardWin = isJokerTile(winningDiscard, gs.indicator);
    const pointsLost = winType === 'pairs' || jokerDiscardWin ? 4 : 2;
    lobby.players.forEach(p => {
      if (p.id !== winner.id) p.score -= pointsLost;
    });

    // The match (this whole run of hands, not just this one) ends once
    // somebody's score drops to zero or below - then the two players left
    // with the most points are the overall winners.
    const matchOver = lobby.players.some(p => p.score <= 0);
    lobby.matchOver = matchOver;
    const matchWinners = matchOver
      ? [...lobby.players].sort((a, b) => b.score - a.score).slice(0, 2)
      : null;

    lobby.status = 'finished';
    const winLabel = winType === 'pairs' ? 'mit 7 Paaren' : jokerDiscardWin ? 'durch Abwerfen des Okey-Steins' : '';
    addLog(lobby, `🏆 ${winner.name} hat OKEY beendet${winLabel ? ` (${winLabel})` : ''} - jeder andere verliert ${pointsLost} Punkte!`);

    // Update the persistent leaderboard - only for players with a real
    // profile. Bots and anonymous solo-test players never appear on the
    // global ranking.
    if (winner.profileId) {
      bumpLeaderboardEntry(winner.profileId, winner.name, { won: true });
    }
    lobby.players.forEach(p => {
      if (p.profileId && p.profileId !== winner.profileId) {
        bumpLeaderboardEntry(p.profileId, p.name, { won: false });
      }
    });

    // The client's "Punktestand" screen reads scores off its locally-held
    // `lobby.players` (kept in sync only via 'lobby_updated'), not off the
    // `players` sent alongside 'game_ended' - without this, winner.score
    // was mutated on the server but the client never learned about it and
    // showed everyone stuck at 0.
    io.to(lobbyId).emit('lobby_updated', lobby);
    io.to(lobbyId).emit('game_ended', { winner, players: lobby.players, winType, pointsLost, matchOver, matchWinners });
    io.emit('leaderboard_updated', Object.values(globalLeaderboard));
  });

  // Deals a new hand within the same match, keeping every player's running
  // score - used after a hand ends but the match (nobody at 0 yet) goes on.
  socket.on('next_round', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'finished' || lobby.gameType !== 'okey' || lobby.matchOver) return;
    initOkeyGame(lobby);
  });

  // TAVLA (BACKGAMMON) ACTIONS
  socket.on('roll_dice', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'tavla') return;

    const gs = lobby.gameState;
    const currentPlayer = lobby.players[gs.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id || gs.diceRolled) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    gs.dice = [d1, d2];
    gs.movesRemaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    gs.diceRolled = true;

    broadcastGameState(lobby);
  });

  socket.on('move_checker', ({ lobbyId, fromIndex, dieValue }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'tavla') return;

    const gs = lobby.gameState;
    const currentPlayer = lobby.players[gs.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id || !gs.diceRolled) return;

    const dieIdx = gs.movesRemaining.indexOf(dieValue);
    if (dieIdx === -1) {
      socket.emit('move_rejected', { message: 'Dieser Würfelwert ist nicht mehr verfügbar.' });
      return;
    }

    const color = gs.playerColors[currentPlayer.id];
    if (!applyTavlaMove(gs, color, fromIndex, dieValue)) {
      socket.emit('move_rejected', { message: 'Dieser Zug ist nicht erlaubt.' });
      return;
    }

    // Use die
    gs.movesRemaining.splice(dieIdx, 1);

    // End turn if no moves remaining
    if (gs.movesRemaining.length === 0) {
      gs.diceRolled = false;
      gs.dice = [];
      gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;
      checkAndTriggerBotTurn(lobby);
    }

    broadcastGameState(lobby);
  });

  socket.on('disconnect', () => {
    lobbies.forEach(lobby => {
      if (lobby.tvSocket === socket.id) {
        lobby.tvSocket = null;
      }
      const playerIdx = lobby.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        const player = lobby.players[playerIdx];
        if (!player.isBot && lobby.status === 'playing') {
          player.isBot = true;
          if (!player.name.includes('(Bot)')) {
            player.name = `${player.name} (Bot)`;
          }
          addLog(lobby, `⚡ ${player.name} hat die Verbindung getrennt. Bot übernimmt!`);
          broadcastGameState(lobby);
          io.to(lobby.id).emit('lobby_updated', lobby);

          if (lobby.gameState && lobby.gameState.turnIndex === playerIdx) {
            checkAndTriggerBotTurn(lobby);
          }
        }
      }
    });
  });
});

async function startServer() {
  await loadLeaderboardFromFirestore();

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/leaderboard', (req, res) => {
    res.json(Object.values(globalLeaderboard));
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
