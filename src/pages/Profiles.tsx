import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useProfileStore, type PlayerProfile } from '../store/profileStore';
import { useUIStore } from '../store/uiStore';
import { Plus, Pencil, Trash2, LogOut } from 'lucide-react';
import ProfileEditDialog, { AVATAR_COLORS } from '../components/ProfileEditDialog';

export default function Profiles() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const { user, authReady, logout } = useAuthStore();
  const { profiles, profilesLoading, profilesError, loadProfiles, deleteProfile, selectProfile } = useProfileStore();
  const showConfirm = useUIStore((s) => s.showConfirm);

  // null = closed, 'new' = create, otherwise the profile being edited.
  const [dialog, setDialog] = useState<'new' | PlayerProfile | null>(null);

  useEffect(() => {
    if (authReady && !user) navigate('/login', { state: { from: '/profiles' } });
  }, [authReady, user, navigate]);

  useEffect(() => {
    if (user) loadProfiles();
  }, [user]);

  const openCreate = () => setDialog('new');

  const openEdit = (p: PlayerProfile, e: MouseEvent) => {
    e.stopPropagation();
    setDialog(p);
  };

  const handleDelete = async (p: PlayerProfile, e?: MouseEvent) => {
    e?.stopPropagation();
    const ok = await showConfirm(`"${p.name}" wirklich löschen? Die Statistik dieses Profils geht dabei verloren.`, {
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await deleteProfile(p.id);
    setDialog(null);
  };

  const handleSelect = (p: PlayerProfile) => {
    selectProfile(p);
    navigate(from);
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col p-4 sm:p-6 font-sans"
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
          <button
            onClick={() => logout()}
            title="Abmelden"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text)]"
          >
            <LogOut className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </button>
        </div>
      </header>

      {/* Starts directly under the header instead of floating in the middle
          of the screen, and always two per row so the tiles can be big
          enough to hit comfortably on a phone. */}
      <main className="max-w-md w-full mx-auto pt-6 pb-10">
        {profilesError && (
          <p className="text-center text-sm mb-4" style={{ color: 'var(--color-accent)' }}>
            {profilesError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-5 sm:gap-6">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="group relative flex flex-col items-center gap-2.5"
            >
              <div
                className="relative w-full aspect-square rounded-3xl flex items-center justify-center font-black text-5xl sm:text-6xl text-white transition-transform group-hover:scale-[1.03] group-active:scale-95"
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
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 transition hover:scale-110"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <Pencil className="w-4 h-4" />
                </span>
                <span
                  onClick={(e) => handleDelete(p, e)}
                  className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 transition hover:scale-110"
                  style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-bg)', color: '#ef4444' }}
                >
                  <Trash2 className="w-4 h-4" />
                </span>
              </div>
              <span className="font-semibold text-base truncate max-w-full">{p.name}</span>
              <span className="text-xs text-[var(--color-text-muted)] -mt-1.5">{p.elo} Elo</span>
            </button>
          ))}

          {profiles.length < 6 && (
            <button onClick={openCreate} className="group flex flex-col items-center gap-2.5">
              <div
                className="w-full aspect-square rounded-3xl flex items-center justify-center border-2 border-dashed transition-transform group-hover:scale-[1.03] group-active:scale-95"
                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-muted)' }}
              >
                <Plus className="w-12 h-12" />
              </div>
              <span className="font-semibold text-base" style={{ color: 'var(--color-text-muted)' }}>
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

      {dialog && (
        <ProfileEditDialog
          profile={dialog === 'new' ? undefined : dialog}
          defaultColor={AVATAR_COLORS[profiles.length % AVATAR_COLORS.length]}
          onClose={() => setDialog(null)}
          onDelete={dialog === 'new' ? undefined : () => handleDelete(dialog)}
        />
      )}

    </div>
  );
}
