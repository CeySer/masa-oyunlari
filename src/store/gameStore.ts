import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface LeaderboardEntry {
  name: string;
  elo: number;
  wins: number;
  losses: number;
  games: number;
}

interface GameState {
  socket: Socket | null;
  lobby: any;
  player: any;
  hand: any[];
  publicGameState: any;
  leaderboard: LeaderboardEntry[];
  connectSocket: () => void;
  setLobby: (lobby: any) => void;
  setPlayer: (player: any) => void;
  setHand: (hand: any[]) => void;
  setPublicGameState: (state: any) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  lobby: null,
  player: null,
  hand: [],
  publicGameState: null,
  leaderboard: [],
  connectSocket: () => {
    if (!get().socket) {
      const socket = io({
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

      socket.on('game_ended', ({ winner }) => {
        set((state) => ({
          lobby: state.lobby ? { ...state.lobby, status: 'finished' } : null,
        }));
      });
    }
  },
  setLobby: (lobby) => set({ lobby }),
  setPlayer: (player) => set({ player }),
  setHand: (hand) => set({ hand }),
  setPublicGameState: (publicGameState) => set({ publicGameState }),
}));
