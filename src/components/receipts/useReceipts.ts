import React, { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSensitiveAction } from '../../context/LockContext';
import { authedFetch } from '../../lib/api-client';
import type { Receipt } from '../../types';

/** File types the "Add photo or PDF" button accepts. */
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

/**
 * The Receipts inbox's state, shared by every layout: adding a file or pasted text, the paste panel,
 * the status line, whether Claude reads receipts, the lists to review and done, and deleting.
 */
export function useReceipts() {
  const { receipts, addReceipt, isDemoMode, deleteReceipt, restoreReceipt } = useWorkspace();
  const sensitive = useSensitiveAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [aiReader, setAiReader] = useState<boolean | null>(null);

  useEffect(() => {
    if (isDemoMode) return setAiReader(null);
    authedFetch<{ aiReader: boolean }>('/api/receipts/read')
      .then((r) => setAiReader(r.aiReader))
      .catch(() => setAiReader(null));
  }, [isDemoMode]);

  const open = receipts.filter((r) => r.status !== 'confirmed' && r.status !== 'ignored');
  const done = receipts.filter((r) => r.status === 'confirmed' || r.status === 'ignored');

  const add = async (input: { file?: File; text?: string }) => {
    setBusy(true);
    setMessage(null);
    const res = await addReceipt(input);
    setBusy(false);
    if (!res.ok) return setMessage({ tone: 'error', text: res.error ?? 'Could not add the receipt.' });
    setMessage({ tone: 'ok', text: 'Receipt added. Check the details below and confirm.' });
    setText('');
    setPasting(false);
  };

  const remove = async (r: Receipt) => {
    if (!window.confirm('Delete this receipt and its file? Any payment it was saved to stays.')) return;
    if (!(await sensitive('delete a receipt'))) return;
    await deleteReceipt(r.id);
  };

  /** Props for the hidden file input behind "Add photo or PDF". */
  const fileInputProps = {
    ref: fileRef,
    type: 'file',
    accept: ACCEPT,
    className: 'hidden',
    'aria-label': 'Receipt file',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) void add({ file: f });
    },
  } as const;
  const pickFile = () => fileRef.current?.click();

  return {
    receipts,
    open,
    done,
    isDemoMode,
    aiReader,
    busy,
    message,
    pasting,
    setPasting,
    text,
    setText,
    add,
    remove,
    restore: restoreReceipt,
    fileInputProps,
    pickFile,
  };
}
