import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSoundStore } from '../store/soundStore';
import { useUIStore } from '../store/uiStore';
import ThemeSwitcher from '../components/ThemeSwitcher';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  BookOpen,
  Users,
  MessageCircleQuestion,
  UserCog,
  LogOut,
  X,
  Copy,
  Check,
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
    title: 'Punkte',
    text: 'Mit Punktesystem starten alle bei 20 Punkten. Ein normaler Sieg kostet jedem Gegner 2 Punkte, ein Sieg mit 7 Paaren oder durch Abwerfen des Okey-Steins kostet 4 Punkte. Das Match endet, sobald jemand bei 0 oder darunter liegt - die zwei mit den meisten Punkten gewinnen dann das Match. Ohne Punktesystem spielt ihr einfach Runde für Runde, ohne Punkteverlust.',
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { enabled: soundEnabled, toggle: toggleSound } = useSoundStore();
  const showToast = useUIStore((s) => s.showToast);
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteFriends = async () => {
    const url = window.location.origin;
    const shareData = { title: 'Masa Oyunları', text: 'Spiel mit mir Okey & Tavla in Echtzeit!', url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled the share sheet or it's unsupported - fall through to copy
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
    const subject = encodeURIComponent('Masa Oyunları - Feedback');
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
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
    <div
      className="min-h-screen flex flex-col p-4 sm:p-6 font-sans"
      style={{
        color: 'var(--color-text)',
        background:
          'radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 55%), var(--color-bg)',
      }}
    >
      <header className="max-w-xl w-full mx-auto flex items-center gap-3 py-4 border-b border-[var(--color-border)]">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] transition"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--color-text-muted)]" />
        </button>
        <h1 className="text-lg font-black">Einstellungen</h1>
      </header>

      <main className="max-w-xl w-full mx-auto my-auto py-8 space-y-3">
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

        <div className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}>
          <span className="flex items-center gap-3">
            <span style={{ color: 'var(--color-accent)' }}>🎨</span>
            <span className="font-semibold text-sm">Design</span>
          </span>
          <ThemeSwitcher />
        </div>

        <Row
          icon={<BookOpen className="w-5 h-5" />}
          label="Spielregeln & Tutorial"
          sublabel="Okey-Regeln, Punktesystem, Joker"
          onClick={() => setShowRules(true)}
        />

        <Row
          icon={<UserCog className="w-5 h-5" />}
          label="Profile verwalten"
          sublabel="Namen, Farbe, Statistik"
          onClick={() => navigate('/profiles')}
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

        <Row
          icon={<LogOut className="w-5 h-5" />}
          label="Abmelden"
          sublabel={user?.email || undefined}
          onClick={() => logout()}
        />
      </main>

      {showRules && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowRules(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 space-y-5 shadow-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between sticky -top-6 pt-1 pb-2 -mx-6 px-6" style={{ background: 'var(--color-surface)' }}>
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
    </div>
  );
}
