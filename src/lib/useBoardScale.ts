import { useEffect, useState, type RefObject } from 'react';

/**
 * Everything on the Okey board is sized off ONE measured unit: the width of
 * a single tile in the rack. That unit is derived from the space actually
 * available - never from fixed pixel sizes or breakpoints - so the whole
 * playing field fits on screen without scrolling, on a small phone held in
 * landscape just as much as on a TV, where it simply scales up instead.
 *
 * The unit is the smaller of two limits:
 *   - width:  15 tiles + gaps have to fit across the rack
 *   - height: two rack rows may only use part of the board's height, so the
 *             table above them keeps room for the seats and the centre
 * Taking the minimum means whichever dimension is tightest decides, which is
 * what makes "it always fits" true rather than hopeful.
 */

/** Tiles per rack row - an Okey istaka is 15 wide. */
const COLS = 15;
/** A real Okey stone is noticeably taller than it is wide. */
const TILE_RATIO = 1.38;
/** Share of the board's height the rack (2 rows + its own chrome) may take. */
const RACK_FRACTION = 0.46;
/** Of that share, how much is the tiles themselves vs. the rack's own chrome. */
const RACK_TILE_SHARE = 0.78;
/** Never smaller than legible, never so big a TV looks like a toy. */
const MIN_TILE_W = 13;
const MAX_TILE_W = 96;
/** Tile width that reads as "comfortable phone in landscape" - scale 1. */
const REFERENCE_TILE_W = 42;

/**
 * How big a rack ("Istaka") tile renders relative to the shared tile unit.
 * Deliberately smaller than 1: the Istaka only needs to be legible and
 * draggable, while the actual playing table (opponents, indicator, discard,
 * actions) is what a player is watching most of the time and reads as "the
 * game" - it should get the room. Because the table is `flex-1` and the
 * rack is `flex-shrink-0` (see OkeyBoard's root layout), rendering rack
 * tiles smaller directly frees up height for the table, without needing any
 * change to the byWidth/byHeight sizing above: those still budget for a
 * full-scale rack (a safety margin, not a target), so shrinking the rack's
 * own render size only ever gives back space, never risks an overflow.
 */
export const RACK_TILE_SCALE = 0.78;

export interface BoardScale {
  tileW: number;
  tileH: number;
  gap: number;
  /** 1 = reference size; <1 on tight screens, >1 on tablets/TVs. */
  scale: number;
  portrait: boolean;
  /** Spread onto the board root so every child can size itself off these. */
  vars: Record<string, string>;
}

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

function compute(width: number, height: number): BoardScale {
  const gap = clamp(2, Math.round(width * 0.005), 6);
  const padX = gap * 2;

  const byWidth = (width - padX * 2 - (COLS - 1) * gap) / COLS;
  const byHeight = (height * RACK_FRACTION * RACK_TILE_SHARE) / 2 / TILE_RATIO;

  const tileW = clamp(MIN_TILE_W, Math.floor(Math.min(byWidth, byHeight)), MAX_TILE_W);
  const tileH = Math.round(tileW * TILE_RATIO);

  return {
    tileW,
    tileH,
    gap,
    scale: tileW / REFERENCE_TILE_W,
    portrait: height > width,
    vars: {
      '--tile-w': `${tileW}px`,
      '--tile-h': `${tileH}px`,
      '--tile-gap': `${gap}px`,
      '--ui-scale': `${tileW / REFERENCE_TILE_W}`,
    },
  };
}

/**
 * Measures the given element (not the window) so the maths accounts for
 * whatever chrome sits above the board, and recomputes on rotation, split
 * screen, browser-bar collapse - anything a ResizeObserver sees.
 *
 * The element must get its size from its PARENT (e.g. flex-1 + min-h-0), not
 * from its children, otherwise sizing children off it would feed back into
 * the measurement and oscillate.
 */
export function useBoardScale(ref: RefObject<HTMLElement | null>): BoardScale {
  const [scale, setScale] = useState<BoardScale>(() =>
    compute(
      typeof window === 'undefined' ? 800 : window.innerWidth,
      typeof window === 'undefined' ? 400 : window.innerHeight
    )
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const next = compute(rect.width, rect.height);
      setScale((prev) =>
        prev.tileW === next.tileW && prev.gap === next.gap && prev.portrait === next.portrait ? prev : next
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Rotating a phone can settle the viewport a beat after the resize event.
    const onOrientation = () => setTimeout(measure, 250);
    window.addEventListener('orientationchange', onOrientation);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', onOrientation);
    };
  }, [ref]);

  return scale;
}
