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
/** Fired with { waiting, saved } whenever the number of changes waiting for the connection changes. */
export const OFFLINE_WRITES_EVENT = 'stacktrack:offline-writes';

type WriteResult = PromiseLike<{ error: { message: string } | null }>;
interface Job {
  label: string;
  run: () => WriteResult;
}

/**
 * Writes that failed because the connection was down, oldest first. They stay in memory only
 * (live data is never stored in the browser) and are retried in order when the connection is back.
 */
const parked: Job[] = [];
let retryTimer: ReturnType<typeof setTimeout> | undefined;

const isNetworkError = (message: string) =>
  /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet_disconnected/i.test(message) ||
  (typeof navigator !== 'undefined' && navigator.onLine === false);

function announce(saved = 0) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OFFLINE_WRITES_EVENT, { detail: { waiting: parked.length, saved } }));
}

function reportError(label: string, message: string) {
  console.error(`[StackTrack sync] ${label} failed:`, message);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_ERROR_EVENT, { detail: { label, message } }));
  }
}

/** Runs one write. Returns false when it couldn't reach the server (the caller keeps it for later). */
async function attempt(job: Job): Promise<boolean> {
  try {
    const { error } = await job.run();
    if (!error) return true;
    if (isNetworkError(error.message)) return false;
    reportError(job.label, error.message);
    return true; // a real error (e.g. a rule the database enforces): report it, don't retry
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(message)) return false;
    reportError(job.label, message);
    return true;
  }
}

function scheduleRetry() {
  if (retryTimer || typeof window === 'undefined') return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    retryParked();
  }, 15_000);
}

/** Replays the waiting writes in order; stops at the first one that still can't get through. */
export function retryParked(): Promise<void> {
  queue = queue.then(async () => {
    let saved = 0;
    while (parked.length) {
      if (!(await attempt(parked[0]))) {
        scheduleRetry();
        announce();
        return;
      }
      parked.shift();
      saved++;
    }
    if (saved) announce(saved);
  });
  return queue;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void retryParked());
  // Closing the tab would lose writes that are still waiting.
  window.addEventListener('beforeunload', (e) => {
    if (parked.length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function enqueue(label: string, run: () => WriteResult) {
  pending++;
  const job: Job = { label, run };
  queue = queue
    .then(async () => {
      // Keep the order: while earlier writes are waiting, later ones wait behind them.
      if (parked.length || !(await attempt(job))) {
        parked.push(job);
        scheduleRetry();
        announce();
      }
    })
    .finally(() => {
      pending--;
    });
}

/** Resolves once every queued write has finished (writes waiting for the connection don't count). */
export function flushWrites(): Promise<void> {
  return queue;
}

export function hasPendingWrites(): boolean {
  return pending > 0 || parked.length > 0;
}

export const waitingWrites = () => parked.length;

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

/** Number columns per table (Postgres numerics can arrive as strings). */
const NUMBER_FIELDS: Partial<Record<Table, string[]>> = {
  service_links: ['cost'],
  payments: ['amount', 'etbPaid'],
  payment_sources: ['openingBalance', 'lowBalance'],
  source_transactions: ['amount', 'etbPaid'],
  receipts: ['sizeBytes', 'telegramMessageId'],
};

/** A row from a live update -> app object, the same way the loaders read it. */
export function liveRowToApp<T>(table: Table, row: Record<string, unknown>): T {
  const [obj] = numify<Record<string, unknown>>(NUMBER_FIELDS[table] ?? [])([fromRow<Record<string, unknown>>(row)]);
  if (table === 'receipts' && !obj.extracted) obj.extracted = {};
  return obj as T;
}

/** Tables whose changes are pushed to the open app (see 0005_realtime.sql). */
export const LIVE_TABLES = ['receipts', 'payments', 'important_dates', 'service_links', 'notification_settings'] as const;
export type LiveTable = (typeof LIVE_TABLES)[number];

/** Fired with a short message when something arrives from outside this tab (e.g. a Telegram receipt). */
export const LIVE_UPDATE_EVENT = 'stacktrack:live-update';

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
