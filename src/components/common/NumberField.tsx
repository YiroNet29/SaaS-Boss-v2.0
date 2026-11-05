import React, { useEffect, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (n: number) => void;
  /** Number reported while the box is empty or invalid. */
  fallback?: number;
  /** Show an empty box (with placeholder) instead of "0". */
  emptyWhenZero?: boolean;
  integer?: boolean;
};

/**
 * Number input that keeps the text exactly as typed. Plain `value={number}` inputs
 * turn "0" + "30" into "030" and snap back to a default as soon as the box is cleared.
 */
export const NumberField: React.FC<Props> = ({
  value,
  onValueChange,
  fallback = 0,
  emptyWhenZero = false,
  integer = false,
  ...rest
}) => {
  const toText = (n: number) => (emptyWhenZero && n === 0 ? '' : String(n));
  const [text, setText] = useState(() => toText(value));

  // Follow outside changes (e.g. the form resets), but not our own keystrokes.
  useEffect(() => {
    const parsed = integer ? parseInt(text, 10) : parseFloat(text);
    if ((Number.isNaN(parsed) ? fallback : parsed) !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = integer ? parseInt(raw, 10) : parseFloat(raw);
        onValueChange(Number.isNaN(n) ? fallback : n);
      }}
    />
  );
};
