/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import TV from './pages/TV';
import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { useAuthStore } from './store/authStore';
import { applyTheme, getStoredTheme } from './lib/theme';

export default function App() {
  const connectSocket = useGameStore(state => state.connectSocket);
  const initAuth = useAuthStore(state => state.initAuth);

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

  return (
    <BrowserRouter>
      <div className="min-h-screen font-sans" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:id" element={<Lobby />} />
          <Route path="/game/:id" element={<Game />} />
          <Route path="/tv/:id?" element={<TV />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
