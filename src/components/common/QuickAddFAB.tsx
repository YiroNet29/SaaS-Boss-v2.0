import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Link2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface QuickAddFABProps {
  onAddService: () => void;
  onAddDate: () => void;
  onAddProduct: () => void;
  onStampTemplate: () => void;
}

export const QuickAddFAB: React.FC<QuickAddFABProps> = ({
  onAddService,
  onAddDate,
  onAddProduct,
  onStampTemplate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Esc, and listen to open-quick-add event
  useEffect(() => {
    const handleOpenQuickAdd = () => setIsOpen(true);
    window.addEventListener('open-quick-add', handleOpenQuickAdd);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
      if (isOpen) {
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          setIsOpen(false);
          onAddService();
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          setIsOpen(false);
          onAddDate();
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          setIsOpen(false);
          onAddProduct();
        } else if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          setIsOpen(false);
          onStampTemplate();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      window.removeEventListener('open-quick-add', handleOpenQuickAdd);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onAddService, onAddDate, onAddProduct, onStampTemplate]);

  const menuItems = [
    {
      id: 'service',
      title: 'Log Service or Subscription',
      subtitle: 'Track AWS, Stripe, Vercel, Supabase, or OpenAI API',
      icon: Link2,
      shortcut: 'S',
      iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white',
      badge: 'Popular',
      badgeColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
      action: () => {
        setIsOpen(false);
        onAddService();
      },
    },
    {
      id: 'date',
      title: 'Upcoming Renewal / Expiry Date',
      subtitle: 'Schedule domain, SSL, invoice, or milestone alert',
      icon: Calendar,
      shortcut: 'D',
      iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white',
      action: () => {
        setIsOpen(false);
        onAddDate();
      },
    },
    {
      id: 'product',
      title: 'New SaaS Product Stack',
      subtitle: 'Group services, costs, and secrets under a project',
      icon: Layers,
      shortcut: 'P',
      iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 group-hover:bg-violet-600 group-hover:text-white',
      action: () => {
        setIsOpen(false);
        onAddProduct();
      },
    },
    {
      id: 'template',
      title: 'Stamp Starter Stack Template',
      subtitle: 'One-click load AI SaaS, FinTech, or E-commerce stack',
      icon: Sparkles,
      shortcut: 'T',
      iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white',
      action: () => {
        setIsOpen(false);
        onStampTemplate();
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 select-none print:hidden"
    >
      {/* Backdrop Dimmer when open on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-stone-900/40 dark:bg-black/60 backdrop-blur-2xs z-30 transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Speed Dial / Quick Add Popover Menu */}
      {isOpen && (
        <div
          className="absolute bottom-16 right-0 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl p-2.5 z-40 animate-in fade-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-label="Quick Add Menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 dark:border-slate-800/80 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold text-stone-900 dark:text-slate-100">
                Quick Add to Stack
              </span>
            </div>
            <span className="text-[10px] text-stone-400 dark:text-slate-500 font-mono">
              Press [S], [D], [P] or [T]
            </span>
          </div>

          {/* Action List */}
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-left bg-stone-50/60 dark:bg-slate-850 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${item.iconBg}`}
                    >
                      <Icon className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-stone-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-200/80 dark:bg-slate-750 text-stone-600 dark:text-slate-300 border border-stone-300/80 dark:border-slate-700 hidden sm:inline">
                      {item.shortcut}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30 border border-indigo-400/30 dark:border-slate-700/80 transition-all active:scale-95 z-40 focus:outline-hidden ${
          isOpen
            ? 'bg-stone-900 dark:bg-slate-800 rotate-45 hover:bg-stone-800'
            : 'bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 hover:from-indigo-500 hover:to-violet-400 hover:scale-105'
        }`}
        aria-label={isOpen ? 'Close Quick Add Menu' : 'Open Quick Add Menu'}
        aria-expanded={isOpen}
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>
    </div>
  );
};
