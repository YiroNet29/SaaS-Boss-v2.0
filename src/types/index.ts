export type Currency = 'USD' | 'ETB';

export type ProductStatus = 'idea' | 'building' | 'live' | 'paused' | 'retired';

export type EnvironmentType = 'dev' | 'staging' | 'production';

export type ServiceCategory =
  | 'hosting'
  | 'domain registrar'
  | 'database'
  | 'email provider'
  | 'payment processor'
  | 'auth'
  | 'analytics'
  | 'error monitoring'
  | 'Google API'
  | 'Telegram API'
  | 'DB API'
  | 'storage'
  | 'SMS'
  | 'other';

export type BillingCycle = 'monthly' | 'yearly' | 'one-time' | 'usage-based' | 'free';

export type ServiceStatus = 'active' | 'trial' | 'paused' | 'cancelled';

export type ImportantDateType =
  | 'domain expiry'
  | 'SSL expiry'
  | 'invoice due'
  | 'key rotation'
  | 'free trial end'
  | 'contract renewal'
  | 'custom';

export type RecurrenceType = 'none' | 'monthly' | 'quarterly' | 'yearly' | 'custom days';

export type ImportantDateStatus = 'open' | 'done' | 'snoozed';

export type ImportantDateSource = 'manual' | 'vault';

export interface VaultRef {
  vaultItemId: string;
  label: string;
  environment: EnvironmentType;
}

export interface WorkspaceExchangeRates {
  ETB_per_USD: number;
  updatedAt: string; // ISO date string
}

export interface Workspace {
  id: string;
  name: string;
  baseCurrency: Currency;
  timezone: string;
  exchangeRates: WorkspaceExchangeRates;
  defaultLeadDays: number[]; // e.g. [30, 14, 7, 1]
  plan: 'free' | 'pro';
  vaultBaseUrl: string;
  createdAt: string;
  ownerId: string;
  memberUids?: string[];
}

export interface Environment {
  id: string;
  type: EnvironmentType;
  baseUrl: string;
  notes?: string;
}

export interface Product {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: ProductStatus;
  liveUrl?: string;
  repoUrl?: string;
  templateId?: string;
  tags: string[];
  environments: Environment[];
  createdAt: string;
  updatedAt?: string;
}

export interface ServiceLink {
  id: string;
  workspaceId: string;
  productId: string;
  environmentType: EnvironmentType;
  category: ServiceCategory;
  providerName: string;
  accountEmail: string;
  loginUrl: string;
  plan: string;
  billingCycle: BillingCycle;
  cost: number;
  currency: Currency;
  startDate?: string;
  renewalDate?: string;
  trialEndsAt?: string;
  autoRenew: boolean;
  paymentMethodLabel: string; // e.g. "Visa ending 4417"
  notes: string;
  status: ServiceStatus;
  vaultRefs: VaultRef[];
  createdAt: string;
  updatedAt?: string;
}

export interface ImportantDate {
  id: string;
  workspaceId: string;
  productId?: string;
  serviceLinkId?: string;
  type: ImportantDateType;
  title: string;
  dueDate: string; // YYYY-MM-DD
  recurrence: RecurrenceType;
  customRecurrenceDays?: number;
  leadDays?: number[]; // overrides workspace default if provided
  notes?: string;
  status: ImportantDateStatus;
  snoozedUntil?: string; // YYYY-MM-DD
  source: ImportantDateSource;
  createdAt: string;
  completedAt?: string;
}

export interface ServiceBlueprint {
  category: ServiceCategory;
  providerName: string;
  billingCycle: BillingCycle;
  typicalCost: number;
  currency: Currency;
  defaultPlan?: string;
  accountEmail?: string;
  loginUrl?: string;
}

export interface StackTemplate {
  id: string;
  name: string;
  description: string;
  isBuiltIn?: boolean;
  blueprints: ServiceBlueprint[];
}

export interface ReminderLog {
  id: string;
  workspaceId: string;
  itemType: 'serviceLink' | 'importantDate';
  itemId: string;
  channel: 'email' | 'telegram';
  leadDay: number;
  sentAt: string;
  status: 'sent' | 'failed' | 'skipped';
}

export interface NotificationSettings {
  email: string;
  emailEnabled: boolean;
  telegramChatId: string;
  telegramEnabled: boolean;
  telegramVerificationCode: string;
  digestTime: string; // e.g. "08:00"
  digestMode: 'daily' | 'individual';
}

export interface AuditLogItem {
  id: string;
  workspaceId: string;
  itemType: 'product' | 'serviceLink' | 'importantDate' | 'workspace';
  itemId: string;
  action: 'create' | 'update' | 'delete' | 'clone' | 'snooze' | 'mark_done';
  changedBy: string;
  details: string;
  timestamp: string;
}

export interface DueSoonGroup {
  label: string;
  category: 'overdue' | 'next7' | 'next14' | 'next30' | 'custom' | 'later';
  items: {
    id: string;
    type: 'renewal' | 'date';
    title: string;
    productName: string;
    productId?: string;
    dueDate: string;
    daysDiff: number; // negative = overdue, 0 = today, positive = days left
    amount?: number;
    currency?: Currency;
    dateType?: ImportantDateType;
    status: string;
    rawDateItem?: ImportantDate;
    rawServiceItem?: ServiceLink;
  }[];
}
