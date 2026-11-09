import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  X,
  FileJson,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  exportServicesToCSV,
  downloadFile,
  parseServicesFromCSV,
  ParsedImportRow,
} from '../../utils/csv';
import { useSensitiveAction } from '../../context/LockContext';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({ isOpen, onClose }) => {
  const {
    currentWorkspace,
    products,
    services,
    dates,
    templates,
    importServicesBatch,
  } = useWorkspace();
  const sensitive = useSensitiveAction();

  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importResult, setImportResult] = useState<{
    valid: ParsedImportRow[];
    errors: string[];
  } | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handle CSV Export
  const handleExportCSV = async () => {
    if (!(await sensitive('export your services', { exportOf: 'Services CSV' }))) return;
    const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 130;
    const csv = exportServicesToCSV(products, services, rate);
    const filename = `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-services.csv`;
    downloadFile(csv, filename, 'text/csv');
  };

  // Handle Full JSON Backup Export
  const handleExportJSON = async () => {
    if (!(await sensitive('download a full backup', { exportOf: 'Full JSON backup' }))) return;
    const backupData = {
      workspace: currentWorkspace,
      products,
      services,
      dates,
      templates,
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const filename = `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-backup.json`;
    downloadFile(jsonStr, filename, 'application/json');
  };

  // Handle Download Sample CSV Template
  const handleDownloadSampleCSV = () => {
    const sample = [
      'ProductName,Environment,Category,Provider,Plan,BillingCycle,Cost,Currency,RenewalDate,AutoRenew,PaymentMethod,AccountEmail,Notes',
      'MySaaS,production,hosting,Vercel,Pro,monthly,20,USD,2026-11-01,true,Visa ending 4417,admin@mysaas.com,SSR Edge Frontend',
      'MySaaS,production,database,Supabase,Pro,monthly,25,USD,2026-11-15,true,Visa ending 4417,admin@mysaas.com,PostgreSQL Main Cluster',
      'MySaaS,production,SMS,Africa\'s Talking,Bulk,monthly,2600,ETB,2026-11-10,true,Telebirr 0911002233,admin@mysaas.com,OTP notifications',
    ].join('\n');
    downloadFile(sample, 'stacktrack-import-sample.csv', 'text/csv');
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseServicesFromCSV(content);
      setImportResult(parsed);
      setImportSuccessMessage(null);
    };
    reader.readAsText(file);
  };

  // Execute Import
  const handleExecuteImport = () => {
    if (!importResult || !importResult.valid.length) return;
    const res = importServicesBatch(importResult.valid);
    setImportSuccessMessage(
      `Imported ${res.addedServices} service(s) across ${res.addedProducts} newly created product(s)!`
    );
    setImportResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8 max-h-[90vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Import & Export Stack Data
            </h3>
            <p className="text-xs text-slate-400">
              CSV spreadsheet export/import and complete JSON workspace backup
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'export'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Data</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'import'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>
        </div>

        {activeTab === 'export' ? (
          <div className="space-y-4">
            {/* Export Option 1: CSV */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Export Services to CSV</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download a spreadsheet of all {services.length} services, renewal dates, and costs.
                </p>
              </div>

              <button
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Export Option 2: Full JSON Backup */}
            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <FileJson className="w-4 h-4 text-indigo-400" />
                  <span>Full Workspace JSON Backup</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete snapshot including workspaces, products, environments, services, and dates.
                </p>
              </div>

              <button
                onClick={handleExportJSON}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            </div>
          </div>
        ) : (
          /* Import CSV Tab */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Upload CSV or paste spreadsheet content:</span>
              <button
                onClick={handleDownloadSampleCSV}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download Sample CSV Template</span>
              </button>
            </div>

            {/* File Upload Box */}
            <label className="border-2 border-dashed border-slate-750 hover:border-indigo-500/60 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer bg-slate-850/50 transition-colors">
              <Upload className="w-6 h-6 text-indigo-400 mb-2" />
              <span className="text-xs font-semibold text-slate-200">
                Click to browse or drop CSV file
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5">
                Supports standard comma-separated exports
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Success message */}
            {importSuccessMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{importSuccessMessage}</span>
              </div>
            )}

            {/* Preview Parsed Rows */}
            {importResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Preview: {importResult.valid.length} valid row(s) ready to import
                  </span>
                  {importResult.errors.length > 0 && (
                    <span className="text-rose-400 font-medium">
                      {importResult.errors.length} error(s)
                    </span>
                  )}
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-850 text-xs divide-y divide-slate-800/80">
                  {importResult.valid.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-200">{item.providerName}</span>
                        <span className="text-slate-500 ml-1.5">({item.productName} • {item.category})</span>
                      </div>
                      <span className="font-mono text-emerald-400">
                        {item.cost} {item.currency}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!importResult.valid.length}
                  onClick={handleExecuteImport}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-colors"
                >
                  Confirm & Import {importResult.valid.length} Services
                </button>
              </div>
            )}
          </div>
        )}

        <div className="pt-3 flex justify-end border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
