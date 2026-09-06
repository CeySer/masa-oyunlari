/**
 * Table reactions. Instead of generic emojis these are little Okey tiles you
 * throw onto the table - same ivory stone look as the real tiles, with the
 * short calls people actually make at an Okey table.
 *
 * The `id`s must stay in sync with ALLOWED_REACTIONS in server.ts, which is
 * what actually decides whether a reaction is accepted.
 */
export interface Reaction {
  id: string;
  symbol: string;
  label: string;
  /** Colour of the symbol on the stone - matches the four tile colours. */
  color: string;
  title: string;
}

export const REACTIONS: Reaction[] = [
  { id: 'okey', symbol: '★', label: 'Okey!', color: '#dc2626', title: 'Okey! - jubeln' },
  { id: 'bravo', symbol: '👏', label: 'Bravo!', color: '#1d4ed8', title: 'Bravo - gut gespielt' },
  { id: 'hadi', symbol: '⏳', label: 'Hadi!', color: '#ca8a04', title: 'Hadi! - mach hin' },
  { id: 'cay', symbol: '🫖', label: 'Çay?', color: '#171717', title: 'Çay? - Tee anbieten' },
  { id: 'aman', symbol: '😅', label: 'Aman!', color: '#dc2626', title: 'Aman! - oh je' },
];

export function findReaction(id: string): Reaction | undefined {
  return REACTIONS.find((r) => r.id === id);
}
