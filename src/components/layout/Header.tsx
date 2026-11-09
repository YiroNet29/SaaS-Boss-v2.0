import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  AlertCircle,
  Send,
  Sun,
  Moon,
  Sparkles,
  Command,
  X,
  ExternalLink,
  Globe,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeSelector } from './ThemeSelector';
import { ServiceLink } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenCommandPalette: () => void;
  onQuickAddProduct: () => void;
  onQuickAddService: () => void;
  onOpenTelegramModal: () => void;
  onNavigateToServices?: (query: string) => void;
  onSelectService?: (s: ServiceLink) => void;
}

function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onOpenCommandPalette,
  onQuickAddProduct,
  onQuickAddService,
  onOpenTelegramModal,
  onNavigateToServices,
  onSelectService,
}) => {
  const { currentWorkspace, isRateStale, isDemoMode, setDemoMode, services, products } = useWorkspace();
  const { theme } = useTheme();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMac = typeof window !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      m.set(p.id, p.name);
    }
    return m;
  }, [products]);

  // Live matching services by name, category, or domain
  const matchingServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return services.filter((s) => {
      const domain = extractDomain(s.loginUrl).toLowerCase();
      const name = s.providerName.toLowerCase();
      const cat = s.category.toLowerCase();
      const plan = (s.plan || '').toLowerCase();
      const notes = (s.notes || '').toLowerCase();
      const prod = (productMap.get(s.productId) || '').toLowerCase();

      return (
        name.includes(q) ||
        cat.includes(q) ||
        domain.includes(q) ||
        plan.includes(q) ||
        notes.includes(q) ||
        prod.includes(q)
      );
    });
  }, [services, searchQuery, productMap]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      if (searchQuery.trim()) {
        setIsDropdownOpen(false);
        if (onNavigateToServices) {
          onNavigateToServices(searchQuery.trim());
        }
      }
    }
  };

  const handleSelectMatch = (s: ServiceLink) => {
    setIsDropdownOpen(false);
    if (onSelectService) {
      onSelectService(s);
    } else if (onNavigateToServices) {
      onNavigateToServices(s.providerName);
    }
  };

  const handleViewAllInServices = () => {
    setIsDropdownOpen(false);
    if (onNavigateToServices) {
      onNavigateToServices(searchQuery.trim());
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 shrink-0 transition-colors">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        {/* Mobile Brand Title */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-100 font-black text-sm shadow-md">
            ST
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-slate-100 tracking-tight leading-none">
                {currentWorkspace.name}
              </h1>
              {isDemoMode && (
                <span className="text-[9px] font-bold px-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  DEMO
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">Totals in {currentWorkspace.baseCurrency}</span>
          </div>
        </div>

        {/* Interactive Global Search Bar with Live Filter Dropdown */}
        <div ref={searchContainerRef} className="flex-1 max-w-lg relative hidden sm:block">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setIsDropdownOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Filter services by name, category, domain (e.g. vercel, database, .com)..."
              className="w-full pl-9 pr-20 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 focus:bg-slate-800 border border-slate-700/80 focus:border-slate-600 text-xs text-slate-200 placeholder-slate-400 focus:outline-hidden transition-all shadow-2xs"
            />

            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setIsDropdownOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Quick Action Ctrl+K / Cmd+K badge */}
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/80 hover:bg-slate-700 text-slate-300 border border-slate-600/80 transition-colors cursor-pointer"
                title={`Open Command Palette (${isMac ? '⌘K' : 'Ctrl+K'})`}
              >
                {isMac ? <Command className="w-2.5 h-2.5" /> : <span>Ctrl+</span>}
                <span>K</span>
              </button>
            </div>
          </div>

          {/* Live Matching Dropdown */}
          {isDropdownOpen && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden z-50 animate-in fade-in duration-150">
              <div className="px-3 py-2 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  {matchingServices.length === 0
                    ? 'No matching services'
                    : `${matchingServices.length} match${matchingServices.length === 1 ? '' : 'es'} found`}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Press [Enter] for full list
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 p-1">
                {matchingServices.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    <p>No services found matching &ldquo;{searchQuery}&rdquo;.</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Try searching by name (e.g. AWS, Supabase), category (e.g. hosting, database), or domain (.com, .io).
                    </p>
                  </div>
                ) : (
                  matchingServices.slice(0, 6).map((service) => {
                    const domain = extractDomain(service.loginUrl);
                    const prodName = productMap.get(service.productId);

                    return (
                      <div
                        key={service.id}
                        onClick={() => handleSelectMatch(service)}
                        className="p-2.5 rounded-xl hover:bg-slate-800 cursor-pointer transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-100 group-hover:text-white transition-colors truncate">
                              {service.providerName}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                              {service.category}
                            </span>
                            {domain && (
                              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 truncate max-w-[140px]">
                                <Globe className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                <span className="truncate">{domain}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className="truncate">{service.plan}</span>
                            {prodName && (
                              <>
                                <span>•</span>
                                <span className="truncate text-slate-400">{prodName}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-slate-200">
                            {formatCurrency(service.cost, service.currency)}
                          </span>
                          <span className="text-[10px] text-slate-400 block capitalize">
                            {service.billingCycle}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {matchingServices.length > 0 && (
                <div className="p-2 bg-slate-850/60 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleViewAllInServices}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    <span>View all {matchingServices.length} matches in Services table</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Demo Mode Toggle Badge */}
          <button
            onClick={() => setDemoMode(!isDemoMode)}
            className={`hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
              isDemoMode
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle between rich starter demo stacks and your live clean workspace"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isDemoMode ? 'Demo Mode' : 'Live Mode'}</span>
          </button>

          {/* Stale Exchange Rate Warning */}
          {isRateStale && (
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium animate-pulse">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>ETB rate &gt;30d</span>
            </div>
          )}

          {/* Telegram Simulator */}
          <button
            onClick={onOpenTelegramModal}
            className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs text-slate-300 transition-colors"
            title="Telegram Reminder Bot Simulator"
          >
            <Send className="w-3.5 h-3.5 text-slate-400" />
            <span>Telegram</span>
          </button>

          {/* 3-Theme Switcher (VS Code / Vercel Midnight / Warm Light) */}
          <ThemeSelector />

          {/* Install PWA Button */}
          <PWAInstallButton variant="header" />

          {/* Add Product Button */}
          <button
            onClick={onQuickAddProduct}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-slate-400" />
            <span>Product</span>
          </button>

          {/* Add Service Button */}
          <button
            onClick={onQuickAddService}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Service</span>
            <span className="sm:hidden">Service</span>
          </button>
        </div>
      </div>

      {/* Mobile Interactive Search Bar row */}
      <div className="mt-2 sm:hidden relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => {
              if (searchQuery.trim()) setIsDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search by name, category, or domain..."
            className="w-full pl-9 pr-16 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 placeholder-slate-400 focus:outline-hidden"
          />
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="absolute right-2 px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-300 border border-slate-600"
          >
            {isMac ? '⌘K' : 'Ctrl+K'}
          </button>
        </div>
      </div>
    </header>
  );
};
