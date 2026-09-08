import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
// The Okey rule engine (what counts as a winning hand) lives in its own
// module so it can be unit-tested on its own: npm run test:rules.
import {
  isJokerTile,
  findWinningDiscard,
  isValidRunSetHand,
  isValidPairsHand,
  winPoints,
  paysForWin,
  type OkeyTile,
  type WinType,
} from './okeyRules';

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
  avatar?: string;
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
  avatar?: string;
  color?: string;
  // Connection dropped (closed tab, WiFi gone, phone asleep). The seat,
  // the tiles and the score all stay exactly as they are - a bot merely
  // covers this player's turns until they come back (see armTurnTimer).
  away?: boolean;
  // Real name of a human whose seat a stand-in bot is covering after they
  // left mid-hand. Used to give the seat back without renaming a real bot.
  humanName?: string;
}

const OKEY_STARTING_SCORE = 20;

// How long a player has for one turn (drawing and discarding together)
// before the computer plays it for them. Only counts down when somebody is
// actually waiting - see armTurnTimer. Adjustable without a code change
// (OKEY_TURN_MS / OKEY_AWAY_TURN_MS), which also keeps tests quick.
const TURN_TIME_MS = Number(process.env.OKEY_TURN_MS) || 60000;
// Someone who is offline shouldn't hold the table up for a full minute.
const AWAY_TURN_TIME_MS = Number(process.env.OKEY_AWAY_TURN_MS) || 6000;
// How long a bot "thinks" before playing. Purely cosmetic - instant bots
// feel wrong at a table - but tunable so an automated run can play whole
// hands in seconds instead of minutes.
const BOT_TURN_DELAY_MS = Number(process.env.OKEY_BOT_DELAY_MS) || 1000;

// The only reactions players can send each other - little Okey stones with
// the calls you'd actually hear at a table (see src/lib/reactions.ts for how
// they're drawn). A fixed list on purpose: it keeps this a bit of fun
// between family members rather than a chat that would need moderating, and
// nothing a player types ever reaches anyone else.
const ALLOWED_REACTIONS = ['okey', 'bravo', 'hadi', 'cay', 'aman'];
const REACTION_COOLDOWN_MS = 2000;
const lastReactionAt = new Map<string, number>();

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
  dealId?: number;
  paused?: boolean;
  // Okey only: whether the traditional 20-point match scoring applies at
  // all. When false (a casual "just play hands" lobby, chosen at creation),
  // winning a hand never costs anyone points and the match never ends on
  // its own - every hand just leads straight into "Nächste Runde". Defaults
  // to true when absent (older lobbies, and Tavla where this doesn't apply).
  scoringEnabled?: boolean;
  // Okey only: "Eşli Okey" - 2 against 2, the players sitting OPPOSITE each
  // other being partners (seats 1+3 vs 2+4), which is how partnership Okey
  // is actually played. Needs exactly four players; see teamOfSeat below for
  // how that seating turns into teams, and declare_win for the scoring.
  teamMode?: boolean;
  // Okey only: how well the bots play. 'easy' still never throws away a
  // joker or misses a free win (that's basic correctness, not a skill
  // setting) but otherwise draws/discards close to at random. 'hard' also
  // values keeping tiles that are close to completing a run/set and holds
  // onto pairs. Defaults to 'easy' for lobbies created before this existed.
  botDifficulty?: 'easy' | 'hard';
  // The Firebase uid that created this lobby (when authRequired) - lets
  // other profiles under the SAME account discover an open lobby without
  // needing the code/link (see broadcastAccountLobbyStatus/subscribe_account).
  ownerUid?: string;
}

// Docks the players who have to pay when `winnerId` ends a hand (or shows a
// Gösterme). Who that is comes from the rule engine - see paysForWin in
// okeyRules.ts, which is where partnership Okey's "the winner's partner is
// spared too" lives and where it is unit-tested.
function chargeLosers(lobby: Lobby, winnerId: string, points: number) {
  const winnerSeat = lobby.players.findIndex(p => p.id === winnerId);
  if (winnerSeat === -1) return;
  lobby.players.forEach((p, seat) => {
    if (paysForWin(winnerSeat, seat, lobby.teamMode === true)) p.score -= points;
  });
}

/**
 * Ends the current hand as a win: scores it, checks for a match end, logs
 * it, updates the leaderboard and tells everyone. Shared by the explicit
 * 'declare_win' event and by discard_tile noticing on its own that the tile
 * just thrown away happens to complete the hand ("Okey über Stein werfen" -
 * no separate button needed, throwing the winning tile away IS the win).
 */
