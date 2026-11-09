import React, { useState } from 'react';
import {
  ArrowRight,
  DollarSign,
  Calendar,
  Layers,
  X,
} from 'lucide-react';
import { Currency } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NumberField } from '../common/NumberField';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinish: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onFinish,
}) => {
  const { currentWorkspace, updateWorkspace, addProduct, createProductFromTemplate } = useWorkspace();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Currency & ETB Rate
  const [baseCurrency, setBaseCurrency] = useState<Currency>(currentWorkspace.baseCurrency || 'USD');
  const [etbRate, setEtbRate] = useState<number>(currentWorkspace.exchangeRates?.ETB_per_USD || 130);

  // Step 2: Reminder Lead Days
  const [leadDays, setLeadDays] = useState<number[]>(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);

  // Step 3: First Product
  const [productType, setProductType] = useState<'template' | 'custom'>('template');
  const [productName, setProductName] = useState('PharmaFlow');

  if (!isOpen) return null;

  const toggleLeadDay = (d: number) => {
    if (leadDays.includes(d)) {
      setLeadDays(leadDays.filter((day) => day !== d));
    } else {
      setLeadDays([...leadDays, d].sort((a, b) => b - a));
    }
  };

  const handleNext = () => {
    if (step === 1) {
      updateWorkspace({
        baseCurrency,
        exchangeRates: {
          ETB_per_USD: etbRate,
          updatedAt: new Date().toISOString(),
        },
      });
      setStep(2);
    } else if (step === 2) {
      updateWorkspace({
        defaultLeadDays: leadDays,
      });
      setStep(3);
    } else if (step === 3) {
      if (productType === 'template') {
        createProductFromTemplate('tpl-standard-saas', productName || 'My First SaaS', '');
      } else {
        addProduct({
          name: productName || 'My First SaaS',
          description: '',
          status: 'live',
          tags: ['first-stack'],
          environments: [
            { id: 'env-1', type: 'dev', baseUrl: 'http://localhost:3000' },
            { id: 'env-2', type: 'staging', baseUrl: '' },
            { id: 'env-3', type: 'production', baseUrl: '' },
          ],
        });
      }
      onFinish();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Steps Progress Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Step {step} of 3: Founder Onboarding
            </span>
            <span className="text-xs text-slate-500">
              {step === 1 ? 'Currencies' : step === 2 ? 'Reminders' : 'First Product'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className={`h-1.5 rounded-full ${step >= 1 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full ${step >= 2 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full ${step >= 3 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
          </div>
        </div>

        {/* Step 1: Base Currency & ETB Rate */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Set Base Currency & Exchange Rate
                </h3>
                <p className="text-xs text-slate-400">
                  StackTrack supports USD and ETB side-by-side
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Primary Workspace Currency
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBaseCurrency('USD')}
                  className={`p-3 rounded-xl border text-left font-semibold text-xs transition-all ${
                    baseCurrency === 'USD'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="text-sm font-bold">USD ($)</div>
                  <div className="text-[11px] font-normal text-slate-400 mt-0.5">Global SaaS Standard</div>
                </button>

                <button
                  type="button"
                  onClick={() => setBaseCurrency('ETB')}
                  className={`p-3 rounded-xl border text-left font-semibold text-xs transition-all ${
                    baseCurrency === 'ETB'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="text-sm font-bold">ETB (Birr)</div>
                  <div className="text-[11px] font-normal text-slate-400 mt-0.5">Ethiopian Birr</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Current ETB per 1 USD Exchange Rate
              </label>
              <NumberField
                step="0.5"
                min="1"
                value={etbRate}
                onValueChange={setEtbRate}
                fallback={130}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                StackTrack will warn you whenever this exchange rate becomes older than 30 days.
              </span>
            </div>
          </div>
        )}

        {/* Step 2: Reminder Lead Days */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Default Reminder Lead Days
                </h3>
                <p className="text-xs text-slate-400">
                  When should StackTrack notify you before renewals & key rotations?
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">
                Select alert trigger thresholds:
              </span>
              <div className="flex flex-wrap gap-2">
                {[45, 30, 14, 7, 3, 1].map((day) => {
                  const isChecked = leadDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleLeadDay(day)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isChecked
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {day} days prior
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                Notifications are deduplicated via <code>reminderLog</code> so you receive exactly one alert per lead threshold. Overdue items are sent daily for 3 days, then weekly.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Add First Product */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Add Your First SaaS Stack
                </h3>
                <p className="text-xs text-slate-400">
                  Start fresh or stamp out a pre-built architecture
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProductType('template')}
                className={`p-3 rounded-xl border text-left text-xs transition-all ${
                  productType === 'template'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-bold">Next.js + Supabase on Vercel</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Vercel, Supabase, domain, Resend, Telegram bot, Claude API</div>
              </button>

              <button
                type="button"
                onClick={() => setProductType('custom')}
                className={`p-3 rounded-xl border text-left text-xs transition-all ${
                  productType === 'custom'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-bold">Blank Product</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Start with no services</div>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Product Name
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. PharmaFlow or QuickBite POS"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
              />
            </div>
          </div>
        )}

        {/* Onboarding Footer */}
        <div className="mt-6 pt-3 flex justify-between border-t border-slate-800">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
          >
            <span>{step === 3 ? 'Complete Setup' : 'Continue'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
