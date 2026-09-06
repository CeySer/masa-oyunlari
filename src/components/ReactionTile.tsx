import type { Reaction } from '../lib/reactions';

/**
 * A reaction drawn as an actual Okey stone - same ivory body, bevel and
 * gloss as OkeyTile, but carrying a symbol and a short call instead of a
 * number. Used both in the picker and for the tile that lands on the table.
 */
export default function ReactionTile({
  reaction,
  size = 'md',
  thrown = false,
}: {
  reaction: Reaction;
  size?: 'sm' | 'md';
  /** Adds the "just landed on the table" animation. */
  thrown?: boolean;
}) {
  const small = size === 'sm';

  return (
    <div
      className={`relative flex flex-col items-center justify-center border border-stone-300/80 select-none ${
        small ? 'w-11 h-14 rounded-lg' : 'w-14 h-18 rounded-xl'
      }`}
      style={{
        background: 'linear-gradient(160deg, #fffaf0 0%, #f5ecd7 55%, #e8dcc0 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -3px 4px rgba(120,100,60,0.25), 0 3px 6px rgba(0,0,0,0.35)',
        animation: thrown ? 'reaction-throw 420ms cubic-bezier(.2,1.4,.5,1)' : undefined,
      }}
    >
      {/* Same glossy top strip the game tiles have */}
      <div className="absolute top-0.5 left-1 right-1 h-1/3 rounded-t-md bg-white/50 blur-[1px] pointer-events-none" />
      <span className={`relative leading-none ${small ? 'text-lg' : 'text-2xl'}`}>{reaction.symbol}</span>
      <span
        className={`relative font-black leading-none mt-0.5 ${small ? 'text-[9px]' : 'text-[11px]'}`}
        style={{ color: reaction.color, textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
      >
        {reaction.label}
      </span>
    </div>
  );
}
