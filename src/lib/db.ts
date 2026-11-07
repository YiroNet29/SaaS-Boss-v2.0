/**
 * Thin Supabase data layer for the workspace context.
 *
 * The UI keeps working against local React state (instant updates, offline-friendly).
 * Every change is also queued here and written to Supabase in order, so a product row
 * always lands before the service rows that point at it.
 */
import { getSupabase } from './supabase/client';
import type {
  AuditLogItem,
  ImportantDate,
  NotificationSettings,
  Payment,
  PaymentSource,
  Product,
  Receipt,
  ServiceLink,
  SourceTransaction,
  Workspace,
} from '../types';

export type Table =
  | 'workspaces'
  | 'products'
  | 'service_links'
  | 'important_dates'
  | 'notification_settings'
  | 'audit_logs'
  | 'payment_sources'
  | 'payments'
  | 'source_transactions'
  | 'receipts';

// Date-only and timestamp fields: the forms use '' for "not set", Postgres needs null.
const NULLABLE_DATE_FIELDS = new Set([
  'startDate',
  'renewalDate',
  'trialEndsAt',
  'snoozedUntil',
  'completedAt',
  'updatedAt',
  'expiresOn',
  'lastCheckedAt',
]);

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * App object -> table row.
 * mode 'insert' drops undefined values so column defaults apply.
 * mode 'update' turns undefined into null so a field can be cleared (e.g. snoozedUntil).
 */
export function toRow(obj: Record<string, unknown>, mode: 'insert' | 'update' = 'insert'): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(obj)) {
    let value = raw;
    if (NULLABLE_DATE_FIELDS.has(key) && value === '') value = null;
    if (value === undefined) {
      if (mode === 'insert') continue;
      value = null;
    }
    row[toSnake(key)] = value;
  }
  return row;
}

/** Table row -> app object. Nulls become absent fields, matching the optional TS types. */
export function fromRow<T>(row: Record<string, unknown>): T {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) continue;
    obj[toCamel(key)] = value;
  }
  return obj as T;
}

// ---------------------------------------------------------------------------
// Ordered write queue
// ---------------------------------------------------------------------------

let queue: Promise<void> = Promise.resolve();
let pending = 0;

export const SYNC_ERROR_EVENT = 'stacktrack:sync-error';

function enqueue(label: string, job: () => PromiseLike<{ error: { message: string } | null }>) {
  pending++;
  queue = queue
    .then(async () => {
      const { error } = await job();
      if (error) throw new Error(error.message);
    })
    .catch((err: Error) => {
      console.error(`[StackTrack sync] ${label} failed:`, err.message);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SYNC_ERROR_EVENT, { detail: { label, message: err.message } }));
      }
    })
    .finally(() => {
      pending--;
    });
}

/** Resolves once every queued write has finished. */
export function flushWrites(): Promise<void> {
  return queue;
}

export function hasPendingWrites(): boolean {
  return pending > 0;
}

export const remote = {
  /** Insert rows, leaving any existing row with the same id untouched (e.g. a renewal already recorded). */
  insertIgnore(table: Table, obj: object | object[]) {
    const rows = (Array.isArray(obj) ? obj : [obj]).map((o) => toRow(o as Record<string, unknown>, 'insert'));
    if (!rows.length) return;
    enqueue(`insert ${table}`, () =>
      getSupabase().from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true, defaultToNull: false })
    );
  },

  upsert(table: Table, obj: object | object[]) {
    const rows = (Array.isArray(obj) ? obj : [obj]).map((o) => toRow(o as Record<string, unknown>, 'insert'));
    if (!rows.length) return;
    const onConflict = table === 'notification_settings' ? 'workspace_id' : 'id';
    enqueue(`upsert ${table}`, () => getSupabase().from(table).upsert(rows, { onConflict, defaultToNull: false }));
  },

  update(table: Table, id: string, patch: object) {
    const row = toRow(patch as Record<string, unknown>, 'update');
    // Never let a patch move a row to another workspace or change its id.
    delete row.id;
    delete row.workspace_id;
    delete row.owner_id;
    if (!Object.keys(row).length) return;
    enqueue(`update ${table}/${id}`, () => getSupabase().from(table).update(row).eq('id', id));
  },

  updateMany(table: Table, ids: string[], patch: object) {
    const row = toRow(patch as Record<string, unknown>, 'update');
    delete row.id;
    delete row.workspace_id;
    if (!ids.length || !Object.keys(row).length) return;
    enqueue(`update ${table} x${ids.length}`, () => getSupabase().from(table).update(row).in('id', ids));
  },

  remove(table: Table, id: string) {
    enqueue(`delete ${table}/${id}`, () => getSupabase().from(table).delete().eq('id', id));
  },
};

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/** Postgres numerics can arrive as strings; make sure money fields are numbers. */
const numify =
  <T,>(fields: string[]) =>
  (rows: T[]): T[] =>
    rows.map((r) => {
      const o = { ...(r as Record<string, unknown>) };
      for (const f of fields) if (o[f] !== undefined && o[f] !== null) o[f] = Number(o[f]);
      return o as T;
    });

