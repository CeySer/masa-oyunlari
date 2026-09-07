import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';
import { QRCodeSVG } from 'qrcode.react';
import { Tv, Trophy, Bot, Users, Activity, Play, PlusCircle, ArrowLeft, WifiOff } from 'lucide-react';
import { OkeyTile } from '../components/OkeyTile';
import TVOkeyTable from '../components/TVOkeyTable';
import { enterPresentationMode } from '../lib/presentation';

export default function TV() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, publicGameState } = useGameStore();
  const showToast = useUIStore((s) => s.showToast);
  const [lobbyIdInput, setLobbyIdInput] = useState(id || '');
  const [gameType, setGameType] = useState<'okey' | 'tavla'>('okey');
  const [connected, setConnected] = useState(false);

  // Turn countdown, driven by the absolute deadline the server broadcasts.
  const [now, setNow] = useState(() => Date.now());
  const turnDeadline: number | null = publicGameState?.turnDeadline ?? null;
  const turnDurationMs: number = publicGameState?.turnDurationMs ?? 60000;
  useEffect(() => {
    if (!turnDeadline) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [turnDeadline]);
  const remainingFraction = turnDeadline
    ? Math.max(0, Math.min(1, (turnDeadline - now) / turnDurationMs))
    : 0;

  useEffect(() => {
    if (socket && id) {
      enterPresentationMode();
      socket.emit('join_lobby', { lobbyId: id, role: 'tv' }, (res: any) => {
        if (res.success) {
          setConnected(true);
        }
      });
    }
  }, [socket, id]);

  // The only way out of TV mode - it has no player seat to leave, so this
  // just takes you back to the main menu; the route change unmounts TV.tsx.
  const exitTVMode = () => navigate('/');

  const joinAsTV = () => {
    if (!lobbyIdInput) return;
    enterPresentationMode();
    socket?.emit('join_lobby', { lobbyId: lobbyIdInput.toUpperCase(), role: 'tv' }, (res: any) => {
      if (res.success) {
        setConnected(true);
        if (!id) navigate(`/tv/${lobbyIdInput.toUpperCase()}`, { replace: true });
      } else {
        showToast(res.error || 'Lobby nicht gefunden!');
      }
    });
  };

  const createTVLobby = () => {
    enterPresentationMode();
    socket?.emit('create_tv_lobby', { gameType }, (res: any) => {
      if (res.success) {
        setConnected(true);
        navigate(`/tv/${res.lobbyId}`, { replace: true });
      }
    });
  };

  const addBot = () => {
    if (!lobby?.id) return;
    socket?.emit('add_bot', { lobbyId: lobby.id });
  };

  const startGameFromTV = () => {
    if (!lobby?.id) return;
    socket?.emit('start_game', { lobbyId: lobby.id });
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] p-6 font-sans">
        <div className="max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-2xl p-8 space-y-6">
          <button
            onClick={exitTVMode}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Zurück</span>
          </button>
          <div className="text-center">
            <Tv className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-2xl font-bold">TV / Monitor Modus</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Öffentlicher Großbildschirm für TV & Tablets</p>
          </div>

          {/* Quick Create TV Lobby */}
          <div className="space-y-3 bg-[var(--color-surface-2)] p-4 rounded-2xl border border-[var(--color-border-strong)]">
            <label className="block text-xs font-bold uppercase text-[var(--color-accent)]">
              1. Neue TV-Lobby Erstellen
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGameType('okey')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  gameType === 'okey' ? 'bg-red-600 border-red-400 text-white' : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-muted)]'
                }`}
              >
                Okey
              </button>
              <button
                type="button"
                onClick={() => setGameType('tavla')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  gameType === 'tavla' ? 'bg-amber-600 border-amber-400 text-white' : 'bg-[var(--color-surface-2)] border-[var(--color-border-strong)] text-[var(--color-text-muted)]'
                }`}
              >
                Tavla
              </button>
            </div>
            <button
              onClick={createTVLobby}
              className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white py-3.5 rounded-xl font-bold transition shadow-xl flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Neue TV-Lobby Erstellen</span>
            </button>
          </div>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border)]"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[var(--color-surface)] text-[var(--color-text-muted)] uppercase tracking-widest font-semibold">Oder</span>
            </div>
          </div>

          {/* Join Existing Lobby */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase text-[var(--color-text-muted)]">
              2. Bestehender Lobby Beitreten
            </label>
            <input
              type="text"
              value={lobbyIdInput}
              onChange={(e) => setLobbyIdInput(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-mono text-center text-lg font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="z.B. ABC123"
            />
            <button
              onClick={joinAsTV}
              className="w-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text)] py-3 rounded-xl font-bold border border-[var(--color-border-strong)] transition"
            >
              Lobby Öffnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Waiting Room View on TV
  if (lobby?.status === 'waiting') {
    const joinUrl = `${window.location.origin}/lobby/${lobby.id}`;
    const maxRequired = lobby.gameType === 'tavla' ? 2 : 4;

    return (
      // Padding kept modest so the whole setup screen (QR + seats) still
      // fits a 720p TV without being cut off or needing a scroll nobody can
      // perform with a remote.
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col items-center justify-between p-4 2xl:p-8 select-none font-sans">

        {/* Header */}
        <div className="w-full flex justify-start">
          <button
            onClick={exitTVMode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-muted)] font-semibold rounded-xl border border-[var(--color-border-strong)] transition"
            title="Zurück zum Hauptmenü"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Zurück</span>
          </button>
        </div>
        <div className="text-center mt-4">
          <div className="inline-flex items-center gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] px-5 py-1.5 rounded-full text-xs font-bold text-[var(--color-accent)] uppercase tracking-widest mb-2 shadow-lg">
            <Tv className="w-4 h-4 text-[var(--color-accent)]" /> TV / GROSSBILDSCHIRM LOBBY
          </div>
          <h1 className="text-5xl sm:text-6xl font-black text-[var(--color-accent)] tracking-tight mb-1">
            {lobby.gameType === 'tavla' ? 'Tavla (Backgammon)' : 'Okey Table'}
          </h1>
          <p className="text-lg text-[var(--color-text-muted)]">Scanne den QR-Code mit deinem Smartphone, um mitzuspielen</p>
        </div>

        {/* QR Code & Join Info */}
        <div className="bg-[var(--color-surface)] border-4 border-[var(--color-border)] p-8 rounded-3xl shadow-2xl flex items-center gap-10 max-w-2xl w-full my-auto">
          <div className="bg-white p-4 rounded-2xl shadow-xl flex-shrink-0">
            <QRCodeSVG value={joinUrl} size={200} />
          </div>

          <div className="flex flex-col gap-4 text-left flex-1">
            <h2 className="text-2xl font-bold text-[var(--color-text)]">Jetzt Beitreten!</h2>
            <p className="text-[var(--color-text-muted)] text-sm">Öffne den Link auf deinem Handy oder scanne den QR-Code.</p>
            <div className="bg-[var(--color-surface-2)] px-5 py-3 rounded-2xl border border-[var(--color-border-strong)] font-mono text-3xl font-black text-[var(--color-accent)] inline-block shadow-inner">
              Code: {lobby.id}
            </div>

            {/* START GAME BUTTON directly on TV */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={startGameFromTV}
                className="w-full py-4 bg-gradient-to-r from-[var(--color-cta-from)] to-[var(--color-cta-to)] hover:from-[var(--color-cta-hover-from)] hover:to-[var(--color-cta-hover-to)] text-white font-black text-lg rounded-2xl shadow-2xl transition flex items-center justify-center gap-2 animate-bounce"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>Spiel Jetzt Starten</span>
              </button>
              <p className="text-[11px] text-[var(--color-text-muted)] text-center italic">
                Fehlende Plätze werden automatisch mit KI-Bots aufgefüllt!
              </p>
            </div>
          </div>
        </div>

        {/* Player slots */}
        <div className="w-full max-w-4xl mb-4">
          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
              Beigetretene Spieler ({lobby.players.length} / {maxRequired})
            </span>

            {lobby.players.length < maxRequired && (
              <button
                onClick={addBot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-accent)] text-xs font-bold rounded-xl border border-[var(--color-border-strong)] transition shadow"
              >
                <Bot className="w-4 h-4 text-[var(--color-accent)]" />
                <span>+ Bot Hinzufügen</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4">
            {lobby.players.map((p: any) => (
              <div
                key={p.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] p-4 rounded-2xl text-center font-bold flex flex-col items-center justify-center gap-1 shadow-lg"
              >
                {p.isBot ? (
                  <Bot className="w-7 h-7 text-[var(--color-accent)] mb-1" />
                ) : (
                  <Users className="w-7 h-7 text-[var(--color-accent)] mb-1" />
                )}
                <span className="text-sm font-bold text-[var(--color-text)] truncate max-w-full">{p.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono">Elo: {p.elo || 1200}</span>
              </div>
            ))}

            {Array.from({ length: maxRequired - lobby.players.length }).map((_, idx) => (
              <div
                key={idx}
                className="bg-[var(--color-surface-2)] border-2 border-dashed border-[var(--color-border)] p-4 rounded-2xl text-center text-[var(--color-text-muted)] flex flex-col items-center justify-center gap-1"
              >
                <Users className="w-7 h-7 text-[var(--color-text-muted)] mb-1" />
                <span className="text-xs font-semibold">Freier Platz</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Active Game State on TV
  if (lobby?.status === 'playing' && publicGameState) {
    const currentPlayer = lobby.players[publicGameState.turnIndex];
    const logs = publicGameState.logs || [];

    // game-shell = fixed viewport height rather than min-height: nobody
    // scrolls a TV, so the whole board has to fit on the screen by itself.
    return (
      <div className="game-shell bg-[var(--color-bg)] text-[var(--color-text)] p-3 2xl:p-6 flex flex-col justify-between select-none font-sans">
        
        {/* TV Top Bar */}
        <div className="flex items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] px-8 py-4 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={exitTVMode}
              className="p-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] rounded-xl border border-[var(--color-border-strong)] transition"
              title="Zurück zum Hauptmenü"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-accent)]">
              {publicGameState.gameType === 'tavla' ? 'Tavla (Backgammon)' : 'Okey Table Live'}
            </h1>
          </div>

          <div className="flex items-center gap-3 px-6 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-amber-950 rounded-full font-black text-lg shadow-xl animate-pulse">
            <Activity className="w-5 h-5" />
            <span>Am Zug: {currentPlayer?.name}</span>
          </div>

          <div className="font-mono text-sm font-bold text-[var(--color-text-muted)]">
            Lobby-Code: <span className="text-[var(--color-accent)] font-black">{lobby.id}</span>
          </div>
        </div>

        {/* Board View */}
        <div className="flex-1 min-h-0 my-3 2xl:my-6 flex items-center justify-center relative">
          
          {publicGameState.gameType === 'okey' ? (
            <TVOkeyTable lobby={lobby} publicGameState={publicGameState} remainingFraction={remainingFraction} />
          ) : (
            /* Tavla TV Board View */
            <div className="w-full max-w-5xl bg-amber-950 border-4 border-amber-900 rounded-3xl p-8 shadow-2xl text-center">
              <h2 className="text-3xl font-black text-amber-200 mb-6">Tavla Board Live</h2>
              <div className="flex justify-center gap-6 mb-6">
                {publicGameState.dice.length > 0 ? (
                  publicGameState.dice.map((d: number, idx: number) => (
                    <div key={idx} className="w-16 h-16 bg-amber-100 text-amber-950 font-black text-4xl rounded-2xl flex items-center justify-center border-4 border-amber-300 shadow-xl">
                      {d}
                    </div>
                  ))
                ) : (
                  <div className="text-[var(--color-accent)]/80 italic text-lg">Warte auf Würfe...</div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Live Activity Ticker / Match Logs Footer */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-4 rounded-2xl shadow-xl flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-accent)] min-w-max border-r border-[var(--color-border)] pr-4">
            <Activity className="w-4 h-4 text-emerald-400" /> Live Match Ticker
          </div>

          <div className="flex-1 overflow-hidden h-6">
            {logs.length > 0 ? (
              <div className="flex items-center gap-3 text-sm font-semibold text-[var(--color-text)] animate-fade-in">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">[{logs[0].time}]</span>
                <span>{logs[0].text}</span>
              </div>
            ) : (
              <span className="text-xs text-[var(--color-text-muted)] italic">Keine Aktionen bisher...</span>
            )}
          </div>
        </div>

      </div>
    );
  }

  // Finished Game Screen on TV
  if (lobby?.status === 'finished') {
    return (
      <div className="relative min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col items-center justify-center p-8 select-none font-sans">
        <button
          onClick={exitTVMode}
          className="absolute top-6 left-6 flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-muted)] font-semibold rounded-xl border border-[var(--color-border-strong)] transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Zurück</span>
        </button>
        <Trophy className="w-24 h-24 text-[var(--color-accent)] mb-4 animate-bounce" />
        <h1 className="text-6xl font-black text-[var(--color-accent)] mb-8">Spiel Beendet!</h1>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] p-8 rounded-3xl shadow-2xl w-full max-w-lg">
          <h2 className="text-2xl font-bold mb-6 border-b border-[var(--color-border)] pb-4">Endergebnis & Leaderboard</h2>
          <ul className="space-y-4">
            {lobby.players
              .sort((a: any, b: any) => b.score - a.score)
              .map((p: any, idx: number) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                return (
                  <li key={p.id} className="flex justify-between items-center text-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-[var(--color-accent)] w-8 text-center">
                        {medal || `#${idx + 1}`}
                      </span>
                      <span>{p.name}</span>
                    </div>
                    <span className="font-black text-emerald-400">{p.score} Pkt</span>
                  </li>
                );
              })}
          </ul>
        </div>
      </div>
    );
  }

  return null;
}
