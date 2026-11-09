import React, { useState } from 'react';
import { Copy, X, AlertCircle } from 'lucide-react';
import { Product } from '../../types';

interface CloneProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onClone: (productId: string, newName: string) => void;
  serviceCount: number;
}

export const CloneProductModal: React.FC<CloneProductModalProps> = ({
  isOpen,
  onClose,
  product,
  onClone,
  serviceCount,
}) => {
  const [newName, setNewName] = useState('');

  if (!isOpen || !product) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onClone(product.id, newName.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Copy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Clone SaaS Stack
            </h3>
            <p className="text-xs text-slate-400">
              Duplicate "{product.name}" into a brand new product
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-750 text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Clone Rules:</span>
            </div>
            <p>
              • All <strong>{serviceCount} services</strong> (categories, providers, plans, costs) will be duplicated.
            </p>
            <p>
              • All renewal dates, start dates, and trial end dates are <strong>cleared blank</strong> so you can configure them for the new app.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              New Product Name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Copy of ${product.name}`}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-colors"
            >
              Clone Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
