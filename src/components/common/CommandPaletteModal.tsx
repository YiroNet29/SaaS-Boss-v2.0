import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Layers,
  Link2,
  Calendar,
  Sparkles,
  Sun,
  Moon,
  Code,
  Plus,
  Send,
  FileSpreadsheet,
  Activity,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
  onSelectProduct: (productId: string) => void;
  onOpenProductModal: () => void;
  onOpenServiceModal: () => void;
  onOpenDateModal: () => void;
  onOpenTelegramModal: () => void;
  onOpenImportExport: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onSelectProduct,
  onOpenProductModal,
  onOpenServiceModal,
  onOpenDateModal,
  onOpenTelegramModal,
  onOpenImportExport,
}) => {
  const { products, services, dates, isDemoMode, setDemoMode, currentWorkspace, stackHealth } = useWorkspace();
  const { theme, toggleTheme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global keydown listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Trigger open via parent or event
          const event = new CustomEvent('open-command-palette');
          window.dispatchEvent(event);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cleanQ = query.toLowerCase().trim();

  // Filtered Products
  const matchedProducts = products
    .filter((p) => p.name.toLowerCase().includes(cleanQ) || p.tags?.some((t) => t.toLowerCase().includes(cleanQ)))
    .slice(0, 4);

  // Filtered Services
  const matchedServices = services
    .filter(
      (s) =>
        s.providerName.toLowerCase().includes(cleanQ) ||
        s.category.toLowerCase().includes(cleanQ) ||
        s.accountEmail?.toLowerCase().includes(cleanQ)
    )
    .slice(0, 5);

  // Filtered Dates
  const matchedDates = dates
    .filter((d) => d.title.toLowerCase().includes(cleanQ) || d.type.toLowerCase().includes(cleanQ))
    .slice(0, 4);

  // Static Action items
  const actionItems = [
    {
      id: 'action-add-service',
      title: 'Add New Service Link',
      category: 'Action',
      icon: Plus,
      badge: 'Action',
      run: () => {
        onClose();
        onOpenServiceModal();
      },
    },
    {
      id: 'action-add-product',
      title: 'Create New SaaS Product',
      category: 'Action',
      icon: Layers,
      badge: 'Action',
      run: () => {
        onClose();
        onOpenProductModal();
      },
    },
    {
      id: 'action-add-date',
      title: 'Schedule Important Date / Milestone',
      category: 'Action',
      icon: Calendar,
      badge: 'Action',
      run: () => {
        onClose();
        onOpenDateModal();
      },
    },
    {
      id: 'action-theme-vscode',
      title: 'Theme: Switch to VS Code Dark Modern (#1e1e1e)',
      category: 'Theme',
      icon: Code,
      badge: theme === 'vscode' ? 'Active' : 'VS Code',
      run: () => {
        setTheme('vscode');
        onClose();
      },
    },
    {
      id: 'action-theme-midnight',
      title: 'Theme: Switch to Vercel Midnight (Late Night OLED #000000)',
      category: 'Theme',
      icon: Moon,
      badge: theme === 'midnight' ? 'Active' : 'Midnight',
      run: () => {
        setTheme('midnight');
        onClose();
      },
    },
    {
      id: 'action-theme-light',
      title: 'Theme: Switch to Warm Alabaster Light (#f9f8f6)',
      category: 'Theme',
      icon: Sun,
      badge: theme === 'light' ? 'Active' : 'Light',
      run: () => {
        setTheme('light');
        onClose();
      },
    },
    {
      id: 'action-toggle-demo',
      title: isDemoMode ? 'Switch to My Live Workspace' : 'Switch to Demo Mode (3 Sample Stacks)',
      category: 'Mode',
      icon: Sparkles,
      badge: isDemoMode ? 'Demo Active' : 'Live Active',
      run: () => {
        setDemoMode(!isDemoMode);
        onClose();
      },
    },
    {
      id: 'action-telegram',
      title: 'Telegram Reminder Bot Simulator (/due)',
      category: 'Reminders',
      icon: Send,
      badge: 'Bot',
      run: () => {
        onClose();
        onOpenTelegramModal();
      },
    },
    {
      id: 'action-import-export',
      title: 'Import / Export Workspace Data (CSV, JSON)',
      category: 'Data',
      icon: FileSpreadsheet,
      badge: 'Backup',
      run: () => {
        onClose();
        onOpenImportExport();
      },
    },
  ];

  const matchedActions = actionItems.filter(
    (a) => a.title.toLowerCase().includes(cleanQ) || a.category.toLowerCase().includes(cleanQ)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 md:pt-20 px-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, product, service, or search term... (Esc to exit)"
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-hidden"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
              ESC
            </span>
          )}
        </div>

        {/* Results Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          {/* Quick Actions */}
          {matchedActions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-2 mb-1.5">
                Quick Actions & Navigation
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {matchedActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={action.run}
                      className="flex items-center justify-between p-2 rounded-xl text-left bg-slate-850 hover:bg-indigo-600/15 hover:border-indigo-500/40 border border-slate-800/80 text-slate-200 transition-all group"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="truncate font-medium text-slate-200 group-hover:text-indigo-300">
                          {action.title}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matched Products */}
          {matchedProducts.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-2 mb-1.5">
                Products ({matchedProducts.length})
              </div>
              <div className="space-y-1">
                {matchedProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onClose();
                      onSelectProduct(p.id);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-left bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Layers className="w-4 h-4 text-violet-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-100 group-hover:text-violet-300">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-md">
                          {p.description || 'No description'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full capitalize bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      {p.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Services */}
          {matchedServices.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-2 mb-1.5">
                Services & Providers ({matchedServices.length})
              </div>
              <div className="space-y-1">
                {matchedServices.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onClose();
                      onSelectTab('services');
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-left bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Link2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-100 group-hover:text-indigo-300">
                          {s.providerName}
                          <span className="ml-2 font-normal text-[11px] text-slate-400">({s.plan})</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.category} • {s.billingCycle} • {s.accountEmail || 'No account email'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-slate-200">
                        {formatCurrency(s.cost, s.currency)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {s.renewalDate ? `Renews ${s.renewalDate}` : 'No date'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Dates */}
          {matchedDates.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-2 mb-1.5">
                Upcoming Milestones & Expirations ({matchedDates.length})
              </div>
              <div className="space-y-1">
                {matchedDates.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      onClose();
                      onSelectTab('dates');
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-left bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-100 group-hover:text-amber-300">
                          {d.title}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {d.type} • {d.source === 'vault' ? 'Mirrored from Vault' : 'Manual milestone'}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-amber-400 shrink-0">
                      {d.dueDate}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {cleanQ &&
            matchedActions.length === 0 &&
            matchedProducts.length === 0 &&
            matchedServices.length === 0 &&
            matchedDates.length === 0 && (
              <div className="text-center py-10 text-slate-500">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No results found for &ldquo;{query}&rdquo;</p>
                <p className="text-[11px] text-slate-600 mt-1">Try searching by provider name, product title, or command action.</p>
              </div>
            )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 px-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">ESC</kbd> to close</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">Cmd+K</kbd> anywhere</span>
          </div>
          <div className="flex items-center gap-2 text-indigo-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Health Score: {stackHealth.score}/100</span>
          </div>
        </div>
      </div>
    </div>
  );
};
