import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRow } from './db';
import { loadMoneyContext } from './reminders-server';
import { readReceipt, type ReadResult } from './receipt-reader';
import {
  RECEIPT_FILE_TYPES,
  cleanDetails,
  describePlan,
  isSavableCurrency,
  planReceiptPayment,
  suggestMatch,
  type ReceiptPlan,
} from '../utils/receipts';
import type { PaymentSource, Receipt, ReceiptDetails, ServiceLink } from '../types';

export const RECEIPT_BUCKET = 'receipts';

/** Files live at <workspace id>/<receipt id>.<ext>; storage policies key off the first folder. */
export const receiptPath = (workspaceId: string, receiptId: string, mimeType: string) =>
  `${workspaceId}/${receiptId}.${RECEIPT_FILE_TYPES[mimeType] ?? 'bin'}`;

/** True only for exactly <workspace id>/<receipt id>.<known ext> (no other folder, no ".."). */
export function isOwnReceiptPath(path: string, workspaceId: string, receiptId: string): boolean {
  const exts = Object.values(RECEIPT_FILE_TYPES);
  const [folder, file, ...rest] = path.split('/');
  if (rest.length || folder !== workspaceId || !file) return false;
  const dot = file.lastIndexOf('.');
  return file.slice(0, dot) === receiptId && exts.includes(file.slice(dot + 1));
}

const toReceipt = (row: Record<string, unknown>): Receipt => {
  const r = fromRow<Receipt>(row);
  return { ...r, extracted: cleanDetails(r.extracted), sizeBytes: r.sizeBytes === undefined ? undefined : Number(r.sizeBytes) };
};

export async function loadReceipt(admin: SupabaseClient, id: string, workspaceIds?: string[]): Promise<Receipt | null> {
  let q = admin.from('receipts').select('*').eq('id', id);
  if (workspaceIds) q = q.in('workspace_id', workspaceIds);
  const { data } = await q.maybeSingle();
  return data ? toReceipt(data as Record<string, unknown>) : null;
}

/** Inserts a new receipt row. Returns 'duplicate' when this receipt (e.g. a redelivered Telegram message) exists. */
export async function createReceipt(admin: SupabaseClient, row: Record<string, unknown>): Promise<'created' | 'duplicate'> {
  const { error } = await admin.from('receipts').insert(row);
  if (!error) return 'created';
  if (error.code === '23505') return 'duplicate';
  throw new Error(error.message);
}

export async function storeReceiptFile(admin: SupabaseClient, receipt: Receipt, bytes: Uint8Array, mimeType: string): Promise<string> {
  const path = receiptPath(receipt.workspaceId, receipt.id, mimeType);
  const { error } = await admin.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Couldn't store the file: ${error.message}`);
  await admin.from('receipts').update({ storage_path: path, mime_type: mimeType, size_bytes: bytes.byteLength }).eq('id', receipt.id);
  return path;
}

export async function downloadReceiptFile(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(RECEIPT_BUCKET).download(path);
  if (error || !data) throw new Error(`Couldn't open the stored file: ${error?.message ?? 'missing'}`);
  return new Uint8Array(await data.arrayBuffer());
}

export interface ProcessedReceipt {
  receipt: Receipt;
  read: ReadResult;
  service?: ServiceLink;
  source?: PaymentSource;
  plan?: ReceiptPlan;
  planText?: string;
}

/**
 * Reads a receipt, suggests the service and card it belongs to, and saves both on the row
 * (status "needs_review"). Nothing is recorded as paid until you confirm.
 */
export async function processReceipt(
  admin: SupabaseClient,
  receipt: Receipt,
  input: { bytes?: Uint8Array; note?: string },
  today: string
): Promise<ProcessedReceipt> {
  const read = await readReceipt({
    bytes: input.bytes,
    mimeType: receipt.mimeType,
    text: receipt.textContent,
    note: input.note,
  });
  const details: ReceiptDetails = read.details ?? { readBy: 'manual' };

  const money = await loadMoneyContext(admin, receipt.workspaceId);
  const match = money ? suggestMatch(details, money.services, money.sources) : { score: 0 };
  const extracted = cleanDetails({ ...details, suggestedServiceId: match.serviceId, suggestedSourceId: match.sourceId });
  const service = money?.services.find((s) => s.id === match.serviceId);
  const source = money?.sources.find((s) => s.id === match.sourceId);

  let plan: ReceiptPlan | undefined;
  if (money && extracted.amount !== undefined && isSavableCurrency(extracted.currency)) {
    plan = planReceiptPayment({ receiptId: receipt.id, date: extracted.date ?? today, service, payments: money.payments, today });
  }

  const updatedAt = new Date().toISOString();
  const patch = { status: 'needs_review', extracted, error: read.ok ? null : read.message, updated_at: updatedAt };
  const { error } = await admin.from('receipts').update(patch).eq('id', receipt.id);
  if (error) throw new Error(error.message);

  return {
    receipt: { ...receipt, status: 'needs_review', extracted, error: read.ok ? undefined : read.message, updatedAt },
    read,
    service,
    source,
    plan,
    planText: plan ? describePlan(plan, service?.providerName) : undefined,
  };
}

