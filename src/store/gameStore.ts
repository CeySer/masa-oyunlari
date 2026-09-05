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
  connectSocket: () => void;
  setLobby: (lobby: any) => void;
  setPlayer: (player: any) => void;
  setHand: (hand: any[]) => void;
  setPublicGameState: (state: any) => void;
  clearGameResult: () => void;
  clearWinRejectedMessage: () => void;
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

      socket.on('game_ended', ({ winner, reason }) => {
        set((state) => ({
          lobby: state.lobby ? { ...state.lobby, status: 'finished' } : null,
          gameResult: { winner: winner || null, reason },
        }));
      });

      socket.on('win_rejected', ({ message }: { message: string }) => {
        set({ winRejectedMessage: message });
      });
    }
  },
  setLobby: (lobby) => set({ lobby }),
  setPlayer: (player) => set({ player }),
  setHand: (hand) => set({ hand }),
  setPublicGameState: (publicGameState) => set({ publicGameState }),
  clearGameResult: () => set({ gameResult: null }),
  clearWinRejectedMessage: () => set({ winRejectedMessage: null }),
}));
