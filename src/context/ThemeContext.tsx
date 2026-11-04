import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'vscode' | 'midnight' | 'light';

export interface ThemeOption {
  id: Theme;
  name: string;
  shortLabel: string;
  description: string;
  iconName: 'code' | 'moon' | 'sun';
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'vscode',
    name: 'VS Code Dark Modern',
    shortLabel: 'VS Code',
    description: 'Iconic developer palette with #1e1e1e editor slate and #007acc accents',
    iconName: 'code',
  },
  {
    id: 'midnight',
    name: 'Vercel / GitHub Late Night',
    shortLabel: 'Midnight',
    description: 'Deep pitch-black OLED #000000 and ultra-clean high contrast borders',
    iconName: 'moon',
  },
  {
    id: 'light',
    name: 'Warm Alabaster Light',
    shortLabel: 'Light',
    description: 'Soft warm stone and alabaster (#f9f8f6) that protects your eyes',
    iconName: 'sun',
  },
];

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
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('stacktrack_theme');
    if (saved === 'vscode' || saved === 'midnight' || saved === 'light') return saved;
    if (saved === 'dark') return 'vscode';
    return 'vscode'; // Default to VS Code Dark Modern
  });

  useEffect(() => {
    localStorage.setItem('stacktrack_theme', theme);

    // Clean all theme classes
    document.documentElement.classList.remove('light', 'dark', 'theme-vscode', 'theme-midnight');

    if (theme === 'vscode') {
      document.documentElement.classList.add('dark', 'theme-vscode');
    } else if (theme === 'midnight') {
      document.documentElement.classList.add('dark', 'theme-midnight');
    } else {
      document.documentElement.classList.add('light');
    }
  }, [theme]);

  const cycleTheme = () => {
    setThemeState((prev) => {
      if (prev === 'vscode') return 'midnight';
      if (prev === 'midnight') return 'light';
      return 'vscode';
    });
  };

  const toggleTheme = cycleTheme;

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const isDark = theme === 'vscode' || theme === 'midnight';

  return (
    <ThemeContext.Provider value={{ theme, cycleTheme, toggleTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
