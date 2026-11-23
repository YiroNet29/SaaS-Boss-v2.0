import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, MoreHorizontal, Send, FileSpreadsheet, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ThemeSelector } from './ThemeSelector';
import { PWAInstallButton } from './PWAInstallButton';

interface TopNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenTelegramModal: () => void;
  onOpenImportExport: () => void;
  onOpenCommandPalette: () => void;
  onNewWorkspace: () => void;
  onAddService: () => void;
}

/** Closes a menu on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/**
 * The Timeline layout's menu: one bar across the top instead of the sidebar (wider screens only; phones
 * keep the bottom menu). `data-sidebar` gives it the sidebar's colours in every theme.
 */
export const TopNav: React.FC<TopNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenTelegramModal,
  onOpenImportExport,
  onOpenCommandPalette,
  onNewWorkspace,
  onAddService,
}) => {
  const { workspaces, currentWorkspace, switchWorkspace, overdueCount, isRateStale, isDemoMode, setDemoMode, receipts } =
    useWorkspace();
  const { user, signOut } = useAuth();
  const toReview = receipts.filter((r) => r.status === 'needs_review' || r.status === 'failed').length;

  const [wsOpen, setWsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeWs = React.useCallback(() => setWsOpen(false), []);
  const closeMore = React.useCallback(() => setMoreOpen(false), []);
  const wsRef = useDismiss(wsOpen, closeWs);
  const moreRef = useDismiss(moreOpen, closeMore);

  const links: { id: string; label: string; badge?: number; warn?: boolean }[] = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'products', label: 'Apps' },
    { id: 'services', label: 'Services' },
    { id: 'dates', label: 'Dates', badge: overdueCount > 0 ? overdueCount : undefined },
    { id: 'money', label: 'Cards & payments' },
    { id: 'receipts', label: 'Receipts', badge: toReview > 0 ? toReview : undefined },
    { id: 'settings', label: 'Settings', warn: isRateStale },
  ];

  const menuItem =
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left text-slate-300 hover:text-slate-100 hover:bg-slate-800/70 transition-colors';

  return (
    <header data-sidebar="" className="hidden md:block shrink-0 bg-slate-900 border-b border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap items-center gap-x-6 gap-y-1 min-h-[68px]">
        {/* Brand and workspace */}
        <div ref={wsRef} className="relative flex items-center gap-2.5 py-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-600/30">
            ST
          </div>
          <button
            type="button"
            onClick={() => setWsOpen((o) => !o)}
            className="flex flex-col items-start leading-tight rounded-lg px-1.5 py-1 hover:bg-slate-800/60 transition-colors"
            aria-haspopup="true"
            aria-expanded={wsOpen}
            aria-label={`Workspace: ${currentWorkspace.name}. Switch workspace`}
          >
            <span className="font-bold text-base text-slate-100 tracking-tight">StackTrack</span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400 max-w-[160px]">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDemoMode ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className="truncate">{currentWorkspace.name}</span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </span>
          </button>

          {wsOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 p-1.5 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl z-50">
              <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1">Your workspaces</div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    switchWorkspace(ws.id);
                    setWsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                    ws.id === currentWorkspace.id ? 'bg-indigo-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  <span className="truncate">{ws.name}</span>
                  <span className="text-[10px] uppercase">{ws.baseCurrency}</span>
                </button>
              ))}
              <div className="border-t border-slate-700/80 mt-1 pt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setWsOpen(false);
                    onNewWorkspace();
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs text-indigo-300 hover:bg-slate-700/60 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create workspace</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWsOpen(false);
                    setDemoMode(!isDemoMode);
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isDemoMode ? 'Leave the demo' : 'Explore the demo'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pages */}
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 flex-[1_1_480px] min-w-0">
          {links.map((link) => {
            const active = currentTab === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => onSelectTab(link.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full text-sm border transition-colors ${
                  active
                    ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'
                }`}
              >
                <span>{link.label}</span>
                {link.warn && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" title="ETB exchange rate older than 30 days" />
                )}
                {link.badge !== undefined && (
                  <span className="px-1.5 text-[10px] font-bold rounded-full bg-rose-600 text-white">{link.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Search, theme, add, more */}
        <div className="flex items-center gap-2 py-3 ml-auto">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-10 h-10 rounded-full border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 flex items-center justify-center transition-colors"
            aria-label="Search and commands (Ctrl+K)"
            title="Search and commands (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>
          <ThemeSelector />
          <PWAInstallButton variant="header" />
          <button
            type="button"
            onClick={onAddService}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add service</span>
          </button>

          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="w-10 h-10 rounded-full border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 flex items-center justify-center transition-colors"
              aria-haspopup="true"
              aria-expanded={moreOpen}
              aria-label="More: Telegram, import and export, sign out"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 p-1.5 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl z-50">
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenTelegramModal();
                  }}
                >
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>Telegram reminders</span>
                </button>
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenImportExport();
                  }}
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  <span>Import and export</span>
                </button>
                {!isDemoMode && user && (
                  <div className="border-t border-slate-700/80 mt-1 pt-1">
                    <div className="px-3 pt-1.5 pb-1 text-xs text-slate-400 truncate" title={user.email}>
                      {user.email}
                    </div>
                    <button
                      type="button"
                      className={menuItem}
                      onClick={() => {
                        setMoreOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
