import { avatarOf } from '../lib/avatars';

export default function PlayerAvatar({
  avatar,
  color,
  size = 28,
  className = '',
}: {
  avatar?: string | null;
  color?: string;
  size?: number;
  className?: string;
}) {
  const a = avatarOf(avatar);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full flex-shrink-0 ${className}`}
      title={a.label}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(12, size * 0.55),
        background: color || 'rgba(8,30,18,0.85)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.35)',
        lineHeight: 1,
      }}
    >
      {a.emoji}
    </span>
  );
}
