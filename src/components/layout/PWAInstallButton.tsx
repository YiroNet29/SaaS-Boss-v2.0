import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'nav' | 'header' | 'floating' }> = ({
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          className={`flex items-center gap-1.5 font-medium rounded-xl transition-all shadow-sm ${
            variant === 'header'
              ? 'px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
              : 'px-3 py-2 text-sm bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
          }`}
          aria-label="Install StackTrack as Web App"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      )}

      {isIOS && (
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 font-medium rounded-xl transition-all border ${
            variant === 'header'
              ? 'px-2.5 py-1 text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
              : 'px-3 py-2 text-sm bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
          }`}
          aria-label="Install StackTrack on iOS"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>Install PWA</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
              aria-label="Close guide"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 text-indigo-400 mb-2">
              <Download className="w-5 h-5" />
              <h3 className="text-base font-semibold text-slate-100">Install StackTrack on iOS</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Install StackTrack on your iPhone or iPad home screen for an offline-ready, full-screen mobile app experience.
            </p>
            <div className="space-y-3 text-xs text-slate-300 bg-slate-800/60 p-3.5 rounded-xl border border-slate-750">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center shrink-0 text-slate-200 font-bold">1</div>
                <div>
                  Tap the <span className="font-semibold text-indigo-300 inline-flex items-center gap-1"><Share2 className="w-3 h-3 inline" /> Share</span> icon in Safari’s bottom toolbar.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center shrink-0 text-slate-200 font-bold">2</div>
                <div>
                  Scroll down and tap <span className="font-semibold text-indigo-300 inline-flex items-center gap-1"><PlusSquare className="w-3 h-3 inline" /> Add to Home Screen</span>.
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center shrink-0 text-slate-200 font-bold">3</div>
                <div>
                  Tap <span className="font-semibold text-indigo-300">Add</span> in the top right corner.
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full py-2.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
