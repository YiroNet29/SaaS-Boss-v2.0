import React from 'react';
import { PaymentForm, SourceForm, TransactionForm } from './MoneyForms';
import type { Money } from './useMoney';

/** The forms Cards & Payments opens: add or edit a card or person, top up / correct / settle up, record a payment. */
export const MoneyModals: React.FC<{ m: Money }> = ({ m }) => (
  <>
    {m.editing && <SourceForm source={m.editing === 'new' ? null : m.editing} onClose={() => m.setEditing(null)} />}
    {m.tx && <TransactionForm source={m.tx.source} mode={m.tx.mode} currentBalance={m.tx.balance} onClose={() => m.setTx(null)} />}
    {m.recording && <PaymentForm onClose={() => m.setRecording(false)} />}
  </>
);
