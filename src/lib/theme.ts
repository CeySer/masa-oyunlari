export type ThemeId = 'coffeehouse' | 'modern-dark' | 'light';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'coffeehouse', label: 'Kahvehane', description: 'Warmes Holz & Gold' },
  { id: 'modern-dark', label: 'Modern Dunkel', description: 'Anthrazit & Türkis' },
  { id: 'light', label: 'Hell', description: 'Creme & Orange' },
];

const STORAGE_KEY = 'masa-oyunlari-theme';

export function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'coffeehouse' || stored === 'modern-dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // localStorage unavailable - fall through to default
  }
  return 'coffeehouse';
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best-effort persistence only
  }
}
