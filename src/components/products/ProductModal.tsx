import React, { useState, useEffect } from 'react';
import { X, Layers, Globe, GitFork, Tag } from 'lucide-react';
import { Product, ProductStatus, Environment } from '../../types';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Product, 'id' | 'workspaceId' | 'createdAt'>) => void;
  initialProduct?: Product | null;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialProduct,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProductStatus>('live');
  const [liveUrl, setLiveUrl] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Default 3 environments: dev, staging, production
  const [devUrl, setDevUrl] = useState('http://localhost:3000');
  const [stagingUrl, setStagingUrl] = useState('');
  const [prodUrl, setProdUrl] = useState('');

  useEffect(() => {
    if (initialProduct) {
      setName(initialProduct.name);
      setDescription(initialProduct.description || '');
      setStatus(initialProduct.status);
      setLiveUrl(initialProduct.liveUrl || '');
      setRepoUrl(initialProduct.repoUrl || '');
      setTagsInput(initialProduct.tags?.join(', ') || '');

      const dev = initialProduct.environments.find((e) => e.type === 'dev');
      const stg = initialProduct.environments.find((e) => e.type === 'staging');
      const prd = initialProduct.environments.find((e) => e.type === 'production');

      if (dev) setDevUrl(dev.baseUrl || '');
      if (stg) setStagingUrl(stg.baseUrl || '');
      if (prd) setProdUrl(prd.baseUrl || '');
    } else {
      setName('');
      setDescription('');
      setStatus('live');
      setLiveUrl('');
      setRepoUrl('');
      setTagsInput('');
      setDevUrl('http://localhost:3000');
      setStagingUrl('');
      setProdUrl('');
    }
  }, [initialProduct, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const environments: Environment[] = [
      { id: 'env-dev-' + Date.now(), type: 'dev', baseUrl: devUrl },
      { id: 'env-stg-' + Date.now(), type: 'staging', baseUrl: stagingUrl },
      { id: 'env-prd-' + Date.now(), type: 'production', baseUrl: prodUrl || liveUrl },
    ];

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      status,
      liveUrl: liveUrl.trim() || prodUrl.trim(),
      repoUrl: repoUrl.trim(),
      tags,
      environments,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {initialProduct ? 'Edit Product' : 'Add New SaaS Product'}
            </h3>
            <p className="text-xs text-slate-400">
              Configure product details and all 3 environment targets
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PharmaFlow or QuickBite POS"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this SaaS do? (e.g. Hospital prescription and inventory management)"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                <option value="idea">Idea</option>
                <option value="building">Building</option>
                <option value="live">Live</option>
                <option value="paused">Paused</option>
                <option value="retired">Retired</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="healthcare, b2b, live"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                Live URL
              </label>
              <input
                type="url"
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                placeholder="https://app.mysaas.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <GitFork className="w-3.5 h-3.5 text-slate-400" />
                Repository URL
              </label>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/acme/saas"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Environment Base URLs (Default 3 created for each product) */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2.5">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Environment Base URLs (Default: Dev, Staging, Prod)
            </span>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-16 font-semibold text-slate-400 text-[11px]">Dev:</span>
                <input
                  type="text"
                  value={devUrl}
                  onChange={(e) => setDevUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 font-semibold text-slate-400 text-[11px]">Staging:</span>
                <input
                  type="text"
                  value={stagingUrl}
                  onChange={(e) => setStagingUrl(e.target.value)}
                  placeholder="https://staging.mysaas.com"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 font-semibold text-slate-400 text-[11px]">Production:</span>
                <input
                  type="text"
                  value={prodUrl}
                  onChange={(e) => setProdUrl(e.target.value)}
                  placeholder="https://app.mysaas.com"
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
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
              {initialProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
