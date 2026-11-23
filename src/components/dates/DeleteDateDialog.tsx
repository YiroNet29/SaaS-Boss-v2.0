import React from 'react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { DatesList } from './useDatesList';

/** "Delete this date?" for the Dates page in every layout. */
export const DeleteDateDialog: React.FC<{ list: Pick<DatesList, 'dateToDelete' | 'confirmDelete' | 'cancelDelete'> }> = ({ list }) => {
  const d = list.dateToDelete;
  if (!d) return null;
  return (
    <ConfirmDialog
      isOpen
      title={`Delete "${d.title}"?`}
      message="This will delete this date."
      isDestructive
      confirmLabel="Delete Date"
      onConfirm={list.confirmDelete}
      onCancel={list.cancelDelete}
    />
  );
};
