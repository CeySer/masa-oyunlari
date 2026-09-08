import { create } from 'zustand';
import { useGameStore } from './gameStore';
import { useAuthStore } from './authStore';

// One Firebase account can hold several player profiles (e.g. one per
// family member) - similar to the profile picker in EduPlay Hub. The
// selected profile decides the display name and persistent leaderboard
// entry used for games; it lives entirely on the server (Firestore
// collection "profiles"), reached here only through socket round-trips.
export interface PlayerProfile {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  elo: number;
  wins: number;
  losses: number;
  games: number;
}

const ACTIVE_PROFILE_KEY = 'activeProfileId';
// sessionStorage (not localStorage!): each browser tab gets its own copy, so
// two family members signed into the same account in two separate tabs (or
// two devices, which each have their own storage regardless) each keep
// their own chosen profile - localStorage would have let picking a profile
// in one tab silently overwrite another open tab's selection.

interface ProfileState {
  profiles: PlayerProfile[];
  activeProfile: PlayerProfile | null;
  profilesLoading: boolean;
  profilesReady: boolean;
  profilesError: string | null;
  loadProfiles: () => void;
  createProfile: (name: string, color: string, avatar?: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (id: string, patch: { name?: string; color?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteProfile: (id: string) => Promise<{ success: boolean; error?: string }>;
  selectProfile: (profile: PlayerProfile) => void;
  clearActiveProfile: () => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  profilesLoading: false,
  profilesReady: false,
  profilesError: null,

  loadProfiles: () => {
    const socket = useGameStore.getState().socket;
    set({ profilesLoading: true, profilesError: null });
    useAuthStore.getState().getIdToken().then((idToken) => {
      if (!socket || !idToken) {
        set({ profilesLoading: false, profilesReady: true });
        return;
      }
      socket.emit('list_profiles', { idToken }, (res: any) => {
        if (res.success) {
          const profiles: PlayerProfile[] = res.profiles;
          const storedId = sessionStorage.getItem(ACTIVE_PROFILE_KEY);
          const match = storedId ? profiles.find((p) => p.id === storedId) : undefined;
          set({ profiles, profilesLoading: false, profilesReady: true, activeProfile: match || get().activeProfile });
        } else {
          set({ profilesLoading: false, profilesReady: true, profilesError: res.error || 'Profile konnten nicht geladen werden.' });
        }
      });
    });
  },

  createProfile: (name, color, avatar) => {
    return new Promise((resolve) => {
      const socket = useGameStore.getState().socket;
      useAuthStore.getState().getIdToken().then((idToken) => {
        if (!socket || !idToken) {
          resolve({ success: false, error: 'Nicht angemeldet.' });
          return;
        }
        socket.emit('create_profile', { idToken, name, color, avatar }, (res: any) => {
          if (res.success) {
            set((s) => ({ profiles: [...s.profiles, res.profile] }));
            resolve({ success: true });
          } else {
            resolve({ success: false, error: res.error });
          }
        });
      });
    });
  },

  updateProfile: (id, patch) => {
    return new Promise((resolve) => {
      const socket = useGameStore.getState().socket;
      useAuthStore.getState().getIdToken().then((idToken) => {
        if (!socket || !idToken) {
          resolve({ success: false, error: 'Nicht angemeldet.' });
          return;
        }
        socket.emit('update_profile', { idToken, profileId: id, ...patch }, (res: any) => {
          if (res.success) {
            set((s) => ({
              profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
              activeProfile: s.activeProfile?.id === id ? { ...s.activeProfile, ...patch } : s.activeProfile,
            }));
            resolve({ success: true });
          } else {
            resolve({ success: false, error: res.error });
          }
        });
      });
    });
  },

  deleteProfile: (id) => {
    return new Promise((resolve) => {
      const socket = useGameStore.getState().socket;
      useAuthStore.getState().getIdToken().then((idToken) => {
        if (!socket || !idToken) {
          resolve({ success: false, error: 'Nicht angemeldet.' });
          return;
        }
        socket.emit('delete_profile', { idToken, profileId: id }, (res: any) => {
          if (res.success) {
            set((s) => ({
              profiles: s.profiles.filter((p) => p.id !== id),
              activeProfile: s.activeProfile?.id === id ? null : s.activeProfile,
            }));
            if (sessionStorage.getItem(ACTIVE_PROFILE_KEY) === id) {
              sessionStorage.removeItem(ACTIVE_PROFILE_KEY);
            }
            resolve({ success: true });
          } else {
            resolve({ success: false, error: res.error });
          }
        });
      });
    });
  },

  selectProfile: (profile) => {
    sessionStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
    set({ activeProfile: profile });
  },

  clearActiveProfile: () => {
    sessionStorage.removeItem(ACTIVE_PROFILE_KEY);
    set({ activeProfile: null });
  },

  reset: () => {
    sessionStorage.removeItem(ACTIVE_PROFILE_KEY);
    set({ profiles: [], activeProfile: null, profilesLoading: false, profilesReady: false, profilesError: null });
  },
}));
