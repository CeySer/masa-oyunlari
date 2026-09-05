import { useUIStore } from '../store/uiStore';

// Mounted once at the app root (see App.tsx). Renders every showToast()
// message as a small themed card instead of a native window.alert().
export default function ToastHost() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="pointer-events-auto rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl border cursor-pointer"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border-strong)',
            color: 'var(--color-text)',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
