import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useUIStore } from '../store/uiStore';
import { isFirebaseConfigured } from '../lib/firebase';
import { enterPresentationMode } from '../lib/presentation';
import { useSoundStore } from '../store/soundStore';
import InGameMenu from '../components/InGameMenu';
import RotateHint from '../components/RotateHint';
import OkeyBoard from '../components/OkeyBoard';
import TavlaBoard from '../components/TavlaBoard';
import { OkeyTile } from '../components/OkeyTile';
import { Bot, Trophy, RefreshCw, Menu } from 'lucide-react';

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, publicGameState, player, gameResult, clearGameResult, setPlayer } = useGameStore();
  const { authReady, getIdToken } = useAuthStore();
  const { activeProfile, profilesReady } = useProfileStore();
  const showConfirm = useUIStore((s) => s.showConfirm);
  const playSound = useSoundStore((s) => s.play);
  const [menuOpen, setMenuOpen] = useState(false);

  // Play a little fanfare exactly once per finished hand, not on every
  // re-render while the result screen stays up.
  useEffect(() => {
    if (gameResult) playSound('win');
  }, [gameResult, playSound]);

  // Games always run fullscreen/landscape - no manual button for it anymore.
  // This can't rely on a click gesture (there isn't always one right before
  // Game.tsx mounts, e.g. after a reconnect), so it's a best-effort, silently
  // ignored attempt rather than a guarantee.
  useEffect(() => {
    enterPresentationMode();
  }, []);

  useEffect(() => {
    // Attempt auto-reconnect to game state if state is empty. Wait for auth
    // (and, when Firebase is configured, the profile) to resolve so a
    // logged-in player reconnects with their own account rather than
    // briefly as an anonymous guest.
    if (socket && id && !player && authReady && (!isFirebaseConfigured || profilesReady)) {
      const storedName = activeProfile?.name || localStorage.getItem('playerName') || 'Spieler';
      getIdToken().then((idToken) => {
        socket.emit('join_lobby', { lobbyId: id, name: storedName, role: 'player', idToken, profileId: activeProfile?.id }, (res: any) => {
          if (res?.success && res.player) setPlayer(res.player);
        });
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
  };

  useEffect(() => {
    if (lobby?.status === 'playing' && gameResult) clearGameResult();
  }, [lobby?.status, gameResult, clearGameResult]);

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
          <p className="text-[var(--color-text-muted)] text-sm mb-3">
            Gewonnen{winTypeLabel} -{' '}
            {lobby.teamMode
              ? `das gegnerische Paar verliert ${gameResult.pointsLost} Punkte.`
              : `jeder andere Spieler verliert ${gameResult.pointsLost} Punkte.`}
          </p>
        )}
        {isOkey && gameResult?.winningHand && gameResult.winningHand.length > 0 && (
          <div className="w-full max-w-xl mb-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Gewinn-Hand</p>
            <div className="flex flex-wrap justify-center gap-1">
              {gameResult.winningHand.map((t) => (
                <OkeyTile key={t.id} tile={t} size="sm" />
              ))}
            </div>
            {gameResult.winningDiscard && (
              <div className="mt-3 flex flex-col items-center gap-1">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Abgeworfen</p>
                <OkeyTile tile={gameResult.winningDiscard} size="sm" />
              </div>
            )}
          </div>
        )}
        {matchOver && gameResult?.matchWinners && (
          <p className="text-sm mb-2 font-bold" style={{ color: 'var(--color-accent)' }}>
            Match beendet! {lobby.teamMode ? 'Siegerpaar' : 'Sieger'}: {gameResult.matchWinners.map((p) => p.name).join(' & ')}
          </p>
        )}
        {scoringEnabled && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 w-full max-w-sm mt-4 shadow-2xl">
            <h2 className="text-sm font-bold text-[var(--color-text-muted)] mb-4 uppercase tracking-wide">Punktestand</h2>

            {lobby.teamMode ? (
              // Eşli: both members of a pair always hold the same score (see
              // server.ts declare_win), so one seat per team is the team's
              // score - listing four separate numbers would just repeat it.
              <ul className="space-y-3">
                {[0, 1].map((team) => {
                  const members = lobby.players.filter((_: any, i: number) => i % 2 === team);
                  const score = members[0]?.score ?? 0;
                  return (
                    <li key={team} className="flex justify-between items-center text-sm gap-3">
                      <span className="min-w-0">
                        <span className="block font-bold">Team {team + 1}</span>
                        <span className="block text-xs text-[var(--color-text-muted)] truncate">
                          {members.map((m: any) => m.name).join(' & ')}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="font-black text-emerald-400">{score} Pkt</span>
                        {score <= 0 && <span className="text-[10px] text-red-400 font-bold">(raus)</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
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
            )}
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
    <div className="game-shell text-[var(--color-text)] flex flex-col select-none" style={{ background: 'var(--table-felt)' }}>

      <header className="absolute top-1 right-1 z-30">
        <button
          onClick={() => setMenuOpen(true)}
          title="Menü"
          className="relative p-1.5 flex-shrink-0 bg-black/25 hover:bg-black/40 text-white rounded-full"
        >
          <Menu className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 min-h-0 w-full flex flex-col">
        {lobby.gameType === 'tavla' ? <TavlaBoard lobbyId={id!} /> : <OkeyBoard lobbyId={id!} />}
      </main>

      <InGameMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLeaveGame={() => {
          setMenuOpen(false);
          handleLeaveGame();
        }}
      />

      <RotateHint />
    </div>
  );
}
