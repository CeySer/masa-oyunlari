import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// These values are all public/client-safe (they identify the Firebase project,
// they are not secrets) and come from the Firebase Console:
// Project settings -> General -> Your apps -> Web app -> SDK setup and configuration.
//
// Fill them in via .env.local (dev) / .env.production (prod) as VITE_FIREBASE_*.
// If VITE_FIREBASE_API_KEY is missing, auth features are disabled gracefully
// (see authStore.ts) so the app still runs without a Firebase project configured.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'masa-oyunlari-3297c.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'masa-oyunlari-3297c',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

export const firebaseApp = isFirebaseConfigured
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
