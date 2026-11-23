import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Theme, ALL_THEME_CLASSES, nextTheme, savedTheme, themeOption } from '../utils/themes';
import { type Layout, LAYOUT_STORAGE_KEY, savedLayout } from '../utils/layouts';

export { type Theme, type ThemeOption, THEME_OPTIONS, nextTheme, savedTheme, themeOption } from '../utils/themes';
export { type Layout, type LayoutOption, LAYOUT_OPTIONS, layoutOption } from '../utils/layouts';

interface ThemeContextType {
  theme: Theme;
  cycleTheme: () => void;
  toggleTheme: () => void; // for backwards compatibility
  setTheme: (t: Theme) => void;
  isDark: boolean;
  /** How the pages are arranged (Classic or Timeline). Any layout works with any theme. */
  layout: Layout;
  setLayout: (l: Layout) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'vscode',
  cycleTheme: () => {},
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: true,
  layout: 'classic',
  setLayout: () => {},
});

const readLayout = (): Layout => {
  try {
    return savedLayout(localStorage.getItem(LAYOUT_STORAGE_KEY));
  } catch {
    return 'classic';
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => savedTheme(localStorage.getItem('stacktrack_theme')));
  const [layout, setLayoutState] = useState<Layout>(readLayout);

  useEffect(() => {
    localStorage.setItem('stacktrack_theme', theme);
    const root = document.documentElement;
    root.classList.remove(...ALL_THEME_CLASSES);
    root.classList.add(...themeOption(theme).classes);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
    } catch {
      /* storage unavailable: the layout lasts until the page reloads */
    }
    document.documentElement.dataset.layout = layout;
  }, [layout]);

  const cycleTheme = () => setThemeState(nextTheme);
  const toggleTheme = cycleTheme;
  const setTheme = (t: Theme) => setThemeState(t);
  const isDark = themeOption(theme).classes.includes('dark');

  return (
    <ThemeContext.Provider value={{ theme, cycleTheme, toggleTheme, setTheme, isDark, layout, setLayout: setLayoutState }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
