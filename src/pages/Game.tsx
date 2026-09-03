import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import OkeyBoard from '../components/OkeyBoard';
import TavlaBoard from '../components/TavlaBoard';
import { Tv, ArrowLeft, LogOut, Bot, Trophy, RefreshCw } from 'lucide-react';

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, publicGameState, player } = useGameStore();
  const [showTVOverlay, setShowTVOverlay] = useState(false);

  useEffect(() => {
    // Attempt auto-reconnect to game state if state is empty
    if (socket && id && !player) {
      const storedName = localStorage.getItem('playerName') || 'Spieler';
      socket.emit('join_lobby', { lobbyId: id, name: storedName, role: 'player' });
    }
  }, [socket, id, player]);

  const handleLeaveGame = () => {
    if (confirm('Möchtest du das Spiel wirklich verlassen? Ein Bot wird deinen Platz übernehmen.')) {
      socket?.emit('leave_game', { lobbyId: id });
      navigate('/');
    }
  };

  const handleBackToLobby = () => {
    socket?.emit('leave_game', { lobbyId: id });
    navigate(`/lobby/${id}`);
  };

  if (!lobby || !publicGameState) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="animate-pulse text-center space-y-3">
          <div className="text-xl font-bold">Spielstand wird geladen...</div>
          <p className="text-xs text-slate-400">Verbindung zur Lobby {id} wird aufgebaut</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl border border-slate-700 transition"
          >
            Zurück zum Hauptmenü
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = lobby.players[publicGameState.turnIndex];
  const isMyTurn = currentPlayer?.id === socket?.id;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-2 sm:p-4 select-none">
      
      {/* Top Header */}
      <header className="flex items-center justify-between pb-2 border-b border-slate-800/90 mb-2">
        <div className="flex items-center gap-2">
          {/* Back to Lobby Button */}
          <button
            onClick={handleBackToLobby}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
            title="Zurück zur Lobby"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
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
            <div className="px-3.5 py-1 bg-amber-400 text-amber-950 font-black rounded-full text-xs shadow-lg shadow-amber-950/50 animate-pulse">
              ★ DU BIST AM ZUG ★
            </div>
          ) : (
            <div className="px-3 py-1 bg-slate-800 text-slate-300 font-semibold rounded-full text-xs flex items-center gap-1.5 border border-slate-700">
              {currentPlayer?.isBot && <Bot className="w-3.5 h-3.5 text-amber-400" />}
              <span>Am Zug: {currentPlayer?.name}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowTVOverlay(!showTVOverlay)}
          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold rounded-xl border border-slate-700"
        >
          <Tv className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">{showTVOverlay ? 'Hand' : 'TV-Brett'}</span>
        </button>
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
                    {p.isBot && <Bot className="w-4 h-4 text-amber-400" />}
                    <span>{p.name}</span>
                  </div>
                  <div className="text-xs text-emerald-300 mt-1">Punkte: {p.score}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowTVOverlay(false)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs border border-slate-700 mx-auto"
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
