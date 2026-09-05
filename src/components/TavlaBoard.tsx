import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';
import { Dices, RefreshCw } from 'lucide-react';

interface TavlaBoardProps {
  lobbyId: string;
}

export default function TavlaBoard({ lobbyId }: TavlaBoardProps) {
  const { socket, lobby, publicGameState, moveRejectedMessage, clearMoveRejectedMessage } = useGameStore();
  const showToast = useUIStore((s) => s.showToast);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  useEffect(() => {
    if (moveRejectedMessage) {
      showToast(moveRejectedMessage);
      clearMoveRejectedMessage();
    }
  }, [moveRejectedMessage, clearMoveRejectedMessage, showToast]);

  if (!publicGameState || !lobby) return null;

  const currentPlayer = lobby.players[publicGameState.turnIndex];
  const isMyTurn = currentPlayer?.id === socket?.id;
  // 'white' moves toward index 23, 'black' toward index 0 - see server.ts initTavlaGame.
  const myColor: 'white' | 'black' | undefined = publicGameState.playerColors?.[socket?.id || ''];
  const direction = myColor === 'white' ? 1 : -1;

  // Reset any stale selection once it's no longer my turn (e.g. I just moved
  // my last die, or a fresh turn started).
  useEffect(() => {
    if (!isMyTurn || !publicGameState.diceRolled) {
      setSelectedPoint(null);
    }
  }, [isMyTurn, publicGameState.diceRolled]);

  const handleRollDice = () => {
    if (!isMyTurn || publicGameState.diceRolled) return;
    socket?.emit('roll_dice', { lobbyId });
  };

  const selectOwnPoint = (pointIndex: number) => {
    const pt = publicGameState.board[pointIndex];
    if (pt && pt.count > 0 && pt.color === myColor) {
      setSelectedPoint(pointIndex);
      return true;
    }
    return false;
  };

  const handlePointClick = (pointIndex: number) => {
    if (!isMyTurn || !publicGameState.diceRolled || !myColor) return;

    if (selectedPoint === null) {
      selectOwnPoint(pointIndex);
    } else if (selectedPoint === pointIndex) {
      setSelectedPoint(null);
    } else {
      // Only the exact forward point for one of the remaining dice is a
      // legal target - own checkers always move in one fixed direction.
      const dieValue = (pointIndex - selectedPoint) * direction;
      if (dieValue > 0 && publicGameState.movesRemaining.includes(dieValue)) {
        socket?.emit('move_checker', {
          lobbyId,
          fromIndex: selectedPoint,
          dieValue,
        });
        setSelectedPoint(null);
      } else if (!selectOwnPoint(pointIndex)) {
        setSelectedPoint(null);
      }
    }
  };

  return (
    <div className="flex flex-col h-full justify-between">
      
      {/* Dice & Controls Top Area */}
      <div className="bg-amber-950/40 border border-amber-900/60 p-4 rounded-3xl mb-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block">Zug am Zug</span>
          <span className="text-sm font-bold text-white">{currentPlayer?.name}</span>
        </div>

        {/* Dice Display */}
        <div className="flex items-center gap-3">
          {publicGameState.dice.length > 0 ? (
            <div className="flex items-center gap-2">
              {publicGameState.dice.map((d: number, i: number) => (
                <div
                  key={i}
                  className="w-10 h-10 bg-amber-100 text-amber-950 rounded-xl font-black text-xl flex items-center justify-center shadow-lg border-2 border-amber-300"
                >
                  {d}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-amber-400/80 italic">Noch nicht gewürfelt</span>
          )}

          <button
            onClick={handleRollDice}
            disabled={!isMyTurn || publicGameState.diceRolled}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-amber-950 font-bold text-sm rounded-xl transition shadow-lg flex items-center gap-2"
          >
            <Dices className="w-4 h-4" />
            <span>Zar At (Würfeln)</span>
          </button>
        </div>
      </div>

      {/* Tavla Board Graphic Representation */}
      <div className="bg-amber-950/80 border-4 border-amber-900 rounded-3xl p-3 sm:p-4 flex-1 flex flex-col justify-between shadow-2xl relative">
        
        {/* Top Points (Points 12 to 23) */}
        <div className="grid grid-cols-12 gap-1 h-36 sm:h-44 border-b-2 border-amber-900/80 pb-2">
          {Array.from({ length: 12 }).map((_, i) => {
            const idx = 12 + i;
            const pt = publicGameState.board[idx];
            const isSelected = selectedPoint === idx;

            return (
              <button
                key={idx}
                onClick={() => handlePointClick(idx)}
                className={`relative flex flex-col items-center justify-start rounded-b-xl transition ${
                  i % 2 === 0 ? 'bg-amber-900/50' : 'bg-amber-800/40'
                } ${isSelected ? 'ring-2 ring-amber-400 bg-amber-700/60' : ''}`}
              >
                <span className="text-[10px] text-amber-400 font-mono font-bold mt-1">{idx + 1}</span>
                {pt && pt.count > 0 && (
                  <div className="mt-2 flex flex-col gap-0.5 items-center">
                    {Array.from({ length: Math.min(pt.count, 5) }).map((_, cIdx) => (
                      <div
                        key={cIdx}
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border shadow ${
                          pt.color === 'white' ? 'bg-amber-100 border-amber-300' : 'bg-slate-900 border-slate-700'
                        }`}
                      />
                    ))}
                    {pt.count > 5 && (
                      <span className="text-[10px] text-amber-300 font-bold">+{pt.count - 5}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Center Bar */}
        <div className="py-2 flex items-center justify-between text-xs text-amber-400 font-bold px-4">
          <span>Bar Weiß: {publicGameState.bar?.white || 0}</span>
          <span>TAVLA BOARD</span>
          <span>Bar Schwarz: {publicGameState.bar?.black || 0}</span>
        </div>

        {/* Bottom Points (Points 11 down to 0) */}
        <div className="grid grid-cols-12 gap-1 h-36 sm:h-44 border-t-2 border-amber-900/80 pt-2">
          {Array.from({ length: 12 }).map((_, i) => {
            const idx = 11 - i;
            const pt = publicGameState.board[idx];
            const isSelected = selectedPoint === idx;

            return (
              <button
                key={idx}
                onClick={() => handlePointClick(idx)}
                className={`relative flex flex-col items-center justify-end rounded-t-xl transition ${
                  i % 2 === 0 ? 'bg-amber-800/40' : 'bg-amber-900/50'
                } ${isSelected ? 'ring-2 ring-amber-400 bg-amber-700/60' : ''}`}
              >
                {pt && pt.count > 0 && (
                  <div className="mb-2 flex flex-col gap-0.5 items-center">
                    {Array.from({ length: Math.min(pt.count, 5) }).map((_, cIdx) => (
                      <div
                        key={cIdx}
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border shadow ${
                          pt.color === 'white' ? 'bg-amber-100 border-amber-300' : 'bg-slate-900 border-slate-700'
                        }`}
                      />
                    ))}
                    {pt.count > 5 && (
                      <span className="text-[10px] text-amber-300 font-bold">+{pt.count - 5}</span>
                    )}
                  </div>
                )}
                <span className="text-[10px] text-amber-400 font-mono font-bold mb-1">{idx + 1}</span>
              </button>
            );
          })}
        </div>

      </div>

    </div>
  );
}
