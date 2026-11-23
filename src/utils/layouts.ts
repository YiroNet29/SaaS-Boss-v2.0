/**
 * The app's layouts: how the pages are arranged (where the menu sits, what the Dashboard shows).
 * Separate from the theme (colours and type), so any layout works with any theme.
 * Remembered in this browser, like the theme.
 */
export type Layout = 'classic' | 'timeline' | 'portfolio';

export interface LayoutOption {
  id: Layout;
  name: string;
  description: string;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Menu down the left side. The Dashboard groups everything into Coming up, Spending and Health.',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Menu across the top. The Dashboard shows the next 60 days on a line, then what is next up.',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Menu across the top. The Dashboard shows each app side by side, with what it pays for.',
  },
];

/** Layouts with the menu in a bar across the top instead of the sidebar. */
export const hasTopBar = (l: Layout) => l !== 'classic';

export const LAYOUT_STORAGE_KEY = 'stacktrack_layout';

export const layoutOption = (l: Layout): LayoutOption => LAYOUT_OPTIONS.find((o) => o.id === l) ?? LAYOUT_OPTIONS[0];

/** The saved layout, or Classic when nothing (or something unknown) is saved. */
export function savedLayout(saved: string | null): Layout {
  return LAYOUT_OPTIONS.some((o) => o.id === saved) ? (saved as Layout) : 'classic';
}
