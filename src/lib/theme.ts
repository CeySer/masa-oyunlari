// Only two palettes now, both part of the same modern design (identical
// accent/CTA colors, just light vs. dark surfaces) - the old warm-brown
// "Kahvehane" theme was dropped since it didn't fit and the user asked for
// the app to be visually consistent with the modern look throughout.
export type ThemeId = 'modern-dark' | 'light';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'modern-dark', label: 'Dunkel', description: 'Anthrazit & Türkis' },
  { id: 'light', label: 'Hell', description: 'Weiß & Türkis' },
];

const STORAGE_KEY = 'masa-oyunlari-theme';

function isThemeId(value: string | null): value is ThemeId {
  return value === 'modern-dark' || value === 'light';
}

export function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) return stored;
    // An old "coffeehouse" (or otherwise unrecognised) value from before
    // the theme cleanup - fall through to a sensible default instead.
  } catch {
    // localStorage unavailable - fall through to default
  }
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'modern-dark';
    }
  } catch {
    // matchMedia unavailable - fall through to default
  }
  return 'light';
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best-effort persistence only
  }
}
