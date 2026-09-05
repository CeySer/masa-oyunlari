import { useState, type FormEvent } from 'react';
import { Mail, Lock, User as UserIcon, LogIn, UserPlus, KeyRound } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { isFirebaseConfigured } from '../lib/firebase';

interface AuthFormProps {
  onSuccess: () => void;
}

// The actual login/register/reset-password form, with no surrounding chrome
// (no overlay, no close/back button) - used both inside the AuthModal popup
// and on the standalone /login page.
export default function AuthForm({ onSuccess }: AuthFormProps) {
  const {
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    sendPasswordReset,
    authLoading,
    authError,
    authNotice,
    clearAuthError,
    clearAuthNotice,
  } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const switchMode = (next: 'login' | 'register' | 'reset') => {
    clearAuthError();
    clearAuthNotice();
    setMode(next);
  };

  if (!isFirebaseConfigured) {
    return (
      <p className="text-sm text-center" style={{ color: 'var(--color-text)' }}>
        Online-Konten sind auf diesem Server noch nicht eingerichtet.
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'reset') {
      await sendPasswordReset(email);
      return;
    }
    const ok =
      mode === 'register'
        ? await registerWithEmail(email, password, displayName)
        : await loginWithEmail(email, password);
    if (ok) onSuccess();
  };

  const google = async () => {
    const ok = await loginWithGoogle();
    if (ok) onSuccess();
  };

  return (
    <>
      <h2 className="text-lg font-black mb-1" style={{ color: 'var(--color-text)' }}>
        {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Passwort zurücksetzen'}
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
        {mode === 'reset'
          ? 'Gib deine E-Mail-Adresse ein - wir schicken dir einen Link zum Zurücksetzen.'
          : 'Melde dich an, um deine Spielerprofile zu verwalten und loszulegen.'}
      </p>

      {mode !== 'reset' && (
        <>
          <button
            type="button"
            onClick={google}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border mb-4 transition disabled:opacity-60"
            style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l6-6C34.6 5.1 29.6 3 24 3 15.9 3 8.9 7.6 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 45c5.4 0 10.3-1.9 14-5.4l-6.5-5.4C29.5 36 26.9 37 24 37c-5.4 0-9.9-3.4-11.5-8.2l-6.6 5.1C8.9 40.4 15.9 45 24 45z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 3-3.2 5.5-6 7.1l6.5 5.4C39.5 37.6 43 31.4 43 24c0-1.2-.1-2.4-.4-3.5z" />
            </svg>
            Mit Google anmelden
          </button>

          <div className="relative py-1 mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--color-border)' }}></div>
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="px-2 uppercase tracking-widest font-semibold" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                oder mit E-Mail
              </span>
            </div>
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <div className="relative">
            <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Anzeigename"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}
            />
          </div>
        )}
        <div className="relative">
          <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2"
            style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}
          />
        </div>
        {mode !== 'reset' && (
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}
            />
          </div>
        )}

        {mode === 'login' && (
          <button
            type="button"
            onClick={() => switchMode('reset')}
            className="text-xs font-semibold -mt-1"
            style={{ color: 'var(--color-accent)' }}
          >
            Passwort vergessen?
          </button>
        )}

        {authError && <p className="text-xs text-red-400">{authError}</p>}
        {authNotice && <p className="text-xs" style={{ color: 'var(--color-accent)' }}>{authNotice}</p>}

        <button
          type="submit"
          disabled={authLoading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition disabled:opacity-60"
          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
        >
          {mode === 'login' && <LogIn className="w-4 h-4" />}
          {mode === 'register' && <UserPlus className="w-4 h-4" />}
          {mode === 'reset' && <KeyRound className="w-4 h-4" />}
          {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Link zum Zurücksetzen senden'}
        </button>
      </form>

      {mode === 'reset' ? (
        <button
          onClick={() => switchMode('login')}
          className="w-full text-center text-xs mt-4 font-semibold"
          style={{ color: 'var(--color-accent)' }}
        >
          Zurück zur Anmeldung
        </button>
      ) : (
        <button
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          className="w-full text-center text-xs mt-4 font-semibold"
          style={{ color: 'var(--color-accent)' }}
        >
          {mode === 'login' ? 'Noch kein Konto? Jetzt registrieren' : 'Schon ein Konto? Jetzt anmelden'}
        </button>
      )}
    </>
  );
}
