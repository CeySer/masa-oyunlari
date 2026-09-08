import { useState } from 'react';
import { useProfileStore, type PlayerProfile } from '../store/profileStore';
import { AVATARS } from '../lib/avatars';
import PlayerAvatar from './PlayerAvatar';
import { X } from 'lucide-react';

export const AVATAR_COLORS = ['#d4a24e', '#2dd4bf', '#e07a2e', '#8b5cf6', '#ef4444', '#22c55e'];

interface ProfileEditDialogProps {
  /** Leave undefined to create a new profile instead of editing one. */
  profile?: PlayerProfile;
  /** Suggested color for a new profile (so fresh profiles don't all match). */
  defaultColor?: string;
  onClose: () => void;
  /** Only rendered when provided - the menu doesn't offer deleting. */
  onDelete?: () => void;
}

// Shared by the profile picker page and the main menu, so "edit my profile"
// looks and behaves the same wherever it's opened from.
export default function ProfileEditDialog({ profile, defaultColor, onClose, onDelete }: ProfileEditDialogProps) {
  const { createProfile, updateProfile } = useProfileStore();
  const [name, setName] = useState(profile?.name || '');
  const [color, setColor] = useState(profile?.color || defaultColor || AVATAR_COLORS[0]);
  const [avatar, setAvatar] = useState(profile?.avatar || AVATARS[0].id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    setBusy(true);
    const res = profile
      ? await updateProfile(profile.id, { name: trimmed, color, avatar })
      : await createProfile(trimmed, color, avatar);
    setBusy(false);
    if (res.success) onClose();
    else setError(res.error || 'Das hat leider nicht geklappt.');
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{profile ? 'Profil bearbeiten' : 'Neues Profil'}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition"
            placeholder="z.B. Ahmet"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Bild</label>
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAvatar(a.id)}
                title={a.label}
                className="rounded-full flex items-center justify-center"
                style={{
                  boxShadow: avatar === a.id ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}` : 'none',
                }}
              >
                <PlayerAvatar avatar={a.id} color={color} size={36} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Farbe</label>
          <div className="flex gap-2.5">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform"
                style={{
                  background: c,
                  transform: color === c ? 'scale(1.2)' : 'scale(1)',
                  boxShadow: color === c ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c}` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition"
              style={{ borderColor: 'var(--color-border-strong)', color: '#ef4444' }}
            >
              Löschen
            </button>
          )}
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-60"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
          >
            {profile ? 'Speichern' : 'Profil anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
