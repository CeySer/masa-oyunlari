/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import TV from './pages/TV';
import Login from './pages/Login';
import Profiles from './pages/Profiles';
import ToastHost from './components/ToastHost';
import ConfirmHost from './components/ConfirmHost';
import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { useAuthStore } from './store/authStore';
import { useProfileStore } from './store/profileStore';
import { applyTheme, getStoredTheme } from './lib/theme';
import { isFirebaseConfigured } from './lib/firebase';

// Login is the mandatory front door once Firebase is configured (like
// EduPlay Hub) - everything else waits for a signed-in account. Without
// Firebase env vars set, the app keeps working exactly as before (no login
// at all) so local/dev setups aren't blocked.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuthStore();
  const location = useLocation();

  if (!isFirebaseConfigured) return <>{children}</>;
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
        <div className="animate-pulse text-sm">Wird geladen...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

// After logging in, a chosen player profile decides who's actually playing
// (one account can hold several, e.g. one per family member).
function RequireProfile({ children }: { children: ReactNode }) {
  const { activeProfile, profilesReady } = useProfileStore();
  const location = useLocation();

  if (!isFirebaseConfigured) return <>{children}</>;
  if (!profilesReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
        <div className="animate-pulse text-sm">Wird geladen...</div>
      </div>
    );
  }
  if (!activeProfile) return <Navigate to="/profiles" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  const connectSocket = useGameStore(state => state.connectSocket);
  const initAuth = useAuthStore(state => state.initAuth);
  const user = useAuthStore(state => state.user);
  const loadProfiles = useProfileStore(state => state.loadProfiles);
  const resetProfiles = useProfileStore(state => state.reset);

  useEffect(() => {
    connectSocket();
  }, [connectSocket]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    // Apply the saved theme on first load, regardless of which page/route
    // the user lands on directly (e.g. a shared /lobby/:id link).
    applyTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (user) {
      loadProfiles();
    } else {
      resetProfiles();
    }
  }, [user, loadProfiles, resetProfiles]);

  return (
    <BrowserRouter>
      <div className="min-h-screen font-sans" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/profiles"
            element={
              <RequireAuth>
                <Profiles />
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <RequireProfile>
                  <Home />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route
            path="/lobby/:id"
            element={
              <RequireAuth>
                <RequireProfile>
                  <Lobby />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route
            path="/game/:id"
            element={
              <RequireAuth>
                <RequireProfile>
                  <Game />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route path="/tv/:id?" element={<TV />} />
        </Routes>
        <ToastHost />
        <ConfirmHost />
      </div>
    </BrowserRouter>
  );
}
