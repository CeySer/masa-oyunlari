import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useUIStore } from '../store/uiStore';
import { Play, Trophy, Bot, Dices, Layers, Menu, MailWarning, Pencil, Users } from 'lucide-react';
import { isFirebaseConfigured } from '../lib/firebase';
import { enterPresentationMode } from '../lib/presentation';
import MainMenu from '../components/MainMenu';

const GAMES = [
  { id: 'okey' as const, name: 'Okey', subtitle: 'Klasik Taş Oyunu', players: '2–4 Spieler', icon: Layers, disabled: false },
  // Tavla has too many open bugs right now - shown but not selectable until
  // it's cleaned up (see server.ts, which also refuses it server-side).
  { id: 'tavla' as const, name: 'Tavla', subtitle: 'Bald verfügbar', players: '', icon: Dices, disabled: true },
];

export default function Home() {
  const navigate = useNavigate();
  const { socket, leaderboard, accountLobbies, subscribeAccount } = useGameStore();
  const { user, getIdToken, resendVerificationEmail, authNotice } = useAuthStore();
  const { activeProfile } = useProfileStore();
  const showToast = useUIStore((s) => s.showToast);
  // Manual name field is only used as a dev/local fallback when no Firebase
  // project is configured at all - with accounts enabled, the active player
  // profile's name is always used instead.
  const [name, setName] = useState(localStorage.getItem('playerName') || '');
  const [gameType, setGameType] = useState<'okey' | 'tavla'>('okey');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  // Traditional Okey scoring (20 points, match runs until someone hits 0) on
  // by default - can be switched off for a casual "just play hands" session.
  const [scoringEnabled, setScoringEnabled] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured && !name) {
      const defaultNames = ['Ahmet', 'Mehmet', 'Can', 'Deniz', 'Elif', 'Zeynep'];
      const randomName = defaultNames[Math.floor(Math.random() * defaultNames.length)];
      setName(randomName);
    }
  }, []);

  // Lets other profiles under the SAME account (e.g. a family member on
  // their own phone) show up here as an open lobby to join with one tap -
  // no code needed, though the code field below still works too. Also
  // re-subscribes after a reconnect, since the server-side room membership
  // this relies on doesn't survive getting a new socket.id.
  useEffect(() => {
    if (!socket || !user || !isFirebaseConfigured) return;
    const subscribe = () => { getIdToken().then((idToken) => idToken && subscribeAccount(idToken)); };
    subscribe();
    socket.io.on('reconnect', subscribe);
    return () => { socket.io.off('reconnect', subscribe); };
  }, [socket, user]);

  const openAccountLobby = Object.values(accountLobbies).find((l) => l.open);

  const handleCreateLobby = async (autoAddBots = false) => {
    // With accounts enabled, a chosen player profile is required for every
    // lobby (online or solo bot-test) - the route guard normally ensures
    // this already, this is just a defensive fallback.
    if (isFirebaseConfigured && !activeProfile) {
      navigate('/profiles', { state: { from: '/' } });
      return;
    }

    const trimmedName = isFirebaseConfigured ? activeProfile!.name : name.trim() || 'Spieler';
    if (!isFirebaseConfigured) localStorage.setItem('playerName', trimmedName);
    const idToken = isFirebaseConfigured ? await getIdToken() : undefined;
    const profileId = isFirebaseConfigured ? activeProfile!.id : undefined;

    socket?.emit(
      'create_lobby',
      { gameType, name: trimmedName, idToken, profileId, scoringEnabled },
      (res: any) => {
        if (res.success) {
          if (autoAddBots) {
            // Solo vs. computer: start_game already fills every empty seat
            // with bots on its own (see server.ts), so there's no reason to
            // add them one by one first. Start immediately and go straight
            // to the board - the invite/QR lobby screen would be pointless
            // here since nobody else is ever going to join.
            socket.emit('start_game', { lobbyId: res.lobbyId });
            navigate(`/game/${res.lobbyId}`);
          } else {
            navigate(`/lobby/${res.lobbyId}`);
          }
        } else {
          showToast(res.error || 'Lobby konnte nicht erstellt werden.');
        }
      }
    );
  };

  const handleJoinByCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    // Lobby.tsx joins on mount by itself (see its attemptJoin effect) - just
    // navigating there is enough; a bad/expired code shows up as an error
    // there instead of needing to be checked twice.
    navigate(`/lobby/${code}`);
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between p-4 sm:p-6 font-sans"
      style={{
        color: 'var(--color-text)',
        background:
          'radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 55%), var(--color-bg)',
      }}
    >
      {/* Top Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between flex-wrap gap-y-2 py-4 border-b border-[var(--color-border)]">
        <button onClick={() => navigate('/')} className="flex items-center gap-3 text-left min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xl text-white flex-shrink-0"
            style={{
              background: 'linear-gradient(145deg, var(--color-cta-from), var(--color-cta-to))',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 16px -6px color-mix(in srgb, var(--color-cta-to) 70%, transparent)',
            }}
          >
            M
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight leading-tight truncate">Masa Oyunları</h1>
            <p className="text-xs text-[var(--color-text-muted)] truncate">Klasik Türk Oyun Platformu</p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLeaderboard(!showLeaderboard)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)', color: 'var(--color-accent)' }}
          >
            <Trophy className="w-4 h-4" />
            <span className="hidden sm:inline">Meister-Rangliste</span>
          </button>
          {isFirebaseConfigured && user && (
            <button
              onClick={() => navigate('/profiles', { state: { from: '/' } })}
              title="Profil wechseln"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-semibold transition bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]"
            >
              {activeProfile && (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                  style={{ background: activeProfile.color }}
                >
                  {activeProfile.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden sm:inline max-w-[6rem] truncate">{activeProfile?.name || '...'}</span>
              <Pencil className="w-3 h-3 text-[var(--color-text-muted)]" />
            </button>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            title="Menü"
            className="p-2 rounded-lg border transition bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-muted)]"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {user && !user.emailVerified && (
        <div
          className="max-w-xl w-full mx-auto mt-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border-strong)',
            borderLeft: '3px solid var(--color-accent)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span className="flex items-center gap-2">
            <MailWarning className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
            <span>E-Mail-Adresse noch nicht bestätigt.{authNotice ? ` ${authNotice}` : ''}</span>
          </span>
          <button
            onClick={() => resendVerificationEmail()}
            className="font-bold whitespace-nowrap"
            style={{ color: 'var(--color-accent)' }}
          >
            Erneut senden
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-xl w-full mx-auto my-auto py-8">
        {showLeaderboard ? (
          <div
            className="rounded-3xl p-6 shadow-2xl animate-fade-in"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
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
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            idx === 0
                              ? 'bg-amber-400 text-amber-950'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-900'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-[var(--color-surface-3)] text-[var(--color-text)]'
                          }`}
                        >
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
          <div
            className="relative overflow-hidden rounded-3xl p-6 sm:p-8 space-y-7"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 24px 60px -24px rgba(0,0,0,0.55)',
            }}
          >
            {/* Subtle top gloss, like the lid of a game box */}
            <div
              className="absolute inset-x-0 top-0 h-28 pointer-events-none"
              style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent)' }}
            />

            <div className="relative space-y-7">
              {/* A family member on this same account just opened a lobby -
                  jump straight in, no code needed. */}
              {openAccountLobby && (
                <button
                  onClick={() => navigate(`/lobby/${openAccountLobby.lobbyId}`)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm transition active:scale-[0.99] animate-pulse"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
                >
                  <span className="flex items-center gap-2 text-left">
                    <Users className="w-5 h-5 flex-shrink-0" />
                    <span>
                      {openAccountLobby.hostName} hat eine Runde offen ({openAccountLobby.playerCount}/{openAccountLobby.maxPlayers})
                    </span>
                  </span>
                  <span className="flex-shrink-0 underline underline-offset-2">Beitreten</span>
                </button>
              )}

              {/* Player Name Input - dev/local fallback only, without Firebase
                  the active profile's name is used instead */}
              {!isFirebaseConfigured && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                    Dein Spielername
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition"
                    placeholder="z.B. Can Yılmaz"
                  />
                </div>
              )}

              {/* Game Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                  Spiel auswählen
                </label>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {GAMES.map((game) => {
                    const selected = gameType === game.id;
                    const Icon = game.icon;
                    return (
                      <button
                        key={game.id}
                        type="button"
                        disabled={game.disabled}
                        onClick={() => !game.disabled && setGameType(game.id)}
                        className="group relative flex flex-col items-center gap-2.5 p-4 sm:p-5 rounded-2xl border-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: selected ? 'var(--color-accent)' : 'var(--color-border-strong)',
                          background: selected
                            ? 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface-2))'
                            : 'var(--color-surface-2)',
                          boxShadow: selected
                            ? '0 10px 24px -10px color-mix(in srgb, var(--color-accent) 60%, transparent)'
                            : 'none',
                        }}
                      >
                        {selected && (
                          <span
                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
                          >
                            ✓
                          </span>
                        )}
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
                          style={{ background: selected ? 'var(--color-accent)' : 'var(--color-surface-3)' }}
                        >
                          <Icon
                            className="w-6 h-6"
                            style={{ color: selected ? 'var(--color-accent-contrast)' : 'var(--color-text-muted)' }}
                          />
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-sm" style={{ color: selected ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                            {game.name}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            {game.subtitle}{game.players ? ` · ${game.players}` : ''}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scoring toggle - only meaningful for Okey */}
              {gameType === 'okey' && (
                <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl cursor-pointer" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}>
                  <span className="text-sm">
                    <span className="font-semibold">Mit Punktesystem spielen</span>
                    <span className="block text-[11px] text-[var(--color-text-muted)]">
                      {scoringEnabled ? 'Start bei 20 Punkten, Match endet bei 0.' : 'Nur einzelne Runden, ohne Punkte.'}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={scoringEnabled}
                    onChange={(e) => setScoringEnabled(e.target.checked)}
                    className="w-5 h-5 flex-shrink-0 accent-[var(--color-accent)]"
                  />
                </label>
              )}

              {/* Actions - big icon-first tiles, minimal text */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => handleCreateLobby(false)}
                  disabled={isFirebaseConfigured && !activeProfile}
                  className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl font-bold shadow-xl transition active:scale-[0.98] disabled:opacity-60 bg-gradient-to-br from-[var(--color-cta-from)] to-[var(--color-cta-to)] text-white"
                >
                  <Play className="w-7 h-7 fill-current" />
                  <span className="text-xs leading-tight text-center">Online-Lobby</span>
                </button>

                <button
                  onClick={() => {
                    enterPresentationMode();
                    handleCreateLobby(true);
                  }}
                  className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl font-bold border-2 transition active:scale-[0.98]"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border-strong)', color: 'var(--color-accent)' }}
                >
                  <Bot className="w-7 h-7" />
                  <span className="text-xs leading-tight text-center">Gegen Computer</span>
                </button>
              </div>

              {/* Join an existing lobby by its code, without a link/QR */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                  maxLength={8}
                  placeholder="Lobby-Code eingeben"
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-mono font-bold tracking-widest text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition"
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={!joinCode.trim()}
                  className="px-5 py-3 rounded-xl font-bold text-sm transition disabled:opacity-40"
                  style={{ background: 'var(--color-surface-3)', color: 'var(--color-text)', border: '1px solid var(--color-border-strong)' }}
                >
                  Beitreten
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto flex flex-wrap items-center justify-center gap-2 py-4">
        {['Echtzeit-Mehrspieler', 'KI-Bots', 'Elo-Rangliste'].map((label) => (
          <span
            key={label}
            className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full"
            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
          >
            {label}
          </span>
        ))}
      </footer>

      <MainMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