function orderHandByRack(tiles: OkeyTile[], rackOrder?: unknown): OkeyTile[] {
  if (!Array.isArray(rackOrder) || rackOrder.length === 0) return tiles;
  const byId = new Map(tiles.map((t) => [Number(t.id), t]));
  const used = new Set<number>();
  const ordered: OkeyTile[] = [];
  for (const raw of rackOrder) {
    if (raw == null) continue;
    const id = Number(raw);
    if (!Number.isFinite(id) || used.has(id)) continue;
    const tile = byId.get(id);
    if (tile) {
      ordered.push(tile);
      used.add(id);
    }
  }
  for (const tile of tiles) {
    if (!used.has(Number(tile.id))) ordered.push(tile);
  }
  return ordered;
}

function finishHandWithWin(
  lobby: Lobby,
  lobbyId: string,
  winner: Player,
  winningDiscard: OkeyTile,
  winType: WinType,
  winningHand: OkeyTile[]
) {
  const gs = lobby.gameState;

  // Traditional Okey scoring: the winner's own score never moves - only
  // the OTHER players lose points. An ordinary sets/runs win costs each
  // loser 2 points; winning with seven pairs, or by discarding the joker
  // itself (a much harder way to go out), costs each loser 4. A lobby
  // created with scoring switched off skips all of this - every hand is
  // its own casual round, nobody's score changes, and the match never
  // ends on its own.
  // In Eşli (partnership) Okey the winner's PARTNER is spared too - only
  // the opposing pair pays. Since both members of that pair lose the same
  // amount, their two scores stay identical hand after hand, which is
  // exactly what "the team has X points left" means; nothing downstream
  // (match end, final standings) needs to know about teams at all.
  const jokerDiscardWin = isJokerTile(winningDiscard, gs.indicator);
  const scoringOn = lobby.scoringEnabled !== false;
  const pointsLost = scoringOn ? winPoints(winType, jokerDiscardWin) : 0;
  if (scoringOn) chargeLosers(lobby, winner.id, pointsLost);

  // The match (this whole run of hands, not just this one) ends once
  // somebody's score drops to zero or below - then the two players left
  // with the most points are the overall winners. Never applies when
  // scoring is off.
  const matchOver = scoringOn && lobby.players.some(p => p.score <= 0);
  lobby.matchOver = matchOver;
  const matchWinners = matchOver
    ? [...lobby.players].sort((a, b) => b.score - a.score).slice(0, 2)
    : null;

  lobby.status = 'finished';
  clearTurnTimer(lobbyId); // Runde vorbei - keine Zuguhr mehr
  const winLabel = winType === 'pairs' ? 'mit 7 Paaren' : jokerDiscardWin ? 'durch Abwerfen des Okey-Steins' : '';
  addLog(
    lobby,
    scoringOn
      ? lobby.teamMode
        ? `🏆 ${winner.name} hat OKEY beendet${winLabel ? ` (${winLabel})` : ''} - das gegnerische Paar verliert ${pointsLost} Punkte!`
        : `🏆 ${winner.name} hat OKEY beendet${winLabel ? ` (${winLabel})` : ''} - jeder andere verliert ${pointsLost} Punkte!`
      : `🏆 ${winner.name} hat OKEY beendet${winLabel ? ` (${winLabel})` : ''}!`
  );

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
  io.to(lobbyId).emit('game_ended', {
    winner,
    players: lobby.players,
    winType,
    pointsLost,
    matchOver,
    matchWinners,
    winningHand,
    winningDiscard,
  });
  io.emit('leaderboard_updated', Object.values(globalLeaderboard));
}

/**
 * Nobody can draw anymore - the round ends in a draw (no winner). Shared by
 * a human's own failed draw attempt and by discard_tile noticing right away
 * that its discard just emptied the pile, so the game doesn't have to wait
 * for the next player to try (and fail) a draw of their own.
 */
