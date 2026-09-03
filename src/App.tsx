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

export default function App() {
  const connectSocket = useGameStore(state => state.connectSocket);
  
  useEffect(() => {
    connectSocket();
  }, [connectSocket]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
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
