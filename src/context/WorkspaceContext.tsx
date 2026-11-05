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
  Currency,
  EnvironmentType,
} from '../types';
import {
  INITIAL_WORKSPACE,
  INITIAL_PRODUCTS,
  INITIAL_SERVICES,
  INITIAL_DATES,
  INITIAL_REMINDER_LOGS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
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
} from '../utils/reminders';
import {
  calculateStackHealth,
  calculateMonthlyCashflowForecast,
  StackHealthReport,
  MonthlyCashflowForecast,
} from '../utils/audit';
import { ParsedImportRow } from '../utils/csv';
import { computeRollForwards, describeRollForward } from '../utils/renewals';
import { remote, loadWorkspaces, loadWorkspaceData } from '../lib/db';
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
  createWorkspace: (name: string, baseCurrency: Currency, etbPerUsd: number, leadDays: number[]) => string;
  updateWorkspace: (updates: Partial<Workspace>) => void;

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
  syncFromVault: () => Promise<{ success: boolean; count: number }>;
  resetToSampleSeedData: () => void;
  importServicesBatch: (rows: ParsedImportRow[]) => { addedProducts: number; addedServices: number };
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_PREFIX = 'stacktrack_v2_';

const LIVE_INITIAL_WORKSPACE: Workspace = {
  id: 'ws-founder-live',
  name: 'Founder Production Studio',
  baseCurrency: 'USD',
  timezone: 'Africa/Nairobi',
  exchangeRates: {
    ETB_per_USD: 130.0,
    updatedAt: new Date().toISOString(),
  },
  defaultLeadDays: [30, 14, 7, 1],
  plan: 'free',
  vaultBaseUrl: 'https://vault.internal.net',
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
  // Writes go to Supabase only for a signed-in user outside demo mode.
  const canSync = !isDemoMode && !!user;
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveReloadKey, setLiveReloadKey] = useState(0);
  const reloadLiveData = useCallback(() => setLiveReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!user) setLiveStatus('idle');
  }, [user]);

  // Live vs Demo separate storages
  const storageKey = isDemoMode ? 'demo_' : 'live_';

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'workspaces');
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
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'active_workspace_id');
    return saved || (isDemoMode ? INITIAL_WORKSPACE.id : LIVE_INITIAL_WORKSPACE.id);
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'products');
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
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'services');
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
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'dates');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return isDemoMode ? INITIAL_DATES : [];
  });

  const [templates, setTemplates] = useState<StackTemplate[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'templates');
    return saved ? JSON.parse(saved) : STARTER_TEMPLATES;
  });

  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'reminderLogs');
    return saved ? JSON.parse(saved) : (isDemoMode ? INITIAL_REMINDER_LOGS : []);
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'notificationSettings');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + storageKey + 'auditLogs');
    return saved ? JSON.parse(saved) : (isDemoMode ? INITIAL_AUDIT_LOGS : []);
  });

  // Switch demo mode
  const setDemoMode = useCallback((val: boolean) => {
    setIsDemoMode(val);
    setLiveStatus('idle');
    localStorage.setItem(STORAGE_PREFIX + 'is_demo_mode', String(val));
    const nextKey = val ? 'demo_' : 'live_';
    const savedWs = localStorage.getItem(STORAGE_PREFIX + nextKey + 'workspaces');
    if (savedWs) {
      try {
        const parsed = JSON.parse(savedWs);
        setWorkspaces(parsed);
        const savedId = localStorage.getItem(STORAGE_PREFIX + nextKey + 'active_workspace_id');
        setCurrentWorkspaceId(savedId || parsed[0]?.id || (val ? INITIAL_WORKSPACE.id : LIVE_INITIAL_WORKSPACE.id));
      } catch {
        // fallback
      }
    } else {
      setWorkspaces(val ? [INITIAL_WORKSPACE] : [LIVE_INITIAL_WORKSPACE]);
      setCurrentWorkspaceId(val ? INITIAL_WORKSPACE.id : LIVE_INITIAL_WORKSPACE.id);
    }

    const savedProds = localStorage.getItem(STORAGE_PREFIX + nextKey + 'products');
    setProducts(savedProds ? JSON.parse(savedProds) : (val ? INITIAL_PRODUCTS : []));

    const savedSrvs = localStorage.getItem(STORAGE_PREFIX + nextKey + 'services');
    setServices(savedSrvs ? JSON.parse(savedSrvs) : (val ? INITIAL_SERVICES : []));

    const savedDates = localStorage.getItem(STORAGE_PREFIX + nextKey + 'dates');
    setDates(savedDates ? JSON.parse(savedDates) : (val ? INITIAL_DATES : []));
  }, []);

  // Save to storage
  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'workspaces', JSON.stringify(workspaces));
  }, [workspaces, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'active_workspace_id', currentWorkspaceId);
  }, [currentWorkspaceId, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'products', JSON.stringify(products));
  }, [products, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'services', JSON.stringify(services));
  }, [services, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'dates', JSON.stringify(dates));
  }, [dates, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'reminderLogs', JSON.stringify(reminderLogs));
  }, [reminderLogs, storageKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'notificationSettings', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + storageKey + 'auditLogs', JSON.stringify(auditLogs));
  }, [auditLogs, storageKey]);

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
          // First sign-in: create a personal workspace with a unique id.
          const ws: Workspace = {
            ...LIVE_INITIAL_WORKSPACE,
            id: 'ws-' + crypto.randomUUID().slice(0, 12),
            name: `${user.displayName}'s Workspace`,
            ownerId: user.uid,
            createdAt: new Date().toISOString(),
            exchangeRates: { ...LIVE_INITIAL_WORKSPACE.exchangeRates, updatedAt: new Date().toISOString() },
          };
          remote.upsert('workspaces', ws);
          list = [ws];
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

  // Scoped data
  const scopedProducts = useMemo(() => {
    return products.filter((p) => p.workspaceId === currentWorkspace.id);
  }, [products, currentWorkspace.id]);

  const scopedServices = useMemo(() => {
    return services.filter((s) => s.workspaceId === currentWorkspace.id);
  }, [services, currentWorkspace.id]);

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
    for (const m of moves) {
      if (canSync) remote.update('service_links', m.id, { renewalDate: m.to, updatedAt: now });
      logAudit('serviceLink', m.id, 'update', describeRollForward(m));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedServices, isDemoMode, liveStatus, canSync]);

  // Workspace Actions
  const switchWorkspace = (workspaceId: string) => {
    if (workspaces.some((w) => w.id === workspaceId)) {
      setCurrentWorkspaceId(workspaceId);
    }
  };

  const createWorkspace = (name: string, baseCurrency: Currency, etbPerUsd: number, leadDays: number[]): string => {
    const id = 'ws-' + Math.random().toString(36).substring(2, 9);
    const newWs: Workspace = {
      id,
      name,
      baseCurrency,
      timezone: 'Africa/Nairobi',
      exchangeRates: {
        ETB_per_USD: etbPerUsd || 130,
        updatedAt: new Date().toISOString(),
      },
      defaultLeadDays: leadDays && leadDays.length ? leadDays : [30, 14, 7, 1],
      plan: 'free',
      vaultBaseUrl: 'https://vault.internal.net',
      createdAt: new Date().toISOString(),
      ownerId: user?.uid || 'usr-demo',
    };
    setWorkspaces((prev) => [...prev, newWs]);
    setCurrentWorkspaceId(id);

    // Save to Supabase if signed in & not demo
    if (canSync) {
      remote.upsert('workspaces', newWs);
    }

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
    logAudit('serviceLink', id, 'update', 'Updated service link');
  };

  const deleteServiceLink = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
    if (canSync) {
      remote.remove('service_links', id);
    }
    logAudit('serviceLink', id, 'delete', 'Deleted service link');
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
    const base = target.snoozedUntil || target.dueDate || todayStr;
    const snoozedUntil = computeSnoozeDate(base, days);

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

  // Template Actions
  const addTemplate = (templateData: Omit<StackTemplate, 'id'>): string => {
    const id = 'tpl-' + Math.random().toString(36).substring(2, 9);
    const newTpl: StackTemplate = { ...templateData, id };
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
      createdAt: new Date().toISOString(),
    }));

    const clonedDates: ImportantDate[] = INITIAL_DATES.map((d) => ({
      ...d,
      id: 'date-' + Math.random().toString(36).substring(2, 9),
      workspaceId: targetWsId,
      productId: d.productId ? idMap.get(d.productId) : undefined,
      serviceLinkId: d.serviceLinkId ? srvIdMap.get(d.serviceLinkId) : undefined,
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

  // Vault Sync Stub
  const syncFromVault = async (): Promise<{ success: boolean; count: number }> => {
    await new Promise((r) => setTimeout(r, 800));

    const syncedItems: ImportantDate[] = [
      {
        id: 'date-vault-sync-1',
        workspaceId: currentWorkspace.id,
        productId: scopedProducts[0]?.id,
        type: 'key rotation',
        title: 'Vault Sync: Cloudflare WAF API token rotation',
        dueDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        recurrence: 'quarterly',
        status: 'open',
        source: 'vault',
        notes: 'Mirrored from Vault item: vault_cf_zone_token_pf. Zero secrets stored.',
        createdAt: new Date().toISOString(),
      },
    ];

    setDates((prev) => {
      const filtered = prev.filter((d) => d.id !== 'date-vault-sync-1');
      return [syncedItems[0], ...filtered];
    });

    logAudit('workspace', currentWorkspace.id, 'update', 'Synchronized metadata from Vault (zero secrets returned)');
    return { success: true, count: 1 };
  };

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
        syncFromVault,
        resetToSampleSeedData,
        importServicesBatch,
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
