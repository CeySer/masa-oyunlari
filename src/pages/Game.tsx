import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useUIStore } from '../store/uiStore';
import { isFirebaseConfigured } from '../lib/firebase';
import { enterPresentationMode } from '../lib/presentation';
import { useSoundStore } from '../store/soundStore';
import OkeyBoard from '../components/OkeyBoard';
import TavlaBoard from '../components/TavlaBoard';
import { Tv, ArrowLeft, LogOut, Bot, Trophy, RefreshCw, Maximize } from 'lucide-react';

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, publicGameState, player, gameResult, clearGameResult } = useGameStore();
  const { authReady, getIdToken } = useAuthStore();
  const { activeProfile, profilesReady } = useProfileStore();
  const showConfirm = useUIStore((s) => s.showConfirm);
  const playSound = useSoundStore((s) => s.play);
  const [showTVOverlay, setShowTVOverlay] = useState(false);

  // Play a little fanfare exactly once per finished hand, not on every
  // re-render while the result screen stays up.
  useEffect(() => {
    if (gameResult) playSound('win');
  }, [gameResult, playSound]);

  useEffect(() => {
    // Attempt auto-reconnect to game state if state is empty. Wait for auth
    // (and, when Firebase is configured, the profile) to resolve so a
    // logged-in player reconnects with their own account rather than
    // briefly as an anonymous guest.
    if (socket && id && !player && authReady && (!isFirebaseConfigured || profilesReady)) {
      const storedName = activeProfile?.name || localStorage.getItem('playerName') || 'Spieler';
      getIdToken().then((idToken) => {
        socket.emit('join_lobby', { lobbyId: id, name: storedName, role: 'player', idToken, profileId: activeProfile?.id });
      });
    }
  }, [socket, id, player, authReady, profilesReady, activeProfile]);

  const handleLeaveGame = async () => {
    const ok = await showConfirm('Möchtest du das Spiel wirklich verlassen? Ein Bot wird deinen Platz übernehmen.', {
      confirmLabel: 'Verlassen',
      danger: true,
    });
    if (ok) {
      socket?.emit('leave_game', { lobbyId: id });
      navigate('/');
    }
  };

  const handleBackToLobby = () => {
    socket?.emit('leave_game', { lobbyId: id });
    clearGameResult();
    navigate(`/lobby/${id}`);
  };

  const handleNextRound = () => {
    socket?.emit('next_round', { lobbyId: id });
    clearGameResult();
  };

  if (!lobby || !publicGameState) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col items-center justify-center p-4">
        <div className="animate-pulse text-center space-y-3">
          <div className="text-xl font-bold">Spielstand wird geladen...</div>
          <p className="text-xs text-[var(--color-text-muted)]">Verbindung zur Lobby {id} wird aufgebaut</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs font-semibold rounded-xl border border-[var(--color-border-strong)] transition"
          >
            Zurück zum Hauptmenü
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = lobby.players[publicGameState.turnIndex];
  const isMyTurn = currentPlayer?.id === socket?.id;

  if (lobby.status === 'finished') {
    const iWon = gameResult?.winner?.id === socket?.id;
    const isOkey = lobby.gameType === 'okey';
    const scoringEnabled = lobby.scoringEnabled !== false;
    const matchOver = isOkey && scoringEnabled && gameResult?.matchOver;
    const winTypeLabel =
      gameResult?.winType === 'pairs' ? ' mit 7 Paaren' : gameResult?.pointsLost === 4 ? ' durch Abwerfen des Okey-Steins' : '';
    return (
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col items-center justify-center p-6 select-none text-center">
        <Trophy className={`w-20 h-20 mb-4 ${iWon ? 'text-[var(--color-accent)] animate-bounce' : 'text-[var(--color-text-muted)]'}`} />
        <h1 className="text-3xl sm:text-4xl font-black mb-2">
          {gameResult?.winner
            ? iWon
              ? 'Du hast gewonnen! 🎉'
              : `${gameResult.winner.name} hat gewonnen`
            : 'Unentschieden'}
        </h1>
        {gameResult?.reason === 'pile_empty' && (
          <p className="text-[var(--color-text-muted)] text-sm mb-6">Der Nachziehstapel ist leer - niemand konnte Okey ausrufen.</p>
        )}
        {isOkey && scoringEnabled && gameResult?.winner && !gameResult?.reason && (
          <p className="text-[var(--color-text-muted)] text-sm mb-6">
            Gewonnen{winTypeLabel} - jeder andere Spieler verliert {gameResult.pointsLost} Punkte.
          </p>
        )}
        {matchOver && gameResult?.matchWinners && (
          <p className="text-sm mb-2 font-bold" style={{ color: 'var(--color-accent)' }}>
            Match beendet! Sieger: {gameResult.matchWinners.map((p) => p.name).join(' & ')}
          </p>
        )}
        {scoringEnabled && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 w-full max-w-sm mt-4 shadow-2xl">
            <h2 className="text-sm font-bold text-[var(--color-text-muted)] mb-4 uppercase tracking-wide">Punktestand</h2>
            <ul className="space-y-2">
              {[...lobby.players]
                .sort((a: any, b: any) => b.score - a.score)
                .map((p: any) => (
                  <li key={p.id} className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-1.5">
                      {p.isBot && <Bot className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />}
                      {p.name}
                      {p.score <= 0 && <span className="text-[10px] text-red-400 font-bold">(raus)</span>}
                    </span>
                    <span className="font-black text-emerald-400">{p.score} Pkt</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        <div className="flex gap-3 mt-6 flex-wrap justify-center">
          {isOkey && !matchOver && (
            <button
              onClick={handleNextRound}
              className="px-5 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)] text-[var(--color-accent-contrast)] font-bold text-sm rounded-xl transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Nächste Runde
            </button>
          )}
          <button
            onClick={handleBackToLobby}
            className={
              isOkey && !matchOver
                ? 'px-5 py-2.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-semibold text-sm rounded-xl transition flex items-center gap-2'
                : 'px-5 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-strong)] text-[var(--color-accent-contrast)] font-bold text-sm rounded-xl transition flex items-center gap-2'
            }
          >
            <RefreshCw className="w-4 h-4" />
            Zurück zur Lobby
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-semibold text-sm rounded-xl transition"
          >
            Hauptmenü
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col justify-between p-2 sm:p-4 select-none">
      
      {/* Top Header */}
      <header className="flex items-center justify-between pb-2 border-b border-[var(--color-border)] mb-2">
        <div className="flex items-center gap-2">
          {/* Back to Lobby Button */}
          <button
            onClick={handleBackToLobby}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] text-xs font-bold rounded-xl transition"
            title="Zurück zur Lobby"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="hidden sm:inline">Lobby</span>
          </button>

          {/* Leave Game Button (Bot takes over) */}
          <button
            onClick={handleLeaveGame}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900/90 border border-red-800/80 text-red-300 text-xs font-bold rounded-xl transition shadow"
            title="Spiel beenden / Bot übernimmt"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
            <span>Spiel Beenden</span>
          </button>
        </div>

        {/* Turn Status Banner */}
        <div className="flex items-center gap-2">
          {isMyTurn ? (
            <div className="px-3.5 py-1 bg-[var(--color-accent)] text-[var(--color-accent-contrast)] font-black rounded-full text-xs shadow-lg animate-pulse">
              ★ DU BIST AM ZUG ★
            </div>
          ) : (
            <div className="px-3 py-1 bg-[var(--color-surface-2)] text-[var(--color-text)] font-semibold rounded-full text-xs flex items-center gap-1.5 border border-[var(--color-border-strong)]">
              {currentPlayer?.isBot && <Bot className="w-3.5 h-3.5 text-[var(--color-accent)]" />}
              <span>Am Zug: {currentPlayer?.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => enterPresentationMode()}
            title="Vollbild & Querformat"
            className="p-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] rounded-xl border border-[var(--color-border-strong)]"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowTVOverlay(!showTVOverlay)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text)] font-semibold rounded-xl border border-[var(--color-border-strong)]"
          >
            <Tv className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span className="hidden sm:inline">{showTVOverlay ? 'Hand' : 'TV-Brett'}</span>
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto flex flex-col justify-between">
        
        {showTVOverlay ? (
          /* Mini TV Board View inside Mobile Screen */
          <div className="bg-emerald-950 border border-emerald-900 rounded-3xl p-6 text-center space-y-6 flex-1 flex flex-col justify-center shadow-2xl">
            <h2 className="text-xl font-bold text-emerald-200">Öffentliches Spielfeld (TV View)</h2>
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              {lobby.players.map((p: any, idx: number) => (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl border text-left ${
                    idx === publicGameState.turnIndex
                      ? 'bg-amber-950/80 border-amber-500 ring-2 ring-amber-500'
                      : 'bg-emerald-900/60 border-emerald-800'
                  }`}
                >
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    {p.isBot && <Bot className="w-4 h-4 text-[var(--color-accent)]" />}
                    <span>{p.name}</span>
                  </div>
                  <div className="text-xs text-emerald-300 mt-1">Punkte: {p.score}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowTVOverlay(false)}
              className="px-6 py-2.5 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text)] rounded-xl font-semibold text-xs border border-[var(--color-border-strong)] mx-auto"
            >
              Zurück zu meiner Hand
            </button>
          </div>
        ) : lobby.gameType === 'tavla' ? (
          <TavlaBoard lobbyId={id!} />
        ) : (
          <OkeyBoard lobbyId={id!} />
        )}

      </main>

    </div>
  );
}
