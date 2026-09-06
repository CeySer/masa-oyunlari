import type { ReactNode } from 'react';
import { useSoundStore } from '../store/soundStore';
import ThemeSwitcher from './ThemeSwitcher';
import { Volume2, VolumeX, Palette, DoorOpen, X } from 'lucide-react';

interface InGameMenuProps {
  open: boolean;
  onClose: () => void;
  onLeaveGame: () => void;
}

/**
 * The menu opened from inside an active game - deliberately a SEPARATE,
 * much shorter component from MainMenu rather than that same menu with a
 * couple of extra rows bolted on. Mid-hand you want design, sound, and a
 * way out - not profile switching, rules, invite links or support buried
 * in the same list. Anything else people want here can be added later, but
 * on purpose starts minimal.
 */
export default function InGameMenu({ open, onClose, onLeaveGame }: InGameMenuProps) {
  const { enabled: soundEnabled, toggle: toggleSound } = useSoundStore();

  if (!open) return null;

  const Row = ({
    icon,
    label,
    sublabel,
    onClick,
    right,
    danger,
  }: {
    icon: ReactNode;
    label: string;
    sublabel?: string;
    onClick?: () => void;
    right?: ReactNode;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-left transition"
      style={{
        background: danger ? 'rgba(153, 27, 27, 0.25)' : 'var(--color-surface-2)',
        border: `1px solid ${danger ? 'rgba(185, 28, 28, 0.6)' : 'var(--color-border-strong)'}`,
      }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="flex-shrink-0" style={{ color: danger ? '#f87171' : 'var(--color-accent)' }}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm" style={{ color: danger ? '#fca5a5' : undefined }}>
            {label}
          </span>
          {sublabel && <span className="block text-xs text-[var(--color-text-muted)] truncate">{sublabel}</span>}
        </span>
      </span>
      {right}
    </button>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />

      {/* Slide-in panel */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm overflow-y-auto p-4 space-y-3 shadow-2xl"
        style={{ background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between pb-3 mb-1 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-black">Menü</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}
          >
            <X className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        </div>

        <div
          className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}
        >
          <span className="flex items-center gap-3">
            <Palette className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
            <span className="font-semibold text-sm">Design</span>
          </span>
          <ThemeSwitcher />
        </div>

        <Row
          icon={soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          label="Sound"
          sublabel={soundEnabled ? 'An' : 'Aus'}
          onClick={toggleSound}
          right={
            <span
              className="w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0"
              style={{ background: soundEnabled ? 'var(--color-accent)' : 'var(--color-surface-3)' }}
            >
              <span
                className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: soundEnabled ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </span>
          }
        />

        <Row
          icon={<DoorOpen className="w-5 h-5" />}
          label="Zurück zum Hauptmenü"
          sublabel="Spiel verlassen - ein Bot übernimmt deinen Platz"
          onClick={onLeaveGame}
          danger
        />
      </aside>
    </>
  );
}
