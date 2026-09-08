import { useEffect, useState } from 'react';

const SEEN_KEY = 'masa-splash-seen';

export default function Splash() {
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const hide = window.setTimeout(() => finish(), 2600);
    return () => window.clearTimeout(hide);
  }, [visible]);

  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    window.setTimeout(() => setVisible(false), 420);
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={finish}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% 42%, #16724a 0%, #0c4c2e 58%, #062616 100%)',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 420ms ease',
      }}
      title="Tippen zum Überspringen"
    >
      <img
        src="/icon-512.png"
        alt=""
        className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl shadow-2xl object-cover"
        style={{
          animation: 'masa-splash-in 900ms cubic-bezier(0.22, 1, 0.36, 1) both',
          boxShadow: '0 18px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(232,197,106,0.25)',
        }}
      />
      <img
        src="/logo.png"
        alt="Masa Oyunları"
        className="mt-8 w-[min(86vw,420px)] object-contain"
        style={{ animation: 'masa-splash-up 900ms 280ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      />
      <span
        className="mt-4 text-xs tracking-[0.28em] uppercase font-semibold"
        style={{
          color: '#e8c56a',
          animation: 'masa-splash-up 900ms 520ms cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        Der Familientisch
      </span>
    </button>
  );
}
