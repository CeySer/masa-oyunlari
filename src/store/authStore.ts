import { create } from 'zustand';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../lib/firebase';

function translateAuthError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Diese E-Mail-Adresse wird bereits verwendet.';
    case 'auth/invalid-email':
      return 'Ungültige E-Mail-Adresse.';
    case 'auth/weak-password':
      return 'Das Passwort muss mindestens 6 Zeichen lang sein.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-Mail oder Passwort ist falsch.';
    case 'auth/too-many-requests':
      return 'Zu viele Versuche. Bitte warte einen Moment.';
    case 'auth/popup-closed-by-user':
      return 'Google-Anmeldung abgebrochen.';
    default:
      return 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';
  }
}

interface AuthState {
  user: User | null;
  authReady: boolean;
  authLoading: boolean;
  authError: string | null;
  authNotice: string | null;
  initAuth: () => void;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  clearAuthNotice: () => void;
  getIdToken: () => Promise<string | undefined>;
  resendVerificationEmail: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  // Without a configured Firebase project there is nothing to wait for.
  authReady: !isFirebaseConfigured,
  authLoading: false,
  authError: null,
  authNotice: null,

  initAuth: () => {
    if (!auth) return;
    onAuthStateChanged(auth, (user) => {
      set({ user, authReady: true });
    });
  },

  registerWithEmail: async (email, password, displayName) => {
    if (!auth) return false;
    set({ authLoading: true, authError: null });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Non-fatal - the account still works, just skip the notice.
      }
      set({
        user: auth.currentUser,
        authLoading: false,
        authNotice: 'Konto erstellt! Wir haben dir eine Bestätigungs-E-Mail geschickt.',
      });
      return true;
    } catch (err: any) {
      set({ authError: translateAuthError(err?.code), authLoading: false });
      return false;
    }
  },

  loginWithEmail: async (email, password) => {
    if (!auth) return false;
    set({ authLoading: true, authError: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      set({ authLoading: false });
      return true;
    } catch (err: any) {
      set({ authError: translateAuthError(err?.code), authLoading: false });
      return false;
    }
  },

  loginWithGoogle: async () => {
    if (!auth) return false;
    set({ authLoading: true, authError: null });
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      set({ authLoading: false });
      return true;
    } catch (err: any) {
      set({ authError: translateAuthError(err?.code), authLoading: false });
      return false;
    }
  },

  logout: async () => {
    if (!auth) return;
    await signOut(auth);
  },

  clearAuthError: () => set({ authError: null }),
  clearAuthNotice: () => set({ authNotice: null }),

  getIdToken: async () => {
    const user = get().user;
    if (!user) return undefined;
    return user.getIdToken();
  },

  resendVerificationEmail: async () => {
    const user = get().user;
    if (!user) return false;
    set({ authLoading: true, authError: null });
    try {
      await sendEmailVerification(user);
      set({ authLoading: false, authNotice: 'Bestätigungs-E-Mail erneut gesendet - bitte Posteingang (auch Spam) prüfen.' });
      return true;
    } catch (err: any) {
      set({ authError: translateAuthError(err?.code), authLoading: false });
      return false;
    }
  },

  sendPasswordReset: async (email) => {
    if (!auth) return false;
    set({ authLoading: true, authError: null });
    try {
      await sendPasswordResetEmail(auth, email);
      set({
        authLoading: false,
        authNotice: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts geschickt.',
      });
      return true;
    } catch (err: any) {
      // Don't leak whether the address exists - show the same generic notice
      // for auth/user-not-found as for success.
      if (err?.code === 'auth/user-not-found') {
        set({
          authLoading: false,
          authNotice: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts geschickt.',
        });
        return true;
      }
      set({ authError: translateAuthError(err?.code), authLoading: false });
      return false;
    }
  },
}));
