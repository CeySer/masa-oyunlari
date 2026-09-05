import { useNavigate, useLocation } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import ThemeSwitcher from '../components/ThemeSwitcher';

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
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col p-4 sm:p-6 font-sans">
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-[var(--color-border)]">
        {/* Not a link: there is no valid destination before signing in (see
            note above) - a clickable logo here would just bounce back to
            this same page, which is confusing, not a shortcut. */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white"
            style={{ background: 'linear-gradient(145deg, var(--color-cta-from), var(--color-cta-to))' }}
          >
            M
          </div>
          <span className="font-black text-sm">Masa Oyunları</span>
        </div>
        <ThemeSwitcher />
      </header>

      <main className="max-w-sm w-full mx-auto my-auto py-10">
        <div
          className="rounded-3xl border p-6 sm:p-7 shadow-2xl"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <AuthForm onSuccess={() => navigate(from)} />
        </div>
      </main>
    </div>
  );
}
