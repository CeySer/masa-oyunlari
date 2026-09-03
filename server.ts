import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
  },
});

const PORT = Number(process.env.PORT) || 3000;

interface Player {
  id: string;
  name: string;
  isBot?: boolean;
  score: number;
  elo: number;
}

interface Lobby {
  id: string;
  host: string;
  gameType: 'okey' | 'tavla';
  players: Player[];
  tvSocket: string | null;
  status: 'waiting' | 'playing' | 'finished';
  gameState: any;
  targetScore: number;
}

const lobbies = new Map<string, Lobby>();

// Persistent leaderboards in memory
const globalLeaderboard: Record<string, { name: string; elo: number; wins: number; losses: number; games: number }> = {
  'Ahmet': { name: 'Ahmet', elo: 1240, wins: 12, losses: 4, games: 16 },
  'Mehmet': { name: 'Mehmet', elo: 1180, wins: 9, losses: 6, games: 15 },
  'Ayşe': { name: 'Ayşe', elo: 1050, wins: 5, losses: 5, games: 10 },
  'Can (Bot)': { name: 'Can (Bot)', elo: 1000, wins: 3, losses: 8, games: 11 },
};

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
  const colors = ['red', 'green', 'blue', 'yellow'];
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

  // 2. End turn if no moves
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

  socket.on('create_tv_lobby', ({ gameType, name }, callback) => {
    const type = gameType === 'tavla' ? 'tavla' : 'okey';
    const lobbyId = createLobby(socket.id, type);
    const lobby = lobbies.get(lobbyId)!;
    lobby.tvSocket = socket.id;

    if (callback) callback({ success: true, lobbyId, lobby });
    io.to(lobbyId).emit('lobby_updated', lobby);
  });

  socket.on('create_lobby', ({ gameType, name }, callback) => {
    const type = gameType === 'tavla' ? 'tavla' : 'okey';
    const lobbyId = createLobby(socket.id, type);
    const lobby = lobbies.get(lobbyId)!;

    // Auto-join host as player 1
    const hostPlayer: Player = {
      id: socket.id,
      name: name || 'Host',
      score: 0,
      elo: globalLeaderboard[name]?.elo || 1200,
    };
    lobby.players.push(hostPlayer);
    socket.join(lobbyId);

    if (callback) callback({ success: true, lobbyId, player: hostPlayer, lobby });
    io.to(lobbyId).emit('lobby_updated', lobby);
  });

  socket.on('join_lobby', ({ lobbyId, name, role }, callback) => {
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
      // Check if player already in lobby
      let existingPlayer = lobby.players.find(p => p.id === socket.id || p.name === name);
      if (existingPlayer) {
        existingPlayer.id = socket.id; // update socket id
      } else {
        if (lobby.players.length >= (lobby.gameType === 'tavla' ? 2 : 4)) {
          if (callback) callback({ success: false, error: 'Lobby ist voll!' });
          return;
        }
        existingPlayer = {
          id: socket.id,
          name: name || `Spieler ${lobby.players.length + 1}`,
          score: 0,
          elo: globalLeaderboard[name]?.elo || 1200,
        };
        lobby.players.push(existingPlayer);
      }

      if (callback) callback({ success: true, player: existingPlayer, lobby });
      io.to(lobbyId).emit('lobby_updated', lobby);

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
      score: 0,
      elo: 1000,
    };

    lobby.players.push(botPlayer);
    if (callback) callback({ success: true, bot: botPlayer, lobby });
    io.to(lobbyId).emit('lobby_updated', lobby);
  });

  socket.on('remove_bot', ({ lobbyId, botId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return;
    lobby.players = lobby.players.filter(p => p.id !== botId);
    io.to(lobbyId).emit('lobby_updated', lobby);
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
      }
    }

    socket.leave(lobbyId);
    if (callback) callback({ success: true });
  });

  socket.on('start_game', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.players.length < 1) return;

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
        score: 0,
        elo: 1000,
      });
    }

    if (lobby.gameType === 'okey') {
      initOkeyGame(lobby);
    } else {
      initTavlaGame(lobby);
    }
    broadcastGameState(lobby);
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
    if (!lobby || lobby.status !== 'playing') return;

    const gs = lobby.gameState;
    const winner = lobby.players[gs.turnIndex];
    if (!winner) return;

    winner.score += 100;
    lobby.status = 'finished';
    addLog(lobby, `🏆 ${winner.name} hat OKEY beendet und 100 Punkte gewonnen!`);

    // Update global leaderboard
    if (!globalLeaderboard[winner.name]) {
      globalLeaderboard[winner.name] = { name: winner.name, elo: 1200, wins: 0, losses: 0, games: 0 };
    }
    globalLeaderboard[winner.name].wins += 1;
    globalLeaderboard[winner.name].games += 1;
    globalLeaderboard[winner.name].elo += 25;

    lobby.players.forEach(p => {
      if (p.name !== winner.name) {
        if (!globalLeaderboard[p.name]) {
          globalLeaderboard[p.name] = { name: p.name, elo: 1200, wins: 0, losses: 0, games: 0 };
        }
        globalLeaderboard[p.name].losses += 1;
        globalLeaderboard[p.name].games += 1;
        globalLeaderboard[p.name].elo = Math.max(800, globalLeaderboard[p.name].elo - 15);
      }
    });

    io.to(lobbyId).emit('game_ended', { winner, players: lobby.players });
    io.emit('leaderboard_updated', Object.values(globalLeaderboard));
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
    if (dieIdx === -1) return;

    const color = gs.playerColors[currentPlayer.id];
    const direction = color === 'white' ? 1 : -1;
    const toIndex = fromIndex + (dieValue * direction);

    if (toIndex >= 0 && toIndex < 24) {
      const sourcePoint = gs.board[fromIndex];
      const destPoint = gs.board[toIndex];

      if (sourcePoint.count > 0 && sourcePoint.color === color) {
        // Legal target point check: empty, same color, or 1 enemy checker (hit)
        if (destPoint.count === 0 || destPoint.color === color || destPoint.count === 1) {
          sourcePoint.count -= 1;
          if (sourcePoint.count === 0) sourcePoint.color = null;

          if (destPoint.count === 1 && destPoint.color !== color) {
            // Hit enemy checker
            const enemyColor = destPoint.color!;
            gs.bar[enemyColor] += 1;
            destPoint.count = 1;
            destPoint.color = color;
          } else {
            destPoint.count += 1;
            destPoint.color = color;
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
        }
      }
    }
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
