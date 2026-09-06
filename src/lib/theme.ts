// Three palettes:
//  - "klassik" is the real card-table look (green felt, wooden rack, ivory
//    tiles, brass accents) that the whole game is designed around.
//  - "modern-dark" / "light" are the two variants of the flat modern look;
//    they share accent and CTA colors and only swap surfaces.
// (The old warm-brown "Kahvehane" theme was dropped - brown everywhere was
// exactly what didn't work. Klassik uses wood only as trim on green felt.)
export type ThemeId = 'klassik' | 'modern-dark' | 'light';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'klassik', label: 'Klassik', description: 'Grüner Filz & Holz' },
  { id: 'modern-dark', label: 'Modern', description: 'Anthrazit & Türkis' },
  { id: 'light', label: 'Modern Hell', description: 'Weiß & Türkis' },
];

const STORAGE_KEY = 'masa-oyunlari-theme';

function isThemeId(value: string | null): value is ThemeId {
  return value === 'klassik' || value === 'modern-dark' || value === 'light';
}

export function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) return stored;
    // An old "coffeehouse" (or otherwise unrecognised) value from before
    // the theme cleanup - fall through to the default instead.
  } catch {
    // localStorage unavailable - fall through to default
  }
  // Klassik is the default for anyone who hasn't chosen yet: it's the look
  // the game is actually built around, and it says "board game" at a glance.
  return 'klassik';
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best-effort persistence only
  }
}
