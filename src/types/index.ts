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
  /** 'auto' (default): refreshed daily from a public rates feed. 'manual': set by hand. */
  mode?: 'auto' | 'manual';
  /** Where an automatic rate came from, e.g. 'open.er-api.com'. */
  source?: string;
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
  /** Which card or person pays for this (see PaymentSource). */
  paymentSourceId?: string;
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
  /** Domain (domain expiry) or host[:port] (SSL expiry) to check automatically. */
  checkTarget?: string;
  autoCheck?: boolean;
  lastCheckedAt?: string;
  lastCheck?: ExpiryCheck;
}

/** What an automatic expiry check found. */
export interface ExpiryCheck {
  kind: 'domain' | 'ssl';
  /** ok: expiry found. manual: no public lookup for this domain. error: the check failed. */
  status: 'ok' | 'manual' | 'error';
  expiresOn?: string;
  /** Domain: the registrar. SSL: who issued the certificate. */
  by?: string;
  /** SSL: why browsers wouldn't trust the certificate (expired, wrong name, self-signed). */
  problem?: string;
  message?: string;
  checkedAt: string;
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
  itemType: 'product' | 'serviceLink' | 'importantDate' | 'workspace' | 'security';
  itemId: string;
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'clone'
    | 'snooze'
    | 'mark_done'
    // security events (itemType 'security')
    | 'sign_in'
    | 'unlock'
    | 'unlock_failed'
    | 'export'
    | 'mfa_enabled'
    | 'mfa_disabled'
    | 'mfa_device_added'
    | 'mfa_device_removed'
    | 'passkey_added'
    | 'passkey_removed'
    | 'telegram_linked';
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

// ---------------------------------------------------------------------------
// Payments (Phase 4)
// ---------------------------------------------------------------------------

export type PaymentSourceKind = 'card' | 'person' | 'bank' | 'other';

/** A card (virtual dollar card, bank card) or a person (a friend who pays for you). */
export interface PaymentSource {
  id: string;
  workspaceId: string;
  name: string;
  kind: PaymentSourceKind;
  currency: Currency;
  /** Prepaid cards have a balance you top up. */
  prepaid: boolean;
  openingBalance: number;
  lowBalance?: number;
  last4?: string;
  /** Card expiry: last day of the month, YYYY-MM-DD. */
  expiresOn?: string;
  notes: string;
  archived: boolean;
  createdAt: string;
}

export type PaymentOrigin = 'manual' | 'auto_renew' | 'telegram' | 'receipt';

/** One renewal actually paid. Renewal payments use the id pay-<serviceId>-<yyyymmdd> (one per cycle). */
export interface Payment {
  id: string;
  workspaceId: string;
  serviceLinkId?: string;
  sourceId?: string;
  paidOn: string;
  amount: number;
  currency: Currency;
  /** What it really cost you in birr, card fees included (optional). */
  etbPaid?: number;
  origin: PaymentOrigin;
  receiptId?: string;
  note: string;
  createdAt: string;
}

export type SourceTransactionKind = 'top_up' | 'repayment' | 'adjustment';

/** Top-up of a prepaid card, repayment to a person, or a manual correction. */
export interface SourceTransaction {
  id: string;
  workspaceId: string;
  sourceId: string;
  kind: SourceTransactionKind;
  happenedOn: string;
  /** In the source's currency. Adjustments may be negative. */
  amount: number;
  etbPaid?: number;
  note: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Receipts (Phase 4.5)
// ---------------------------------------------------------------------------

export type ReceiptChannel = 'telegram' | 'upload' | 'email';
export type ReceiptStatus = 'new' | 'reading' | 'needs_review' | 'confirmed' | 'ignored' | 'failed';

/** What was read from a receipt (by Claude, the plain-text reader, or typed in), plus the suggested match. */
export interface ReceiptDetails {
  isReceipt?: boolean;
  vendor?: string;
  amount?: number;
  /** As printed: USD, ETB, EUR... Only USD and ETB can be saved as payments. */
  currency?: string;
  /** YYYY-MM-DD */
  date?: string;
  cardLast4?: string;
  periodStart?: string;
  periodEnd?: string;
  invoiceNumber?: string;
  summary?: string;
  readBy?: 'claude' | 'text' | 'manual';
  suggestedServiceId?: string;
  suggestedSourceId?: string;
}

export interface Receipt {
  id: string;
  workspaceId: string;
  channel: ReceiptChannel;
  /** <workspace id>/<receipt id>.<ext> in the private "receipts" storage bucket. */
  storagePath?: string;
  mimeType?: string;
  originalName?: string;
  sizeBytes?: number;
  /** Forwarded email or message text. */
  textContent?: string;
  status: ReceiptStatus;
  extracted: ReceiptDetails;
  serviceLinkId?: string;
  paymentId?: string;
  telegramChatId?: string;
  telegramMessageId?: number;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}
