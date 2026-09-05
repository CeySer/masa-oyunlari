import { create } from 'zustand';

// Themed replacements for window.alert()/window.confirm(). Native browser
// dialogs are synchronous and block the whole JS thread until dismissed -
// which (among looking out of place) can pause socket.io's heartbeat long
// enough to cause a disconnect. These are plain React state instead, so
// they render in the app's own dark/light theme and never block anything.

interface ToastItem {
  id: number;
  message: string;
}

interface ConfirmRequest {
  id: number;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UIState {
  toasts: ToastItem[];
  confirmRequest: ConfirmRequest | null;
  showToast: (message: string) => void;
  dismissToast: (id: number) => void;
  showConfirm: (message: string, options?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
}

let nextId = 1;

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  confirmRequest: null,

  showToast: (message: string) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast: (id: number) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  showConfirm: (message, options) => {
    return new Promise<boolean>((resolve) => {
      const id = nextId++;
      set({ confirmRequest: { id, message, confirmLabel: options?.confirmLabel, danger: options?.danger, resolve } });
    });
  },

  resolveConfirm: (ok: boolean) => {
    const req = get().confirmRequest;
    set({ confirmRequest: null });
    if (req) req.resolve(ok);
  },
}));
