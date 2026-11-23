export type Theme = 'vscode' | 'midnight' | 'light' | 'noir' | 'sage' | 'ember';

export interface ThemeOption {
  id: Theme;
  name: string;
  shortLabel: string;
  description: string;
  iconName: 'code' | 'moon' | 'sun' | 'gem' | 'leaf' | 'flame';
  /** Classes put on <html>: `dark` or `light` picks the base styling, `theme-*` the palette. */
  classes: string[];
}

/** Every theme, in the order the pickers show them and the cycle button steps through them. */
export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'vscode',
    name: 'VS Code Dark Modern',
    shortLabel: 'VS Code',
    description: 'Iconic developer palette with #1e1e1e editor slate and #007acc accents',
    iconName: 'code',
    classes: ['dark', 'theme-vscode'],
  },
  {
    id: 'midnight',
    name: 'Vercel / GitHub Late Night',
    shortLabel: 'Midnight',
    description: 'Deep pitch-black OLED #000000 and ultra-clean high contrast borders',
    iconName: 'moon',
    classes: ['dark', 'theme-midnight'],
  },
  {
    id: 'light',
    name: 'Warm Alabaster Light',
    shortLabel: 'Light',
    description: 'Soft warm stone and alabaster (#f9f8f6) that protects your eyes',
    iconName: 'sun',
    classes: ['light'],
  },
  {
    id: 'noir',
    name: 'Noir Gold',
    shortLabel: 'Noir Gold',
    description: 'Green-black and cream with gold accents and serif headings. Quiet luxury.',
    iconName: 'gem',
    classes: ['dark', 'theme-noir'],
  },
  {
    id: 'sage',
    name: 'Sage',
    shortLabel: 'Sage',
    description: 'Cream pages, a deep forest-green sidebar and terracotta buttons. Fresh and light.',
    iconName: 'leaf',
    classes: ['light', 'theme-sage'],
  },
  {
    id: 'ember',
    name: 'Ember',
    shortLabel: 'Ember',
    description: 'Warm charcoal and cream with ember-orange accents and soft serif headings.',
    iconName: 'flame',
    classes: ['dark', 'theme-ember'],
  },
];

const THEME_IDS = THEME_OPTIONS.map((o) => o.id);

/** Every class any theme puts on <html>, so switching can remove the old theme's classes. */
export const ALL_THEME_CLASSES = [...new Set(THEME_OPTIONS.flatMap((o) => o.classes))];

export const themeOption = (t: Theme): ThemeOption => THEME_OPTIONS.find((o) => o.id === t) ?? THEME_OPTIONS[0];

/** The saved theme, or VS Code for a missing or unknown value (including 'dark', its old name). */
export function savedTheme(saved: string | null): Theme {
  if (saved && (THEME_IDS as string[]).includes(saved)) return saved as Theme;
  return 'vscode';
}

/** The theme after this one, in the order of the theme list, back to the first after the last. */
export function nextTheme(t: Theme): Theme {
  return THEME_IDS[(THEME_IDS.indexOf(t) + 1) % THEME_IDS.length];
}
