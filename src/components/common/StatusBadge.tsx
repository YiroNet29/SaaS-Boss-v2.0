import React from 'react';
import { ProductStatus, ServiceStatus, ImportantDateStatus } from '../../types';

interface StatusBadgeProps {
  status: ProductStatus | ServiceStatus | ImportantDateStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const s = status.toLowerCase();
  let colorStyles = 'bg-slate-800 text-slate-300 border-slate-700';
  let dotColor = 'bg-slate-400';

  if (s === 'live' || s === 'active' || s === 'done') {
    colorStyles = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    dotColor = 'bg-emerald-400';
  } else if (s === 'building' || s === 'trial' || s === 'open') {
    colorStyles = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    dotColor = 'bg-amber-400 animate-pulse';
  } else if (s === 'paused' || s === 'snoozed') {
    colorStyles = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
    dotColor = 'bg-indigo-400';
  } else if (s === 'retired' || s === 'cancelled' || s === 'overdue') {
    colorStyles = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    dotColor = 'bg-rose-400';
  } else if (s === 'idea') {
    colorStyles = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
    dotColor = 'bg-purple-400';
  }

  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border capitalize tracking-wide ${colorStyles} ${px}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};
