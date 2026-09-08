import { Bot, WifiOff } from 'lucide-react';
import { OkeyTile } from './OkeyTile';
import PlayerAvatar from './PlayerAvatar';

type Seat = 'bottom' | 'right' | 'top' | 'left';

const SEATS: Seat[] = ['bottom', 'right', 'top', 'left'];

function FaceDown({ n, vertical }: { n: number; vertical?: boolean }) {
  const shown = Math.min(Math.max(n, 0), 14);
  return (
    <div className={`flex justify-center gap-[2px] ${vertical ? 'flex-col items-center' : 'items-end'}`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className="block rounded-sm border border-black/30"
          style={{
            width: vertical ? 20 : 14,
            height: vertical ? 14 : 20,
            background: 'linear-gradient(160deg, #8a5a2b 0%, #6b4118 55%, #4a2c0f 100%)',
            boxShadow: '0 1px 1px rgba(0,0,0,0.35)',
          }}
        />
      ))}
    </div>
  );
}

function Rack({
  player,
  isTurn,
  remainingFraction,
  vertical,
}: {
  player: any;
  isTurn: boolean;
  remainingFraction: number;
  vertical?: boolean;
}) {
  const wood = {
    background: 'linear-gradient(180deg, #8b5a2b 0%, #6d4520 55%, #543616 100%)',
    border: isTurn ? '2px solid #e8c56a' : '2px solid #422a11',
    boxShadow: isTurn ? '0 0 0 3px rgba(232,197,106,0.35)' : '0 4px 10px rgba(0,0,0,0.35)',
  } as const;

  if (!player) {
    return (
      <div className="flex items-center justify-center rounded-sm px-3 py-2" style={{ ...wood, minWidth: vertical ? 52 : 180, minHeight: vertical ? 180 : 44 }}>
        <span className="text-[10px] font-semibold text-amber-100/50 uppercase tracking-widest">leer</span>
      </div>
    );
  }

  const count = typeof player.handCount === 'number' ? player.handCount : 0;

  return (
    <div
      className={`flex items-center gap-1 rounded-sm ${vertical ? 'flex-col px-1.5 py-3' : 'flex-col px-3 py-1.5'}`}
      style={{ ...wood, minWidth: vertical ? 56 : 220 }}
    >
      <div className="flex items-center gap-1.5 max-w-full">
        <PlayerAvatar avatar={player.avatar} color={player.color} size={22} />
        {player.isBot && <Bot className="w-3.5 h-3.5 text-amber-200 flex-shrink-0" />}
        {player.away && <WifiOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
        <span className={`text-xs font-bold truncate ${isTurn ? 'text-amber-100' : 'text-amber-50/75'}`}>{player.name}</span>
        <span className="text-[10px] text-amber-200/70">{count}</span>
      </div>
      {isTurn && (
        <span className="block w-full h-1 rounded-full overflow-hidden bg-black/30">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${remainingFraction * 100}%`,
              background: remainingFraction < 0.25 ? '#ef4444' : '#e8c56a',
              transition: 'width 200ms linear',
            }}
          />
        </span>
      )}
      <FaceDown n={count} vertical={vertical} />
    </div>
  );
}

export default function TVOkeyTable({
  lobby,
  publicGameState,
  remainingFraction,
}: {
  lobby: any;
  publicGameState: any;
  remainingFraction: number;
}) {
  const pileBack = 'linear-gradient(160deg, #8a5a2b 0%, #6b4118 55%, #4a2c0f 100%)';

  const seats = SEATS.map((seat, i) => {
    const p = lobby.players[i];
    return {
      seat,
      player: p
        ? { ...p, handCount: publicGameState.handCounts?.[p.id] }
        : null,
      discard: p ? (publicGameState.discardPiles?.[p.id] || []).at(-1) : null,
      isTurn: Boolean(p) && i === publicGameState.turnIndex,
    };
  });

  const bySeat = (s: Seat) => seats.find((x) => x.seat === s)!;

  const discardOf = (s: Seat) => {
    const d = bySeat(s).discard;
    if (!d) return <span className="w-8 h-11" />;
    return <OkeyTile tile={d} size="md" />;
  };

  return (
    <div
      className="w-full h-full max-w-6xl max-h-full rounded-sm p-3 flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #7a4e26 0%, #5c3b1a 55%, #402910 100%)',
        boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.14), inset -2px -2px 0 rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="flex-1 min-h-0 grid rounded-sm overflow-hidden"
        style={{
          background: 'var(--table-felt)',
          gridTemplateColumns: 'auto minmax(0,1fr) auto',
          gridTemplateRows: 'auto minmax(0,1fr) auto',
          padding: 12,
          gap: 8,
        }}
      >
        <div className="col-start-2 row-start-1 flex flex-col items-center gap-2">
          <Rack player={bySeat('top').player} isTurn={bySeat('top').isTurn} remainingFraction={remainingFraction} />
          {discardOf('top')}
        </div>

        <div className="col-start-1 row-start-2 flex flex-row items-center gap-2">
          <Rack player={bySeat('left').player} isTurn={bySeat('left').isTurn} remainingFraction={remainingFraction} vertical />
          {discardOf('left')}
        </div>

        <div className="col-start-2 row-start-2 flex items-center justify-center gap-8">
          <button type="button" className="relative" style={{ width: 56, height: 78 }} tabIndex={-1}>
            <span className="absolute inset-0" style={{ transform: 'translate(4px,4px)', background: pileBack, borderRadius: 8, border: '1px solid rgba(0,0,0,0.35)' }} />
            <span className="absolute inset-0" style={{ transform: 'translate(2px,2px)', background: pileBack, borderRadius: 8, border: '1px solid rgba(0,0,0,0.35)' }} />
            <span
              className="relative flex items-center justify-center w-full h-full font-black text-amber-100 text-xl"
              style={{
                background: pileBack,
                borderRadius: 8,
                border: '2px solid rgba(0,0,0,0.4)',
                boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
              }}
            >
              {publicGameState.pileCount}
            </span>
          </button>
          {publicGameState.indicator && <OkeyTile tile={publicGameState.indicator} size="lg" />}
        </div>

        <div className="col-start-3 row-start-2 flex flex-row-reverse items-center gap-2">
          <Rack player={bySeat('right').player} isTurn={bySeat('right').isTurn} remainingFraction={remainingFraction} vertical />
          {discardOf('right')}
        </div>

        <div className="col-start-2 row-start-3 flex flex-col-reverse items-center gap-2">
          <Rack player={bySeat('bottom').player} isTurn={bySeat('bottom').isTurn} remainingFraction={remainingFraction} />
          {discardOf('bottom')}
        </div>
      </div>
    </div>
  );
}
