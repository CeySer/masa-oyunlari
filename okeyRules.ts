/**
 * Okey rule engine - the single source of truth for "is this a winning hand".
 *
 * Kept in its own module (rather than inline in server.ts) so it can be
 * unit-tested without booting a server: see okeyRules.test.ts.
 *
 * Rules follow the standard Turkish Okey rules as documented on
 * pagat.com/rummy/okey.html:
 *  - A SET is 3 or 4 tiles of the same number in DIFFERENT colours
 *    (never more than 4 - there are only four colours).
 *  - A RUN is 3 OR MORE consecutive tiles of the same colour. There is no
 *    upper limit beyond "how many consecutive numbers exist".
 *  - The 1 counts either as the lowest tile (1-2-3) or as an extension
 *    above the 13 (11-12-13-1), but never as both in the same run.
 *  - A winning hand is exactly 14 tiles, every tile belonging to exactly one
 *    group. Because runs may be longer than 4, the group sizes can add up to
 *    14 in many ways (3+3+4+4, 3+3+3+5, 3+11, 5+9, ...).
 *  - Alternatively: "Çift" - seven pairs of two IDENTICAL tiles (same colour
 *    AND number).
 *  - The joker ("okey") is the tile one number above the indicator in the
 *    same colour (13 wraps to 1). The two unnumbered "sahte okey" tiles are
 *    always jokers too. A joker substitutes for any tile.
 */

export type OkeyTile = { id: number; color: string; value: number };
export type WinType = 'runset' | 'pairs';

export function isJokerTile(tile: OkeyTile, indicator: OkeyTile | null | undefined): boolean {
  if (tile.color === 'fake') return true;
  if (!indicator) return false;
  const jokerValue = (indicator.value % 13) + 1;
  return tile.color === indicator.color && tile.value === jokerValue;
}

/** All ways to choose `k` items from `items` (k is tiny here: at most 3). */
function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...tail] = items;
  return [...combinations(tail, k - 1).map(c => [head, ...c]), ...combinations(tail, k)];
}

/**
 * Can `tiles` (all non-jokers) plus `jokerCount` wildcards be split up so that
 * every single tile ends up in a valid run or set, with nothing left over?
 *
 * Works by anchoring on the first tile - since a winning hand uses every
 * tile, that tile must belong to *some* group, so it's enough to try every
 * group it could be part of and recurse on the rest.
 */
export function canFormGroups(tiles: OkeyTile[], jokerCount: number): boolean {
  if (tiles.length === 0) {
    // Only jokers left. They can stand in for any tiles at all, so three or
    // more of them are a group in their own right; one or two are stranded.
    return jokerCount === 0 || jokerCount >= 3;
  }
  if (tiles.length + jokerCount < 3) return false;

  const first = tiles[0];

  // --- Try every SET containing `first` -------------------------------
  // One tile per colour only: if the hand holds both copies of e.g. red 5,
  // the second copy cannot be part of the same set and has to find another
  // group. (Picking "the first N tiles with this value" would wrongly use
  // both copies - and refusing to build a set at all whenever a duplicate
  // exists would wrongly reject perfectly valid hands.)
  const otherColorTiles: OkeyTile[] = [];
  const seenColors = new Set<string>([first.color]);
  for (const t of tiles) {
    if (t.value === first.value && !seenColors.has(t.color)) {
      seenColors.add(t.color);
      otherColorTiles.push(t);
    }
  }

  const maxSetSize = Math.min(4, 1 + otherColorTiles.length + jokerCount);
  for (let size = maxSetSize; size >= 3; size--) {
    const maxRealPartners = Math.min(size - 1, otherColorTiles.length);
    const minRealPartners = Math.max(0, size - 1 - jokerCount);
    for (let realPartners = maxRealPartners; realPartners >= minRealPartners; realPartners--) {
      const jokersNeeded = size - 1 - realPartners;
      if (jokersNeeded > jokerCount) continue;
      // Which colours end up in the set matters for what's left over
      // afterwards (a black 5 kept back may be needed for a black run), so
      // every combination gets a try - there are at most three partners.
      for (const partners of combinations(otherColorTiles, realPartners)) {
        const used = new Set([first.id, ...partners.map(t => t.id)]);
        const remaining = tiles.filter(t => !used.has(t.id));
        if (canFormGroups(remaining, jokerCount - jokersNeeded)) return true;
      }
    }
  }

  // --- Try every RUN containing `first` -------------------------------
  // Run positions are 1-13, plus position 14 which only a "1" can fill (so
  // 11-12-13-1 works). A window is never allowed to contain both position 1
  // and position 14, which the size cap below already guarantees.
  const sameColor = tiles.filter(t => t.color === first.color);
  const matchAt = (pos: number, used: Set<number>) =>
    sameColor.find(t => t.value === (pos === 14 ? 1 : pos) && !used.has(t.id));

  const anchorPositions = first.value === 1 ? [1, 14] : [first.value];
  const maxRunSize = Math.min(13, tiles.length + jokerCount);

  for (const anchor of anchorPositions) {
    for (let size = 3; size <= maxRunSize; size++) {
      for (let start = anchor - size + 1; start <= anchor; start++) {
        const end = start + size - 1;
        if (start < 1 || end > 14) continue;

        let jokersNeeded = 0;
        const used = new Set<number>();
        for (let pos = start; pos <= end; pos++) {
          const match = matchAt(pos, used);
          if (match) used.add(match.id);
          else jokersNeeded++;
        }
        if (jokersNeeded > jokerCount) continue;
        // The anchor position must be covered by a real tile of `first`'s
        // colour+value (that's either `first` itself or its twin - they are
        // interchangeable), otherwise this "run" doesn't actually place the
        // tile we're anchoring on and the recursion would spin.
        if (!used.size) continue;
        const remaining = tiles.filter(t => !used.has(t.id));
        if (remaining.length === tiles.length) continue;
        if (canFormGroups(remaining, jokerCount - jokersNeeded)) return true;
      }
    }
  }

  return false;
}

