import React, { useState, useRef, useEffect } from 'react';
import {
  Code,
  Moon,
  Sun,
  Gem,
  Leaf,
  Flame,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useTheme, Theme, THEME_OPTIONS, themeOption } from '../../context/ThemeContext';

const ICONS = {
  code: { Icon: Code, color: 'text-sky-400' },
  moon: { Icon: Moon, color: 'text-indigo-400' },
  sun: { Icon: Sun, color: 'text-amber-500' },
  gem: { Icon: Gem, color: 'text-yellow-500' },
  leaf: { Icon: Leaf, color: 'text-emerald-500' },
  flame: { Icon: Flame, color: 'text-orange-500' },
} as const;

/** The icon component for a theme, for lists that colour icons themselves. */
export const themeIconComponent = (theme: Theme) => ICONS[themeOption(theme).iconName].Icon;

/** The small icon that stands for a theme, in its own colour. */
export const ThemeIcon: React.FC<{ theme: Theme; className?: string }> = ({ theme, className = 'w-4 h-4' }) => {
  const { Icon, color } = ICONS[themeOption(theme).iconName];
  return <Icon className={`${className} ${color}`} aria-hidden="true" />;
};

interface ThemeSelectorProps {
  compact?: boolean;
  /** Show only the icon on the menu button (the menu still names every theme). */
  iconOnly?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ compact = false, iconOnly = false }) => {
  const { theme, setTheme, cycleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = themeOption(theme);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {compact ? (
        <button
          onClick={cycleTheme}
          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-slate-100 transition-colors flex items-center justify-center"
          title={`Current: ${currentOption.name}. Click to cycle themes.`}
          aria-label="Cycle theme"
        >
          <ThemeIcon theme={theme} />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs text-slate-300 hover:text-slate-100 transition-colors"
          title={iconOnly ? `Theme: ${currentOption.name}. Choose another` : 'Switch site theme'}
          aria-label={iconOnly ? `Theme: ${currentOption.name}. Choose another` : undefined}
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <ThemeIcon theme={theme} className="w-3.5 h-3.5" />
          {!iconOnly && <span className="hidden sm:inline font-medium text-[11px]">{currentOption.shortLabel}</span>}
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 text-[10px] font-bold text-stone-400 dark:text-slate-500 uppercase tracking-wider border-b border-stone-100 dark:border-slate-800/80 mb-1">
            Choose Workspace Theme
          </div>

          <div className="space-y-1">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    setTheme(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700'
                      : 'hover:bg-stone-50 dark:hover:bg-slate-850 border border-transparent'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <ThemeIcon theme={opt.id} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900 dark:text-slate-100">
                        {opt.name}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-slate-400 mt-0.5 leading-tight">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
