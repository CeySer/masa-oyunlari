import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useUIStore } from '../store/uiStore';
import { isFirebaseConfigured } from '../lib/firebase';
import { QRCodeSVG } from 'qrcode.react';
import { Users, Play, Bot, UserPlus, Copy, Check, Tv, Trash2 } from 'lucide-react';
import ThemeSwitcher from '../components/ThemeSwitcher';
import BrandLogo from '../components/BrandLogo';

export default function Lobby() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, setPlayer, player } = useGameStore();
  const { user, authReady, getIdToken } = useAuthStore();
  const { activeProfile, profilesReady } = useProfileStore();
  const showToast = useUIStore((s) => s.showToast);
  const [name, setName] = useState(localStorage.getItem('playerName') || '');
  const [copied, setCopied] = useState(false);

  const attemptJoin = async () => {
    if (!socket || !id) return;
    const storedName = activeProfile?.name || localStorage.getItem('playerName') || 'Spieler';
    const idToken = await getIdToken();
    socket.emit(
      'join_lobby',
      { lobbyId: id, name: storedName, role: 'player', idToken, profileId: activeProfile?.id },
      (res: any) => {
        if (res.success) {
          setPlayer(res.player);
        } else if (res.error === 'auth_required') {
          navigate('/login', { state: { from: `/lobby/${id}` } });
        } else if (res.error === 'invalid_profile') {
          navigate('/profiles', { state: { from: `/lobby/${id}` } });
        } else if (res.error) {
          showToast(res.error);
          navigate('/');
        }
      }
    );
  };

  useEffect(() => {
    // If player is not in lobby state yet, attempt auto-join. Wait for the
    // auth (and, when Firebase is configured, the profile) state to resolve
    // first so an already-logged-in visitor's account/profile is used
    // rather than briefly joining anonymously.
    if (socket && id && authReady && (!isFirebaseConfigured || profilesReady)) {
      attemptJoin();
    }
  }, [socket, id, authReady, user, profilesReady, activeProfile]);

  useEffect(() => {
    if (lobby?.status === 'playing') {
      navigate(`/game/${id}`);
    }
  }, [lobby?.status, navigate, id]);

  const joinLobby = () => {
    if (!name.trim()) return showToast('Bitte gib deinen Namen ein');
    localStorage.setItem('playerName', name);

    socket?.emit('join_lobby', { lobbyId: id, name, role: 'player' }, (res: any) => {
      if (res.success) {
        setPlayer(res.player);
      } else {
        showToast(res.error || 'Fehler beim Beitritt');
        navigate('/');
      }
    });
  };

  const addBot = () => {
    socket?.emit('add_bot', { lobbyId: id }, (res: any) => {
      if (!res.success) {
        showToast(res.error);
      }
    });
  };

  const removeBot = (botId: string) => {
    socket?.emit('remove_bot', { lobbyId: id, botId });
  };

  const startGame = () => {
    socket?.emit('start_game', { lobbyId: id });
  };

  const copyLink = () => {
    const joinUrl = `${window.location.origin}/lobby/${id}`;
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHost = socket?.id === lobby?.host;
  const maxPlayers = lobby?.gameType === 'tavla' ? 2 : 4;
  const canStart = (lobby?.players?.length || 0) >= 2;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col p-4 sm:p-6">

      {/* Header */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between flex-wrap gap-y-2 py-4 border-b border-[var(--color-border)] mb-6">
        <BrandLogo compact />

        <div className="text-center">
          <span className="text-xs uppercase font-bold text-[var(--color-text-muted)] tracking-wider">Lobby-Code</span>
          <div className="font-mono text-2xl font-black text-[var(--color-accent)]">{id}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/tv/${id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text)] font-semibold rounded-lg border border-[var(--color-border-strong)]"
          >
            <Tv className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span>TV-Modus</span>
          </button>
          <ThemeSwitcher />
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl w-full mx-auto my-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* QR Code & Join Link Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-xl">
          <span className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">
            {lobby?.gameType === 'tavla' ? 'Tavla (Backgammon)' : 'Okey (Steinspiel)'}
          </span>
          <h2 className="text-xl font-bold mb-6">Scanner zum Beitreten</h2>

          <div className="bg-white p-4 rounded-2xl shadow-2xl mb-6 ring-4 ring-[var(--color-border-strong)]">
            <QRCodeSVG value={`${window.location.origin}/lobby/${id}`} size={180} />
          </div>

          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text)] text-sm font-semibold rounded-xl border border-[var(--color-border-strong)] transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />}
            <span>{copied ? 'Link kopiert!' : 'Einladungslink kopieren'}</span>
          </button>
        </div>

        {/* Players List Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--color-accent)]" />
                <h2 className="text-lg font-bold">Mitspieler ({lobby?.players?.length || 0} / {maxPlayers})</h2>
              </div>
              
              {isHost && (lobby?.players?.length || 0) < maxPlayers && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const needed = maxPlayers - (lobby?.players?.length || 0);
                      for (let i = 0; i < needed; i++) addBot();
                    }}
                    className="px-2.5 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)] text-[var(--color-accent-contrast)] text-xs font-bold rounded-xl transition shadow"
                  >
                    Bots auffüllen
                  </button>
                  <button
                    onClick={addBot}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-accent)] text-xs font-semibold rounded-xl border border-[var(--color-border-strong)] transition"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>+ Bot</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 mb-6">
              {lobby?.players?.map((p: any, idx: number) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-surface-3)] text-[var(--color-text)] flex items-center justify-center font-bold text-xs border border-[var(--color-border-strong)]">
                      {p.isBot ? <Bot className="w-4 h-4 text-[var(--color-accent)]" /> : idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {p.name}
                        {p.id === lobby.host && (
                          <span className="text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
                            HOST
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">Elo: {p.elo || 1200}</div>
                    </div>
                  </div>

                  {isHost && p.isBot && (
                    <button
                      onClick={() => removeBot(p.id)}
                      className="p-2 text-[var(--color-text-muted)] hover:text-red-400 transition"
                      title="Bot entfernen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Start Button Area */}
          <div>
            {isHost ? (
              <button
                onClick={startGame}
                disabled={!canStart}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[var(--color-cta-from)] to-[var(--color-cta-to)] hover:from-[var(--color-cta-hover-from)] hover:to-[var(--color-cta-hover-to)] disabled:from-[var(--color-surface-2)] disabled:to-[var(--color-surface-2)] disabled:text-[var(--color-text-muted)] text-white py-4 rounded-2xl font-bold text-base shadow-xl transition"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Spiel Jetzt Starten</span>
              </button>
            ) : (
              <div className="text-center p-4 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-2xl text-[var(--color-text-muted)] text-sm font-medium">
                Warte auf den Host zum Starten...
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
