import { useState, useEffect, useRef, type CSSProperties, type DragEvent } from 'react';
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';
import { useSoundStore } from '../store/soundStore';
import { REACTIONS, findReaction } from '../lib/reactions';
import { ArrowDown, Trophy, Palette, Hash, ChevronLeft, ChevronRight, Sparkles, Wand2, Bot, WifiOff, MessageCircle } from 'lucide-react';
import { OkeyTile, EmptyOkeyTileSlot } from './OkeyTile';
import ReactionTile from './ReactionTile';
import { useBoardScale } from '../lib/useBoardScale';

interface Tile {
  id: number;
  color: string;
  value: number;
}

interface OkeyBoardProps {
  lobbyId: string;
}

const TOTAL_SLOTS = 30; // 2 rows of 15 slots
// How long a thrown reaction stone stays lying on the table.
const REACTION_VISIBLE_MS = 4000;
// How long the "tiles landing" deal animation plays for a fresh hand.
const DEAL_ANIM_MS = 900;

// "Logical" grouping: cluster tiles into their actual runs (3+ consecutive,
// same color) and sets (3-4, same value, different colors) with a gap
// between clusters, jokers up front, anything left over sorted at the end.
// This is a display-only heuristic (not the server's authoritative win
// check) - it just arranges the rack the way a player would by hand. Pulled
// out as a standalone function so both the manual "Auto" button and the
// automatic arrange-on-deal effect can share it.
function computeGroupedSlots(tiles: Tile[], indicator: Tile | undefined | null): (Tile | null)[] {
  const isJoker = (t: Tile) =>
    t.color === 'fake' || (indicator ? t.color === indicator.color && t.value === ((indicator.value % 13) + 1) : false);

  const jokers = tiles.filter(isJoker);
  const rest = tiles.filter((t) => !isJoker(t));
  const used = new Set<number>();
  const groups: Tile[][] = [];

  // 1) Runs
  (['red', 'black', 'blue', 'yellow'] as const).forEach((color) => {
    const byColor = rest.filter((t) => t.color === color).sort((a, b) => a.value - b.value);
    let run: Tile[] = [];
    const flush = () => {
      if (run.length >= 3) {
        run.forEach((t) => used.add(t.id));
        groups.push(run);
      }
      run = [];
    };
    byColor.forEach((t) => {
      const last = run[run.length - 1];
      if (!last || t.value === last.value + 1) {
        run.push(t);
      } else {
        flush();
        run = [t];
      }
    });
    flush();
  });

  // 2) Sets, from whatever the run pass didn't use
  const afterRuns = rest.filter((t) => !used.has(t.id));
  const byValue = new Map<number, Tile[]>();
  afterRuns.forEach((t) => {
    if (!byValue.has(t.value)) byValue.set(t.value, []);
    byValue.get(t.value)!.push(t);
  });
  byValue.forEach((vs) => {
    const seenColors = new Set<string>();
    const setTiles: Tile[] = [];
    vs.forEach((t) => {
      if (!seenColors.has(t.color)) {
        seenColors.add(t.color);
        setTiles.push(t);
      }
    });
    if (setTiles.length >= 3) {
      setTiles.forEach((t) => used.add(t.id));
      groups.push(setTiles);
    }
  });

  // 3) Leftovers - just sorted for readability
  const leftover = rest
    .filter((t) => !used.has(t.id))
    .sort((a, b) => (a.color !== b.color ? a.color.localeCompare(b.color) : a.value - b.value));

  const newSlots: (Tile | null)[] = Array(TOTAL_SLOTS).fill(null);
  let idx = 0;
  const place = (ts: Tile[]) => {
    ts.forEach((t) => {
      if (idx < TOTAL_SLOTS) newSlots[idx] = t;
      idx++;
    });
    idx++; // gap between clusters
  };
  if (jokers.length) place(jokers);
  groups.forEach(place);
  if (leftover.length) place(leftover);

  return newSlots;
}

