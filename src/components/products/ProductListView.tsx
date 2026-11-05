import React, { useState } from 'react';
import {
  Plus,
  Layers,
  Sparkles,
  Globe,
  Copy,
  Edit2,
  Trash2,
  ArrowRight,
  Search,
  Filter,
} from 'lucide-react';
import { Product, ProductStatus } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ProductListViewProps {
  onSelectProduct: (productId: string) => void;
  onOpenCreateModal: () => void;
  onOpenTemplatePicker: () => void;
  onEditProduct: (p: Product) => void;
  onCloneProduct: (p: Product) => void;
}

export const ProductListView: React.FC<ProductListViewProps> = ({
  onSelectProduct,
  onOpenCreateModal,
  onOpenTemplatePicker,
  onEditProduct,
  onCloneProduct,
}) => {
  const { products, services, dates, currentWorkspace, deleteProduct } = useWorkspace();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const rate = currentWorkspace.exchangeRates.ETB_per_USD || 130;

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <span>SaaS Products & Stacks</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {products.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Your own apps. Each one lists the services it pays for.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenTemplatePicker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Use Template</span>
          </button>
          <button
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, tags..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'live', 'building', 'idea', 'paused', 'retired'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Product Cards Grid */}
      {!filteredProducts.length ? (
        <EmptyState
          icon={Layers}
          title={search || statusFilter !== 'all' ? 'No apps found' : 'No apps yet'}
          description={
            search || statusFilter !== 'all'
              ? 'Try adjusting your search query or status filter.'
              : 'Add an app you run (e.g. SaaS Boss), then add what it pays for: hosting, domain, database…'
          }
          actionLabel="Add App"
          onAction={onOpenCreateModal}
          secondaryActionLabel="Pick Starter Template"
          onSecondaryAction={onOpenTemplatePicker}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((p) => {
            const prodServices = services.filter((s) => s.productId === p.id && s.status !== 'cancelled');
            const prodDates = dates.filter((d) => d.productId === p.id && d.status !== 'done');

            // Calculate product monthly spend
            let monthlyUsd = 0;
            for (const s of prodServices) {
              const base = s.billingCycle === 'yearly' ? s.cost / 12 : s.billingCycle === 'monthly' ? s.cost : 0;
              monthlyUsd += s.currency === 'ETB' ? base / rate : base;
            }
            const monthlyEtb = monthlyUsd * rate;

            return (
              <div
                key={p.id}
                onClick={() => onSelectProduct(p.id)}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base text-slate-100 group-hover:text-indigo-400 transition-colors leading-tight">
                      {p.name}
                    </h3>
                    <StatusBadge status={p.status} size="sm" />
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {p.description || 'No description provided.'}
                  </p>

                  {/* Tags */}
                  {p.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Metrics Ticker & Footer */}
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-500">
                        Monthly Burn
                      </div>
                      <div className="text-sm font-bold text-slate-100 font-mono">
                        {formatCurrency(monthlyUsd, 'USD')}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">
                        ETB Equivalent
                      </div>
                      <div className="text-xs font-semibold text-emerald-400 font-mono">
                        {formatCurrency(monthlyEtb, 'ETB')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>
                      {prodServices.length} service{prodServices.length !== 1 ? 's' : ''} • {prodDates.length} date{prodDates.length !== 1 ? 's' : ''}
                    </span>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onCloneProduct(p)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-300"
                        title="Clone Product"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onEditProduct(p)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                        title="Edit Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setProductToDelete(p)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      {productToDelete && (
        <ConfirmDialog
          isOpen={!!productToDelete}
          title={`Delete "${productToDelete.name}"?`}
          message="This will delete the product and all associated services and dates."
          isDestructive
          confirmLabel="Delete Product"
          onConfirm={() => {
            deleteProduct(productToDelete.id);
            setProductToDelete(null);
          }}
          onCancel={() => setProductToDelete(null)}
        />
      )}
    </div>
  );
};
