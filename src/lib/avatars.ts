export const AVATARS = [
  { id: 'cay', label: 'Çay', emoji: '🍵' },
  { id: 'okey', label: 'Okey', emoji: '🀄' },
  { id: 'lale', label: 'Tulpe', emoji: '🌷' },
  { id: 'kedi', label: 'Katze', emoji: '🐱' },
  { id: 'balik', label: 'Fisch', emoji: '🐟' },
  { id: 'gunes', label: 'Sonne', emoji: '☀️' },
  { id: 'ay', label: 'Mond', emoji: '🌙' },
  { id: 'uzum', label: 'Traube', emoji: '🍇' },
  { id: 'fener', label: 'Lampe', emoji: '🏮' },
  { id: 'zar', label: 'Würfel', emoji: '🎲' },
  { id: 'kus', label: 'Vogel', emoji: '🐦' },
  { id: 'tac', label: 'Krone', emoji: '👑' },
] as const;

export type AvatarId = (typeof AVATARS)[number]['id'];

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && AVATARS.some((a) => a.id === value);
}

export function avatarOf(id?: string | null) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}
