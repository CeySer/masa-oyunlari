import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';

/**
 * Asks the player to turn the phone sideways while a game is running.
 *
 * The board itself fits in portrait too (it scales down rather than
 * overflowing), it's just cramped - so this is a nudge, never a wall: one
 * tap plays on anyway. It exists because we cannot actually force the
 * rotation: screen.orientation.lock() needs fullscreen and is unsupported on
 * iOS Safari entirely, so "we always start in landscape" is a wish on iPhone,
 * not a guarantee.
 */
export default function RotateHint() {
  const [portrait, setPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only nag on phone-sized screens - a portrait tablet or a desktop
    // window that happens to be tall has plenty of room.
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 820px)');
    const apply = () => setPortrait(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Turning the phone sideways and back should bring the hint back.
  useEffect(() => {
    if (!portrait) setDismissed(false);
  }, [portrait]);

  if (!portrait || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 p-8 text-center"
      style={{ background: 'color-mix(in srgb, var(--color-bg) 94%, black)' }}
    >
      <RotateCw className="w-14 h-14 animate-pulse" style={{ color: 'var(--color-accent)' }} />
      <div className="space-y-2">
        <h2 className="text-xl font-black">Bitte quer halten</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
          Im Querformat passt der ganze Tisch mit allen 15 Steinen auf den Bildschirm.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}
      >
        Trotzdem so weiterspielen
      </button>
    </div>
  );
}
