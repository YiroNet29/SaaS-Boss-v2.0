import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Workspace,
  Product,
  ServiceLink,
  ImportantDate,
  StackTemplate,
  ReminderLog,
  NotificationSettings,
  AuditLogItem,
  DueSoonGroup,
  Payment,
  PaymentSource,
  SourceTransaction,
  Currency,
  EnvironmentType,
  Receipt,
  ExpiryCheck,
  ImportantDateType,
} from '../types';
import {
  INITIAL_WORKSPACE,
  INITIAL_PRODUCTS,
  INITIAL_SERVICES,
  INITIAL_DATES,
  INITIAL_REMINDER_LOGS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PAYMENT_SOURCES,
  INITIAL_PAYMENTS,
  INITIAL_SOURCE_TRANSACTIONS,
  INITIAL_RECEIPTS,
} from '../data/seedData';
import { STARTER_TEMPLATES } from '../data/templates';
import {
  calculateTotalMonthlyCost,
  calculateProviderConcentration,
  calculateCategoryBreakdown,
  ProviderConcentrationStat,
} from '../utils/cost';
import {
  getDaysDiff,
  computeNextRecurringDate,
  computeSnoozeDate,
  snoozeUntil,
} from '../utils/reminders';
import {
  calculateStackHealth,
  calculateMonthlyCashflowForecast,
  StackHealthReport,
  MonthlyCashflowForecast,
} from '../utils/audit';
import { ParsedImportRow } from '../utils/csv';
import { advanceAfterPayment, computeRollForwards, describeRollForward } from '../utils/renewals';
import { crossedRenewals, renewalPaymentId } from '../utils/ledger';
import { isPlausibleEtbRate, needsRateRefresh } from '../utils/fx';
import { remote, loadWorkspaces, loadWorkspaceData, toRow, LIVE_TABLES, LIVE_UPDATE_EVENT, liveRowToApp, fromRow, type LiveTable } from '../lib/db';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase/client';
import { authedFetch } from '../lib/api-client';
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_FILE_TYPES,
  cleanDetails,
  describePlan,
  parseReceiptText,
  planReceiptPayment,
  receiptMimeType,
  suggestMatch,
} from '../utils/receipts';
import { useAuth } from './AuthContext';

interface WorkspaceContextType {
  // Demo Mode
  isDemoMode: boolean;
  setDemoMode: (val: boolean) => void;
  importDemoStacksIntoLive: () => void;

  // Live (Supabase) sync status
  liveStatus: 'idle' | 'loading' | 'ready' | 'error';
  liveError: string | null;
  reloadLiveData: () => void;

  // State
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  products: Product[];
  services: ServiceLink[];
  dates: ImportantDate[];
  templates: StackTemplate[];
  reminderLogs: ReminderLog[];
  notificationSettings: NotificationSettings;
  auditLogs: AuditLogItem[];

  // Computed metrics & Upgrades
  totalCosts: { totalInBase: number; totalUsd: number; totalEtb: number };
  providerConcentration: ProviderConcentrationStat[];
  categoryBreakdown: { category: string; costUsd: number; costEtb: number; count: number }[];
  dueSoonGroups: DueSoonGroup[];
  overdueCount: number;
  trialsEndingCount: number;
  activeServicesCount: number;
  knownProviders: string[];
  isRateStale: boolean;
  stackHealth: StackHealthReport;
  cashflowForecast: MonthlyCashflowForecast[];
  autoRenewingServices: ServiceLink[];

  // Actions
  switchWorkspace: (workspaceId: string) => void;
  /** Creates a workspace and switches to it (live: once it is saved). */
  createWorkspace: (name: string, baseCurrency: Currency, etbPerUsd: number, leadDays: number[]) => Promise<string>;
  updateWorkspace: (updates: Partial<Workspace>) => void;
  /** Fetch today's USD->ETB rate and store it (auto mode). */
  refreshExchangeRate: () => Promise<{ ok: boolean; rate?: number; source?: string; error?: string }>;

  // Product Actions
  addProduct: (data: Omit<Product, 'id' | 'workspaceId' | 'createdAt'>) => string;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  cloneProduct: (productId: string, newName: string) => string;
  createProductFromTemplate: (templateId: string, productName: string, description?: string) => string;

  // ServiceLink Actions
  addServiceLink: (data: Omit<ServiceLink, 'id' | 'workspaceId' | 'createdAt'>) => string;
  updateServiceLink: (id: string, updates: Partial<ServiceLink>) => void;
  deleteServiceLink: (id: string) => void;
  duplicateServiceToProducts: (serviceId: string, targetProductIds: string[]) => void;
  bulkUpdateServices: (serviceIds: string[], updates: Partial<ServiceLink>) => void;

  // ImportantDate Actions
  addImportantDate: (data: Omit<ImportantDate, 'id' | 'workspaceId' | 'createdAt'>) => string;
  updateImportantDate: (id: string, updates: Partial<ImportantDate>) => void;
  deleteImportantDate: (id: string) => void;
  snoozeImportantDate: (dateId: string, days: number) => void;
  markDateDone: (dateId: string) => void;

  // Template Actions
  addTemplate: (template: Omit<StackTemplate, 'id'>) => string;

  // Settings & Integration Actions
  updateNotificationSettings: (updates: Partial<NotificationSettings>) => void;
  resetToSampleSeedData: () => void;
  importServicesBatch: (rows: ParsedImportRow[]) => { addedProducts: number; addedServices: number };

  // Payments (Phase 4)
  paymentSources: PaymentSource[];
  payments: Payment[];
  sourceTransactions: SourceTransaction[];
  addPaymentSource: (data: Omit<PaymentSource, 'id' | 'workspaceId' | 'createdAt'>) => string;
  updatePaymentSource: (id: string, updates: Partial<PaymentSource>) => void;
  deletePaymentSource: (id: string) => void;
  addSourceTransaction: (data: Omit<SourceTransaction, 'id' | 'workspaceId' | 'createdAt'>) => void;
  deleteSourceTransaction: (id: string) => void;
  recordPayment: (data: Omit<Payment, 'id' | 'workspaceId' | 'createdAt'> & { id?: string }) => string;
  updatePayment: (id: string, updates: Partial<Payment>) => void;
  deletePayment: (id: string) => void;
  /** Manual renewal paid: records the payment for the current cycle and moves the date on. */
  markServicePaid: (serviceId: string, opts?: { etbPaid?: number }) => { ok: boolean; next?: string; error?: string };

  // Receipts (Phase 4.5)
  receipts: Receipt[];
  /** Adds a photo/PDF or pasted email text, then reads it (Claude on the server, if set up). */
  addReceipt: (input: { file?: File; text?: string }) => Promise<{ ok: boolean; error?: string }>;
  /** Reads a receipt again (e.g. after adding the Anthropic key). */
  rereadReceipt: (id: string) => Promise<{ ok: boolean; error?: string }>;
  /** Records the payment the receipt proves and marks it confirmed. */
  confirmReceipt: (id: string, draft: ReceiptDraft) => { ok: boolean; note: string };
  ignoreReceipt: (id: string) => void;
  restoreReceipt: (id: string) => void;
  deleteReceipt: (id: string) => Promise<void>;

  // Expiry checks (Phase 5)
  /** Checks a domain/SSL date now (live workspace) and saves what was found. */
  checkDateNow: (id: string) => Promise<{ ok: boolean; error?: string; notes?: string[] }>;
  /** Looks up a domain's or site's expiry without saving (the date form). */
  lookupExpiry: (type: ImportantDateType, target: string) => Promise<{ ok: boolean; check?: ExpiryCheck; error?: string }>;
  /** A short-lived link to view the stored file (null when there is none). */
  receiptFileUrl: (receipt: Receipt) => Promise<string | null>;
}

/** What you confirm on a receipt (after any corrections). */
export interface ReceiptDraft {
  vendor?: string;
  amount: number;
  currency: Currency;
  date: string;
  serviceLinkId?: string;
  sourceId?: string;
  etbPaid?: number;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_PREFIX = 'stacktrack_v2_';


/**
 * Browser storage keeps only the demo sandbox and harmless preferences. Live workspace data
 * (services, emails, notes, settings) stays in memory and is loaded from Supabase each time,
 * so nothing readable is left on the device.
 */
const LIVE_KEYS_KEPT = new Set(['active_workspace_id']);

function readLocal(scope: string, key: string): string | null {
  if (scope === 'live_' && !LIVE_KEYS_KEPT.has(key)) return null;
  try {
    return localStorage.getItem(STORAGE_PREFIX + scope + key);
  } catch {
    return null;
  }
}

function writeLocal(scope: string, key: string, value: string) {
  if (scope === 'live_' && !LIVE_KEYS_KEPT.has(key)) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + scope + key, value);
  } catch {
    /* storage full or unavailable */
  }
}

