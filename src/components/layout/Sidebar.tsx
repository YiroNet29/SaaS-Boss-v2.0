import React, { useState } from 'react';
import {
  LayoutDashboard,
  Layers,
  Link2,
  Calendar,
  Settings,
  Sparkles,
  ChevronDown,
  Plus,
  Send,
  FileSpreadsheet,
  Moon,
  Sun,
  Code,
  Command,
  Wallet,
  LogOut,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenTelegramModal: () => void;
  onOpenImportExport: () => void;
  onOpenCommandPalette: () => void;
  onNewWorkspace: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenTelegramModal,
  onOpenImportExport,
  onOpenCommandPalette,
  onNewWorkspace,
}) => {
  const {
    workspaces,
    currentWorkspace,
    switchWorkspace,
    products,
    services,
    overdueCount,
    totalCosts,
    isRateStale,
    isDemoMode,
    setDemoMode,
    receipts,
  } = useWorkspace();
  const toReview = receipts.filter((r) => r.status === 'needs_review' || r.status === 'failed').length;
  const { theme, cycleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const navLinks = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Layers, count: products.length },
    { id: 'services', label: 'Services', icon: Link2, count: services.length },
    { id: 'dates', label: 'Due Dates & Calendar', icon: Calendar, badge: overdueCount > 0 ? overdueCount : undefined },
    { id: 'money', label: 'Cards & Payments', icon: Wallet },
    { id: 'receipts', label: 'Receipts', icon: Receipt, badge: toReview > 0 ? toReview : undefined },
    { id: 'settings', label: 'Workspace Settings', icon: Settings, warn: isRateStale },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-slate-200 select-none shrink-0 h-full transition-colors">
      {/* Brand & Workspace Picker */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-600/30">
              ST
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base text-slate-100 tracking-tight">StackTrack</span>
              </div>
              <p className="text-[11px] text-slate-400">Multi-SaaS Stack Tracker</p>
            </div>
          </div>
        </div>

        {/* Workspace Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-200 transition-colors"
            aria-label="Switch Workspace"
          >
            <div className="flex items-center gap-2 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isDemoMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="truncate">{currentWorkspace.name}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isWorkspaceMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 p-1.5 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl z-50 animate-in fade-in">
              <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1">
                Your Workspaces
              </div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    switchWorkspace(ws.id);
                    setIsWorkspaceMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                    ws.id === currentWorkspace.id
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  <span className="truncate">{ws.name}</span>
                  <span className="text-[10px] opacity-70 uppercase">{ws.baseCurrency}</span>
                </button>
              ))}
              <div className="border-t border-slate-700/80 mt-1 pt-1">
                <button
                  onClick={() => {
                    setIsWorkspaceMenuOpen(false);
                    onNewWorkspace();
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-indigo-300 hover:bg-slate-700/60 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Workspace</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Demo Mode Toggle Button inside sidebar */}
        <div className="mt-2.5">
          <button
            onClick={() => setDemoMode(!isDemoMode)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
              isDemoMode
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-slate-800/50 text-slate-400 border-slate-750 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isDemoMode ? 'Demo Mode Active' : 'Live Workspace'}</span>
            </div>
            <span className="text-[10px] font-normal underline opacity-80">
              {isDemoMode ? 'Exit' : 'Explore Demo'}
            </span>
          </button>
        </div>

        {!isDemoMode && user && (
          <div className="mt-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/30 border border-slate-750 text-[11px]">
            <span className="truncate text-slate-400" title={user.email}>
              {user.email}
            </span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1 text-slate-400 hover:text-rose-300 shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto" aria-label="Main Sidebar Navigation">
        {/* Quick Command Palette Button */}
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl text-xs bg-slate-800/50 hover:bg-slate-800 border border-slate-750 text-slate-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Command className="w-3.5 h-3.5 text-indigo-400" />
            <span>Command Palette</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-850 px-1.5 py-0.5 rounded border border-slate-700">Cmd+K</span>
        </button>

        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = currentTab === link.id;

          return (
            <button
              key={link.id}
              onClick={() => onSelectTab(link.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{link.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {link.warn && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" title="ETB exchange rate older than 30 days" />
                )}
                {link.badge !== undefined && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white shadow-xs">
                    {link.badge}
                  </span>
                )}
                {link.count !== undefined && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    {link.count}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {/* Integration Shortcuts Section */}
        <div className="pt-4 mt-3 border-t border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-500 px-3 mb-2 tracking-wider">
            Tools & Integrations
          </div>

          <button
            onClick={onOpenTelegramModal}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            <Send className="w-4 h-4 text-sky-400" />
            <span>Telegram Bot & Alerts</span>
          </button>

          <button
            onClick={onOpenImportExport}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            <span>Import & Export</span>
          </button>
        </div>
      </nav>

      {/* Monthly Burn Ticker & Footer */}
      <div className="p-3.5 border-t border-slate-800 bg-slate-900/60">
        <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-750 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Total Monthly Burn
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-100 font-mono">
              {formatCurrency(totalCosts.totalUsd, 'USD')}
            </span>
            <span className="text-xs font-semibold text-emerald-400 font-mono">
              {formatCurrency(totalCosts.totalEtb, 'ETB')}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Rate: 1 USD = {currentWorkspace.exchangeRates.ETB_per_USD} ETB</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition-colors"
            aria-label="Cycle theme"
            title="Click to cycle: VS Code -> Vercel Midnight -> Warm Light"
          >
            {theme === 'vscode' ? (
              <Code className="w-4 h-4 text-sky-400" />
            ) : theme === 'midnight' ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-[11px] font-medium">
              {theme === 'vscode' ? 'VS Code Dark' : theme === 'midnight' ? 'Midnight (OLED)' : 'Warm Light'}
            </span>
          </button>
          <span className="text-[10px] text-slate-500 font-mono">v1.2.0</span>
        </div>
      </div>
    </aside>
  );
};
