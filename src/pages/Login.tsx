import { useNavigate, useLocation } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import { OkeyTile } from '../components/OkeyTile';

// Purely decorative Okey tiles scattered behind the login card - without
// them the login screen could be for any app at all; this makes it
// obvious at a glance what kind of game this is. Position/rotation/timing
// vary per tile so they don't all move in lockstep.
const DECORATIVE_TILES = [
  { color: 'red', value: 5, top: '8%', left: '10%', rot: -12, delay: '0s', size: 'sm' as const },
  { color: 'blue', value: 13, top: '15%', left: '82%', rot: 10, delay: '1.2s', size: 'md' as const },
  { color: 'black', value: 9, top: '68%', left: '6%', rot: 8, delay: '0.6s', size: 'md' as const },
  { color: 'yellow', value: 2, top: '78%', left: '88%', rot: -6, delay: '2s', size: 'sm' as const },
  { color: 'fake', value: 0, top: '40%', left: '4%', rot: -18, delay: '1.6s', size: 'sm' as const },
  { color: 'red', value: 11, top: '4%', left: '48%', rot: 14, delay: '0.9s', size: 'sm' as const },
];

// Login is the mandatory front door (see App.tsx/RequireAuth) - there is no
// valid "back" destination before signing in, since every other route just
// redirects back here. A "Zurück" button here used to point at that same
// dead end, so it's been removed rather than left looking broken. `from`
// (where RequireAuth redirected here from) is still used once login
// succeeds, to send the player onward to where they actually wanted to go.
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* Decorative Okey tiles - see DECORATIVE_TILES above */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {DECORATIVE_TILES.map((t, i) => (
          <div
            key={i}
            className="absolute animate-tile-drift opacity-20 sm:opacity-30"
            style={{ top: t.top, left: t.left, animationDelay: t.delay, ['--tile-rot' as string]: `${t.rot}deg` }}
          >
            <OkeyTile tile={{ color: t.color, value: t.value }} size={t.size} />
          </div>
        ))}
      </div>

      <header className="relative z-10 max-w-4xl w-full mx-auto flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
        {/* Not a link: there is no valid destination before signing in (see
            note above) - a clickable logo here would just bounce back to
            this same page, which is confusing, not a shortcut. */}
        <div className="flex items-center gap-2">
          <img src="/icon-mark.png" alt="" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-display text-lg font-bold" style={{ color: 'var(--color-accent)' }}>Masa Oyunları</span>
        </div>
      </header>

      {/* Centred by growing to fill what's left rather than by outer margins:
          the card then sits in the middle without the page ever becoming
          taller than the screen and scrolling. */}
      <main className="relative z-10 max-w-sm w-full mx-auto flex-1 flex items-center py-4">
        <div
          className="w-full rounded-3xl border p-5 sm:p-7 shadow-2xl"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <AuthForm onSuccess={() => navigate(from)} />
        </div>
      </main>
    </div>
  );
}