/** Removes live-workspace copies written by older versions of the app. */
export function purgeLiveDataFromBrowser() {
  try {
    for (const key of Object.keys(localStorage)) {
      const liveKey = key.startsWith(STORAGE_PREFIX + 'live_') && !LIVE_KEYS_KEPT.has(key.slice((STORAGE_PREFIX + 'live_').length));
      const oldSharedSettings = key === STORAGE_PREFIX + 'notificationSettings';
      if (liveKey || oldSharedSettings) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

const EMPTY_NOTIFICATIONS: NotificationSettings = {
  email: '',
  emailEnabled: false,
  telegramChatId: '',
  telegramEnabled: false,
  telegramVerificationCode: '',
  digestTime: '08:00',
  digestMode: 'daily',
};

const LIVE_INITIAL_WORKSPACE: Workspace = {
  id: 'ws-founder-live',
  name: 'Founder Production Studio',
  baseCurrency: 'USD',
  timezone: 'Africa/Addis_Ababa',
  exchangeRates: {
    ETB_per_USD: 130.0,
    updatedAt: new Date().toISOString(),
  },
  defaultLeadDays: [30, 14, 7, 1],
  vaultBaseUrl: '',
  createdAt: new Date().toISOString(),
  ownerId: 'usr-founder-001',
};

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Demo Mode state: default to true so first-time visitors see rich sample data, with instant toggle to live
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'is_demo_mode');
    return saved !== null ? saved === 'true' : true;
  });

  const { user } = useAuth();
  useEffect(() => {
    purgeLiveDataFromBrowser();
  }, []);
  // Writes go to Supabase only for a signed-in user outside demo mode.
  const canSync = !isDemoMode && !!user;
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** The first workspace being created for a new user (shared by overlapping loads). */
  const firstWorkspace = useRef<{ uid: string; created: Promise<Workspace> } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveReloadKey, setLiveReloadKey] = useState(0);
  const reloadLiveData = useCallback(() => setLiveReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!user) setLiveStatus('idle');
  }, [user]);

  // Live vs Demo separate storages
  const storageKey = isDemoMode ? 'demo_' : 'live_';

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const saved = readLocal(storageKey, 'workspaces');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return isDemoMode ? [INITIAL_WORKSPACE] : [LIVE_INITIAL_WORKSPACE];
  });

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(() => {
    const saved = readLocal(storageKey, 'active_workspace_id');
    return saved || (isDemoMode ? INITIAL_WORKSPACE.id : LIVE_INITIAL_WORKSPACE.id);
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = readLocal(storageKey, 'products');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return isDemoMode ? INITIAL_PRODUCTS : [];
  });

  const [services, setServices] = useState<ServiceLink[]>(() => {
    const saved = readLocal(storageKey, 'services');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return isDemoMode ? INITIAL_SERVICES : [];
  });

  const [dates, setDates] = useState<ImportantDate[]>(() => {
    const saved = readLocal(storageKey, 'dates');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return isDemoMode ? INITIAL_DATES : [];
  });

  // Built-in templates always come from the code, so improvements reach you; only your own are kept in the browser.
  const [templates, setTemplates] = useState<StackTemplate[]>(() => {
    let mine: StackTemplate[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'templates') || '[]') as StackTemplate[];
      mine = saved.filter((t) => !t.isBuiltIn && !STARTER_TEMPLATES.some((b) => b.id === t.id));
    } catch {
      // A damaged entry: start from the built-ins.
    }
    return [...STARTER_TEMPLATES, ...mine];
  });

  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>(() => {
    const saved = readLocal(storageKey, 'reminderLogs');
    return saved ? JSON.parse(saved) : (isDemoMode ? INITIAL_REMINDER_LOGS : []);
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    const saved = readLocal(storageKey, 'notificationSettings');
    return saved ? JSON.parse(saved) : isDemoMode ? INITIAL_NOTIFICATIONS : EMPTY_NOTIFICATIONS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    const saved = readLocal(storageKey, 'auditLogs');
    return saved ? JSON.parse(saved) : (isDemoMode ? INITIAL_AUDIT_LOGS : []);
  });

  const [paymentSources, setPaymentSources] = useState<PaymentSource[]>(() => {
    const saved = readLocal(storageKey, 'paymentSources');
    return saved ? JSON.parse(saved) : isDemoMode ? INITIAL_PAYMENT_SOURCES : [];
  });
  const [payments, setPayments] = useState<Payment[]>(() => {
    const saved = readLocal(storageKey, 'payments');
    return saved ? JSON.parse(saved) : isDemoMode ? INITIAL_PAYMENTS : [];
  });
  const [sourceTransactions, setSourceTransactions] = useState<SourceTransaction[]>(() => {
    const saved = readLocal(storageKey, 'sourceTransactions');
    return saved ? JSON.parse(saved) : isDemoMode ? INITIAL_SOURCE_TRANSACTIONS : [];
  });
  const [receipts, setReceipts] = useState<Receipt[]>(() => {
    const saved = readLocal(storageKey, 'receipts');
    return saved ? JSON.parse(saved) : isDemoMode ? INITIAL_RECEIPTS : [];
  });
  // Demo uploads have no storage: keep a preview link for this visit only.
  const demoFileUrls = useRef(new Map<string, string>());

  // Switch demo mode
  const setDemoMode = useCallback((val: boolean) => {
    setIsDemoMode(val);
    setLiveStatus('idle');
    localStorage.setItem(STORAGE_PREFIX + 'is_demo_mode', String(val));
    const nextKey = val ? 'demo_' : 'live_';
    const savedWs = readLocal(nextKey, 'workspaces');
    if (savedWs) {
      try {
        const parsed = JSON.parse(savedWs);
        setWorkspaces(parsed);
        const savedId = readLocal(nextKey, 'active_workspace_id');
        setCurrentWorkspaceId(savedId || parsed[0]?.id || (val ? INITIAL_WORKSPACE.id : LIVE_INITIAL_WORKSPACE.id));
      } catch {
        // fallback
      }
    } else {
      setWorkspaces(val ? [INITIAL_WORKSPACE] : [LIVE_INITIAL_WORKSPACE]);
      setCurrentWorkspaceId(val ? INITIAL_WORKSPACE.id : LIVE_INITIAL_WORKSPACE.id);
    }

    const savedProds = readLocal(nextKey, 'products');
    setProducts(savedProds ? JSON.parse(savedProds) : (val ? INITIAL_PRODUCTS : []));

    const savedSrvs = readLocal(nextKey, 'services');
    setServices(savedSrvs ? JSON.parse(savedSrvs) : (val ? INITIAL_SERVICES : []));

    const savedDates = readLocal(nextKey, 'dates');
    setDates(savedDates ? JSON.parse(savedDates) : (val ? INITIAL_DATES : []));

    const savedSources = readLocal(nextKey, 'paymentSources');
    setPaymentSources(savedSources ? JSON.parse(savedSources) : val ? INITIAL_PAYMENT_SOURCES : []);
    const savedPayments = readLocal(nextKey, 'payments');
    setPayments(savedPayments ? JSON.parse(savedPayments) : val ? INITIAL_PAYMENTS : []);
    const savedTx = readLocal(nextKey, 'sourceTransactions');
    setSourceTransactions(savedTx ? JSON.parse(savedTx) : val ? INITIAL_SOURCE_TRANSACTIONS : []);
    const savedReceipts = readLocal(nextKey, 'receipts');
    setReceipts(savedReceipts ? JSON.parse(savedReceipts) : val ? INITIAL_RECEIPTS : []);
  }, []);

  // Save to storage
  useEffect(() => {
    writeLocal(storageKey, 'workspaces', JSON.stringify(workspaces));
  }, [workspaces, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'active_workspace_id', currentWorkspaceId);
  }, [currentWorkspaceId, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'products', JSON.stringify(products));
  }, [products, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'services', JSON.stringify(services));
  }, [services, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'dates', JSON.stringify(dates));
  }, [dates, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    writeLocal(storageKey, 'reminderLogs', JSON.stringify(reminderLogs));
  }, [reminderLogs, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'notificationSettings', JSON.stringify(notificationSettings));
  }, [notificationSettings, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'auditLogs', JSON.stringify(auditLogs));
  }, [auditLogs, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'paymentSources', JSON.stringify(paymentSources));
    writeLocal(storageKey, 'payments', JSON.stringify(payments));
    writeLocal(storageKey, 'sourceTransactions', JSON.stringify(sourceTransactions));
  }, [paymentSources, payments, sourceTransactions, storageKey]);

  useEffect(() => {
    writeLocal(storageKey, 'receipts', JSON.stringify(receipts));
  }, [receipts, storageKey]);

  // Live mode: load the signed-in user's workspaces and data from Supabase.
  // Local state stays the source the UI renders from; writes are mirrored through `remote`.
  useEffect(() => {
    if (!canSync || !user) return;
    let cancelled = false;

    (async () => {
      setLiveStatus('loading');
      setLiveError(null);
      try {
        let list = await loadWorkspaces();
        if (!list.length) {
          // First sign-in: create a personal workspace, exactly once. The load runs again straight
          // away (for the new workspace id), and a second run that didn't wait for this one would
          // find no workspace yet and create a duplicate.
          if (firstWorkspace.current?.uid !== user.uid) {
            const ws: Workspace = {
              ...LIVE_INITIAL_WORKSPACE,
              id: 'ws-' + crypto.randomUUID().slice(0, 12),
              name: `${user.displayName}'s Workspace`,
              ownerId: user.uid,
              createdAt: new Date().toISOString(),
              exchangeRates: { ...LIVE_INITIAL_WORKSPACE.exchangeRates, updatedAt: new Date().toISOString() },
            };
            const created = (async () => {
              const { error } = await getSupabase().from('workspaces').insert(toRow(ws as unknown as Record<string, unknown>));
              if (error) {
                firstWorkspace.current = null;
                throw new Error(`workspaces: ${error.message}`);
              }
              return ws;
            })();
            firstWorkspace.current = { uid: user.uid, created };
          }
          list = [await firstWorkspace.current!.created];
        }
        if (cancelled) return;

        const activeId = list.some((w) => w.id === currentWorkspaceId) ? currentWorkspaceId : list[0].id;
        setWorkspaces(list);
        if (activeId !== currentWorkspaceId) {
          setCurrentWorkspaceId(activeId);
          return; // the effect re-runs for the new workspace id
        }

        const data = await loadWorkspaceData(activeId);
        if (cancelled) return;

        // Keep only this user's workspaces in the live cache.
        const allowed = new Set(list.map((w) => w.id));
        const replace = <T extends { workspaceId: string }>(prev: T[], next: T[]) => [
          ...prev.filter((x) => x.workspaceId !== activeId && allowed.has(x.workspaceId)),
          ...next,
        ];
        setProducts((prev) => replace(prev, data.products));
        setServices((prev) => replace(prev, data.services));
        setDates((prev) => replace(prev, data.dates));
        setAuditLogs((prev) => replace(prev, data.auditLogs));
        setPaymentSources((prev) => replace(prev, data.paymentSources));
        setPayments((prev) => replace(prev, data.payments));
        setSourceTransactions((prev) => replace(prev, data.sourceTransactions));
        setReceipts((prev) => replace(prev, data.receipts));
        setNotificationSettings(
          data.notificationSettings ?? {
            email: user.email,
            emailEnabled: false,
            telegramChatId: '',
            telegramEnabled: false,
            telegramVerificationCode: '',
            digestTime: '08:00',
            digestMode: 'daily',
          }
        );
        setLiveStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[StackTrack] Failed to load live workspace:', err);
        setLiveError(err instanceof Error ? err.message : String(err));
        setLiveStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canSync, user?.uid, currentWorkspaceId, liveReloadKey]);

  // Current active workspace
  const currentWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0] || (isDemoMode ? INITIAL_WORKSPACE : LIVE_INITIAL_WORKSPACE);
  }, [workspaces, currentWorkspaceId, isDemoMode]);

  // Live updates: rows changed elsewhere (the Telegram bot, the hourly job, another tab or device)
  // are merged in as they happen. Realtime applies the same Row Level Security as every query.
  useEffect(() => {
    if (!canSync || liveStatus !== 'ready') return;
    const wsId = currentWorkspace.id;
    const supabase = getSupabase();
    const notify = (message: string) => window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { message } }));

    const mergeInto =
      <T extends { id: string }>(table: LiveTable, set: React.Dispatch<React.SetStateAction<T[]>>, note?: (row: T, ev: string) => string | null) =>
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string } | undefined)?.id;
          if (id) set((prev) => prev.filter((x) => x.id !== id));
          return;
        }
        const row = liveRowToApp<T>(table, payload.new);
        set((prev) => {
          const i = prev.findIndex((x) => x.id === row.id);
          return i === -1 ? [row, ...prev] : prev.map((x, k) => (k === i ? row : x));
        });
        const message = note?.(row, payload.eventType);
        if (message) notify(message);
      };

    const handlers: Record<LiveTable, (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => void> = {
      receipts: mergeInto<Receipt>('receipts', setReceipts, (r, ev) =>
        ev === 'INSERT' && r.channel === 'telegram' ? '🧾 New receipt from Telegram. It is in your Receipts inbox.' : null
      ),
      payments: mergeInto<Payment>('payments', setPayments, (p, ev) =>
        ev === 'INSERT' && p.origin === 'telegram' ? '✅ A payment was recorded from Telegram.' : null
      ),
      important_dates: mergeInto<ImportantDate>('important_dates', setDates),
      service_links: mergeInto<ServiceLink>('service_links', setServices),
      notification_settings: (payload) => {
        if (payload.eventType === 'DELETE') return;
        const { workspaceId: _ws, ...rest } = fromRow<NotificationSettings & { workspaceId: string }>(payload.new);
        setNotificationSettings((prev) => ({ ...prev, ...rest }));
      },
    };

    const channel = supabase.channel(`live-${wsId}`);
    for (const table of LIVE_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `workspace_id=eq.${wsId}` }, handlers[table]);
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canSync, liveStatus, currentWorkspace.id]);

  // Scoped data
  const scopedProducts = useMemo(() => {
    return products.filter((p) => p.workspaceId === currentWorkspace.id);
  }, [products, currentWorkspace.id]);

  const scopedServices = useMemo(() => {
    return services.filter((s) => s.workspaceId === currentWorkspace.id);
  }, [services, currentWorkspace.id]);

  const scopedSources = useMemo(
    () => paymentSources.filter((x) => x.workspaceId === currentWorkspace.id),
    [paymentSources, currentWorkspace.id]
  );
  const scopedPayments = useMemo(
    () => payments.filter((x) => x.workspaceId === currentWorkspace.id).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)),
    [payments, currentWorkspace.id]
  );
  const scopedTransactions = useMemo(
    () => sourceTransactions.filter((x) => x.workspaceId === currentWorkspace.id),
    [sourceTransactions, currentWorkspace.id]
  );
  const scopedReceipts = useMemo(
    () =>
      receipts
        .filter((x) => x.workspaceId === currentWorkspace.id)
        .map((x) => ({ ...x, extracted: cleanDetails(x.extracted) }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [receipts, currentWorkspace.id]
  );

  const scopedDates = useMemo(() => {
    return dates.filter((d) => d.workspaceId === currentWorkspace.id);
  }, [dates, currentWorkspace.id]);

  // Check if ETB rate is stale
  const isRateStale = useMemo(() => {
    if (!currentWorkspace.exchangeRates?.updatedAt) return true;
    const updated = new Date(currentWorkspace.exchangeRates.updatedAt).getTime();
    const daysOld = (Date.now() - updated) / (1000 * 60 * 60 * 24);
    return daysOld > 30;
  }, [currentWorkspace.exchangeRates]);

  // Known providers
  const knownProviders = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (s.providerName?.trim()) set.add(s.providerName.trim());
    }
    for (const t of templates) {
      for (const bp of t.blueprints) {
        if (bp.providerName) set.add(bp.providerName);
      }
    }
    return Array.from(set).sort();
  }, [services, templates]);

  // Computed metrics
  const totalCosts = useMemo(() => {
    const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 130;
    return calculateTotalMonthlyCost(scopedServices, currentWorkspace.baseCurrency, rate);
  }, [scopedServices, currentWorkspace.baseCurrency, currentWorkspace.exchangeRates]);

  const providerConcentration = useMemo(() => {
    const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 130;
    return calculateProviderConcentration(scopedServices, scopedProducts.length, rate);
  }, [scopedServices, scopedProducts.length, currentWorkspace.exchangeRates]);

  const categoryBreakdown = useMemo(() => {
    const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 130;
    return calculateCategoryBreakdown(scopedServices, rate);
  }, [scopedServices, currentWorkspace.exchangeRates]);

  const activeServicesCount = useMemo(() => {
    return scopedServices.filter((s) => s.status === 'active').length;
  }, [scopedServices]);

  const autoRenewingServices = useMemo(() => {
    return scopedServices.filter((s) => s.autoRenew && s.status === 'active');
  }, [scopedServices]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const trialsEndingCount = useMemo(() => {
    return scopedServices.filter((s) => {
      if (s.status !== 'trial' || !s.trialEndsAt) return false;
      const diff = getDaysDiff(todayStr, s.trialEndsAt);
      return diff >= 0 && diff <= 14;
    }).length;
  }, [scopedServices, todayStr]);

  // Stack Health Report (0 - 100%)
  const stackHealth = useMemo(() => {
    return calculateStackHealth(scopedServices, scopedDates, scopedProducts, providerConcentration);
  }, [scopedServices, scopedDates, scopedProducts, providerConcentration]);

  // 12-Month Cashflow Forecast
  const cashflowForecast = useMemo(() => {
    const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 130;
    return calculateMonthlyCashflowForecast(scopedServices, currentWorkspace.baseCurrency, rate, 12);
  }, [scopedServices, currentWorkspace.baseCurrency, currentWorkspace.exchangeRates]);

  // Due Soon grouping
  const { dueSoonGroups, overdueCount } = useMemo(() => {
    const prodMap = new Map<string, string>();
    for (const p of scopedProducts) prodMap.set(p.id, p.name);

    interface GroupItem {
      id: string;
      type: 'renewal' | 'date';
      title: string;
      productName: string;
      productId?: string;
      dueDate: string;
      daysDiff: number;
      amount?: number;
      currency?: Currency;
      dateType?: any;
      status: string;
      rawDateItem?: ImportantDate;
      rawServiceItem?: ServiceLink;
    }

    const overdueList: GroupItem[] = [];
    const next7List: GroupItem[] = [];
    const next14List: GroupItem[] = [];
    const next30List: GroupItem[] = [];
    const laterList: GroupItem[] = [];

    const categorize = (item: GroupItem) => {
      if (item.daysDiff < 0) {
        overdueList.push(item);
      } else if (item.daysDiff <= 7) {
        next7List.push(item);
      } else if (item.daysDiff <= 14) {
        next14List.push(item);
      } else if (item.daysDiff <= 30) {
        next30List.push(item);
      } else {
        laterList.push(item);
      }
    };

    for (const d of scopedDates) {
      if (d.status === 'done') continue;
      const effectiveDate = d.snoozedUntil || d.dueDate;
      if (!effectiveDate) continue;
      const daysDiff = getDaysDiff(todayStr, effectiveDate);

      categorize({
        id: d.id,
        type: 'date',
        title: d.title,
        productName: d.productId ? prodMap.get(d.productId) || 'Global' : 'Global',
        productId: d.productId,
        dueDate: effectiveDate,
        daysDiff,
        dateType: d.type,
        status: d.status,
        rawDateItem: d,
      });
    }

    for (const s of scopedServices) {
      if (s.status === 'cancelled' || !s.renewalDate) continue;
      const daysDiff = getDaysDiff(todayStr, s.renewalDate);

      categorize({
        id: s.id,
        type: 'renewal',
        title: `${s.providerName} Renewal (${s.plan})`,
        productName: prodMap.get(s.productId) || 'Product',
        productId: s.productId,
        dueDate: s.renewalDate,
        daysDiff,
        amount: s.cost,
        currency: s.currency,
        status: s.status,
        rawServiceItem: s,
      });
    }

    const sorter = (a: GroupItem, b: GroupItem) => a.daysDiff - b.daysDiff;
    overdueList.sort(sorter);
    next7List.sort(sorter);
    next14List.sort(sorter);
    next30List.sort(sorter);
    laterList.sort(sorter);

    const groups: DueSoonGroup[] = [
      { label: 'Overdue Items', category: 'overdue', items: overdueList },
      { label: 'Next 7 Days', category: 'next7', items: next7List },
      { label: 'Next 14 Days', category: 'next14', items: next14List },
      { label: 'Next 30 Days', category: 'next30', items: next30List },
      { label: 'Later', category: 'later', items: laterList },
    ];

    return {
      dueSoonGroups: groups,
      overdueCount: overdueList.length,
    };
  }, [scopedDates, scopedServices, scopedProducts, todayStr]);

  // Audit log helper
  const logAudit = (itemType: AuditLogItem['itemType'], itemId: string, action: AuditLogItem['action'], details: string) => {
    const item: AuditLogItem = {
      id: 'audit-' + crypto.randomUUID().slice(0, 12),
      workspaceId: currentWorkspace.id,
      itemType,
      itemId,
      action,
      changedBy: user?.email || 'demo@stacktrack.local',
      details,
      timestamp: new Date().toISOString(),
    };
    setAuditLogs((prev) => [item, ...prev].slice(0, 100));
    if (canSync) remote.upsert('audit_logs', item);
  };

  // Auto-renew roll-forward: same rules as the cron job, applied as soon as data is shown,
  // so an auto-renewing bill never appears overdue.
  useEffect(() => {
    if (!isDemoMode && liveStatus !== 'ready') return;
    const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
    const moves = computeRollForwards(scopedServices, today);
    if (!moves.length) return;

    const now = new Date().toISOString();
    const byId = new Map(moves.map((m) => [m.id, m]));
    setServices((prev) =>
      prev.map((s) => (byId.has(s.id) ? { ...s, renewalDate: byId.get(s.id)!.to, updatedAt: now } : s))
    );
    const autoPayments: Payment[] = [];
    for (const m of moves) {
      if (canSync) remote.update('service_links', m.id, { renewalDate: m.to, updatedAt: now });
      logAudit('serviceLink', m.id, 'update', describeRollForward(m));
      const svc = scopedServices.find((x) => x.id === m.id);
      if (!svc) continue;
      const anchor = svc.startDate ? Number(svc.startDate.slice(8, 10)) : undefined;
      for (const due of crossedRenewals(m.from, m.to, svc.billingCycle, anchor)) {
        autoPayments.push({
          id: renewalPaymentId(svc.id, due),
          workspaceId: svc.workspaceId,
          serviceLinkId: svc.id,
          sourceId: svc.paymentSourceId,
          paidOn: due,
          amount: svc.cost,
          currency: svc.currency,
          origin: 'auto_renew',
          note: '',
          createdAt: now,
        });
      }
    }
    if (autoPayments.length) {
      // One payment per cycle: never overwrite one that already exists (e.g. recorded by the server).
      setPayments((prev) => [...autoPayments.filter((ap) => !prev.some((p) => p.id === ap.id)), ...prev]);
      if (canSync) remote.insertIgnore('payments', autoPayments);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedServices, isDemoMode, liveStatus, canSync]);

  // Workspace Actions
  const switchWorkspace = (workspaceId: string) => {
    if (workspaces.some((w) => w.id === workspaceId)) {
      setCurrentWorkspaceId(workspaceId);
    }
  };

  const createWorkspace = async (name: string, baseCurrency: Currency, etbPerUsd: number, leadDays: number[]): Promise<string> => {
    const id = 'ws-' + crypto.randomUUID().slice(0, 12);
    const newWs: Workspace = {
      id,
      name,
      baseCurrency,
      timezone: 'Africa/Addis_Ababa',
      exchangeRates: {
        ETB_per_USD: etbPerUsd || 130,
        updatedAt: new Date().toISOString(),
      },
      defaultLeadDays: leadDays && leadDays.length ? leadDays : [30, 14, 7, 1],
      vaultBaseUrl: '',
      createdAt: new Date().toISOString(),
      ownerId: user?.uid || 'usr-demo',
    };
    // Live: save it before switching. Switching reloads the workspace list, and a workspace that
    // isn't saved yet wouldn't be in it (the app would jump back to the first one).
    if (canSync) {
      const { error } = await getSupabase().from('workspaces').insert(toRow(newWs as unknown as Record<string, unknown>));
      if (error) throw new Error(error.message);
    }
    setWorkspaces((prev) => [...prev, newWs]);
    setCurrentWorkspaceId(id);

    logAudit('workspace', id, 'create', `Created workspace "${name}"`);
    return id;
  };

  const updateWorkspace = (updates: Partial<Workspace>) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === currentWorkspace.id) {
          const updated = { ...w, ...updates };
          if (canSync) {
            remote.update('workspaces', currentWorkspace.id, updates);
          }
          return updated;
        }
        return w;
      })
    );
    logAudit('workspace', currentWorkspace.id, 'update', 'Updated workspace settings');
  };

  // Automatic exchange rate (auto mode). Quiet: no audit entry for routine daily refreshes.
  const refreshExchangeRate = useCallback(async () => {
    try {
      const res = await fetch('/api/fx/usd-etb');
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !isPlausibleEtbRate(body.rate)) {
        return { ok: false, error: body.error || `Rate service returned HTTP ${res.status}` };
      }
      const wsId = currentWorkspace.id;
      const next = {
        ...currentWorkspace.exchangeRates,
        ETB_per_USD: Math.round(body.rate * 100) / 100,
        updatedAt: new Date().toISOString(),
        mode: 'auto' as const,
        source: String(body.source || ''),
      };
      setWorkspaces((prev) => prev.map((w) => (w.id === wsId ? { ...w, exchangeRates: next } : w)));
      if (canSync) remote.update('workspaces', wsId, { exchangeRates: next });
      return { ok: true, rate: next.ETB_per_USD, source: next.source };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [currentWorkspace.id, currentWorkspace.exchangeRates, canSync]);

  const fxAttemptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isDemoMode && liveStatus !== 'ready') return;
    if (fxAttemptedFor.current === currentWorkspace.id) return; // once per workspace per page load
    if (!needsRateRefresh(currentWorkspace.exchangeRates, new Date())) return;
    fxAttemptedFor.current = currentWorkspace.id;
    refreshExchangeRate();
  }, [currentWorkspace.id, currentWorkspace.exchangeRates, isDemoMode, liveStatus, refreshExchangeRate]);

  // Product Actions
  const addProduct = (data: Omit<Product, 'id' | 'workspaceId' | 'createdAt'>): string => {
    const id = 'prod-' + Math.random().toString(36).substring(2, 9);
    const defaultEnvs = data.environments && data.environments.length >= 3
      ? data.environments
      : [
          { id: 'env-' + id + '-dev', type: 'dev' as EnvironmentType, baseUrl: 'http://localhost:3000' },
          { id: 'env-' + id + '-staging', type: 'staging' as EnvironmentType, baseUrl: `https://stage.${data.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.app` },
          { id: 'env-' + id + '-prod', type: 'production' as EnvironmentType, baseUrl: data.liveUrl || `https://${data.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.app` },
        ];

    const newProd: Product = {
      ...data,
      id,
      workspaceId: currentWorkspace.id,
      environments: defaultEnvs,
      createdAt: new Date().toISOString(),
    };
    setProducts((prev) => [newProd, ...prev]);

    if (canSync) {
      remote.upsert('products', newProd);
    }

    logAudit('product', id, 'create', `Created product "${data.name}"`);
    return id;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
          if (canSync) {
            remote.update('products', id, updates);
          }
          return updated;
        }
        return p;
      })
    );
    logAudit('product', id, 'update', 'Updated product details');
  };

  const deleteProduct = (id: string) => {
    const prod = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setServices((prev) => prev.filter((s) => s.productId !== id));
    setDates((prev) => prev.filter((d) => d.productId !== id));

    if (canSync) {
      remote.remove('products', id);
    }

    logAudit('product', id, 'delete', `Deleted product "${prod?.name || id}"`);
  };

  const cloneProduct = (productId: string, newName: string): string => {
    const original = products.find((p) => p.id === productId);
    if (!original) throw new Error('Product not found');

    const newProductId = 'prod-' + Math.random().toString(36).substring(2, 9);
    const clonedProd: Product = {
      ...original,
      id: newProductId,
      name: newName,
      status: 'building',
      createdAt: new Date().toISOString(),
      environments: original.environments.map((e) => ({
        ...e,
        id: 'env-' + Math.random().toString(36).substring(2, 9),
      })),
    };

    const sourceServices = services.filter((s) => s.productId === productId);
    const clonedServices: ServiceLink[] = sourceServices.map((s) => ({
      ...s,
      id: 'srv-' + Math.random().toString(36).substring(2, 9),
      productId: newProductId,
      startDate: undefined,
      renewalDate: undefined,
      trialEndsAt: undefined,
      createdAt: new Date().toISOString(),
    }));

    setProducts((prev) => [clonedProd, ...prev]);
    setServices((prev) => [...clonedServices, ...prev]);

    if (canSync) {
      remote.upsert('products', clonedProd);
      for (const cs of clonedServices) {
        remote.upsert('service_links', cs);
      }
    }

    logAudit('product', newProductId, 'clone', `Cloned "${original.name}" into "${newName}"`);
    return newProductId;
  };

  const createProductFromTemplate = (templateId: string, productName: string, description?: string): string => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) throw new Error('Template not found');

    const newProductId = 'prod-' + Math.random().toString(36).substring(2, 9);
    const newProd: Product = {
      id: newProductId,
      workspaceId: currentWorkspace.id,
      name: productName,
      description: description || template.description,
      status: 'building',
      templateId,
      tags: ['template-stamped'],
      environments: [
        { id: 'env-' + newProductId + '-dev', type: 'dev', baseUrl: 'http://localhost:3000' },
        { id: 'env-' + newProductId + '-staging', type: 'staging', baseUrl: '' },
        { id: 'env-' + newProductId + '-prod', type: 'production', baseUrl: '' },
      ],
      createdAt: new Date().toISOString(),
    };

    const stampedServices: ServiceLink[] = template.blueprints.map((bp) => ({
      id: 'srv-' + Math.random().toString(36).substring(2, 9),
      workspaceId: currentWorkspace.id,
      productId: newProductId,
      environmentType: 'production',
      category: bp.category,
      providerName: bp.providerName,
      accountEmail: bp.accountEmail || '',
      loginUrl: bp.loginUrl || '',
      plan: bp.defaultPlan || 'Standard',
      billingCycle: bp.billingCycle,
      cost: bp.typicalCost,
      currency: bp.currency,
      autoRenew: true,
      paymentMethodLabel: 'Default Card',
      notes: `Created from template "${template.name}". Set renewal dates after activating.`,
      status: 'active',
      vaultRefs: [],
      createdAt: new Date().toISOString(),
    }));

    setProducts((prev) => [newProd, ...prev]);
    setServices((prev) => [...stampedServices, ...prev]);

    if (canSync) {
      remote.upsert('products', newProd);
      for (const ss of stampedServices) {
        remote.upsert('service_links', ss);
      }
    }

    logAudit('product', newProductId, 'create', `Created product "${productName}" from template "${template.name}"`);
    return newProductId;
  };

  // ServiceLink Actions
  const addServiceLink = (data: Omit<ServiceLink, 'id' | 'workspaceId' | 'createdAt'>): string => {
    const id = 'srv-' + Math.random().toString(36).substring(2, 9);
    const newService: ServiceLink = {
      ...data,
      id,
      workspaceId: currentWorkspace.id,
      createdAt: new Date().toISOString(),
    };
    setServices((prev) => [newService, ...prev]);

    if (canSync) {
      remote.upsert('service_links', newService);
    }

    logAudit('serviceLink', id, 'create', `Added service "${data.providerName}" (${data.category})`);
    return id;
  };

  const updateServiceLink = (id: string, updates: Partial<ServiceLink>) => {
    setServices((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const updated = { ...s, ...updates, updatedAt: new Date().toISOString() };
          if (canSync) {
            remote.update('service_links', id, updates);
          }
          return updated;
        }
        return s;
      })
    );
    logAudit('serviceLink', id, 'update', 'Updated service');
  };

  const deleteServiceLink = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
    if (canSync) {
      remote.remove('service_links', id);
    }
    logAudit('serviceLink', id, 'delete', 'Deleted service');
  };

  const duplicateServiceToProducts = (serviceId: string, targetProductIds: string[]) => {
    const source = services.find((s) => s.id === serviceId);
    if (!source || !targetProductIds.length) return;

    const newServices: ServiceLink[] = targetProductIds.map((pId) => ({
      ...source,
      id: 'srv-' + Math.random().toString(36).substring(2, 9),
      productId: pId,
      createdAt: new Date().toISOString(),
    }));

    setServices((prev) => [...newServices, ...prev]);

    if (canSync) {
      for (const ns of newServices) {
        remote.upsert('service_links', ns);
      }
    }

    logAudit('serviceLink', serviceId, 'clone', `Duplicated "${source.providerName}" to ${targetProductIds.length} products`);
  };

  const bulkUpdateServices = (serviceIds: string[], updates: Partial<ServiceLink>) => {
    setServices((prev) =>
      prev.map((s) => (serviceIds.includes(s.id) ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s))
    );
    if (canSync) {
      for (const sId of serviceIds) {
        remote.update('service_links', sId, updates);
      }
    }
    logAudit('serviceLink', serviceIds.join(','), 'update', `Bulk updated ${serviceIds.length} services`);
  };

  // ImportantDate Actions
  const addImportantDate = (data: Omit<ImportantDate, 'id' | 'workspaceId' | 'createdAt'>): string => {
    const id = 'date-' + Math.random().toString(36).substring(2, 9);
    const newDate: ImportantDate = {
      ...data,
      id,
      workspaceId: currentWorkspace.id,
      createdAt: new Date().toISOString(),
    };
    setDates((prev) => [newDate, ...prev]);

    if (canSync) {
      remote.upsert('important_dates', newDate);
    }

    logAudit('importantDate', id, 'create', `Added milestone "${data.title}"`);
    return id;
  };

  const updateImportantDate = (id: string, updates: Partial<ImportantDate>) => {
    setDates((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          const updated = { ...d, ...updates };
          if (canSync) {
            remote.update('important_dates', id, updates);
          }
          return updated;
        }
        return d;
      })
    );
    logAudit('importantDate', id, 'update', 'Updated date milestone');
  };

  const deleteImportantDate = (id: string) => {
    setDates((prev) => prev.filter((d) => d.id !== id));
    if (canSync) {
      remote.remove('important_dates', id);
    }
    logAudit('importantDate', id, 'delete', 'Deleted date milestone');
  };

  const snoozeImportantDate = (dateId: string, days: number) => {
    const target = dates.find((d) => d.id === dateId);
    if (!target) return;
    // Counts from today when the item is already due/overdue, so it really moves into the future.
    const snoozedUntil = snoozeUntil(target.snoozedUntil || target.dueDate, new Date().toLocaleDateString('en-CA'), days);

    updateImportantDate(dateId, { status: 'snoozed', snoozedUntil });
    logAudit('importantDate', dateId, 'snooze', `Snoozed "${target.title}" for ${days} days until ${snoozedUntil}`);
  };

  const markDateDone = (dateId: string) => {
    const target = dates.find((d) => d.id === dateId);
    if (!target) return;

    const nextDueDate = computeNextRecurringDate(
      target.dueDate,
      target.recurrence,
      target.customRecurrenceDays
    );

    if (nextDueDate) {
      const nextId = 'date-' + Math.random().toString(36).substring(2, 9);
      const nextInstance: ImportantDate = {
        ...target,
        id: nextId,
        dueDate: nextDueDate,
        status: 'open',
        snoozedUntil: undefined,
        createdAt: new Date().toISOString(),
      };

      setDates((prev) => [
        nextInstance,
        ...prev.map((d) => (d.id === dateId ? { ...d, status: 'done' as const, completedAt: new Date().toISOString() } : d)),
      ]);

      if (canSync) {
        remote.upsert('important_dates', nextInstance);
        remote.update('important_dates', dateId, {
          status: 'done',
          completedAt: new Date().toISOString(),
        });
      }

      logAudit('importantDate', dateId, 'mark_done', `Marked "${target.title}" done; scheduled next for ${nextDueDate}`);
    } else {
      updateImportantDate(dateId, { status: 'done', completedAt: new Date().toISOString() });
      logAudit('importantDate', dateId, 'mark_done', `Marked "${target.title}" done`);
    }
  };

 // Payment sources, transactions and payments
  const addPaymentSource = (data: Omit<PaymentSource, 'id' | 'workspaceId' | 'createdAt'>): string => {
    const src: PaymentSource = {
      ...data,
      id: 'src-' + crypto.randomUUID().slice(0, 12),
      workspaceId: currentWorkspace.id,
      createdAt: new Date().toISOString(),
    };
    setPaymentSources((prev) => [...prev, src]);
    if (canSync) remote.upsert('payment_sources', src);
    logAudit('workspace', src.id, 'create', `Added payment source "${src.name}"`);
    return src.id;
  };

  const updatePaymentSource = (id: string, updates: Partial<PaymentSource>) => {
    setPaymentSources((prev) => prev.map((x) => (x.id === id ? { ...x, ...updates } : x)));
    if (canSync) remote.update('payment_sources', id, updates);
  };

  const deletePaymentSource = (id: string) => {
    const src = paymentSources.find((x) => x.id === id);
    setPaymentSources((prev) => prev.filter((x) => x.id !== id));
    // The database keeps the history (references become empty); mirror that locally.
    setServices((prev) => prev.map((x) => (x.paymentSourceId === id ? { ...x, paymentSourceId: undefined } : x)));
    setPayments((prev) => prev.map((x) => (x.sourceId === id ? { ...x, sourceId: undefined } : x)));
    setSourceTransactions((prev) => prev.filter((x) => x.sourceId !== id));
    if (canSync) remote.remove('payment_sources', id);
    logAudit('workspace', id, 'delete', `Deleted payment source "${src?.name || id}"`);
  };

  const addSourceTransaction = (data: Omit<SourceTransaction, 'id' | 'workspaceId' | 'createdAt'>) => {
    const t: SourceTransaction = {
      ...data,
      id: 'tx-' + crypto.randomUUID().slice(0, 12),
      workspaceId: currentWorkspace.id,
      createdAt: new Date().toISOString(),
    };
    setSourceTransactions((prev) => [...prev, t]);
    if (canSync) remote.upsert('source_transactions', t);
    const src = paymentSources.find((x) => x.id === t.sourceId);
    const label = t.kind === 'top_up' ? 'Top-up' : t.kind === 'repayment' ? 'Repayment' : 'Adjustment';
    logAudit('workspace', t.id, 'create', `${label} of ${t.amount} ${src?.currency ?? ''} for "${src?.name ?? t.sourceId}"`);
  };

  const deleteSourceTransaction = (id: string) => {
    const t = sourceTransactions.find((x) => x.id === id);
    setSourceTransactions((prev) => prev.filter((x) => x.id !== id));
    if (canSync) remote.remove('source_transactions', id);
    if (t) {
      const src = paymentSources.find((x) => x.id === t.sourceId);
      logAudit('workspace', id, 'delete', `Deleted ${t.kind.replace('_', '-')} of ${t.amount} ${src?.currency ?? ''} on ${t.happenedOn} for "${src?.name ?? t.sourceId}"`);
    }
  };

  const recordPayment = (data: Omit<Payment, 'id' | 'workspaceId' | 'createdAt'> & { id?: string }): string => {
    const p: Payment = {
      ...data,
      id: data.id || 'pay-' + crypto.randomUUID().slice(0, 12),
      workspaceId: currentWorkspace.id,
      createdAt: new Date().toISOString(),
    };
    setPayments((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
    if (canSync) remote.upsert('payments', p);
    return p.id;
  };

  const updatePayment = (id: string, updates: Partial<Payment>) => {
    setPayments((prev) => prev.map((x) => (x.id === id ? { ...x, ...updates } : x)));
    if (canSync) remote.update('payments', id, updates);
  };

  const deletePayment = (id: string) => {
    const p = payments.find((x) => x.id === id);
    setPayments((prev) => prev.filter((x) => x.id !== id));
    if (canSync) remote.remove('payments', id);
    // A receipt that was saved to this payment goes back to the inbox, so it can be saved again.
    const linked = receipts.filter((r) => r.paymentId === id);
    for (const r of linked) patchReceipt(r.id, { status: 'needs_review', paymentId: undefined });
    if (p) logAudit('workspace', id, 'delete', `Deleted payment of ${p.amount} ${p.currency} on ${p.paidOn}`);
  };

  const markServicePaid = (serviceId: string, opts: { etbPaid?: number } = {}) => {
    const svc = services.find((x) => x.id === serviceId);
    if (!svc?.renewalDate) return { ok: false, error: 'This service has no renewal date.' };
    const today = new Date().toLocaleDateString('en-CA');
    const anchor = svc.startDate ? Number(svc.startDate.slice(8, 10)) : undefined;
    const next = advanceAfterPayment(svc.renewalDate, svc.billingCycle, today, anchor);
    if (!next) return { ok: false, error: 'One-time and free services have no next renewal.' };

    const id = renewalPaymentId(svc.id, svc.renewalDate);
    if (!payments.some((x) => x.id === id)) {
      recordPayment({
        id,
        serviceLinkId: svc.id,
        sourceId: svc.paymentSourceId,
        paidOn: today,
        amount: svc.cost,
        currency: svc.currency,
        etbPaid: opts.etbPaid,
        origin: 'manual',
        note: `Renewal due ${svc.renewalDate}`,
      });
    }
    updateServiceLink(svc.id, { renewalDate: next });
    logAudit('serviceLink', svc.id, 'update', `Marked ${svc.providerName} paid; next renewal ${next}`);
    return { ok: true, next };
  };

  // ---------------------------------------------------------------------------
  // Receipts
  // ---------------------------------------------------------------------------
  const patchReceipt = (id: string, updates: Partial<Receipt>, sync = true) => {
    const stamped = { ...updates, updatedAt: new Date().toISOString() };
    setReceipts((prev) => prev.map((x) => (x.id === id ? { ...x, ...stamped } : x)));
    if (sync && canSync) remote.update('receipts', id, stamped);
  };

  /** Demo (no server): the simple text reader, then the same matching the server does. */
  const readLocally = (r: Receipt) => {
    const details = r.textContent ? parseReceiptText(r.textContent) : { readBy: 'manual' as const };
    const match = suggestMatch(details, scopedServices, scopedSources);
    patchReceipt(
      r.id,
      {
        status: 'needs_review',
        extracted: cleanDetails({ ...details, suggestedServiceId: match.serviceId, suggestedSourceId: match.sourceId }),
        error: r.textContent ? undefined : 'Demo mode: type in the details from the file.',
      },
      false
    );
  };

  const readOnServer = async (id: string): Promise<{ ok: boolean; error?: string }> => {
    patchReceipt(id, { status: 'reading', error: undefined }, false);
    try {
      const res = await authedFetch<{ receipt: Receipt }>('/api/receipts/read', { method: 'POST', body: JSON.stringify({ receiptId: id }) });
      setReceipts((prev) => prev.map((x) => (x.id === id ? { ...res.receipt, extracted: cleanDetails(res.receipt.extracted) } : x)));
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      patchReceipt(id, { status: 'failed', error }, false);
      return { ok: false, error };
    }
  };

  const addReceipt = async (input: { file?: File; text?: string }): Promise<{ ok: boolean; error?: string }> => {
    const { file } = input;
    const text = input.text?.trim();
    if (!file && !text) return { ok: false, error: 'Choose a file or paste the receipt text.' };
    const mimeType = file ? receiptMimeType(file.type, file.name) : undefined;
    if (file && !mimeType) return { ok: false, error: 'Use a photo (JPEG, PNG, WebP, HEIC) or a PDF.' };
    if (file && file.size > MAX_RECEIPT_BYTES) return { ok: false, error: 'That file is over 10 MB.' };

    const id = 'rcpt-' + crypto.randomUUID().slice(0, 12);
    const receipt: Receipt = {
      id,
      workspaceId: currentWorkspace.id,
      channel: 'upload',
      status: 'reading',
      extracted: {},
      textContent: file ? undefined : text!.slice(0, 100_000),
      mimeType: mimeType ?? undefined,
      originalName: file?.name.slice(0, 200),
      sizeBytes: file?.size,
      createdAt: new Date().toISOString(),
    };
    setReceipts((prev) => [receipt, ...prev]);

    if (!canSync) {
      if (file) demoFileUrls.current.set(id, URL.createObjectURL(file));
      readLocally(receipt);
      return { ok: true };
    }

    try {
      const supabase = getSupabase();
      let storagePath: string | undefined;
      if (file && mimeType) {
        // Straight to private storage (no size limit from our server); the folder is the workspace id.
        storagePath = `${receipt.workspaceId}/${id}.${RECEIPT_FILE_TYPES[mimeType]}`;
        // Re-wrap so the upload carries the normalised type (some browsers leave HEIC files untyped).
        const typed = new File([file], file.name, { type: mimeType });
        const up = await supabase.storage.from('receipts').upload(storagePath, typed, { contentType: mimeType, upsert: false });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      }
      const { error } = await supabase.from('receipts').insert(toRow({ ...receipt, storagePath } as unknown as Record<string, unknown>));
      if (error) throw new Error(error.message);
      // Only now is the file there to preview.
      patchReceipt(id, { storagePath }, false);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setReceipts((prev) => prev.filter((x) => x.id !== id));
      return { ok: false, error };
    }
    logAudit('workspace', id, 'create', `Added receipt ${file ? `"${file.name}"` : '(pasted text)'}`);
    return readOnServer(id);
  };

  const rereadReceipt = async (id: string) => {
    const r = receipts.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'Receipt not found.' };
    if (!canSync) {
      readLocally(r);
      return { ok: true };
    }
    return readOnServer(id);
  };

  const confirmReceipt = (id: string, draft: ReceiptDraft): { ok: boolean; note: string } => {
    const r = receipts.find((x) => x.id === id);
    if (!r) return { ok: false, note: 'Receipt not found.' };
    if (r.status === 'confirmed') return { ok: false, note: 'Already confirmed.' };
    if (!(draft.amount > 0) || !draft.date) return { ok: false, note: 'Enter the amount and date first.' };

    const service = scopedServices.find((x) => x.id === draft.serviceLinkId);
    const today = new Date().toLocaleDateString('en-CA');
    const plan = planReceiptPayment({ receiptId: id, date: draft.date, service, payments: scopedPayments, today });
    const sourceId = draft.sourceId || undefined;

    if (plan.kind === 'attach') {
      const existing = scopedPayments.find((p) => p.id === plan.paymentId);
      updatePayment(plan.paymentId, {
        amount: draft.amount,
        currency: draft.currency,
        receiptId: id,
        sourceId: sourceId ?? existing?.sourceId,
        etbPaid: draft.etbPaid ?? existing?.etbPaid,
      });
    } else {
      recordPayment({
        id: plan.paymentId,
        serviceLinkId: service?.id,
        sourceId,
        paidOn: draft.date,
        amount: draft.amount,
        currency: draft.currency,
        etbPaid: draft.etbPaid,
        origin: 'receipt',
        receiptId: id,
        note: plan.kind === 'renewal' ? `Renewal due ${plan.due}` : [draft.vendor, r.extracted.summary].filter(Boolean).join(' · ').slice(0, 200),
      });
      if (plan.kind === 'renewal' && service) updateServiceLink(service.id, { renewalDate: plan.next });
    }

    const extracted = cleanDetails({
      ...r.extracted,
      vendor: draft.vendor || r.extracted.vendor,
      amount: draft.amount,
      currency: draft.currency,
      date: draft.date,
      suggestedServiceId: service?.id,
      suggestedSourceId: sourceId,
    });
    patchReceipt(id, { status: 'confirmed', serviceLinkId: service?.id, paymentId: plan.paymentId, extracted, error: undefined });
    const note = describePlan(plan, service?.providerName);
    logAudit('workspace', id, 'update', `Confirmed receipt (${extracted.vendor ?? 'unknown vendor'} ${draft.amount} ${draft.currency}): ${note}`);
    return { ok: true, note };
  };

  const ignoreReceipt = (id: string) => patchReceipt(id, { status: 'ignored' });
  const restoreReceipt = (id: string) => patchReceipt(id, { status: 'needs_review' });

  const deleteReceipt = async (id: string) => {
    const r = receipts.find((x) => x.id === id);
    setReceipts((prev) => prev.filter((x) => x.id !== id));
    // The database clears the link on payments (on delete set null); mirror that here.
    setPayments((prev) => prev.map((p) => (p.receiptId === id ? { ...p, receiptId: undefined } : p)));
    const demoUrl = demoFileUrls.current.get(id);
    if (demoUrl) URL.revokeObjectURL(demoUrl);
    demoFileUrls.current.delete(id);
    if (canSync) {
      if (r?.storagePath) await getSupabase().storage.from('receipts').remove([r.storagePath]).catch(() => undefined);
      remote.remove('receipts', id);
    }
    logAudit('workspace', id, 'delete', `Deleted receipt (${r?.extracted.vendor ?? r?.originalName ?? id})`);
  };

  const receiptFileUrl = async (r: Receipt): Promise<string | null> => {
    if (!canSync) return demoFileUrls.current.get(r.id) ?? null;
    if (!r.storagePath) return null;
    const { data, error } = await getSupabase().storage.from('receipts').createSignedUrl(r.storagePath, 300);
    return error ? null : data.signedUrl;
  };

  // ---------------------------------------------------------------------------
  // Expiry checks
  // ---------------------------------------------------------------------------
  const checkDateNow = async (id: string): Promise<{ ok: boolean; error?: string; notes?: string[] }> => {
    if (!canSync) return { ok: false, error: 'Checks run in your live workspace (the demo has no internet access).' };
    try {
      const res = await authedFetch<{ date: ImportantDate; notices: { text: string }[] }>('/api/expiry/check', {
        method: 'POST',
        body: JSON.stringify({ dateId: id }),
      });
      setDates((prev) => prev.map((d) => (d.id === id ? res.date : d)));
      return { ok: true, notes: res.notices.map((n) => n.text) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const lookupExpiry = async (type: ImportantDateType, target: string) => {
    if (!canSync) return { ok: false, error: 'Look-ups run in your live workspace (the demo has no internet access).' };
    try {
      const res = await authedFetch<{ check: ExpiryCheck }>('/api/expiry/check', { method: 'POST', body: JSON.stringify({ type, target }) });
      return { ok: true, check: res.check };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  // Template Actions
  const addTemplate = (templateData: Omit<StackTemplate, 'id'>): string => {
    const id = 'tpl-' + Math.random().toString(36).substring(2, 9);
    const newTpl: StackTemplate = { ...templateData, id, isBuiltIn: false };
    setTemplates((prev) => [...prev, newTpl]);
    return id;
  };

  // Notification Settings
  const updateNotificationSettings = (updates: Partial<NotificationSettings>) => {
    const next = { ...notificationSettings, ...updates };
    setNotificationSettings(next);
    if (canSync) {
      remote.upsert('notification_settings', {
        ...next,
        workspaceId: currentWorkspace.id,
        // Empty codes would collide on the unique index.
        telegramVerificationCode: next.telegramVerificationCode || undefined,
      });
    }
  };

  // Import Demo Stacks into Live Workspace
  // When clicked from demo mode we first switch to live, wait for the live workspace
  // to load, then copy the stacks into it (otherwise they'd land in the demo workspace).
  const pendingDemoImport = useRef(false);

  const importDemoStacksIntoLive = () => {
    if (isDemoMode) {
      pendingDemoImport.current = true;
      setDemoMode(false);
      return;
    }
    copyDemoStacksInto(currentWorkspace.id);
  };

  const copyDemoStacksInto = (targetWsId: string) => {

    // Clone products and services with new IDs scoped to target workspace
    const idMap = new Map<string, string>();
    const clonedProds: Product[] = INITIAL_PRODUCTS.map((p) => {
      const newPId = 'prod-' + Math.random().toString(36).substring(2, 9);
      idMap.set(p.id, newPId);
      return {
        ...p,
        id: newPId,
        workspaceId: targetWsId,
        createdAt: new Date().toISOString(),
      };
    });

    const srvIdMap = new Map<string, string>();
    const clonedServices: ServiceLink[] = INITIAL_SERVICES.map((s) => ({
      ...s,
      id: (() => {
        const nid = 'srv-' + Math.random().toString(36).substring(2, 9);
        srvIdMap.set(s.id, nid);
        return nid;
      })(),
      workspaceId: targetWsId,
      productId: idMap.get(s.productId) || s.productId,
      // The demo's cards and people (e.g. "Grey virtual card") are samples and aren't copied:
      // pointing at them would make the database refuse the service.
      paymentSourceId: undefined,
      createdAt: new Date().toISOString(),
    }));

    const clonedDates: ImportantDate[] = INITIAL_DATES.map((d) => ({
      ...d,
      id: 'date-' + Math.random().toString(36).substring(2, 9),
      workspaceId: targetWsId,
      productId: d.productId ? idMap.get(d.productId) : undefined,
      serviceLinkId: d.serviceLinkId ? srvIdMap.get(d.serviceLinkId) : undefined,
      // Sample domains are never checked from your live workspace (turn it on for your own).
      autoCheck: d.checkTarget ? false : d.autoCheck,
      lastCheck: undefined,
      lastCheckedAt: undefined,
      createdAt: new Date().toISOString(),
    }));

    setProducts((prev) => [...clonedProds, ...prev]);
    setServices((prev) => [...clonedServices, ...prev]);
    setDates((prev) => [...clonedDates, ...prev]);

    if (canSync) {
      for (const cp of clonedProds) {
        remote.upsert('products', cp);
      }
      for (const cs of clonedServices) {
        remote.upsert('service_links', cs);
      }
      for (const cd of clonedDates) {
        remote.upsert('important_dates', cd);
      }
    }

    logAudit('workspace', targetWsId, 'create', `Imported ${clonedProds.length} demo stacks and ${clonedServices.length} services into live workspace`);
  };

  useEffect(() => {
    if (pendingDemoImport.current && !isDemoMode && liveStatus === 'ready') {
      pendingDemoImport.current = false;
      copyDemoStacksInto(currentWorkspace.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, liveStatus, currentWorkspace.id]);

  // Reset data
  const resetToSampleSeedData = () => {
    // Only the local demo copy is reset; live Supabase data is never wiped from here.
    if (!isDemoMode) setDemoMode(true);
    setWorkspaces([INITIAL_WORKSPACE]);
    setCurrentWorkspaceId(INITIAL_WORKSPACE.id);
    setProducts(INITIAL_PRODUCTS);
    setServices(INITIAL_SERVICES);
    setDates(INITIAL_DATES);
    setTemplates(STARTER_TEMPLATES);
    setReminderLogs(INITIAL_REMINDER_LOGS);
    setNotificationSettings(INITIAL_NOTIFICATIONS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setPaymentSources(INITIAL_PAYMENT_SOURCES);
    setPayments(INITIAL_PAYMENTS);
    setSourceTransactions(INITIAL_SOURCE_TRANSACTIONS);
    setReceipts(INITIAL_RECEIPTS);
  };

  // Batch CSV Import
  const importServicesBatch = (rows: ParsedImportRow[]): { addedProducts: number; addedServices: number } => {
    const prodMap = new Map<string, string>();
    for (const p of scopedProducts) {
      prodMap.set(p.name.toLowerCase().trim(), p.id);
    }

    let addedProds = 0;
    const newProds: Product[] = [];
    const newServices: ServiceLink[] = [];

    for (const r of rows) {
      const prodKey = r.productName.toLowerCase().trim();
      let targetProdId = prodMap.get(prodKey);

      if (!targetProdId) {
        targetProdId = 'prod-' + Math.random().toString(36).substring(2, 9);
        const p: Product = {
          id: targetProdId,
          workspaceId: currentWorkspace.id,
          name: r.productName,
          description: 'Imported via CSV',
          status: 'live',
          tags: ['imported'],
          environments: [
            { id: 'env-' + targetProdId + '-dev', type: 'dev', baseUrl: '' },
            { id: 'env-' + targetProdId + '-staging', type: 'staging', baseUrl: '' },
            { id: 'env-' + targetProdId + '-prod', type: 'production', baseUrl: '' },
          ],
          createdAt: new Date().toISOString(),
        };
        newProds.push(p);
        prodMap.set(prodKey, targetProdId);
        addedProds++;
      }

      const s: ServiceLink = {
        id: 'srv-' + Math.random().toString(36).substring(2, 9),
        workspaceId: currentWorkspace.id,
        productId: targetProdId,
        environmentType: r.environmentType,
        category: r.category,
        providerName: r.providerName,
        accountEmail: r.accountEmail,
        loginUrl: '',
        plan: r.plan,
        billingCycle: r.billingCycle,
        cost: r.cost,
        currency: r.currency,
        renewalDate: r.renewalDate,
        autoRenew: true,
        paymentMethodLabel: r.paymentMethodLabel,
        notes: r.notes,
        status: r.status,
        vaultRefs: [],
        createdAt: new Date().toISOString(),
      };
      newServices.push(s);
    }

    if (newProds.length) {
      setProducts((prev) => [...newProds, ...prev]);
    }
    if (newServices.length) {
      setServices((prev) => [...newServices, ...prev]);
    }

    if (canSync) {
      for (const np of newProds) {
        remote.upsert('products', np);
      }
      for (const ns of newServices) {
        remote.upsert('service_links', ns);
      }
    }

    logAudit('serviceLink', 'csv-import', 'create', `Imported ${newServices.length} services across ${rows.length} rows`);
    return { addedProducts: addedProds, addedServices: newServices.length };
  };

  return (
    <WorkspaceContext.Provider
      value={{
        isDemoMode,
        setDemoMode,
        importDemoStacksIntoLive,
        liveStatus,
        liveError,
        reloadLiveData,
        workspaces,
        currentWorkspace,
        products: scopedProducts,
        services: scopedServices,
        dates: scopedDates,
        templates,
        reminderLogs,
        notificationSettings,
        auditLogs,
        totalCosts,
        providerConcentration,
        categoryBreakdown,
        dueSoonGroups,
        overdueCount,
        trialsEndingCount,
        activeServicesCount,
        knownProviders,
        isRateStale,
        stackHealth,
        cashflowForecast,
        autoRenewingServices,
        switchWorkspace,
        createWorkspace,
        updateWorkspace,
        refreshExchangeRate,
        addProduct,
        updateProduct,
        deleteProduct,
        cloneProduct,
        createProductFromTemplate,
        addServiceLink,
        updateServiceLink,
        deleteServiceLink,
        duplicateServiceToProducts,
        bulkUpdateServices,
        addImportantDate,
        updateImportantDate,
        deleteImportantDate,
        snoozeImportantDate,
        markDateDone,
        addTemplate,
        updateNotificationSettings,
        resetToSampleSeedData,
        importServicesBatch,
        paymentSources: scopedSources,
        payments: scopedPayments,
        sourceTransactions: scopedTransactions,
        addPaymentSource,
        updatePaymentSource,
        deletePaymentSource,
        addSourceTransaction,
        deleteSourceTransaction,
        recordPayment,
        updatePayment,
        deletePayment,
        markServicePaid,
        receipts: scopedReceipts,
        addReceipt,
        rereadReceipt,
        confirmReceipt,
        ignoreReceipt,
        restoreReceipt,
        deleteReceipt,
        receiptFileUrl,
        checkDateNow,
        lookupExpiry,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
};
