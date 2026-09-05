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
      <div
        className={`${compact ? 'w-8 h-8 text-sm rounded-lg' : 'w-9 h-9 text-sm rounded-xl'} flex items-center justify-center font-black text-white flex-shrink-0`}
        style={{ background: 'linear-gradient(145deg, var(--color-cta-from), var(--color-cta-to))' }}
      >
        M
      </div>
      <div className="min-w-0">
        <div className="font-black text-sm leading-tight truncate">Masa Oyunları</div>
        {subtitle && <div className="text-xs text-[var(--color-text-muted)] truncate">{subtitle}</div>}
      </div>
    </button>
  );
}
