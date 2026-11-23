import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Theme, ALL_THEME_CLASSES, nextTheme, savedTheme, themeOption } from '../utils/themes';

export { type Theme, type ThemeOption, THEME_OPTIONS, nextTheme, savedTheme, themeOption } from '../utils/themes';

interface ThemeContextType {
  theme: Theme;
  cycleTheme: () => void;
  toggleTheme: () => void; // for backwards compatibility
  setTheme: (t: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'vscode',
  cycleTheme: () => {},
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: true,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => savedTheme(localStorage.getItem('stacktrack_theme')));

  useEffect(() => {
    localStorage.setItem('stacktrack_theme', theme);
    const root = document.documentElement;
    root.classList.remove(...ALL_THEME_CLASSES);
    root.classList.add(...themeOption(theme).classes);
  }, [theme]);

  const cycleTheme = () => setThemeState(nextTheme);
  const toggleTheme = cycleTheme;
  const setTheme = (t: Theme) => setThemeState(t);
  const isDark = themeOption(theme).classes.includes('dark');

  return (
    <ThemeContext.Provider value={{ theme, cycleTheme, toggleTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
