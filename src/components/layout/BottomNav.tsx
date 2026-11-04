import React from 'react';
import {
  LayoutDashboard,
  Layers,
  Link2,
  Calendar,
  Plus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface BottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onQuickAdd: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onQuickAdd,
}) => {
  const { overdueCount } = useWorkspace();

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Layers },
    { id: 'add', label: 'Add', isAction: true },
    { id: 'services', label: 'Services', icon: Link2 },
    { id: 'dates', label: 'Dates', icon: Calendar, badge: overdueCount > 0 ? overdueCount : undefined },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-stone-200/90 dark:border-slate-800/80 pb-safe shadow-2xl transition-colors"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="flex items-center justify-around px-2 py-1.5 h-16">
        {navItems.map((item) => {
          if (item.isAction) {
            return (
              <button
                key="action-add"
                onClick={onQuickAdd}
                className="relative -top-3 w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 border-2 border-white dark:border-slate-900 transition-transform active:scale-95"
                aria-label="Quick Add Service or Product"
              >
                <Plus className="w-6 h-6 stroke-[2.5]" />
              </button>
            );
          }

          const Icon = item.icon!;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center w-14 py-1 rounded-xl transition-all relative ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
              }`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