/**
 * Who sits where, given the opponents in turn order starting from whoever
 * plays right after me: the one opposite goes across the table, the others
 * left and right. Named seats rather than coordinates because the table is
 * laid out as a grid - on a 360px-tall phone, absolutely positioned seats
 * and the centre pile happily land on top of each other, and a grid simply
 * cannot do that.
 */
function seatsOf(list: any[]): { top?: any; left?: any; right?: any } {
  if (list.length <= 1) return { top: list[0] };
  if (list.length === 2) return { right: list[0], left: list[1] };
  return { right: list[0], top: list[1], left: list[2] };
}

export default function OkeyBoard({ lobbyId }: OkeyBoardProps) {
  const {
    socket,
    lobby,
    hand,
    publicGameState,
    winRejectedMessage,
    clearWinRejectedMessage,
    gostermeEligible,
    gostermeMessage,
    clearGostermeMessage,
    declareGosterme,
    reactions,
    sendReaction,
  } = useGameStore();
  const showToast = useUIStore((s) => s.showToast);
  const playSound = useSoundStore((s) => s.play);
  const [rackSlots, setRackSlots] = useState<(Tile | null)[]>(Array(TOTAL_SLOTS).fill(null));
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  // Tile ids currently playing the "just dealt" landing animation, so a
  // fresh hand looks like it's being dealt out rather than just appearing.
  const [dealingTileIds, setDealingTileIds] = useState<Set<number>>(new Set());

  // The whole board sizes itself off the space it actually has (see
  // useBoardScale) instead of breakpoints, so it fits any phone in landscape
  // without scrolling and scales up rather than out on a tablet or TV.
  const rootRef = useRef<HTMLDivElement>(null);
  const { scale, vars } = useBoardScale(rootRef);
  // Text can't shrink as far as tiles can before it stops being readable.
  const fs = (px: number, min = 8) => `max(${min}px, calc(${px}px * var(--ui-scale)))`;
  const sp = (px: number, min = 2) => `max(${min}px, calc(${px}px * var(--ui-scale)))`;

  // Turn countdown. The server sends an absolute deadline; the clock below
  // just ticks locally so the bar animates between state updates. (A skewed
  // phone clock would shift the bar a little - the server alone decides when
  // the time is actually up.)
  const [now, setNow] = useState(() => Date.now());
  const turnDeadline: number | null = publicGameState?.turnDeadline ?? null;
  const turnDurationMs: number = publicGameState?.turnDurationMs ?? 60000;
  useEffect(() => {
    if (!turnDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [turnDeadline]);

  const remainingMs = turnDeadline ? Math.max(0, turnDeadline - now) : 0;
  const remainingFraction = turnDeadline ? Math.max(0, Math.min(1, remainingMs / turnDurationMs)) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const runningOut = remainingFraction < 0.25;

  // The little bar that runs down under whoever is on turn.
  const renderTurnBar = () =>
    turnDeadline ? (
      <span
        className="block w-full rounded-full overflow-hidden mt-0.5"
        style={{ background: 'var(--table-inset)', height: sp(3, 2) }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${remainingFraction * 100}%`,
            background: runningOut ? '#ef4444' : 'var(--color-accent)',
            transition: 'width 200ms linear',
          }}
        />
      </span>
    ) : null;

  // Reaction stones: thrown onto the table in front of whoever sent one and
  // cleared again a few seconds later. The turn clock above only ticks while
  // a turn is running, so this one keeps stones disappearing in between.
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [, setReactionClock] = useState(0);
  const hasFreshReaction = Object.values(reactions).some((r) => Date.now() - r.at < REACTION_VISIBLE_MS);
  useEffect(() => {
    if (!hasFreshReaction) return;
    const id = setInterval(() => setReactionClock((c) => c + 1), 400);
    return () => clearInterval(id);
  }, [hasFreshReaction]);

  const reactionFor = (playerId: string) => {
    const entry = reactions[playerId];
    if (!entry || Date.now() - entry.at > REACTION_VISIBLE_MS) return null;
    return findReaction(entry.reaction) || null;
  };

  const handleSendReaction = (id: string) => {
    sendReaction(lobbyId, id);
    setReactionPickerOpen(false);
  };

  // Touch drag tracking
  const touchStartSlotRef = useRef<number | null>(null);

  const currentPlayer = publicGameState && lobby ? lobby.players[publicGameState.turnIndex] : null;
  const isMyTurn = Boolean(currentPlayer && socket && currentPlayer.id === socket.id);

  // A little chime when it becomes your turn - only on the false -> true
  // transition, so it doesn't replay every re-render while it's still you.
  const wasMyTurnRef = useRef(isMyTurn);
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      playSound('turn');
    }
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn, playSound]);

  const iHaveDrawn = hand.length === 15;

  // Sync hand tiles with rack slots smoothly while keeping custom positions.
  // A brand-new hand (every tile in it is unfamiliar to the rack) is arranged
  // automatically via the same grouping logic as the "Auto" button, with a
  // brief dealing animation - no button press needed at the start of a hand.
  useEffect(() => {
    const handMap = new Map(hand.map((t) => [Number(t.id), t]));
    const currentIds = new Set(rackSlots.filter((t): t is Tile => t !== null).map((t) => Number(t.id)));
    const missingTiles = hand.filter((t) => !currentIds.has(Number(t.id)));
    const isFreshDeal = hand.length >= 14 && missingTiles.length === hand.length;

    if (isFreshDeal) {
      setRackSlots(computeGroupedSlots(hand as Tile[], publicGameState?.indicator));
      setDealingTileIds(new Set(hand.map((t) => Number(t.id))));
      const timer = setTimeout(() => setDealingTileIds(new Set()), DEAL_ANIM_MS);
      return () => clearTimeout(timer);
    }

    setRackSlots((prevSlots) => {
      const nextSlots = prevSlots.map(t => (t && handMap.has(Number(t.id)) ? handMap.get(Number(t.id))! : null));
      const presentIds = new Set(nextSlots.filter((t): t is Tile => t !== null).map(t => Number(t.id)));
      const stillMissing = hand.filter(t => !presentIds.has(Number(t.id)));

      let missingIdx = 0;
      for (let i = 0; i < nextSlots.length && missingIdx < stillMissing.length; i++) {
        if (nextSlots[i] === null) {
          nextSlots[i] = stillMissing[missingIdx++];
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
    playSound('draw');
    socket?.emit('draw_tile', { lobbyId, source: 'pile' });
  };

  const handleDrawDiscard = () => {
    if (!isMyTurn || iHaveDrawn) return;
    playSound('draw');
    socket?.emit('draw_tile', { lobbyId, source: 'discard' });
  };

  const selectedTile = selectedSlotIndex !== null ? rackSlots[selectedSlotIndex] : null;

  const handleDiscard = (tileToDiscard?: Tile | null) => {
    const tile = tileToDiscard || selectedTile;
    if (!isMyTurn || !iHaveDrawn || !tile) return;

    playSound('discard');
    socket?.emit('discard_tile', { lobbyId, tileId: tile.id });
    setSelectedSlotIndex(null);
  };

  const handleDeclareWin = () => {
    if (hand.length === 15 && isMyTurn) {
      socket?.emit('declare_win', { lobbyId });
    } else {
      playSound('error');
      showToast('Du benötigst 15 Steine (nach dem Ziehen), um das Spiel zu beenden!');
    }
  };

  useEffect(() => {
    if (winRejectedMessage) {
      playSound('error');
      showToast(winRejectedMessage);
      clearWinRejectedMessage();
    }
  }, [winRejectedMessage, clearWinRejectedMessage, showToast, playSound]);

  useEffect(() => {
    if (gostermeMessage) {
      playSound('error');
      showToast(gostermeMessage);
      clearGostermeMessage();
    }
  }, [gostermeMessage, clearGostermeMessage, showToast, playSound]);

  const handleDeclareGosterme = () => {
    playSound('gosterme');
    declareGosterme(lobbyId);
  };

  // Every hook above runs unconditionally - bailing out earlier (as this
  // component used to) changes the hook order between renders, which React
  // refuses to do once the game state arrives.
  if (!publicGameState || !lobby) return null;

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
      setSelectedSlotIndex(null);
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
        setSelectedSlotIndex(null);
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
      setSelectedSlotIndex(null);
    }
    touchStartSlotRef.current = null;
  };

  // "Logical" auto-sort button - same grouping logic used automatically at
  // the start of a hand (see the [hand] effect above), callable any time the
  // player wants to re-cluster the rack by hand.
  const sortByGroups = () => {
    const tilesOnly = rackSlots.filter((t): t is Tile => t !== null);
    setRackSlots(computeGroupedSlots(tilesOnly, publicGameState?.indicator));
    setSelectedSlotIndex(null);
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


  // --- Table layout ---------------------------------------------------
  // Everyone at the table, starting with the player to my left (i.e. the
  // one who plays after me), so the row reads in turn order. Each opponent
  // shows their name, how many tiles they're holding and the tile they
  // discarded last - at a real table you can see all of that.
  const myIndex = lobby.players.findIndex((p: any) => p.id === socket?.id);
  const seatCount = lobby.players.length;
  const opponents =
    myIndex === -1
      ? lobby.players
      : Array.from({ length: seatCount - 1 }, (_, i) => lobby.players[(myIndex + 1 + i) % seatCount]);
  const seats = seatsOf(opponents);
  // Eşli Okey: partners sit opposite, so at a full table my partner is
  // always the seat across from me - the one seatsOf puts at the top.
  const partnerId: string | null =
    lobby.teamMode && opponents.length === 3 ? seats.top?.id ?? null : null;

  // Okey only lets you pick up the tile the player before you just threw.
  const prevPlayerIndex = (publicGameState.turnIndex - 1 + seatCount) % seatCount;
  const prevPlayer = lobby.players[prevPlayerIndex];

  const lastDiscardOf = (playerId: string) => {
    const pile = publicGameState.discardPiles?.[playerId] || [];
    return pile[pile.length - 1];
  };
  const handCountOf = (playerId: string) => publicGameState.handCounts?.[playerId];

  const myTopDiscard = lastDiscardOf(socket?.id || '');
  const canTakeDiscard = isMyTurn && !iHaveDrawn && Boolean(lastDiscardOf(prevPlayer?.id));

  const topRowSlots = rackSlots.slice(0, 15);
  const bottomRowSlots = rackSlots.slice(15, 30);

  const renderSlotTile = (tile: Tile | null, slotIdx: number) => {
    const isSelected = selectedSlotIndex === slotIdx;
    const isDealing = Boolean(tile) && dealingTileIds.has(Number(tile!.id));

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
        className={`cursor-pointer select-none flex-shrink-0 transition-transform ${isDealing ? 'animate-tile-deal' : ''}`}
        style={isDealing ? { animationDelay: `${(slotIdx % 15) * 25}ms` } : undefined}
      >
        {tile ? (
          <OkeyTile tile={tile} selected={isSelected} scale={1} />
        ) : (
          <EmptyOkeyTileSlot index={slotIdx} scale={1} />
        )}
      </div>
    );
  };
  // Where each opponent's plaque sits around a rectangular table, in turn
  // order starting from whoever plays right after me - one seat opposite,
  // the rest split left/right, same as sitting at a real four-sided table.
  // One opponent's plaque: name, the tile they discarded last (tappable when
  // it's your turn and they're the player before you, with a checkmark
  // showing it can be taken), and their tile count - positioned at their
  // seat around the table via seatClassFor.
  const renderOpponent = (p: any, seat: 'top' | 'left' | 'right') => {
    if (!p) return null;
    const isTheirTurn = lobby.players[publicGameState.turnIndex]?.id === p.id;
    const discard = lastDiscardOf(p.id);
    const takeable = canTakeDiscard && p.id === prevPlayer?.id;
    const count = handCountOf(p.id);
    const isPartner = p.id === partnerId;
    // The discarded tile always sits on the side facing the middle of the
    // table, the way it would lie in front of that player in real life.
    const direction = seat === 'right' ? 'flex-row-reverse' : 'flex-row';

    return (
      <button
        key={p.id}
        onClick={takeable ? handleDrawDiscard : undefined}
        disabled={!takeable}
        title={takeable ? `Stein von ${p.name} aufnehmen` : p.name}
        className={`relative z-10 flex items-center rounded-xl transition disabled:cursor-default ${direction} ${
          takeable ? 'cursor-pointer active:scale-[0.97]' : ''
        }`}
        style={{
          gap: sp(5, 3),
          padding: `${sp(4, 2)} ${sp(6, 3)}`,
          maxWidth: `calc(var(--tile-w) * 4.2)`,
          background: isTheirTurn
            ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)'
            : 'var(--table-inset)',
          border: `1px solid ${
            takeable
              ? 'var(--color-accent)'
              : isTheirTurn
              ? 'color-mix(in srgb, var(--color-accent) 55%, transparent)'
              : isPartner
              ? 'rgba(94,234,212,0.75)'
              : 'var(--table-edge)'
          }`,
          boxShadow: takeable ? '0 0 0 2px color-mix(in srgb, var(--color-accent) 40%, transparent)' : undefined,
        }}
      >
        {/* The stone this player just threw onto the table */}
        {reactionFor(p.id) && (
          <span
            className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
            style={{ animation: `reaction-fade ${REACTION_VISIBLE_MS}ms ease-out forwards` }}
          >
            <ReactionTile reaction={reactionFor(p.id)!} size="sm" thrown />
          </span>
        )}

        <span className="relative flex-shrink-0 leading-none">
          {discard ? (
            <OkeyTile tile={discard} scale={0.62} />
          ) : (
            <span
              className="flex items-center justify-center rounded border border-dashed"
              style={{
                width: 'calc(var(--tile-w) * 0.62)',
                height: 'calc(var(--tile-h) * 0.62)',
                fontSize: fs(8, 7),
                borderColor: 'var(--slot-empty-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              –
            </span>
          )}
          {takeable && (
            <span
              className="absolute rounded-full bg-emerald-500 text-white flex items-center justify-center font-black shadow"
              style={{
                top: `calc(var(--tile-w) * -0.13)`,
                right: `calc(var(--tile-w) * -0.13)`,
                width: `max(12px, calc(var(--tile-w) * 0.34))`,
                height: `max(12px, calc(var(--tile-w) * 0.34))`,
                fontSize: fs(9, 8),
              }}
            >
              ✓
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1 flex flex-col items-start">
          <span className="flex items-center gap-1 max-w-full">
            {p.isBot && (
              <Bot
                className="flex-shrink-0"
                style={{ color: 'var(--color-accent)', width: fs(11, 9), height: fs(11, 9) }}
              />
            )}
            {p.away && (
              <WifiOff className="flex-shrink-0 text-red-400" style={{ width: fs(11, 9), height: fs(11, 9) }} />
            )}
            <span
              className="font-bold truncate leading-tight"
              style={{
                fontSize: fs(12, 9),
                color: isTheirTurn ? 'var(--color-text)' : 'var(--color-text-muted)',
                opacity: p.away ? 0.6 : 1,
              }}
            >
              {p.name}
            </span>
          </span>
          <span
            className="leading-none"
            style={{
              fontSize: fs(10, 8),
              color: takeable
                ? 'var(--color-accent)'
                : p.away
                ? '#f87171'
                : isPartner
                ? '#5eead4'
                : 'var(--color-text-muted)',
            }}
          >
            {p.away
              ? 'offline'
              : isPartner
              ? `Partner · ${typeof count === 'number' ? `${count} Steine` : ''}`
              : typeof count === 'number'
              ? `${count} Steine`
              : ''}
          </span>
          {/* Countdown while it's this player's turn - everyone sees it */}
          {isTheirTurn && renderTurnBar()}
        </span>
      </button>
    );
  };

  // Middle of the table: face-down draw pile, the indicator tile centered
  // plainly, and my own discard slot right next to it - like a real table,
  // no explanatory captions needed.
  const renderCentre = () => (
    <div className="flex items-center justify-center" style={{ gap: sp(12, 6) }}>
      <button
        onClick={handleDrawPile}
        disabled={!isMyTurn || iHaveDrawn}
        title="Vom Stapel ziehen"
        className="relative flex items-center justify-center rounded-md transition disabled:opacity-50 active:scale-[0.97]"
        style={{
          width: 'calc(var(--tile-w) * 0.9)',
          height: 'calc(var(--tile-h) * 0.9)',
          background: 'linear-gradient(160deg, #b45309 0%, #92400e 60%, #78350f 100%)',
          border: `2px solid ${isMyTurn && !iHaveDrawn ? 'var(--color-accent)' : 'var(--table-edge)'}`,
          boxShadow: '0 3px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <span className="font-black text-amber-100 leading-none" style={{ fontSize: fs(13, 9) }}>
          {publicGameState.pileCount}
        </span>
      </button>

      {publicGameState.indicator ? (
        <OkeyTile tile={publicGameState.indicator} scale={1} className="ring-2 ring-[var(--color-accent)]/70" />
      ) : (
        <span style={{ width: 'calc(var(--tile-w) * 0.9)', height: 'calc(var(--tile-h) * 0.9)' }} />
      )}

      <div
        onDragOver={handleDragOver}
        onDrop={handleDropDiscardZone}
        onClick={() => {
          if (selectedTile && isMyTurn && iHaveDrawn) handleDiscard();
        }}
        title="Ablegen"
        className={`flex items-center justify-center rounded-md transition ${
          isMyTurn && iHaveDrawn ? 'cursor-pointer animate-pulse' : ''
        }`}
        style={{
          width: 'calc(var(--tile-w) * 0.9)',
          height: 'calc(var(--tile-h) * 0.9)',
          background: 'var(--table-inset)',
          border: `2px dashed ${isMyTurn && iHaveDrawn ? '#ef4444' : 'var(--table-edge)'}`,
        }}
      >
        {myTopDiscard && <OkeyTile tile={myTopDiscard} scale={0.8} />}
      </div>
    </div>
  );

  // My own controls, sitting at MY edge of the table (bottom centre) rather
  // than in a row of their own - on a phone in landscape a separate row of
  // buttons is exactly the height the table needs to stay playable.
  const btnStyle = {
    padding: `${sp(6, 4)} ${sp(12, 7)}`,
    fontSize: fs(12, 9),
    gap: sp(4, 3),
  };
  const iconSize = { width: fs(14, 11), height: fs(14, 11) };

  const renderActions = () => (
    <div className="relative z-20 flex flex-col items-center" style={{ gap: sp(5, 3) }}>
      {gostermeEligible && (
        <button
          onClick={handleDeclareGosterme}
          className="rounded-xl font-bold shadow transition flex items-center justify-center animate-pulse whitespace-nowrap"
          style={{ ...btnStyle, background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
        >
          <Sparkles style={iconSize} />
          <span>Gösterme zeigen</span>
        </button>
      )}

      <div className="flex items-stretch" style={{ gap: sp(6, 4) }}>
        <button
          onClick={() => handleDiscard()}
          disabled={!isMyTurn || !iHaveDrawn || !selectedTile}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold rounded-xl shadow transition flex items-center justify-center whitespace-nowrap"
          style={btnStyle}
        >
          <ArrowDown style={iconSize} />
          <span>{selectedTile ? `${selectedTile.value} Abwerfen` : 'Abwerfen'}</span>
        </button>

        <button
          onClick={handleDeclareWin}
          disabled={!isMyTurn || !iHaveDrawn}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl shadow transition flex items-center justify-center whitespace-nowrap"
          style={btnStyle}
        >
          <Trophy className="text-amber-300" style={iconSize} />
          <span>Okey</span>
        </button>

        {/* Throw a reaction stone - a fixed set of calls, never free text */}
        <div className="relative">
          <button
            onClick={() => setReactionPickerOpen((o) => !o)}
            title="Stein werfen"
            className="h-full rounded-xl transition active:scale-95 flex items-center justify-center"
            style={{
              padding: `0 ${sp(9, 6)}`,
              background: 'var(--table-inset)',
              border: '1px solid var(--table-edge)',
            }}
          >
            <MessageCircle style={{ ...iconSize, color: 'var(--color-accent)' }} />
          </button>

          {reactionPickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setReactionPickerOpen(false)} />
              <div
                className="absolute bottom-full right-0 mb-2 z-50 flex gap-1.5 p-2 rounded-2xl shadow-2xl"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)' }}
              >
                {REACTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSendReaction(r.id)}
                    title={r.title}
                    className="transition active:scale-90 hover:-translate-y-0.5"
                  >
                    <ReactionTile reaction={r} size="sm" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ ...(vars as CSSProperties), gap: sp(6, 4) }}
    >
      {/* ---------- THE TABLE ---------- */}
      {/* A rectangular table like a real one: the player opposite across the
          top, the other two left and right, the pile and indicator in the
          middle, my own controls at my edge. Laid out as a 3x3 grid so the
          seats, the centre and the controls each own their band and can
          never overlap, however short the screen is. The table takes
          whatever height is left after the rack - it never pushes the page
          taller, so nothing can scroll out of view. */}
      <div
        className="grid flex-1 min-h-0 rounded-2xl shadow-xl overflow-hidden"
        style={{
          background: 'var(--table-felt)',
          border: '2px solid var(--table-edge)',
          padding: sp(6, 4),
          gap: sp(4, 3),
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
        }}
      >
        <div className="col-start-2 row-start-1 flex items-start justify-center">
          {renderOpponent(seats.top, 'top')}
        </div>

        <div className="col-start-1 row-start-2 flex items-center justify-start">
          {renderOpponent(seats.left, 'left')}
        </div>

        <div className="col-start-2 row-start-2 flex items-center justify-center">{renderCentre()}</div>

        <div className="col-start-3 row-start-2 flex items-center justify-end">
          {renderOpponent(seats.right, 'right')}
        </div>

        <div className="col-start-1 col-span-3 row-start-3 flex items-end justify-center">{renderActions()}</div>
      </div>

      {/* ---------- ISTAKA (the wooden rack) ---------- */}
      <div
        className="rounded-2xl shadow-2xl relative flex-shrink-0"
        style={{
          background: 'var(--rack-wood)',
          border: '2px solid var(--rack-wood-edge)',
          padding: sp(6, 4),
        }}
      >
        <div className="relative flex items-center justify-between" style={{ marginBottom: sp(4, 3) }}>
          {reactionFor(socket?.id || '') && (
            <span
              className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
              style={{ animation: `reaction-fade ${REACTION_VISIBLE_MS}ms ease-out forwards` }}
            >
              <ReactionTile reaction={reactionFor(socket?.id || '')!} size="sm" thrown />
            </span>
          )}
          <div className="flex items-center min-w-0" style={{ gap: sp(6, 4) }}>
            <span
              className="font-black uppercase tracking-wider leading-none"
              style={{ color: 'var(--color-accent)', fontSize: fs(13, 9) }}
            >
              Istaka ({hand.length})
            </span>
            {iHaveDrawn && isMyTurn && (
              <span
                className="bg-red-500 text-white font-bold rounded-full animate-pulse leading-none whitespace-nowrap"
                style={{ fontSize: fs(10, 8), padding: `${sp(3, 2)} ${sp(7, 5)}` }}
              >
                Abwerfen!
              </span>
            )}
            {/* My own clock - same countdown the others can see under my name */}
            {isMyTurn && turnDeadline && (
              <span className="flex items-center" style={{ gap: sp(5, 3), minWidth: sp(70, 48) }}>
                <span className="flex-1">{renderTurnBar()}</span>
                <span
                  className="font-bold tabular-nums leading-none"
                  style={{ fontSize: fs(11, 9), color: runningOut ? '#f87171' : 'var(--color-text)' }}
                >
                  {remainingSeconds}s
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center flex-shrink-0" style={{ gap: sp(5, 3) }}>
            {selectedSlotIndex !== null && (
              <div
                className="flex items-center rounded-lg"
                style={{ gap: sp(3, 2), padding: sp(2, 1), background: 'var(--table-inset)', border: '1px solid var(--rack-wood-edge)' }}
              >
                <button
                  onClick={moveSelectedLeft}
                  disabled={selectedSlotIndex === 0}
                  className="rounded font-bold transition flex items-center disabled:opacity-30"
                  style={{
                    padding: `${sp(3, 2)} ${sp(5, 3)}`,
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-contrast)',
                  }}
                  title="Nach links verschieben"
                >
                  <ChevronLeft style={iconSize} />
                </button>
                <button
                  onClick={moveSelectedRight}
                  disabled={selectedSlotIndex === TOTAL_SLOTS - 1}
                  className="rounded font-bold transition flex items-center disabled:opacity-30"
                  style={{
                    padding: `${sp(3, 2)} ${sp(5, 3)}`,
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-contrast)',
                  }}
                  title="Nach rechts verschieben"
                >
                  <ChevronRight style={iconSize} />
                </button>
              </div>
            )}

            <button
              onClick={sortByGroups}
              className="rounded-lg font-bold transition flex items-center shadow-sm whitespace-nowrap"
              style={{
                ...btnStyle,
                padding: `${sp(4, 3)} ${sp(8, 5)}`,
                background: 'var(--color-accent)',
                color: 'var(--color-accent-contrast)',
              }}
              title="Ordnet Reihen & Sätze automatisch zusammen"
            >
              <Wand2 style={iconSize} />
              <span>Auto</span>
            </button>
            <button
              onClick={sortByColor}
              className="rounded-lg font-bold transition flex items-center shadow-sm whitespace-nowrap"
              style={{
                ...btnStyle,
                padding: `${sp(4, 3)} ${sp(8, 5)}`,
                background: 'var(--table-inset)',
                color: 'var(--color-text)',
                border: '1px solid var(--rack-wood-edge)',
              }}
            >
              <Palette style={iconSize} />
              <span>Farbe</span>
            </button>
            <button
              onClick={sortByValue}
              className="rounded-lg font-bold transition flex items-center shadow-sm whitespace-nowrap"
              style={{
                ...btnStyle,
                padding: `${sp(4, 3)} ${sp(8, 5)}`,
                background: 'var(--table-inset)',
                color: 'var(--color-text)',
                border: '1px solid var(--rack-wood-edge)',
              }}
            >
              <Hash style={iconSize} />
              <span>Zahl</span>
            </button>
          </div>
        </div>

        {/* Two rows of 15. The tile unit is derived from this rack's own
            width and height budget, so all 30 slots always fit across -
            no horizontal scrolling, on any screen. */}
        <div className="flex flex-col items-center" style={{ gap: 'var(--tile-gap)' }}>
          <div className="flex items-center justify-center" style={{ gap: 'var(--tile-gap)' }}>
            {topRowSlots.map((tile, idx) => renderSlotTile(tile, idx))}
          </div>
          <div className="flex items-center justify-center" style={{ gap: 'var(--tile-gap)' }}>
            {bottomRowSlots.map((tile, idx) => renderSlotTile(tile, 15 + idx))}
          </div>
        </div>
      </div>
    </div>
  );
}
