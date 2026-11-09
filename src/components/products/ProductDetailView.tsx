import React, { useState } from 'react';
import {
  ArrowLeft,
  Globe,
  GitFork,
  ExternalLink,
  Plus,
  Copy,
  Edit2,
  Trash2,
  Calendar,
  Server,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Product, ServiceLink, ImportantDate } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { VaultRefChip } from '../vault/VaultRefChip';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency, formatDate, formatDaysDiff } from '../../utils/formatters';
import { calculateTotalMonthlyCost } from '../../utils/cost';
import { getDaysDiff } from '../../utils/reminders';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useSensitiveAction } from '../../context/LockContext';

interface ProductDetailViewProps {
  productId: string;
  onBack: () => void;
  onEditProduct: (p: Product) => void;
  onCloneProduct: (p: Product) => void;
  onAddService: (productId: string) => void;
  onEditService: (s: ServiceLink) => void;
  onAddDate: (productId: string) => void;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  productId,
  onBack,
  onEditProduct,
  onCloneProduct,
  onAddService,
  onEditService,
  onAddDate,
}) => {
  const {
    products,
    services,
    dates,
    currentWorkspace,
    deleteProduct,
    deleteServiceLink,
    snoozeImportantDate,
    markDateDone,
    paymentSources,
  } = useWorkspace();
  const sensitive = useSensitiveAction();

  const [activeTab, setActiveTab] = useState<'services' | 'environments' | 'dates'>('services');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const product = products.find((p) => p.id === productId);
  if (!product) {
    return (
      <div className="p-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Products</span>
        </button>
        <div className="p-8 text-center text-slate-400">Product not found.</div>
      </div>
    );
  }

  // Filter services and dates for this product
  const prodServices = services.filter((s) => s.productId === productId);
  const prodDates = dates.filter((d) => d.productId === productId);

  // Group services by category
  const categoriesMap = new Map<string, ServiceLink[]>();
  for (const s of prodServices) {
    if (!categoriesMap.has(s.category)) {
      categoriesMap.set(s.category, []);
    }
    categoriesMap.get(s.category)!.push(s);
  }

  // Monthly cost calculation for this product
  const rate = currentWorkspace.exchangeRates.ETB_per_USD || 130;
  const costSummary = calculateTotalMonthlyCost(prodServices, currentWorkspace.baseCurrency, rate);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Products</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onCloneProduct(product)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
            title="Clone this stack"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Clone Stack</span>
          </button>
          <button
            onClick={() => onEditProduct(product)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 transition-colors"
            title="Edit product info"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
            title="Delete product"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Product Hero Card */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">
                {product.name}
              </h2>
              <StatusBadge status={product.status} />
              {product.tags?.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-400"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              {product.description || 'No description provided.'}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
              {product.liveUrl && (
                <a
                  href={product.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{product.liveUrl.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {product.repoUrl && (
                <a
                  href={product.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white"
                >
                  <GitFork className="w-3.5 h-3.5 text-slate-400" />
                  <span>Repository</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <span className="text-slate-500">
                Created {formatDate(product.createdAt)}
              </span>
            </div>
          </div>

          {/* Monthly Cost Ticker for this product */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-750 shrink-0 text-right self-start">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
              Product Monthly Burn
            </div>
            <div className="text-xl font-extrabold text-slate-100 font-mono">
              {formatCurrency(costSummary.totalUsd, 'USD')}
            </div>
            <div className="text-xs font-semibold text-emerald-400 font-mono mt-0.5">
              {formatCurrency(costSummary.totalEtb, 'ETB')}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {prodServices.length} active service{prodServices.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('services')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'services'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            Services ({prodServices.length})
          </button>
          <button
            onClick={() => setActiveTab('environments')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'environments'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            Environments (3)
          </button>
          <button
            onClick={() => setActiveTab('dates')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'dates'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            Milestones & Dates ({prodDates.length})
          </button>
        </div>

        <div>
          {activeTab === 'services' && (
            <button
              onClick={() => onAddService(productId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Service</span>
            </button>
          )}
          {activeTab === 'dates' && (
            <button
              onClick={() => onAddDate(productId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Date</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Service Links Grouped by Category */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          {!prodServices.length ? (
            <EmptyState
              icon={Server}
              title="No services added yet"
              description="Track hosting, database, email, domains, and payment gateways for this product."
              actionLabel="Add First Service Link"
              onAction={() => onAddService(productId)}
            />
          ) : (
            Array.from(categoriesMap.entries()).map(([category, items]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                  <span className="capitalize">{category} ({items.length})</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {items.map((service) => (
                    <div
                      key={service.id}
                      onClick={() => onEditService(service)}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors">
                              {service.providerName}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400 capitalize">
                              {service.environmentType}
                            </span>
                            <StatusBadge status={service.status} size="sm" />
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">
                            {service.plan} • {service.billingCycle}
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="font-mono text-sm font-bold text-slate-100">
                            {formatCurrency(service.cost, service.currency)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {service.autoRenew ? 'Auto-renews' : 'Manual renew'}
                          </div>
                        </div>
                      </div>

                      {/* Renewal & Account info */}
                      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                        <div>
                          {service.renewalDate ? (
                            <span className="flex items-center gap-1 text-slate-300">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              Renews: {formatDate(service.renewalDate)}
                            </span>
                          ) : (
                            <span className="text-slate-500">No renewal date set</span>
                          )}
                        </div>

                        {(paymentSources.find((x) => x.id === service.paymentSourceId)?.name || service.paymentMethodLabel) && (
                          <span className="text-slate-400">
                            {paymentSources.find((x) => x.id === service.paymentSourceId)?.name || service.paymentMethodLabel}
                          </span>
                        )}
                      </div>

                      {/* Vault references if attached */}
                      {service.vaultRefs?.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {service.vaultRefs.map((v) => (
                            <VaultRefChip key={v.vaultItemId} label={v.label} itemId={v.vaultItemId} prefix="Vault: " />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Environments */}
      {activeTab === 'environments' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {product.environments.map((env) => (
            <div
              key={env.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  {env.type} environment
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Base URL</label>
                {env.baseUrl ? (
                  <a
                    href={env.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-slate-200 hover:text-indigo-300 break-all inline-flex items-center gap-1"
                  >
                    <span>{env.baseUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-500 italic">Not set</span>
                )}
              </div>

              <div className="text-xs text-slate-400">
                <span>Services attached: </span>
                <span className="font-semibold text-slate-200">
                  {prodServices.filter((s) => s.environmentType === env.type).length}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Dates & Milestones */}
      {activeTab === 'dates' && (
        <div className="space-y-3">
          {!prodDates.length ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming milestones for this product"
              description="Track domain expiries, key rotations, and contract deadlines."
              actionLabel="Add Important Date"
              onAction={() => onAddDate(productId)}
            />
          ) : (
            prodDates.map((d) => {
              const diff = formatDaysDiff(
                getDaysDiff(new Date().toISOString().slice(0, 10), d.snoozedUntil || d.dueDate)
              );

              return (
                <div
                  key={d.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-100">{d.title}</span>
                      <StatusBadge status={d.status} size="sm" />
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-500/10 text-indigo-300 capitalize">
                        {d.type}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                      <span>Due: {formatDate(d.dueDate)}</span>
                      <span className="font-semibold text-slate-300">({diff.label})</span>
                      <span>Recurrence: {d.recurrence}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {d.status !== 'done' && (
                      <>
                        <button
                          onClick={() => markDateDone(d.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </button>
                        <button
                          onClick={() => snoozeImportantDate(d.id, 7)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
                        >
                          +7d
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Delete Product Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title={`Delete "${product.name}"?`}
        message="This will permanently delete this product and all its attached service links and important date milestones."
        isDestructive
        confirmLabel="Delete Product"
        onConfirm={async () => {
          if (!(await sensitive(`delete "${product.name}" and everything in it`))) return setIsDeleteConfirmOpen(false);
          deleteProduct(productId);
          setIsDeleteConfirmOpen(false);
          onBack();
        }}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </div>
  );
};