export async function markReceiptFailed(admin: SupabaseClient, id: string, message: string) {
  await admin.from('receipts').update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', id);
}

type Result = { ok: boolean; note: string };

/**
 * "✅ Save" from Telegram: records the payment the same way the app's Confirm does
 * (attach to an existing payment, pay the current renewal, or add a new payment).
 */
export async function confirmReceiptOnServer(
  admin: SupabaseClient,
  receiptId: string,
  workspaceIds: string[],
  today: string,
  changedBy = 'telegram'
): Promise<Result> {
  const receipt = await loadReceipt(admin, receiptId, workspaceIds);
  if (!receipt) return { ok: false, note: 'Receipt not found.' };
  if (receipt.status === 'confirmed') return { ok: false, note: 'Already saved.' };
  if (receipt.status === 'ignored') return { ok: false, note: 'This receipt was ignored. Open the app to save it.' };

  const d = receipt.extracted;
  if (d.amount === undefined || !isSavableCurrency(d.currency)) {
    return { ok: false, note: 'Amount missing or not in USD/ETB. Open the app to finish it.' };
  }
  const money = await loadMoneyContext(admin, receipt.workspaceId);
  if (!money) return { ok: false, note: 'Payments are not set up yet (run 0003_payments.sql).' };

  const date = d.date ?? today;
  const service = money.services.find((s) => s.id === d.suggestedServiceId);
  const plan = planReceiptPayment({ receiptId, date, service, payments: money.payments, today });
  const sourceId = d.suggestedSourceId ?? service?.paymentSourceId ?? null;
  const base = {
    workspace_id: receipt.workspaceId,
    service_link_id: service?.id ?? null,
    source_id: sourceId,
    amount: d.amount,
    currency: d.currency,
    receipt_id: receipt.id,
  };

  if (plan.kind === 'attach') {
    const existing = money.payments.find((p) => p.id === plan.paymentId);
    const { error } = await admin
      .from('payments')
      .update({ amount: d.amount, currency: d.currency, receipt_id: receipt.id, source_id: existing?.sourceId ?? sourceId })
      .eq('id', plan.paymentId);
    if (error) return { ok: false, note: `Couldn't save: ${error.message}` };
  } else if (plan.kind === 'renewal') {
    const { data: moved, error: moveErr } = await admin
      .from('service_links')
      .update({ renewal_date: plan.next, updated_at: new Date().toISOString() })
      .eq('id', service!.id)
      .eq('renewal_date', plan.due)
      .select('id');
    if (moveErr) return { ok: false, note: `Couldn't save: ${moveErr.message}` };
    if (!moved?.length) return { ok: false, note: 'The renewal changed meanwhile. Open the app to save this receipt.' };
    const { error } = await admin
      .from('payments')
      .upsert({ ...base, id: plan.paymentId, paid_on: date, origin: 'receipt', note: `Renewal due ${plan.due}` }, { onConflict: 'id' });
    if (error) return { ok: false, note: `Couldn't save: ${error.message}` };
  } else {
    const note = [d.vendor, d.summary].filter(Boolean).join(' · ').slice(0, 200);
    const { error } = await admin
      .from('payments')
      .upsert({ ...base, id: plan.paymentId, paid_on: date, origin: 'receipt', note }, { onConflict: 'id' });
    if (error) return { ok: false, note: `Couldn't save: ${error.message}` };
  }

  await admin
    .from('receipts')
    .update({ status: 'confirmed', service_link_id: service?.id ?? null, payment_id: plan.paymentId, updated_at: new Date().toISOString() })
    .eq('id', receipt.id);
  const what = describePlan(plan, service?.providerName);
  await admin.from('audit_logs').insert({
    id: 'audit-' + crypto.randomUUID().slice(0, 12),
    workspace_id: receipt.workspaceId,
    item_type: 'workspace',
    item_id: receipt.id,
    action: 'update',
    changed_by: changedBy,
    details: `Saved receipt (${d.vendor ?? 'unknown vendor'} ${d.amount} ${d.currency}): ${what}`,
  });
  const short = plan.kind === 'renewal' ? `Saved · next renewal ${plan.next}` : plan.kind === 'attach' ? 'Saved to the existing payment' : 'Saved as a new payment';
  return { ok: true, note: short };
}

export async function ignoreReceiptOnServer(admin: SupabaseClient, receiptId: string, workspaceIds: string[]): Promise<Result> {
  const receipt = await loadReceipt(admin, receiptId, workspaceIds);
  if (!receipt) return { ok: false, note: 'Receipt not found.' };
  if (receipt.status === 'confirmed') return { ok: false, note: 'Already saved. Open the app to undo it.' };
  if (receipt.status === 'ignored') return { ok: false, note: 'Already ignored.' };
  await admin.from('receipts').update({ status: 'ignored', updated_at: new Date().toISOString() }).eq('id', receiptId);
  return { ok: true, note: 'Ignored' };
}