/** Standard win: 14 tiles, all of them inside runs/sets. */
export function isValidRunSetHand(tiles: OkeyTile[], indicator: OkeyTile | null | undefined): boolean {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter(t => isJokerTile(t, indicator));
  const rest = tiles.filter(t => !isJokerTile(t, indicator));
  return canFormGroups(rest, jokers.length);
}

/** "Çift" win: seven pairs of two identical tiles; jokers fill any gap. */
export function isValidPairsHand(tiles: OkeyTile[], indicator: OkeyTile | null | undefined): boolean {
  if (tiles.length !== 14) return false;
  const jokers = tiles.filter(t => isJokerTile(t, indicator));
  const rest = tiles.filter(t => !isJokerTile(t, indicator));

  const counts = new Map<string, number>();
  rest.forEach(t => {
    const key = `${t.color}-${t.value}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let neededJokers = 0;
  for (const count of counts.values()) {
    // A real Okey set has only two copies of any tile, so a count is 1 or 2.
    // A single needs a joker as its partner; anything above 2 can't pair up.
    if (count === 1) neededJokers += 1;
    else if (count !== 2) return false;
  }
  return neededJokers <= jokers.length;
}

/** What a win is worth to the winner: every other player loses this many. */
export function winPoints(winType: WinType, jokerDiscardWin: boolean): number {
  return winType === 'pairs' || jokerDiscardWin ? 4 : 2;
}

/**
 * "Eşli Okey" (partnership Okey): partners are the players sitting OPPOSITE
 * each other, so around a four-seat table the teams are simply the even
 * seats against the odd ones.
 *
 * One consequence worth knowing while playing: the person before you - the
 * only one whose discard you may pick up - is an adjacent seat, so always an
 * opponent. In a partnership game a tile you throw away can therefore only
 * ever help the other pair, never your own partner.
 */
export function teamOfSeat(seat: number): 0 | 1 {
  return (((seat % 2) + 2) % 2) as 0 | 1;
}

/** Whether two seats are partners. Always false outside partnership mode. */
export function arePartners(seatA: number, seatB: number, teamMode: boolean): boolean {
  return teamMode && teamOfSeat(seatA) === teamOfSeat(seatB);
}

/**
 * Whether the player in `seat` is docked points when `winnerSeat` ends a hand.
 *
 * Solo Okey: everyone except the winner pays.
 * Eşli Okey: the winner's PARTNER is spared as well, so only the opposing
 * pair pays. Because both of them lose the same amount every time, their two
 * scores stay identical hand after hand - which is precisely what "the team
 * has X points left" means, and why nothing downstream (match end, final
 * standings) has to know about teams at all.
 */
export function paysForWin(winnerSeat: number, seat: number, teamMode: boolean): boolean {
  if (seat === winnerSeat) return false;
  return !arePartners(winnerSeat, seat, teamMode);
}

/**
 * Given a 15-tile hand, find a tile that can be discarded to leave a valid
 * 14-tile winning hand - and report which kind of win it is.
 *
 * When several discards would win, the one worth the most is chosen: seven
 * pairs and "went out by throwing the joker away" both cost the losers 4
 * instead of 2, and the player should never be silently given the cheaper
 * of two wins they actually had.
 */
export function findWinningDiscard(
  hand: OkeyTile[],
  indicator: OkeyTile | null | undefined
): { tile: OkeyTile; type: WinType } | null {
  let best: { tile: OkeyTile; type: WinType; points: number } | null = null;

  for (let i = 0; i < hand.length; i++) {
    const discard = hand[i];
    const remaining = [...hand.slice(0, i), ...hand.slice(i + 1)];
    const jokerDiscard = isJokerTile(discard, indicator);

    const options: WinType[] = [];
    if (isValidPairsHand(remaining, indicator)) options.push('pairs');
    if (isValidRunSetHand(remaining, indicator)) options.push('runset');

    for (const type of options) {
      const points = winPoints(type, jokerDiscard);
      if (!best || points > best.points) {
        best = { tile: discard, type, points };
      }
    }
  }

  return best ? { tile: best.tile, type: best.type } : null;
}
