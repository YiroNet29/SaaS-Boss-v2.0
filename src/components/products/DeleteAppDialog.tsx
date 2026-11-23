import React from 'react';
import { Product } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useSensitiveAction } from '../../context/LockContext';

/** The two messages the Classic pages use: on the Apps list, and on one app's page. */
export const DELETE_APP_MESSAGE = {
  list: 'This will delete the product and all associated services and dates.',
  page: 'This will permanently delete this product and all its services and dates.',
};

/**
 * "Delete this app?" with the "Confirm it's you" step, used by every layout's Apps list and app page.
 * Shown while `product` is set.
 */
export const DeleteAppDialog: React.FC<{
  product: Product | null;
  message: string;
  onClose: () => void;
  /** After the app is deleted (the app page goes back to the list). */
  onDeleted?: () => void;
}> = ({ product, message, onClose, onDeleted }) => {
  const { deleteProduct } = useWorkspace();
  const sensitive = useSensitiveAction();
  if (!product) return null;
  return (
    <ConfirmDialog
      isOpen
      title={`Delete "${product.name}"?`}
      message={message}
      isDestructive
      confirmLabel="Delete Product"
      onConfirm={async () => {
        if (!(await sensitive(`delete "${product.name}" and everything in it`))) return onClose();
        deleteProduct(product.id);
        onClose();
        onDeleted?.();
      }}
      onCancel={onClose}
    />
  );
};
