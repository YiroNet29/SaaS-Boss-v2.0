import React from 'react';
import { Link2 } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { ServiceList } from './useServiceList';

/** What the Services page shows when nothing is listed: none added yet, or none match the filters. */
export const ServiceEmptyState: React.FC<{ list: ServiceList; onAddService: () => void }> = ({ list, onAddService }) =>
  list.services.length ? (
    <EmptyState
      icon={Link2}
      title="No services match"
      description="Nothing matches this search and these filters."
      actionLabel="Clear filters"
      onAction={list.clearFilters}
    />
  ) : (
    <EmptyState
      icon={Link2}
      title="No services yet"
      description="Add what your apps pay for: hosting, domain, database, email, APIs. With the price and renewal date, reminders come before each renewal. You can also send /add Vercel 20 monthly to the Telegram bot."
      actionLabel="Add Service"
      onAction={onAddService}
    />
  );

/** "Delete "Vercel"?" — asks first, then "Confirm it's you" when the lock is on. */
export const DeleteServiceDialog: React.FC<{ list: ServiceList }> = ({ list }) => {
  const s = list.serviceToDelete;
  if (!s) return null;
  return (
    <ConfirmDialog
      isOpen={!!s}
      title={`Delete "${s.providerName}"?`}
      message="This will remove this service and its vault references."
      isDestructive
      confirmLabel="Delete Service"
      onConfirm={list.confirmDelete}
      onCancel={() => list.setServiceToDelete(null)}
    />
  );
};
