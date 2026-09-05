import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useProfileStore, type PlayerProfile } from '../store/profileStore';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { Plus, Pencil, Trash2, LogOut, X } from 'lucide-react';

const AVATAR_COLORS = ['#d4a24e', '#2dd4bf', '#e07a2e', '#8b5cf6', '#ef4444', '#22c55e'];

export default function Profiles() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const { user, authReady, logout } = useAuthStore();
  const { profiles, profilesLoading, profilesError, loadProfiles, createProfile, updateProfile, deleteProfile, selectProfile } =
    useProfileStore();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(AVATAR_COLORS[0]);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authReady && !user) navigate('/login', { state: { from: '/profiles' } });
  }, [authReady, user, navigate]);

  useEffect(() => {
    if (user) loadProfiles();
  }, [user]);

  const openCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormColor(AVATAR_COLORS[profiles.length % AVATAR_COLORS.length]);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: PlayerProfile, e: MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setFormName(p.name);
    setFormColor(p.color);
    setFormError('');
    setShowForm(true);
  };

  const submitForm = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Bitte einen Namen eingeben.');
      return;
    }
    setBusy(true);
    const res = editingId
      ? await updateProfile(editingId, { name: trimmed, color: formColor })
      : await createProfile(trimmed, formColor);
    setBusy(false);
    if (res.success) {
      setShowForm(false);
    } else {
      setFormError(res.error || 'Das hat leider nicht geklappt.');
    }
  };

  const handleDelete = async (p: PlayerProfile, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${p.name}" wirklich löschen? Die Statistik dieses Profils geht dabei verloren.`)) return;
    await deleteProfile(p.id);
  };

  const handleSelect = (p: PlayerProfile) => {
    selectProfile(p);
    navigate(from);
  };

  return (
    <div
      className="min-h-screen flex flex-col p-4 sm:p-6 font-sans"
      style={{
        color: 'var(--color-text)',
        background:
          'radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 55%), var(--color-bg)',
      }}
    >
      <header className="max-w-2xl w-full mx-auto flex items-center justify-between py-4 border-b border-[var(--color-border)]">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-left">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white"
            style={{ background: 'linear-gradient(145deg, var(--color-cta-from), var(--color-cta-to))' }}
          >
            M
          </div>
          <div>
            <div className="font-black text-sm leading-tight">Wer spielt mit?</div>
            <div className="text-xs text-[var(--color-text-muted)] max-w-[14rem] truncate">{user?.email}</div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <button
            onClick={() => logout()}
            title="Abmelden"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]"
          >
            <LogOut className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl w-full mx-auto my-auto py-10">
        {profilesError && (
          <p className="text-center text-sm mb-4" style={{ color: 'var(--color-accent)' }}>
            {profilesError}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-5 sm:gap-6">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="group relative flex flex-col items-center gap-2 w-24 sm:w-28"
            >
              <div
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl text-white transition-transform group-hover:scale-105 group-active:scale-95"
                style={{
                  background: `linear-gradient(145deg, ${p.color}, color-mix(in srgb, ${p.color} 60%, black))`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 24px -10px rgba(0,0,0,0.5)',
                }}
              >
                {p.name.slice(0, 1).toUpperCase()}
                {/* Always visible (not hover-gated) - hover doesn't fire on
                    touch devices, which would otherwise hide these entirely
                    on phones/tablets and make edit/delete undiscoverable. */}
                <span
                  onClick={(e) => openEdit(p, e)}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition hover:scale-110"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <Pencil className="w-3 h-3" />
                </span>
                <span
                  onClick={(e) => handleDelete(p, e)}
                  className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition hover:scale-110"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-bg)', color: '#ef4444' }}
                >
                  <Trash2 className="w-3 h-3" />
                </span>
              </div>
              <span className="font-semibold text-sm truncate max-w-full">{p.name}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{p.elo} Elo</span>
            </button>
          ))}

          {profiles.length < 6 && (
            <button onClick={openCreate} className="group flex flex-col items-center gap-2 w-24 sm:w-28">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center border-2 border-dashed transition-colors group-hover:scale-105"
                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}
              >
                <Plus className="w-8 h-8" />
              </div>
              <span className="font-semibold text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Neues Profil
              </span>
            </button>
          )}

          {profiles.length === 0 && !profilesLoading && (
            <p className="w-full text-center text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
              Leg dein erstes Spielerprofil an, um loszulegen.
            </p>
          )}
        </div>
      </main>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowForm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{editingId ? 'Profil bearbeiten' : 'Neues Profil'}</h2>
              <button onClick={() => setShowForm(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={24}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-text)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition"
                placeholder="z.B. Ahmet"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Farbe</label>
              <div className="flex gap-2.5">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className="w-8 h-8 rounded-full transition-transform"
                    style={{
                      background: c,
                      transform: formColor === c ? 'scale(1.2)' : 'scale(1)',
                      boxShadow: formColor === c ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            {formError && (
              <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
                {formError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              {editingId && (
                <button
                  onClick={(e) => {
                    const p = profiles.find((pr) => pr.id === editingId);
                    if (p) handleDelete(p, e as any);
                    setShowForm(false);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition"
                  style={{ borderColor: 'var(--color-border-strong)', color: '#ef4444' }}
                >
                  Löschen
                </button>
              )}
              <button
                onClick={submitForm}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-60"
                style={{ background: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
              >
                {editingId ? 'Speichern' : 'Profil anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
