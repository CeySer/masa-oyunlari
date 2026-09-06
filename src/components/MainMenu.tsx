import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useSoundStore } from '../store/soundStore';
import { useUIStore } from '../store/uiStore';
import ProfileEditDialog from './ProfileEditDialog';
import ThemeSwitcher from './ThemeSwitcher';
import { isFirebaseConfigured } from '../lib/firebase';
import {
  Volume2,
  VolumeX,
  BookOpen,
  Users,
  MessageCircleQuestion,
  Pencil,
  UserCog,
  LogOut,
  X,
  Copy,
  Check,
  Palette,
  DoorOpen,
  Tv,
} from 'lucide-react';

const SUPPORT_EMAIL = 'cu.oezdemir@gmail.com';

const OKEY_RULES = [
  {
    title: 'Ziel',
    text: 'Jeder Spieler bekommt 14 Steine (der Startspieler 15). Ziel ist es, als Erster 14 Steine zu einer gültigen Hand zu ordnen: Reihen und Sätze, oder 7 Paare.',
  },
  {
    title: 'Reihen & Sätze',
    text: 'Eine Reihe sind 3 oder mehr aufeinanderfolgende Steine derselben Farbe (z.B. Rot 5-6-7-8). Ein Satz sind 3 oder 4 Steine derselben Zahl in unterschiedlichen Farben. Die 1 gilt als niedrigster Stein oder als Verlängerung über die 13 hinaus (11-12-13-1), aber nicht beides gleichzeitig.',
  },
  {
    title: '7 Paare (Çift)',
    text: 'Alternativ gewinnst du mit 7 Paaren aus jeweils zwei identischen Steinen (gleiche Farbe und Zahl).',
  },
  {
    title: 'Okey (Joker)',
    text: 'Zu Beginn wird ein Anzeige-Stein (Gösterge) aufgedeckt. Die Steine mit der nächsthöheren Zahl in derselben Farbe sind der Okey-Stein und gelten als Joker - er ersetzt jeden beliebigen Stein. Die beiden "Sahte Okey"-Steine (ohne Zahl) sind ebenfalls immer Joker.',
  },
  {
    title: 'Ablauf',
    text: 'Reihum zieht jeder einen Stein (vom Stapel oder vom Ablagestapel des Vorgängers) und wirft danach einen ab. Sobald deine 14 verbleibenden Steine (nach dem Abwerfen) eine gültige Hand ergeben, kannst du "Okey Gewinnen" ausrufen.',
  },
  {
    title: 'Gösterme-Bonus',
    text: 'Hast du direkt beim Austeilen einen Stein bekommen, der identisch zum Anzeige-Stein ist, kannst du das vor deinem ersten Ziehen zeigen - jeder Gegner verliert dafür 1 Punkt.',
  },
  {
    title: 'Zug-Timer',
    text: 'Sobald mehrere Menschen am Tisch sitzen, läuft pro Zug eine Uhr - der Balken unter dem Namen zeigt sie an. Läuft sie ab, spielt der Computer diesen einen Zug. Wer die Verbindung verliert, behält seinen Platz: der Computer überbrückt nur, bis er wieder da ist.',
  },
  {
    title: 'Punkte',
    text: 'Mit Punktesystem starten alle bei 20 Punkten. Ein normaler Sieg kostet jedem Gegner 2 Punkte, ein Sieg mit 7 Paaren oder durch Abwerfen des Okey-Steins kostet 4 Punkte. Das Match endet, sobald jemand bei 0 oder darunter liegt - die zwei mit den meisten Punkten gewinnen dann das Match. Ohne Punktesystem spielt ihr einfach Runde für Runde, ohne Punkteverlust.',
  },
];

interface MainMenuProps {
  open: boolean;
  onClose: () => void;
  // Extra rows shown only while a game is in progress (Game.tsx passes
  // these) - kept optional so every other page can use the same menu
  // without knowing about them.
  onLeaveGame?: () => void;
  tvBoardOpen?: boolean;
  onToggleTvBoard?: () => void;
}

/**
 * The app's single menu, opened by the burger icon. Deliberately an overlay
 * on top of whatever page you're on rather than its own route: it never
 * navigates anywhere, so it can't drop you somewhere unexpected (like the
 * login screen) just for opening it.
 */