function endRoundPileEmpty(lobby: Lobby, lobbyId: string) {
  addLog(lobby, `⚠️ Der Stapel ist leer. Runde endet unentschieden.`);
  lobby.status = 'finished';
  clearTurnTimer(lobbyId);
  // A draw itself never costs anyone points - but a Gösterme bonus claimed
  // earlier in this same hand can already have dropped someone to 0, so the
  // match can still be over even though nobody won.
  const matchOver = lobby.scoringEnabled !== false && lobby.players.some(p => p.score <= 0);
  lobby.matchOver = matchOver;
  const matchWinners = matchOver
    ? [...lobby.players].sort((a, b) => b.score - a.score).slice(0, 2)
    : null;
  io.to(lobbyId).emit('lobby_updated', lobby);
  io.to(lobbyId).emit('game_ended', { winner: null, players: lobby.players, reason: 'pile_empty', matchOver, matchWinners });
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
    // "Gösterme" bonus (see declare_gosterme): who has drawn a tile yet this
    // hand (the bonus is only claimable before your own first draw) and who
    // has already claimed it this hand. Internal only - never sent to
    // clients (broadcastGameState only forwards a fixed set of public
    // fields), each player's own eligibility is reported separately below.
    drawnThisHand: {} as Record<string, boolean>,
    gostermeDeclared: {} as Record<string, boolean>,
  };
  lobby.status = 'playing';
  lobby.paused = false;
  lobby.dealId = (lobby.dealId || 0) + 1;

  addLog(lobby, `🎮 Spiel gestartet! ${players[firstPlayerIndex].name} ist am Zug.`);
  broadcastGameState(lobby);
  checkAndTriggerBotTurn(lobby);
}

// OKEY WIN VALIDATION
// The rules themselves live in ./okeyRules.ts so they can be unit-tested
// without booting a server (npm run test:rules). Nothing about "is this a
// winning hand" is decided here any more - only what happens afterwards.

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

// TURN TIMER
// One pending timeout per lobby. Not kept on gameState because that gets
// serialised out to clients - only the deadline itself is public.
const turnTimers = new Map<string, NodeJS.Timeout>();

function clearTurnTimer(lobbyId: string) {
  const existing = turnTimers.get(lobbyId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(lobbyId);
  }
}

/**
 * Makes sure a countdown is running for whoever is on turn - and that it
 * isn't restarted mid-turn (drawing a tile must not buy a fresh minute).
 *
 * Called at the top of broadcastGameState, so every state change keeps the
 * timer honest and the deadline it sets goes out with that same broadcast.
 */
function armTurnTimer(lobby: Lobby) {
  const gs = lobby.gameState;

  const stop = () => {
    clearTurnTimer(lobby.id);
    if (gs) {
      gs.turnDeadline = null;
      gs.timerForTurn = null;
      gs.timerForAway = null;
    }
  };

  if (!gs || lobby.status !== 'playing' || lobby.gameType !== 'okey' || lobby.paused) return stop();

  const current = lobby.players[gs.turnIndex];
  // Bots already move on their own timer, no countdown needed for them.
  if (!current || current.isBot) return stop();

  // A clock only makes sense while someone is waiting: playing alone
  // against bots there's nobody to hold up. The exception is a player who
  // has gone offline - then the table would stall without one.
  const humans = lobby.players.filter(p => !p.isBot).length;
  if (humans < 2 && !current.away) return stop();

  // Already counting down for exactly this turn, on the clock that still
  // applies: leave it alone. But a player can go away or come back without
  // the turn itself changing - reconnecting mid-turn must not be left
  // stuck on the short away-clock that was armed before they returned (and
  // going away mid-turn must not be left on the long normal clock either),
  // so a change in away-status for this same turn always re-arms below.
  if (gs.timerForTurn === gs.turnIndex && gs.timerForAway === current.away && turnTimers.has(lobby.id)) return;

  clearTurnTimer(lobby.id);
  const durationMs = current.away ? AWAY_TURN_TIME_MS : TURN_TIME_MS;
  gs.turnDurationMs = durationMs;
  gs.turnDeadline = Date.now() + durationMs;
  gs.timerForTurn = gs.turnIndex;
  gs.timerForAway = current.away === true;

  const armedFor = gs.turnIndex;
  turnTimers.set(
    lobby.id,
    // Small grace on top so a move that arrives right on the buzzer still
    // counts as the player's own.
    setTimeout(() => {
      turnTimers.delete(lobby.id);
      onTurnTimeout(lobby, armedFor);
    }, durationMs + 300)
  );
}

/** Time's up: the computer plays this one turn, the seat stays the player's. */
function onTurnTimeout(lobby: Lobby, armedFor: number) {
  const gs = lobby.gameState;
  if (!gs || lobby.status !== 'playing' || gs.turnIndex !== armedFor) return;

  const player = lobby.players[armedFor];
  if (!player || player.isBot) return;

  addLog(
    lobby,
    player.away
      ? `📴 ${player.name} ist offline - der Computer übernimmt diesen Zug.`
      : `⏳ Zeit abgelaufen - der Computer übernimmt ${player.name}s Zug.`
  );

  // Nothing about the player changes here: no "(Bot)" in the name, no lost
  // seat. They just miss this one turn and can carry on with the next.
  gs.timerForTurn = null;
  gs.timerForAway = null;
  executeOkeyBotTurn(lobby, player);
}

