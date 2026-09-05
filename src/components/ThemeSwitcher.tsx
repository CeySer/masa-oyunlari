import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from '../lib/theme';

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>('coffeehouse');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const choose = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition"
        style={{
          background: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
        title="Design wechseln"
      >
        <Palette className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
        <span className="hidden sm:inline">Design</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-48 rounded-xl border shadow-2xl z-50 overflow-hidden"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => choose(t.id)}
                className="w-full text-left px-3.5 py-2.5 text-sm transition flex flex-col gap-0.5"
                style={{
                  background: theme === t.id ? 'var(--color-surface-2)' : 'transparent',
                  color: 'var(--color-text)',
                }}
              >
                <span className="font-semibold flex items-center gap-1.5">
                  {t.label}
                  {theme === t.id && <span style={{ color: 'var(--color-accent)' }}>●</span>}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t.description}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
