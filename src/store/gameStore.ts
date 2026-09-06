import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface LeaderboardEntry {
  uid?: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  games: number;
}

export interface GameResult {
  winner: { id: string; name: string } | null;
  reason?: string;
  winType?: 'runset' | 'pairs';
  pointsLost?: number;
  matchOver?: boolean;
  matchWinners?: { id: string; name: string; score: number }[] | null;
}

// A lobby another profile under the SAME account currently has open,
// discoverable without a code (see server.ts broadcastAccountLobbyStatus).
export interface AccountLobbyStatus {
  lobbyId: string;
  gameType: 'okey' | 'tavla';
  open: boolean;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
}

interface GameState {
  socket: Socket | null;
  lobby: any;
  player: any;
  hand: any[];
  publicGameState: any;
  leaderboard: LeaderboardEntry[];
  gameResult: GameResult | null;
  winRejectedMessage: string | null;
  moveRejectedMessage: string | null;
  gostermeMessage: string | null;
  // Whether the game state you're currently in makes you eligible to
  // declare "Gösterme" right now (a tile matching the indicator, and you
  // haven't drawn yet this hand) - see server.ts's 'gosterme_eligible'.
  gostermeEligible: boolean;
  // Keyed by lobbyId. Open lobbies from other profiles under this account -
  // see subscribeAccount() and server.ts's 'account_lobby_status' event.
  accountLobbies: Record<string, AccountLobbyStatus>;
  connectSocket: () => void;
  subscribeAccount: (idToken: string) => void;
  setLobby: (lobby: any) => void;
  setPlayer: (player: any) => void;
  setHand: (hand: any[]) => void;
  setPublicGameState: (state: any) => void;
  clearGameResult: () => void;
  clearWinRejectedMessage: () => void;
  clearMoveRejectedMessage: () => void;
  clearGostermeMessage: () => void;
  declareGosterme: (lobbyId: string) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  lobby: null,
  player: null,
  hand: [],
  publicGameState: null,
  leaderboard: [],
  gameResult: null,
  winRejectedMessage: null,
  moveRejectedMessage: null,
  gostermeMessage: null,
  gostermeEligible: false,
  accountLobbies: {},
  connectSocket: () => {
    if (!get().socket) {
      // VITE_SERVER_URL points at the game server when frontend and backend
      // are hosted separately (e.g. frontend on Firebase Hosting, backend on
      // Render/Railway/Fly). Leave unset for same-origin (monolithic) deploys.
      const serverUrl = import.meta.env.VITE_SERVER_URL || undefined;
      const socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      set({ socket });

      // A reconnect (dropped WiFi, backgrounded tab, or the tab being paused
      // by a blocking window.alert()) gets a brand-new socket.id from the
      // server. The lobby on the server still has our OLD id tied to our
      // seat/turn, so without rejoining, isMyTurn (id comparison) would
      // silently stay false forever - looking exactly like a frozen game.
      // Clearing `player` here makes the existing "rejoin if !player" effect
      // (see Game.tsx) fire again and re-associate our seat with the new id.
      socket.io.on('reconnect', () => {
        set({ player: null });
      });

      socket.on('lobby_updated', (lobby) => {
        set({ lobby });
      });

      socket.on('game_started', (gameState) => {
        set((state) => ({
          lobby: state.lobby ? { ...state.lobby, status: 'playing', gameState } : null,
          publicGameState: gameState,
        }));
      });

      socket.on('game_state_updated', (publicGameState) => {
        set({ publicGameState });
      });

      socket.on('hand_updated', (hand) => {
        set({ hand });
      });

      socket.on('leaderboard_updated', (leaderboard: LeaderboardEntry[]) => {
        set({ leaderboard });
      });

      socket.on('game_ended', ({ winner, reason, winType, pointsLost, matchOver, matchWinners }) => {
        set((state) => ({
          lobby: state.lobby ? { ...state.lobby, status: 'finished' } : null,
          gameResult: { winner: winner || null, reason, winType, pointsLost, matchOver, matchWinners },
        }));
      });

      socket.on('win_rejected', ({ message }: { message: string }) => {
        set({ winRejectedMessage: message });
      });

      socket.on('move_rejected', ({ message }: { message: string }) => {
        set({ moveRejectedMessage: message });
      });

      socket.on('gosterme_eligible', (eligible: boolean) => {
        set({ gostermeEligible: eligible });
      });

      // Real-time updates for lobbies opened by OTHER profiles under this
      // same account - the initial snapshot comes back from the
      // 'subscribe_account' callback instead (see subscribeAccount below).
      socket.on('account_lobby_status', (status: AccountLobbyStatus) => {
        set((state) => {
          const next = { ...state.accountLobbies };
          if (status.open) next[status.lobbyId] = status;
          else delete next[status.lobbyId];
          return { accountLobbies: next };
        });
      });
    }
  },
  subscribeAccount: (idToken: string) => {
    const socket = get().socket;
    if (!socket) return;
    socket.emit('subscribe_account', { idToken }, (res: { success: boolean; openLobbies?: AccountLobbyStatus[] }) => {
      if (res?.success && res.openLobbies) {
        const map: Record<string, AccountLobbyStatus> = {};
        res.openLobbies.forEach((l) => { map[l.lobbyId] = l; });
        set({ accountLobbies: map });
      }
    });
  },
  setLobby: (lobby) => set({ lobby }),
  setPlayer: (player) => set({ player }),
  setHand: (hand) => set({ hand }),
  setPublicGameState: (publicGameState) => set({ publicGameState }),
  clearGameResult: () => set({ gameResult: null }),
  clearWinRejectedMessage: () => set({ winRejectedMessage: null }),
  clearMoveRejectedMessage: () => set({ moveRejectedMessage: null }),
  clearGostermeMessage: () => set({ gostermeMessage: null }),
  declareGosterme: (lobbyId: string) => {
    const socket = get().socket;
    socket?.emit('declare_gosterme', { lobbyId }, (res: { success: boolean; error?: string }) => {
      if (!res?.success) {
        set({ gostermeMessage: res?.error || 'Gösterme konnte nicht gezeigt werden.' });
      }
    });
  },
}));
