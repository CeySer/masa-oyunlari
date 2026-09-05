import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AuthForm from '../components/AuthForm';
import ThemeSwitcher from '../components/ThemeSwitcher';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col p-4 sm:p-6 font-sans">
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-[var(--color-border)]">
        <button
          onClick={() => navigate(from)}
          className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Zurück</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center font-black text-sm text-white">
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
