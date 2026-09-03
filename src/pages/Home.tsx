import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { Play, Tv, Trophy, Bot, Dices, Layers, ShieldAlert, Sparkles } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const { socket, leaderboard } = useGameStore();
  const [name, setName] = useState(localStorage.getItem('playerName') || '');
  const [gameType, setGameType] = useState<'okey' | 'tavla'>('okey');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    if (!name) {
      const defaultNames = ['Ahmet', 'Mehmet', 'Can', 'Deniz', 'Elif', 'Zeynep'];
      const randomName = defaultNames[Math.floor(Math.random() * defaultNames.length)];
      setName(randomName);
    }
  }, []);

  const handleCreateLobby = (autoAddBots = false) => {
    const trimmedName = name.trim() || 'Spieler';
    localStorage.setItem('playerName', trimmedName);

    socket?.emit('create_lobby', { gameType, name: trimmedName }, (res: any) => {
      if (res.success) {
        if (autoAddBots) {
          const numBots = gameType === 'tavla' ? 1 : 3;
          let added = 0;
          const addNextBot = () => {
            if (added < numBots) {
              socket.emit('add_bot', { lobbyId: res.lobbyId }, () => {
                added++;
                addNextBot();
              });
            } else {
              navigate(`/lobby/${res.lobbyId}`);
            }
          };
          addNextBot();
        } else {
          navigate(`/lobby/${res.lobbyId}`);
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans">
      
      {/* Top Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-red-950/50">
            M
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">Masa Oyunları</h1>
            <p className="text-xs text-slate-400">Klasik Türk Oyun Platformu</p>
          </div>
        </div>

        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-xl text-sm transition border border-slate-700"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Meister-Rangliste (Elo)</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-xl w-full mx-auto my-auto py-8">
        
        {showLeaderboard ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-400" />
                <h2 className="text-xl font-bold">Globales Ranking (Elo)</h2>
              </div>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="text-xs text-slate-400 hover:text-white px-3 py-1 bg-slate-800 rounded-lg"
              >
                Zurück
              </button>
            </div>

            <div className="space-y-3">
              {leaderboard.length === 0 ? (
                <p className="text-slate-500 text-center py-6">Noch keine Spiele gewertet.</p>
              ) : (
                leaderboard
                  .sort((a, b) => b.elo - a.elo)
                  .map((entry, idx) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-400 text-amber-950' :
                          idx === 1 ? 'bg-slate-300 text-slate-900' :
                          idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-sm">{entry.name}</div>
                          <div className="text-xs text-slate-400">{entry.wins} Siege / {entry.games} Spiele</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-amber-400">{entry.elo}</span>
                        <span className="text-xs text-slate-500 ml-1">Elo</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
            
            {/* Player Name Input */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Dein Spielername</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                placeholder="z.B. Can Yılmaz"
              />
            </div>

            {/* Game Selector */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Spiel auswählen</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGameType('okey')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    gameType === 'okey'
                      ? 'bg-red-950/40 border-red-500 text-white shadow-lg shadow-red-950/50 ring-1 ring-red-500'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Layers className={`w-7 h-7 ${gameType === 'okey' ? 'text-red-400' : 'text-slate-400'}`} />
                  <span className="font-bold text-sm">Okey (Steine)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGameType('tavla')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    gameType === 'tavla'
                      ? 'bg-amber-950/40 border-amber-500 text-white shadow-lg shadow-amber-950/50 ring-1 ring-amber-500'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Dices className={`w-7 h-7 ${gameType === 'tavla' ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="font-bold text-sm">Tavla (Backgammon)</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                onClick={() => handleCreateLobby(false)}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-red-950/40 transition active:scale-[0.99]"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Mehrspieler-Lobby Erstellen</span>
              </button>

              <button
                onClick={() => handleCreateLobby(true)}
                className="w-full flex items-center justify-center gap-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 py-3.5 rounded-2xl font-semibold border border-amber-500/30 transition active:scale-[0.99]"
              >
                <Bot className="w-5 h-5 text-amber-400" />
                <span>Sofort-Test mit KI-Bots (Singleplayer)</span>
              </button>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-slate-900 text-slate-500 uppercase tracking-widest font-semibold">Oder Fernseher Modus</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/tv')}
              className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 py-3.5 rounded-2xl font-semibold border border-slate-700 transition"
            >
              <Tv className="w-5 h-5 text-slate-400" />
              <span>Öffentliche TV / Tablett-Ansicht Starten</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-4">
        Multi-Screen Masa Oyunları • Tavla & Okey • Real-Time WebSockets
      </footer>
    </div>
  );
}
