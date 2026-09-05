/**
 * Shared visual for a single Okey tile ("taş"): an ivory/bone-colored stone
 * with a printed, colored number - matching the classic four Okey colors
 * (red, black, blue, yellow) instead of a flat colored chip.
 */

export interface OkeyTileData {
  id?: number;
  color: string;
  value: number;
}

const NUMERAL_COLOR: Record<string, string> = {
  red: 'text-red-600',
  black: 'text-neutral-900',
  blue: 'text-blue-700',
  yellow: 'text-yellow-600',
  fake: 'text-red-600',
};

export function tileNumeralColorClass(color: string): string {
  return NUMERAL_COLOR[color] || 'text-neutral-900';
}

type TileSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<TileSize, string> = {
  xs: 'w-6 h-9 sm:w-7 sm:h-10 rounded-md',
  sm: 'w-8 h-11 sm:w-9 sm:h-12 rounded-lg',
  md: 'w-7 h-12 sm:w-9 sm:h-15 md:w-11 md:h-18 rounded-lg sm:rounded-xl',
  lg: 'w-20 h-28 sm:w-24 sm:h-32 rounded-2xl border-2',
};

const NUMERAL_SIZE_CLASSES: Record<TileSize, string> = {
  xs: 'text-xs sm:text-sm',
  sm: 'text-sm sm:text-base',
  md: 'text-sm sm:text-base md:text-xl',
  lg: 'text-3xl sm:text-4xl',
};

interface OkeyTileProps {
  tile: OkeyTileData;
  size?: TileSize;
  selected?: boolean;
  dimmed?: boolean;
  className?: string;
}

// The tile "stone" face: cream/ivory gradient body with a beveled, slightly
// glossy look (like real bone/melamine Okey tiles) and an engraved-style
// colored numeral - the color lives in the numeral, not the tile body.
export function OkeyTile({ tile, size = 'md', selected, dimmed, className = '' }: OkeyTileProps) {
  const isJoker = tile.color === 'fake';

  return (
    <div
      className={`relative flex flex-col items-center justify-center border ${SIZE_CLASSES[size]} ${
        selected
          ? 'border-red-500 ring-2 sm:ring-4 ring-red-500/70 -translate-y-1.5 shadow-xl scale-105'
          : 'border-stone-300/80 shadow-md'
      } ${dimmed ? 'opacity-60' : ''} ${className}`}
      style={{
        background: 'linear-gradient(160deg, #fffaf0 0%, #f5ecd7 55%, #e8dcc0 100%)',
        boxShadow: selected
          ? undefined
          : 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -3px 4px rgba(120,100,60,0.25), 0 2px 3px rgba(0,0,0,0.25)',
      }}
    >
      {/* Top glossy highlight strip, like a rounded bone/melamine surface */}
      <div className="absolute top-0.5 left-1 right-1 h-1/3 rounded-t-md bg-white/50 blur-[1px] pointer-events-none" />

      <span
        className={`relative font-black tracking-tight leading-none drop-shadow-sm ${NUMERAL_SIZE_CLASSES[size]} ${tileNumeralColorClass(
          tile.color
        )}`}
        style={{ textShadow: '0 1px 0 rgba(255,255,255,0.6), 0 -1px 0 rgba(0,0,0,0.15)' }}
      >
        {isJoker ? '★' : tile.value}
      </span>
    </div>
  );
}

interface EmptyTileSlotProps {
  index: number;
  size?: TileSize;
  className?: string;
}

export function EmptyOkeyTileSlot({ index, size = 'md', className = '' }: EmptyTileSlotProps) {
  return (
    <div
      className={`flex items-center justify-center border border-dashed border-amber-900/40 bg-amber-950/30 hover:border-amber-700/60 ${SIZE_CLASSES[size]} ${className}`}
    >
      <span className="text-[8px] text-amber-900/50 font-mono">{index + 1}</span>
    </div>
  );
}
