import React, { useState } from 'react';
import { Copy, X, CheckSquare, Square, Search, Layers } from 'lucide-react';
import { ServiceLink, Product } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';

interface DuplicateToProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceLink | null;
  onDuplicate: (serviceId: string, targetProductIds: string[]) => void;
}

export const DuplicateToProductsModal: React.FC<DuplicateToProductsModalProps> = ({
  isOpen,
  onClose,
  service,
  onDuplicate,
}) => {
  const { products } = useWorkspace();
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  if (!isOpen || !service) return null;

  // Filter products excluding the source product
  const eligibleProducts = products.filter((p) => p.id !== service.productId);
  const filtered = eligibleProducts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProduct = (pId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]
    );
  };

  const selectAll = () => {
    if (selectedProductIds.length === filtered.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filtered.map((p) => p.id));
    }
  };

  const handleDuplicate = () => {
    if (!selectedProductIds.length) return;
    onDuplicate(service.id, selectedProductIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[85vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
            <Copy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Duplicate to Other Products
            </h3>
            <p className="text-xs text-slate-400">
              Copy <span className="text-indigo-300 font-semibold">{service.providerName}</span> across multiple SaaS products
            </p>
          </div>
        </div>

        {/* Search & Select All */}
        <div className="my-3 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search target products..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <button
              onClick={selectAll}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {selectedProductIds.length === filtered.length ? 'Deselect All' : 'Select All Filtered'}
            </button>
            <span>{selectedProductIds.length} selected</span>
          </div>
        </div>

        {/* Checklist */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/60 border border-slate-800 rounded-xl p-2 bg-slate-850">
          {!filtered.length ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No eligible products found.
            </div>
          ) : (
            filtered.map((prod) => {
              const isChecked = selectedProductIds.includes(prod.id);
              return (
                <div
                  key={prod.id}
                  onClick={() => toggleProduct(prod.id)}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors pt-2"
                >
                  <div className="flex items-center gap-2.5">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{prod.name}</div>
                      <div className="text-[10px] text-slate-500">{prod.status}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-4 mt-3 flex justify-end gap-2.5 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedProductIds.length}
            onClick={handleDuplicate}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/30 transition-colors"
          >
            Duplicate to {selectedProductIds.length} Product{selectedProductIds.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
