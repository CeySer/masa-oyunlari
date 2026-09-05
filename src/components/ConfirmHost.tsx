import { useUIStore } from '../store/uiStore';

// Mounted once at the app root (see App.tsx). Renders a showConfirm()
// request as a themed modal instead of a native window.confirm().
export default function ConfirmHost() {
  const confirmRequest = useUIStore((s) => s.confirmRequest);
  const resolveConfirm = useUIStore((s) => s.resolveConfirm);

  if (!confirmRequest) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={() => resolveConfirm(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl p-6 space-y-5 shadow-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--color-text)' }}>
          {confirmRequest.message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => resolveConfirm(false)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text)', background: 'var(--color-surface-2)' }}
          >
            Abbrechen
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition"
            style={
              confirmRequest.danger
                ? { background: '#ef4444', color: '#fff' }
                : { background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }
            }
          >
            {confirmRequest.confirmLabel || 'Bestätigen'}
          </button>
        </div>
      </div>
    </div>
  );
}
