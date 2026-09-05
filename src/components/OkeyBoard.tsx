import { useState, useEffect, useRef, type DragEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { ArrowDown, Trophy, Palette, Hash, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { OkeyTile, EmptyOkeyTileSlot } from './OkeyTile';

interface Tile {
  id: number;
  color: string;
  value: number;
}

interface OkeyBoardProps {
  lobbyId: string;
}

const TOTAL_SLOTS = 30; // 2 rows of 15 slots

export default function OkeyBoard({ lobbyId }: OkeyBoardProps) {
  const { socket, lobby, hand, publicGameState, winRejectedMessage, clearWinRejectedMessage } = useGameStore();
  const [rackSlots, setRackSlots] = useState<(Tile | null)[]>(Array(TOTAL_SLOTS).fill(null));
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  // Touch drag tracking
  const touchStartSlotRef = useRef<number | null>(null);

  if (!publicGameState || !lobby) return null;

  const currentPlayer = lobby.players[publicGameState.turnIndex];
  const isMyTurn = currentPlayer?.id === socket?.id;
  const iHaveDrawn = hand.length === 15;

  // Sync hand tiles with rack slots smoothly while keeping custom positions
  useEffect(() => {
    setRackSlots((prevSlots) => {
      const handMap = new Map(hand.map(t => [Number(t.id), t]));
      const nextSlots = prevSlots.map(t => (t && handMap.has(Number(t.id)) ? handMap.get(Number(t.id))! : null));

      const presentIds = new Set(nextSlots.filter((t): t is Tile => t !== null).map(t => Number(t.id)));
      const missingTiles = hand.filter(t => !presentIds.has(Number(t.id)));

      let missingIdx = 0;
      for (let i = 0; i < nextSlots.length && missingIdx < missingTiles.length; i++) {
        if (nextSlots[i] === null) {
          nextSlots[i] = missingTiles[missingIdx++];
        }
      }
      return nextSlots;
    });

    if (hand.length === 14 && selectedSlotIndex !== null) {
      if (!hand.some(t => Number(t.id) === Number(rackSlots[selectedSlotIndex]?.id))) {
        setSelectedSlotIndex(null);
      }
    }
  }, [hand]);

  const handleDrawPile = () => {
    if (!isMyTurn || iHaveDrawn) return;
    socket?.emit('draw_tile', { lobbyId, source: 'pile' });
  };

  const handleDrawDiscard = () => {
    if (!isMyTurn || iHaveDrawn) return;
    socket?.emit('draw_tile', { lobbyId, source: 'discard' });
  };

  const selectedTile = selectedSlotIndex !== null ? rackSlots[selectedSlotIndex] : null;

  const handleDiscard = (tileToDiscard?: Tile | null) => {
    const tile = tileToDiscard || selectedTile;
    if (!isMyTurn || !iHaveDrawn || !tile) return;

    socket?.emit('discard_tile', { lobbyId, tileId: tile.id });
    setSelectedSlotIndex(null);
  };

  const handleDeclareWin = () => {
    if (hand.length === 15 && isMyTurn) {
      socket?.emit('declare_win', { lobbyId });
    } else {
      alert('Du benötigst 15 Steine (nach dem Ziehen), um das Spiel zu beenden!');
    }
  };

  useEffect(() => {
    if (winRejectedMessage) {
      alert(winRejectedMessage);
      clearWinRejectedMessage();
    }
  }, [winRejectedMessage, clearWinRejectedMessage]);

  // Swap slots (Works anytime!)
  const swapSlots = (fromIdx: number, toIdx: number) => {
    setRackSlots(prev => {
      const next = [...prev];
      const temp = next[fromIdx];
      next[fromIdx] = next[toIdx];
      next[toIdx] = temp;
      return next;
    });
  };

  // Move selected tile left or right
  const moveSelectedLeft = () => {
    if (selectedSlotIndex === null || selectedSlotIndex <= 0) return;
    swapSlots(selectedSlotIndex, selectedSlotIndex - 1);
    setSelectedSlotIndex(selectedSlotIndex - 1);
  };

  const moveSelectedRight = () => {
    if (selectedSlotIndex === null || selectedSlotIndex >= TOTAL_SLOTS - 1) return;
    swapSlots(selectedSlotIndex, selectedSlotIndex + 1);
    setSelectedSlotIndex(selectedSlotIndex + 1);
  };

  // Handle slot tap/click
  const handleSlotClick = (slotIdx: number) => {
    if (selectedSlotIndex === null) {
      if (rackSlots[slotIdx]) {
        setSelectedSlotIndex(slotIdx);
      }
    } else if (selectedSlotIndex === slotIdx) {
      setSelectedSlotIndex(null);
    } else {
      swapSlots(selectedSlotIndex, slotIdx);
      setSelectedSlotIndex(slotIdx);
    }
  };

  // Double click tile to directly discard when it's your turn
  const handleTileDoubleClick = (slotIdx: number) => {
    const tile = rackSlots[slotIdx];
    if (tile && isMyTurn && iHaveDrawn) {
      handleDiscard(tile);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: DragEvent, slotIdx: number) => {
    if (!rackSlots[slotIdx]) return;
    e.dataTransfer.setData('text/plain', slotIdx.toString());
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDropSlot = (e: DragEvent, targetSlotIdx: number) => {
    e.preventDefault();
    const sourceIdxStr = e.dataTransfer.getData('text/plain');
    if (sourceIdxStr !== '') {
      const sourceSlotIdx = parseInt(sourceIdxStr, 10);
      if (!isNaN(sourceSlotIdx) && sourceSlotIdx !== targetSlotIdx) {
        swapSlots(sourceSlotIdx, targetSlotIdx);
        setSelectedSlotIndex(targetSlotIdx);
      }
    }
  };

  const handleDropDiscardZone = (e: DragEvent) => {
    e.preventDefault();
    const sourceIdxStr = e.dataTransfer.getData('text/plain');
    if (sourceIdxStr !== '') {
      const sourceSlotIdx = parseInt(sourceIdxStr, 10);
      const tile = rackSlots[sourceSlotIdx];
      if (tile && isMyTurn && iHaveDrawn) {
        handleDiscard(tile);
      }
    }
  };

  // Touch drag handlers for mobile devices
  const handleTouchStart = (slotIdx: number) => {
    touchStartSlotRef.current = slotIdx;
  };

  const handleTouchEnd = (targetSlotIdx: number) => {
    const startIdx = touchStartSlotRef.current;
    if (startIdx !== null && startIdx !== targetSlotIdx) {
      swapSlots(startIdx, targetSlotIdx);
      setSelectedSlotIndex(targetSlotIdx);
    }
    touchStartSlotRef.current = null;
  };

  // Auto-sort helpers
  const sortByColor = () => {
    const tilesOnly = rackSlots.filter((t): t is Tile => t !== null);
    tilesOnly.sort((a, b) => {
      if (a.color !== b.color) return a.color.localeCompare(b.color);
      return a.value - b.value;
    });

    const newSlots = Array(TOTAL_SLOTS).fill(null);
    tilesOnly.forEach((t, i) => {
      if (i < TOTAL_SLOTS) newSlots[i] = t;
    });
    setRackSlots(newSlots);
    setSelectedSlotIndex(null);
  };

  const sortByValue = () => {
    const tilesOnly = rackSlots.filter((t): t is Tile => t !== null);
    tilesOnly.sort((a, b) => {
      if (a.value !== b.value) return a.value - b.value;
      return a.color.localeCompare(b.color);
    });

    const newSlots = Array(TOTAL_SLOTS).fill(null);
    tilesOnly.forEach((t, i) => {
      if (i < TOTAL_SLOTS) newSlots[i] = t;
    });
    setRackSlots(newSlots);
    setSelectedSlotIndex(null);
  };

  // Discard pile info
  const prevPlayerIndex = (publicGameState.turnIndex - 1 + lobby.players.length) % lobby.players.length;
  const prevPlayer = lobby.players[prevPlayerIndex];
  const prevDiscardList = publicGameState.discardPiles[prevPlayer?.id] || [];
  const topPrevDiscard = prevDiscardList[prevDiscardList.length - 1];

  const myDiscardList = publicGameState.discardPiles[socket?.id || ''] || [];
  const myTopDiscard = myDiscardList[myDiscardList.length - 1];

  const topRowSlots = rackSlots.slice(0, 15);
  const bottomRowSlots = rackSlots.slice(15, 30);

  const renderSlotTile = (tile: Tile | null, slotIdx: number) => {
    const isSelected = selectedSlotIndex === slotIdx;

    return (
      <div
        key={slotIdx}
        draggable={Boolean(tile)}
        onDragStart={(e) => handleDragStart(e, slotIdx)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDropSlot(e, slotIdx)}
        onTouchStart={() => handleTouchStart(slotIdx)}
        onTouchEnd={() => handleTouchEnd(slotIdx)}
        onClick={() => handleSlotClick(slotIdx)}
        onDoubleClick={() => handleTileDoubleClick(slotIdx)}
        className="cursor-pointer select-none flex-shrink-0 transition-transform"
      >
        {tile ? (
          <OkeyTile tile={tile} selected={isSelected} />
        ) : (
          <EmptyOkeyTileSlot index={slotIdx} />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full justify-between gap-2 sm:gap-3">
      {/* Table Center & Draw Action Panel */}
      <div className="p-2.5 sm:p-4 bg-slate-900/95 border border-slate-800 rounded-2xl sm:rounded-3xl flex flex-col justify-between flex-1 shadow-xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] sm:text-xs text-slate-400 font-medium">Gösterge:</span>
            {publicGameState.indicator ? (
              <OkeyTile tile={publicGameState.indicator} size="xs" />
            ) : (
              <span className="text-xs text-slate-500">-</span>
            )}
          </div>

          <div className="text-[11px] sm:text-xs text-slate-300 font-mono flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Stapel:</span>
            <span className="text-amber-400 font-black text-xs sm:text-sm">{publicGameState.pileCount}</span>
          </div>
        </div>

        {/* Draw & Discard Targets */}
        <div className="grid grid-cols-3 gap-2 my-1">
          {/* Draw Discard Button */}
          <button
            onClick={handleDrawDiscard}
            disabled={!isMyTurn || iHaveDrawn}
            className="p-2 sm:p-2.5 bg-slate-800/90 border border-slate-700 hover:border-amber-500/60 disabled:opacity-40 rounded-xl flex flex-col items-center justify-center transition shadow-sm group"
          >
            <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-0.5 truncate max-w-full">
              Von {prevPlayer?.name}
            </span>
            {topPrevDiscard ? (
              <div className="group-hover:scale-110 transition">
                <OkeyTile tile={topPrevDiscard} size="xs" />
              </div>
            ) : (
              <span className="text-[10px] text-slate-600 italic">Leer</span>
            )}
          </button>

          {/* Draw Pile Button */}
          <button
            onClick={handleDrawPile}
            disabled={!isMyTurn || iHaveDrawn}
            className="p-2 sm:p-2.5 bg-emerald-950/80 border border-emerald-700/60 hover:bg-emerald-900/80 disabled:opacity-40 rounded-xl flex flex-col items-center justify-center transition shadow-sm group"
          >
            <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-300 mb-0.5">Vom Stapel</span>
            <span className="text-xl sm:text-2xl font-black text-white group-hover:scale-110 transition">
              {publicGameState.pileCount}
            </span>
          </button>

          {/* My Discard Drop Target Box */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropDiscardZone}
            onClick={() => {
              if (selectedTile && isMyTurn && iHaveDrawn) {
                handleDiscard();
              }
            }}
            className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-center transition shadow-sm ${
              isMyTurn && iHaveDrawn
                ? 'bg-red-950/50 border-red-500/80 ring-2 ring-red-500/30 cursor-pointer animate-pulse'
                : 'bg-slate-800/50 border-slate-700/50'
            }`}
          >
            <span className="text-[9px] sm:text-[10px] font-semibold text-red-300 mb-0.5">Deine Ablage</span>
            {myTopDiscard ? (
              <OkeyTile tile={myTopDiscard} size="xs" />
            ) : (
              <span className="text-[9px] text-slate-500 italic">Hier abwerfen</span>
            )}
          </div>
        </div>

        {/* Main Action Controls */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            onClick={() => handleDiscard()}
            disabled={!isMyTurn || !iHaveDrawn || !selectedTile}
            className="py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>
              {selectedTile ? `Stein ${selectedTile.value} Abwerfen` : 'Stein Abwerfen'}
            </span>
          </button>

          <button
            onClick={handleDeclareWin}
            disabled={!isMyTurn || !iHaveDrawn}
            className="py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>Okey Gewinnen</span>
          </button>
        </div>
      </div>

      {/* ISTAKA RACK (OPTIMIZED SIZES FOR S25 LANDSCAPE & MOBILE) */}
      <div className="bg-amber-950/80 border-2 border-amber-900 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 shadow-2xl backdrop-blur relative">
        {/* Rack Header & Reorder Controls */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400">
              Istaka ({hand.length})
            </span>
            {iHaveDrawn && isMyTurn && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full animate-pulse">
                Abwerfen!
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Shift buttons when a tile is selected */}
            {selectedSlotIndex !== null && (
              <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 p-0.5 rounded-lg">
                <button
                  onClick={moveSelectedLeft}
                  disabled={selectedSlotIndex === 0}
                  className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white rounded text-[10px] font-bold transition flex items-center"
                  title="Nach links verschieben"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>Links</span>
                </button>
                <button
                  onClick={moveSelectedRight}
                  disabled={selectedSlotIndex === TOTAL_SLOTS - 1}
                  className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white rounded text-[10px] font-bold transition flex items-center"
                  title="Nach rechts verschieben"
                >
                  <span>Rechts</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Auto Sort Buttons */}
            <button
              onClick={sortByColor}
              className="px-2 py-1 bg-amber-900/80 hover:bg-amber-800 text-amber-200 rounded-lg text-[11px] font-bold border border-amber-700 transition flex items-center gap-1 shadow-sm"
            >
              <Palette className="w-3 h-3 text-amber-400" />
              <span>Farbe</span>
            </button>
            <button
              onClick={sortByValue}
              className="px-2 py-1 bg-amber-900/80 hover:bg-amber-800 text-amber-200 rounded-lg text-[11px] font-bold border border-amber-700 transition flex items-center gap-1 shadow-sm"
            >
              <Hash className="w-3 h-3 text-amber-400" />
              <span>Zahl</span>
            </button>
          </div>
        </div>

        {/* 2-ROW RACK PERFECTLY SIZED FOR PHONES IN LANDSCAPE MODE */}
        <div className="overflow-x-auto pb-1 pt-1 max-w-full scrollbar-none">
          <div className="flex flex-col gap-2 min-w-max px-0.5">
            {/* Top Row (Slots 0 - 14) */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {topRowSlots.map((tile, idx) => renderSlotTile(tile, idx))}
            </div>

            {/* Bottom Row (Slots 15 - 29) */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {bottomRowSlots.map((tile, idx) => renderSlotTile(tile, 15 + idx))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
