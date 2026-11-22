import { useEffect, useRef } from 'react';

/** Open dialogs, oldest first: Escape closes only the one on top (e.g. "Confirm it's you" over a form). */
const openDialogs: symbol[] = [];

/** Escape closes this dialog while it's open, if it's the topmost one. */
export function useEscapeToClose(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const me = Symbol('dialog');
    openDialogs.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || openDialogs[openDialogs.length - 1] !== me) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openDialogs.lastIndexOf(me);
      if (i >= 0) openDialogs.splice(i, 1);
    };
  }, [open]);
}
