import { useNavigate } from 'react-router-dom';

interface BrandLogoProps {
  subtitle?: string;
  compact?: boolean;
}

// The "M" mark, styled identically everywhere it appears (Home, Profiles,
// Lobby, Game, Login) and - except on Login, where there's genuinely no
// valid destination before signing in - clickable back to the main menu.
export default function BrandLogo({ subtitle, compact = false }: BrandLogoProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/')}
      title="Zum Hauptmenü"
      className="flex items-center gap-2 text-left min-w-0"
    >
      <img
        src="/icon-mark.png"
        alt=""
        className={`${compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl'} flex-shrink-0 object-cover`}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
      />
      <div className="min-w-0">
        <div className="font-display font-bold text-[15px] leading-tight truncate" style={{ color: 'var(--color-accent)' }}>Masa Oyunları</div>
        {subtitle && <div className="text-xs text-[var(--color-text-muted)] truncate">{subtitle}</div>}
      </div>
    </button>
  );
}