async function selectAll<T>(table: Table, workspaceId: string, orderBy?: string): Promise<T[]> {
  let q = getSupabase().from(table).select('*').eq('workspace_id', workspaceId);
  if (orderBy) q = q.order(orderBy, { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []).map((r) => fromRow<T>(r));
}

export async function loadWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await getSupabase().from('workspaces').select('*').order('created_at');
  if (error) throw new Error(`workspaces: ${error.message}`);
  return (data ?? []).map((r) => fromRow<Workspace>(r));
}

export interface WorkspaceData {
  products: Product[];
  services: ServiceLink[];
  dates: ImportantDate[];
  auditLogs: AuditLogItem[];
  notificationSettings: NotificationSettings | null;
  paymentSources: PaymentSource[];
  payments: Payment[];
  sourceTransactions: SourceTransaction[];
  receipts: Receipt[];
}

export async function loadWorkspaceData(workspaceId: string): Promise<WorkspaceData> {
  const supabase = getSupabase();
  const [products, services, dates, auditRes, settingsRes, paymentSources, payments, sourceTransactions, receipts] = await Promise.all([
    selectAll<Product>('products', workspaceId, 'created_at'),
    selectAll<ServiceLink>('service_links', workspaceId, 'created_at'),
    selectAll<ImportantDate>('important_dates', workspaceId, 'created_at'),
    supabase
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('timestamp', { ascending: false })
      .limit(100),
    supabase.from('notification_settings').select('*').eq('workspace_id', workspaceId).maybeSingle(),
    selectAll<PaymentSource>('payment_sources', workspaceId, 'created_at').then(numify(['openingBalance', 'lowBalance'])),
    selectAll<Payment>('payments', workspaceId, 'paid_on').then(numify(['amount', 'etbPaid'])),
    selectAll<SourceTransaction>('source_transactions', workspaceId, 'happened_on').then(numify(['amount', 'etbPaid'])),
    selectAll<Receipt>('receipts', workspaceId, 'created_at').then(numify(['sizeBytes', 'telegramMessageId'])),
  ]);
  if (auditRes.error) throw new Error(`audit_logs: ${auditRes.error.message}`);
  if (settingsRes.error) throw new Error(`notification_settings: ${settingsRes.error.message}`);

  let notificationSettings: NotificationSettings | null = null;
  if (settingsRes.data) {
    const { workspaceId: _ws, ...rest } = fromRow<NotificationSettings & { workspaceId: string }>(settingsRes.data);
    notificationSettings = {
      email: '',
      emailEnabled: false,
      telegramChatId: '',
      telegramEnabled: false,
      telegramVerificationCode: '',
      digestTime: '08:00',
      digestMode: 'daily',
      ...rest,
    };
  }

  return {
    products,
    services,
    dates,
    auditLogs: (auditRes.data ?? []).map((r) => fromRow<AuditLogItem>(r)),
    notificationSettings,
    paymentSources,
    payments,
    sourceTransactions,
    receipts: receipts.map((r) => ({ ...r, extracted: r.extracted ?? {} })),
  };
}