// BOT AI CONTROLLER
function checkAndTriggerBotTurn(lobby: Lobby) {
  if (lobby.status !== 'playing' || !lobby.gameState || lobby.paused) return;
  const gs = lobby.gameState;
  const turnWhenQueued = gs.turnIndex;
  const currentPlayer = lobby.players[turnWhenQueued];

  if (!currentPlayer || !currentPlayer.isBot) return;

  setTimeout(() => {
    if (lobby.status !== 'playing' || !lobby.gameState) return;
    if (lobby.gameState.turnIndex !== turnWhenQueued) return;
    const activePlayer = lobby.players[lobby.gameState.turnIndex];
    if (!activePlayer || !activePlayer.isBot) return;

    if (lobby.gameType === 'okey') {
      executeOkeyBotTurn(lobby, activePlayer);
    } else if (lobby.gameType === 'tavla') {
      executeTavlaBotTurn(lobby, activePlayer);
    }
  }, BOT_TURN_DELAY_MS);
}

// --- Bot AI -----------------------------------------------------------
// Two knobs decide how a bot plays a hand (see Lobby.botDifficulty): 'easy'
// bots draw and discard close to at random, 'hard' bots keep track of
// which tiles are actually useful. Both levels share two rules that are
// about correctness rather than skill, and always apply regardless of
// difficulty: never sit on a hand that has already won (see
// executeOkeyBotDiscard's findWinningDiscard check), and never voluntarily
// throw away a joker - handing an opponent the single strongest tile in
// the game is close to the worst move in Okey, not a beginner mistake to
// imitate.

/**
 * Rough measure of how useful `tile` still is for building a run or set
 * with the rest of the hand: a same-colour tile one or two steps away
 * helps a run, a same-value tile of another colour helps a set. Higher
 * means more useful to keep - this only needs to rank a hand's tiles
 * against each other, not be a perfect evaluation.
 */
function tileConnectivity(tile: OkeyTile, hand: OkeyTile[]): number {
  let score = 0;
  for (const other of hand) {
    if (other.id === tile.id) continue;
    if (other.color === tile.color) {
      const dist = Math.abs(other.value - tile.value);
      if (dist === 1) score += 2;
      else if (dist === 2) score += 1;
    } else if (other.value === tile.value) {
      score += 2;
    }
  }
  return score;
}

