import { X } from 'lucide-react';
import AuthForm from './AuthForm';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-sm rounded-3xl border p-6 sm:p-7 shadow-2xl relative"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg"
          style={{ color: 'var(--color-text-muted)' }}
          title="Schließen"
        >
          <X className="w-4 h-4" />
        </button>

        <AuthForm onSuccess={onSuccess} />
      </div>
    </div>
  );
}