export default function MainMenu({ open, onClose, onLeaveGame, tvBoardOpen, onToggleTvBoard }: MainMenuProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { activeProfile } = useProfileStore();
  const { enabled: soundEnabled, toggle: toggleSound } = useSoundStore();
  const showToast = useUIStore((s) => s.showToast);
  const [showRules, setShowRules] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const inviteFriends = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Masa Oyunları', text: 'Spiel mit mir Okey!', url });
        return;
      }
    } catch {
      // share sheet cancelled or unsupported - fall through to copying
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Link kopiert - jetzt an Freunde weiterschicken!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(url);
    }
  };

  const openSupport = () => {
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Masa Oyunları - Feedback')}`;
  };

  const Row = ({
    icon,
    label,
    sublabel,
    onClick,
    right,
  }: {
    icon: ReactNode;
    label: string;
    sublabel?: string;
    onClick?: () => void;
    right?: ReactNode;
  }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-left transition disabled:cursor-default"
      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="flex-shrink-0" style={{ color: 'var(--color-accent)' }}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm">{label}</span>
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

        {onLeaveGame && (
          <Row
            icon={<DoorOpen className="w-5 h-5" />}
            label="Spiel Beenden"
            sublabel="Ein Bot übernimmt deinen Platz"
            onClick={onLeaveGame}
          />
        )}

        {onToggleTvBoard && (
          <Row
            icon={<Tv className="w-5 h-5" />}
            label="Öffentliches Spielfeld"
            sublabel={tvBoardOpen ? 'Wird angezeigt' : 'Wie auf dem TV-Bildschirm'}
            onClick={onToggleTvBoard}
          />
        )}

        {isFirebaseConfigured && activeProfile && (
          <Row
            icon={
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white"
                style={{ background: activeProfile.color }}
              >
                {activeProfile.name.slice(0, 1).toUpperCase()}
              </span>
            }
            label="Profil bearbeiten"
            sublabel={`${activeProfile.name} · ${activeProfile.elo} Elo`}
            onClick={() => setEditingProfile(true)}
            right={<Pencil className="w-4 h-4 text-[var(--color-text-muted)]" />}
          />
        )}

        {isFirebaseConfigured && (
          <Row
            icon={<UserCog className="w-5 h-5" />}
            label="Profil wechseln"
            sublabel="Anderes Familienmitglied"
            onClick={() => {
              onClose();
              navigate('/profiles', { state: { from: window.location.pathname } });
            }}
          />
        )}

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
          icon={<BookOpen className="w-5 h-5" />}
          label="Spielregeln & Tutorial"
          sublabel="Regeln, Joker, Punkte, Timer"
          onClick={() => setShowRules(true)}
        />

        <Row
          icon={<Users className="w-5 h-5" />}
          label="Freunde einladen"
          sublabel="Link zur App teilen"
          onClick={inviteFriends}
          right={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />}
        />

        <Row
          icon={<MessageCircleQuestion className="w-5 h-5" />}
          label="Feedback & Support"
          sublabel={SUPPORT_EMAIL}
          onClick={openSupport}
        />

        {isFirebaseConfigured && user && (
          <Row icon={<LogOut className="w-5 h-5" />} label="Abmelden" sublabel={user.email || undefined} onClick={() => logout()} />
        )}
      </aside>

      {editingProfile && activeProfile && (
        <ProfileEditDialog profile={activeProfile} onClose={() => setEditingProfile(false)} />
      )}

      {showRules && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowRules(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 space-y-5 shadow-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div
              className="flex items-center justify-between sticky -top-6 pt-1 pb-2 -mx-6 px-6"
              style={{ background: 'var(--color-surface)' }}
            >
              <h2 className="font-bold text-lg">Okey - Spielregeln</h2>
              <button onClick={() => setShowRules(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {OKEY_RULES.map((r) => (
              <div key={r.title}>
                <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--color-accent)' }}>
                  {r.title}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{r.text}</p>
              </div>
            ))}

            <p className="text-xs text-[var(--color-text-muted)] italic border-t border-[var(--color-border)] pt-4">
              Tavla ist gerade vorübergehend deaktiviert, während wir noch letzte Fehler beheben.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