/** Index into a 15-tile hand of the tile the bot should throw away. */
function pickBotDiscardIndex(hand: OkeyTile[], indicator: OkeyTile | null, difficulty: 'easy' | 'hard'): number {
  const keepable = hand.map((_, i) => i).filter(i => !isJokerTile(hand[i], indicator));
  // Every tile being a joker can't happen in a legal hand, but fall back
  // to the full hand rather than throw if it somehow did.
  const candidates = keepable.length > 0 ? keepable : hand.map((_, i) => i);

  if (difficulty === 'easy') {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let bestIdxs: number[] = [];
  let bestScore = Infinity;
  for (const i of candidates) {
    const score = tileConnectivity(hand[i], hand);
    if (score < bestScore) {
      bestScore = score;
      bestIdxs = [i];
    } else if (score === bestScore) {
      bestIdxs.push(i);
    }
  }
  return bestIdxs[Math.floor(Math.random() * bestIdxs.length)];
}

/** Whether the bot should pick up the top discard instead of drawing blind. */
function shouldTakeDiscard(topDiscard: OkeyTile, hand: OkeyTile[], difficulty: 'easy' | 'hard'): boolean {
  const matches = hand.some(t => t.value === topDiscard.value || t.color === topDiscard.color);
  if (!matches) return false;
  if (difficulty === 'easy') return Math.random() > 0.3;
  // Hard bots weigh how useful the tile would actually be instead of just
  // noticing that some match exists.
  return tileConnectivity(topDiscard, hand) >= 2 || Math.random() > 0.5;
}

function executeOkeyBotTurn(lobby: Lobby, botPlayer: Player) {
  const gs = lobby.gameState;
  if (!gs || lobby.status !== 'playing' || lobby.paused) return;
  if (lobby.players[gs.turnIndex]?.id !== botPlayer.id) return;
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

    const difficulty: 'easy' | 'hard' = lobby.botDifficulty === 'hard' ? 'hard' : 'easy';

    let drewFromDiscard = false;
    if (topDiscard && topDiscard.color !== 'fake' && shouldTakeDiscard(topDiscard, hand, difficulty)) {
      hand.push(prevDiscard.pop());
      drewFromDiscard = true;
      addLog(lobby, `📥 ${botPlayer.name} hat einen Stein vom Ablagestapel genommen.`);
    }

    if (!drewFromDiscard) {
      if (gs.pile.length > 0) {
        hand.push(gs.pile.pop());
        addLog(lobby, `📥 ${botPlayer.name} hat einen Stein vom Stapel gezogen.`);
      } else {
        endRoundPileEmpty(lobby, lobby.id);
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

  if (hand.length >= 15) {
    executeOkeyBotDiscard(lobby, botPlayer);
    return;
  }

  // Can't draw and can't discard — don't freeze the table.
  addLog(lobby, `⚠️ ${botPlayer.name} konnte nicht ziehen - Zug wird weitergegeben.`);
  gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;
  broadcastGameState(lobby);
  checkAndTriggerBotTurn(lobby);
}

function executeOkeyBotDiscard(lobby: Lobby, botPlayer: Player) {
  const gs = lobby.gameState;
  if (!gs || lobby.status !== 'playing' || lobby.paused) return;
  if (lobby.players[gs.turnIndex]?.id !== botPlayer.id) return;
  const hand = gs.hands[botPlayer.id];
  if (!hand || hand.length < 15) {
    checkAndTriggerBotTurn(lobby);
    return;
  }

  // A bot never sits on a hand that has already won - if any discard
  // completes a valid hand, take it, exactly like a human's "Okey über
  // Stein werfen" auto-win in discard_tile.
  const winningDiscard = findWinningDiscard(hand, gs.indicator);
  if (winningDiscard) {
    const idx = hand.findIndex(t => Number(t.id) === Number(winningDiscard.tile.id));
    if (idx !== -1) {
      const rest14 = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
      const tile = hand.splice(idx, 1)[0];
      finishHandWithWin(lobby, lobby.id, botPlayer, tile, winningDiscard.type, rest14);
      return;
    }
  }

  const difficulty: 'easy' | 'hard' = lobby.botDifficulty === 'hard' ? 'hard' : 'easy';
  const discardIndex = pickBotDiscardIndex(hand, gs.indicator, difficulty);

  const discardedTile = hand.splice(discardIndex, 1)[0];
  if (!gs.discardPiles[botPlayer.id]) {
    gs.discardPiles[botPlayer.id] = [];
  }
  gs.discardPiles[botPlayer.id].push(discardedTile);
  addLog(lobby, `📤 ${botPlayer.name} hat ${discardedTile.color === 'fake' ? 'Sahte Okey' : discardedTile.color.toUpperCase() + ' ' + discardedTile.value} abgeworfen.`);

  // Advance turn
  gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;

  // Nobody can draw anymore - end the round right here, exactly like the
  // human discard path.
  if (gs.pile.length === 0) {
    endRoundPileEmpty(lobby, lobby.id);
    return;
  }

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

  // Before building the payload, so a freshly set deadline goes out with
  // this very broadcast instead of only with the next one.
  armTurnTimer(lobby);

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
    // When the player on turn runs out of time (epoch ms), and how long
    // they had - the clients draw the countdown bar from these two.
    turnDeadline: gs.turnDeadline ?? null,
    turnDurationMs: gs.turnDurationMs ?? TURN_TIME_MS,
    // How many tiles each player is holding. The tiles themselves stay
    // private (only their owner gets 'hand_updated'), but the count is
    // public information at a real table - you can see everyone's rack.
    dealId: lobby.dealId || 0,
    handCounts: gs.hands
      ? lobby.players.reduce((acc: Record<string, number>, p) => {
          acc[p.id] = (gs.hands[p.id] || []).length;
          return acc;
        }, {})
      : {},
  };

  io.to(lobby.id).emit('lobby_updated', lobby);
  io.to(lobby.id).emit('game_state_updated', publicState);

  if (gs.hands) {
    lobby.players.forEach(p => {
      if (!p.isBot) {
        io.to(p.id).emit('hand_updated', gs.hands[p.id] || []);
        if (lobby.gameType === 'okey') {
          const hand = gs.hands[p.id] || [];
          const indicator = gs.indicator;
          const hasMatch = indicator && hand.some((t: OkeyTile) => t.color === indicator.color && t.value === indicator.value);
          const eligible = Boolean(
            hasMatch && !gs.drawnThisHand?.[p.id] && !gs.gostermeDeclared?.[p.id]
          );
          io.to(p.id).emit('gosterme_eligible', eligible);
        }
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

  socket.on('create_profile', async ({ idToken, name, color, avatar }, callback) => {
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
        avatar: typeof avatar === 'string' ? avatar.slice(0, 16) : 'cay',
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

  socket.on('update_profile', async ({ idToken, profileId, name, color, avatar }, callback) => {
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
    if (typeof avatar === 'string' && avatar) update.avatar = avatar.slice(0, 16);

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

  socket.on('create_lobby', async ({ gameType, name, idToken, profileId, scoringEnabled, teamMode, botDifficulty }, callback) => {
    const type = gameType === 'tavla' ? 'tavla' : 'okey';

    // Tavla still has too many open bugs to expose right now - keep it
    // switched off server-side too, not just hidden in the UI, so a stale
    // client or a direct API call can't start one either.
    if (type === 'tavla') {
      if (callback) callback({ success: false, error: 'Tavla ist vorübergehend deaktiviert, während wir Okey fertigstellen.' });
      return;
    }

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
    lobby.scoringEnabled = scoringEnabled !== false; // default on
    // Eşli Okey only makes sense with four seats - start_game fills any
    // empty ones with bots, so a team lobby always ends up 2 against 2.
    lobby.teamMode = type === 'okey' && teamMode === true;
    lobby.botDifficulty = botDifficulty === 'hard' ? 'hard' : 'easy';

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
      let existingPlayer = lobby.players.find(p =>
        (profile && p.profileId === profile.id) ||
        p.id === socket.id ||
        p.humanName === playerName ||
        (!p.isBot && p.name === playerName)
      );
      if (existingPlayer) {
        const oldId = existingPlayer.id;
        existingPlayer.id = socket.id; // update socket id
        if (oldId !== socket.id) {
          // Reconnecting (tab switched away and back, dropped WiFi, etc.)
          // gets a brand-new socket.id. Several per-player bits of live game
          // state are keyed by that id - if we don't rekey them too, the
          // reconnecting player's hand/discards/checker-color silently
          // vanish even though the player object itself is fine. This was a
          // real reported bug ("alle meine Steine weg" after switching tabs).
          if (lobby.host === oldId) lobby.host = socket.id;
          const gs = lobby.gameState;
          if (gs) {
            if (gs.hands && oldId in gs.hands) {
              gs.hands[socket.id] = gs.hands[oldId];
              delete gs.hands[oldId];
            }
            if (gs.discardPiles && oldId in gs.discardPiles) {
              gs.discardPiles[socket.id] = gs.discardPiles[oldId];
              delete gs.discardPiles[oldId];
            }
            if (gs.playerColors && oldId in gs.playerColors) {
              gs.playerColors[socket.id] = gs.playerColors[oldId];
              delete gs.playerColors[oldId];
            }
            if (gs.drawnThisHand && oldId in gs.drawnThisHand) {
              gs.drawnThisHand[socket.id] = gs.drawnThisHand[oldId];
              delete gs.drawnThisHand[oldId];
            }
            if (gs.gostermeDeclared && oldId in gs.gostermeDeclared) {
              gs.gostermeDeclared[socket.id] = gs.gostermeDeclared[oldId];
              delete gs.gostermeDeclared[oldId];
            }
          }
        }
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
          avatar: profile?.avatar,
          color: profile?.color,
        };
        lobby.players.push(existingPlayer);
      }

      // Back from being offline or from a seat the table had turned into a
      // stand-in bot: this is a human again, same name, same tiles.
      if (existingPlayer.away || existingPlayer.humanName || (existingPlayer.isBot && existingPlayer.profileId)) {
        existingPlayer.away = false;
        existingPlayer.isBot = false;
        existingPlayer.name = playerName || existingPlayer.humanName || existingPlayer.name.replace(/ \(Bot\)$/, '');
        delete existingPlayer.humanName;
        if (profile?.avatar) existingPlayer.avatar = profile.avatar;
        if (profile?.color) existingPlayer.color = profile.color;
        if (lobby.status === 'playing') {
          addLog(lobby, `🔌 ${existingPlayer.name} ist wieder da und spielt weiter.`);
        }
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

    const botAvatars = ['zar', 'kus', 'balik', 'lale', 'fener', 'tac'];
    const botPlayer: Player = {
      id: `bot_${Math.random().toString(36).substring(2, 7)}`,
      name: availableName,
      isBot: true,
      score: OKEY_STARTING_SCORE,
      elo: 1000,
      avatar: botAvatars[lobby.players.length % botAvatars.length],
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
        const reserved = new Set(lobby.players.map((p) => p.name));
        const standIn = ['Bot Can', 'Bot Elif', 'Bot Mehmet', 'Bot Zeynep', 'Bot Deniz', 'Bot Ayse']
          .find((n) => !reserved.has(n)) || `Bot ${playerIdx + 1}`;
        leavingPlayer.humanName = leavingPlayer.name;
        leavingPlayer.name = standIn;
        leavingPlayer.isBot = true;
        leavingPlayer.away = false;
        lobby.paused = false;
        addLog(lobby, `🚪 ${leavingPlayer.humanName} hat verlassen - ${standIn} übernimmt.`);

        broadcastGameState(lobby);
        io.to(lobbyId).emit('lobby_updated', lobby);
        checkAndTriggerBotTurn(lobby);
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
      const botAvatars = ['zar', 'kus', 'balik', 'lale', 'fener', 'tac'];
      lobby.players.push({
        id: `bot_${Math.random().toString(36).substring(2, 7)}`,
        name,
        isBot: true,
        score: OKEY_STARTING_SCORE,
        elo: 1000,
        avatar: botAvatars[lobby.players.length % botAvatars.length],
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
      // Drawing closes the window for this player's "Gösterme" bonus (it's
      // only claimable before your own first draw of the hand).
      if (!gs.drawnThisHand) gs.drawnThisHand = {};
      gs.drawnThisHand[currentPlayer.id] = true;
      broadcastGameState(lobby);
    } else if (source === 'pile' && gs.pile.length === 0) {
      // No tiles left anywhere to draw - the round ends in a draw (no winner).
      endRoundPileEmpty(lobby, lobbyId);
    }
  });

  socket.on('discard_tile', ({ lobbyId, tileId, rackOrder }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'okey') return;

    const gs = lobby.gameState;
    const currentPlayer = lobby.players[gs.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const hand = gs.hands[currentPlayer.id];
    if (!hand || hand.length !== 15) return;

    const tileIdx = hand.findIndex(t => Number(t.id) === Number(tileId));
    if (tileIdx === -1) return;

    // "Okey über Stein werfen": no separate win button - if throwing away
    // exactly this tile leaves the other 14 forming a valid hand, that IS
    // declaring the win, the same as the old explicit declare_win event.
    // Seven pairs is checked first only because it (like the joker-discard
    // bonus below) is worth more when a hand happens to satisfy both.
    const rest14 = [...hand.slice(0, tileIdx), ...hand.slice(tileIdx + 1)];
    const winType: WinType | null = isValidPairsHand(rest14, gs.indicator)
      ? 'pairs'
      : isValidRunSetHand(rest14, gs.indicator)
      ? 'runset'
      : null;

    const tile = hand.splice(tileIdx, 1)[0];

    if (winType) {
      finishHandWithWin(lobby, lobbyId, currentPlayer, tile, winType, orderHandByRack(rest14, rackOrder));
      return;
    }

    gs.discardPiles[currentPlayer.id].push(tile);
    addLog(lobby, `📤 ${currentPlayer.name} hat ${tile.color === 'fake' ? 'Sahte Okey' : tile.color.toUpperCase() + ' ' + tile.value} abgeworfen.`);

    // Next turn
    gs.turnIndex = (gs.turnIndex + 1) % lobby.players.length;

    // Nobody can draw anymore - end the round right here (a draw, no
    // winner) instead of waiting for the next player to try, and fail, a
    // draw of their own.
    if (gs.pile.length === 0) {
      endRoundPileEmpty(lobby, lobbyId);
      return;
    }

    broadcastGameState(lobby);
    checkAndTriggerBotTurn(lobby);
  });

  socket.on('declare_win', ({ lobbyId, rackOrder }) => {
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
    const rest14 = idx === -1 ? [...hand] : [...hand.slice(0, idx), ...hand.slice(idx + 1)];
    if (idx !== -1) hand.splice(idx, 1);

    finishHandWithWin(lobby, lobbyId, winner, winningDiscard, winType, orderHandByRack(rest14, rackOrder));
  });

  // Throwing a reaction stone onto the table. Only ids from the fixed list
  // above are accepted, and a short cooldown per player stops anyone from
  // burying the table in stones.
  socket.on('send_reaction', ({ lobbyId, reaction }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || !ALLOWED_REACTIONS.includes(reaction)) return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;

    const last = lastReactionAt.get(socket.id) || 0;
    if (Date.now() - last < REACTION_COOLDOWN_MS) return;
    lastReactionAt.set(socket.id, Date.now());

    io.to(lobbyId).emit('reaction', { playerId: player.id, name: player.name, reaction });
  });

  // Deals a new hand within the same match, keeping every player's running
  // score - used after a hand ends but the match (nobody at 0 yet) goes on.
  socket.on('next_round', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'finished' || lobby.gameType !== 'okey' || lobby.matchOver) return;
    lobby.players.forEach((p) => {
      if (p.isBot && (p.profileId || p.name.endsWith(' (Bot)'))) {
        p.isBot = false;
        p.away = false;
        if (p.name.endsWith(' (Bot)')) p.name = p.name.replace(/ \(Bot\)$/, '');
      }
    });
    initOkeyGame(lobby);
  });

  socket.on('toggle_pause', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'okey') return;
    const humans = lobby.players.filter((p) => !p.isBot && !p.away).length;
    if (humans !== 1) return;
    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player || player.isBot) return;
    lobby.paused = !lobby.paused;
    if (lobby.paused) {
      addLog(lobby, '⏸️ Pause');
      io.to(lobbyId).emit('lobby_updated', lobby);
      broadcastGameState(lobby);
    } else {
      addLog(lobby, '▶️ Weiter');
      io.to(lobbyId).emit('lobby_updated', lobby);
      broadcastGameState(lobby);
      checkAndTriggerBotTurn(lobby);
    }
  });

  // "Gösterme": if a player was dealt a tile identical to the gösterge
  // (indicator) tile, they may show it - before their own first draw this
  // hand - to take 1 point off every other player. Per the official rules
  // this is a bonus, not a win: play just continues afterwards.
  socket.on('declare_gosterme', ({ lobbyId }, callback) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'playing' || lobby.gameType !== 'okey') {
      if (callback) callback({ success: false, error: 'Gerade nicht möglich.' });
      return;
    }
    const gs = lobby.gameState;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) {
      if (callback) callback({ success: false, error: 'Du bist gerade nicht in dieser Runde.' });
      return;
    }
    if (gs.drawnThisHand?.[player.id]) {
      if (callback) callback({ success: false, error: 'Zu spät - du hast in dieser Runde schon gezogen.' });
      return;
    }
    if (gs.gostermeDeclared?.[player.id]) {
      if (callback) callback({ success: false, error: 'Du hast das schon gezeigt.' });
      return;
    }
    const hand: OkeyTile[] = gs.hands[player.id] || [];
    const indicator = gs.indicator;
    const hasMatch = indicator && hand.some(t => t.color === indicator.color && t.value === indicator.value);
    if (!hasMatch) {
      if (callback) callback({ success: false, error: 'Du hast keinen zum Gösterge passenden Stein.' });
      return;
    }

    if (!gs.gostermeDeclared) gs.gostermeDeclared = {};
    gs.gostermeDeclared[player.id] = true;

    // Same as a win: in a partnership lobby only the opposing pair pays.
    const scoringOn = lobby.scoringEnabled !== false;
    if (scoringOn) chargeLosers(lobby, player.id, 1);
    addLog(
      lobby,
      scoringOn
        ? lobby.teamMode
          ? `✨ ${player.name} zeigt einen Gösterme-Stein - das gegnerische Paar verliert 1 Punkt!`
          : `✨ ${player.name} zeigt einen Gösterme-Stein - jeder andere verliert 1 Punkt!`
        : `✨ ${player.name} zeigt einen Gösterme-Stein!`
    );

    // If this drops someone to 0, the match is over - but that's only
    // acted on (and lobby.matchOver set) once the current hand actually
    // ends, exactly like an ordinary win; see declare_win / pile_empty.
    io.to(lobbyId).emit('lobby_updated', lobby);
    broadcastGameState(lobby); // refreshes gosterme_eligible for everyone
    if (callback) callback({ success: true });
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
      if (playerIdx === -1) return;

      const player = lobby.players[playerIdx];
      if (player.isBot || player.away) return;

      // Mark them away instead of replacing them. Their seat, tiles and
      // score stay untouched and their name stays their name - the turn
      // timer just lets the computer cover their turns (on a much shorter
      // clock, see AWAY_TURN_TIME_MS) until they reconnect. A backgrounded
      // tab or a WiFi blip therefore costs at most a turn, not the game.
      player.away = true;
      if (lobby.status === 'playing') {
        addLog(lobby, `📴 ${player.name} ist offline - der Computer übernimmt so lange.`);
      }
      broadcastGameState(lobby);
      io.to(lobby.id).emit('lobby_updated', lobby);
      broadcastAccountLobbyStatus(lobby);
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
