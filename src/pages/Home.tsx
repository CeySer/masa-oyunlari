import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { Play, Tv, Trophy, Bot, Dices, Layers, ShieldAlert, Sparkles, LogIn, LogOut, UserCircle2 } from 'lucide-react';
import ThemeSwitcher from '../components/ThemeSwitcher';
import AuthModal from '../components/AuthModal';
import { isFirebaseConfigured } from '../lib/firebase';

export default function Home() {
  const navigate = useNavigate();
  const { socket, leaderboard } = useGameStore();
  const { user, authReady, logout, getIdToken } = useAuthStore();
  const [name, setName] = useState(localStorage.getItem('playerName') || '');
  const [gameType, setGameType] = useState<'okey' | 'tavla'>('okey');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!name) {
      const defaultNames = ['Ahmet', 'Mehmet', 'Can', 'Deniz', 'Elif', 'Zeynep'];
      const randomName = defaultNames[Math.floor(Math.random() * defaultNames.length)];
      setName(randomName);
    }
  }, []);

  const handleCreateLobby = async (autoAddBots = false) => {
    // Online multiplayer (no bots auto-added) needs a real account so games
    // count towards a persistent identity/leaderboard. The solo bot-test
    // stays open to everyone, exactly like before.
    if (!autoAddBots && isFirebaseConfigured && !user) {
      setPendingAction(() => () => handleCreateLobby(false));
      setShowAuthModal(true);
      return;
    }

    const trimmedName = (user?.displayName || name).trim() || 'Spieler';
    localStorage.setItem('playerName', trimmedName);
    const idToken = !autoAddBots ? await getIdToken() : undefined;

    socket?.emit(
      'create_lobby',
      { gameType, name: trimmedName, online: !autoAddBots, idToken },
      (res: any) => {
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
        } else {
          alert(res.error || 'Lobby konnte nicht erstellt werden.');
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col justify-between p-4 sm:p-6 font-sans">
      
      {/* Top Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-red-950/50">
            M
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-[var(--color-text)]">Masa Oyunları</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Klasik Türk Oyun Platformu</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-accent)] font-semibold rounded-xl text-sm transition border border-[var(--color-border-strong)]"
          >
            <Trophy className="w-4 h-4 text-[var(--color-accent)]" />
            <span className="hidden sm:inline">Meister-Rangliste (Elo)</span>
          </button>
          <ThemeSwitcher />
          {isFirebaseConfigured && (
            user ? (
              <button
                onClick={() => logout()}
                title="Abmelden"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]"
              >
                <UserCircle2 className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                <span className="hidden sm:inline max-w-[8rem] truncate">{user.displayName || user.email}</span>
                <LogOut className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                title="Anmelden"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]"
              >
                <LogIn className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                <span className="hidden sm:inline">Anmelden</span>
              </button>
            )
          )}
        </div>
      </header>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            const action = pendingAction;
            setPendingAction(null);
            action?.();
          }}
        />
      )}

      {/* Main Content */}
      <main className="max-w-xl w-full mx-auto my-auto py-8">
        
        {showLeaderboard ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-[var(--color-accent)]" />
                <h2 className="text-xl font-bold">Globales Ranking (Elo)</h2>
              </div>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-3 py-1 bg-[var(--color-surface-2)] rounded-lg"
              >
                Zurück
              </button>
            </div>

            <div className="space-y-3">
              {leaderboard.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-center py-6">Noch keine Spiele gewertet.</p>
              ) : (
                leaderboard
                  .sort((a, b) => b.elo - a.elo)
                  .map((entry, idx) => (
                    <div
                      key={entry.uid || entry.name}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)]"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-400 text-amber-950' :
                          idx === 1 ? 'bg-slate-300 text-slate-900' :
                          idx === 2 ? 'bg-amber-700 text-white' : 'bg-[var(--color-surface-3)] text-[var(--color-text)]'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-sm">{entry.name}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">{entry.wins} Siege / {entry.games} Spiele</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[var(--color-accent)]">{entry.elo}</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-1">Elo</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
            
            {/* Player Name Input */}
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--color-text-muted)] mb-2">Dein Spielername</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition"
                placeholder="z.B. Can Yılmaz"
              />
            </div>

            {/* Game Selector */}
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--color-text-muted)] mb-2">Spiel auswählen</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGameType('okey')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    gameType === 'okey'
                      ? 'bg-red-950/40 border-red-500 text-white shadow-lg shadow-red-950/50 ring-1 ring-red-500'
                      : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  <Layers className={`w-7 h-7 ${gameType === 'okey' ? 'text-red-400' : 'text-[var(--color-text-muted)]'}`} />
                  <span className="font-bold text-sm">Okey (Steine)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGameType('tavla')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                    gameType === 'tavla'
                      ? 'bg-amber-950/40 border-amber-500 text-white shadow-lg shadow-amber-950/50 ring-1 ring-amber-500'
                      : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  <Dices className={`w-7 h-7 ${gameType === 'tavla' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
                  <span className="font-bold text-sm">Tavla (Backgammon)</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                onClick={() => handleCreateLobby(false)}
                disabled={isFirebaseConfigured && !authReady}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-[var(--color-cta-from)] to-[var(--color-cta-to)] hover:from-[var(--color-cta-hover-from)] hover:to-[var(--color-cta-hover-to)] disabled:opacity-60 text-white py-4 rounded-2xl font-bold shadow-xl transition active:scale-[0.99]"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Mehrspieler-Lobby Erstellen</span>
              </button>
              {isFirebaseConfigured && !user && (
                <p className="text-[11px] text-center -mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Für echtes Online-Spiel gegen andere ist ein Konto nötig.
                </p>
              )}

              <button
                onClick={() => handleCreateLobby(true)}
                className="w-full flex items-center justify-center gap-2.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-accent)] py-3.5 rounded-2xl font-semibold border border-[var(--color-border-strong)] transition active:scale-[0.99]"
              >
                <Bot className="w-5 h-5 text-[var(--color-accent)]" />
                <span>Sofort-Test mit KI-Bots (Singleplayer)</span>
              </button>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--color-border)]"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-[var(--color-surface)] text-[var(--color-text-muted)] uppercase tracking-widest font-semibold">Oder Fernseher Modus</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/tv')}
              className="w-full flex items-center justify-center gap-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)] text-[var(--color-text)] py-3.5 rounded-2xl font-semibold border border-[var(--color-border-strong)] transition"
            >
              <Tv className="w-5 h-5 text-[var(--color-text-muted)]" />
              <span>Öffentliche TV / Tablett-Ansicht Starten</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-[var(--color-text-muted)] py-4">
        Multi-Screen Masa Oyunları • Tavla & Okey • Real-Time WebSockets
      </footer>
    </div>
  );
}
