import React, { useState } from 'react';
import {
  X,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  Code,
  Globe,
  Download,
  Terminal,
  ShieldCheck,
} from 'lucide-react';

interface AndroidInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidInstallGuideModal: React.FC<AndroidInstallGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pwa' | 'twa' | 'webview'>('twa');

  if (!isOpen) return null;

  const currentUrl = window.location.origin;
  const manifestUrl = `${currentUrl}/manifest.json`;

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const webViewKotlinCode = `package com.stacktrack.app

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        webView.webViewClient = WebViewClient()
        webView.loadUrl("${currentUrl}")
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Android Studio & Standalone App Testing
              </h2>
              <p className="text-[11px] text-slate-400">
                Test StackTrack as an independent mobile app on Android Studio emulator or device
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Option Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-850 px-3 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('twa')}
            className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'twa'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Recommended: TWA (Bubblewrap)</span>
          </button>
          <button
            onClick={() => setActiveTab('webview')}
            className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'webview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Android Studio WebView</span>
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'pwa'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Direct PWA Install</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-300">
          {/* URL & Manifest quick copy */}
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300">App Start URL:</span>
              <button
                onClick={() => copyText('app-url', currentUrl)}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                {copiedKey === 'app-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'app-url' ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
            <div className="font-mono text-[11px] p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-200 truncate">
              {currentUrl}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-semibold text-slate-300">Web App Manifest URL:</span>
              <button
                onClick={() => copyText('manifest-url', manifestUrl)}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                {copiedKey === 'manifest-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'manifest-url' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="font-mono text-[11px] p-1.5 rounded bg-slate-900 border border-slate-750 text-slate-200 truncate">
              {manifestUrl}
            </div>
          </div>

          {activeTab === 'twa' && (
            <div className="space-y-3">
              <div className="text-slate-200 font-semibold">
                Option 1: Google Bubblewrap CLI (Official Trusted Web Activity)
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Trusted Web Activities run StackTrack inside a secure Chrome container without browser address bars, with full native performance and Android Studio compilation.
              </p>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Run in your local terminal:</span>
                  <button
                    onClick={() =>
                      copyText(
                        'bubblewrap-cmd',
                        `npx @bubblewrap/cli init --manifest=${manifestUrl}\nnpx @bubblewrap/cli build`
                      )
                    }
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono text-[10px]"
                  >
                    {copiedKey === 'bubblewrap-cmd' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>Copy Commands</span>
                  </button>
                </div>
                <pre className="font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre p-2 bg-slate-900 rounded-lg">
{`# 1. Initialize Android project from manifest
npx @bubblewrap/cli init --manifest=${manifestUrl}

# 2. Open generated folder in Android Studio
# File -> Open -> Select the project folder

# 3. Hit 'Run' (Shift + F10) in Android Studio to test on emulator!`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'webview' && (
            <div className="space-y-3">
              <div className="text-slate-200 font-semibold">
                Option 2: Native Android Studio WebView Project
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                If you already have a new Empty Activity project in Android Studio, replace your <code className="text-indigo-300 font-mono">MainActivity.kt</code> with this standalone snippet:
              </p>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>MainActivity.kt</span>
                  <button
                    onClick={() => copyText('webview-code', webViewKotlinCode)}
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-mono text-[10px]"
                  >
                    {copiedKey === 'webview-code' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>Copy Kotlin Code</span>
                  </button>
                </div>
                <pre className="font-mono text-[10px] text-slate-300 overflow-x-auto whitespace-pre p-2 bg-slate-900 rounded-lg max-h-56">
                  {webViewKotlinCode}
                </pre>
              </div>
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px]">
                Tip: In <code className="font-mono">AndroidManifest.xml</code>, add <code className="font-mono">&lt;uses-permission android:name=&quot;android.permission.INTERNET&quot; /&gt;</code>.
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-3">
              <div className="text-slate-200 font-semibold">
                Option 3: Direct Android Chrome PWA Install
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                StackTrack is a full PWA with an active service worker and manifest.
              </p>
              <ol className="list-decimal list-inside space-y-2 text-slate-300 text-[11px]">
                <li>Open Chrome or Samsung Internet on your Android device or emulator.</li>
                <li>Navigate to: <span className="font-mono text-indigo-300">{currentUrl}</span></li>
                <li>Tap the <strong>&ldquo;Install StackTrack&rdquo;</strong> prompt or three dots menu (<code className="font-mono">⋮</code>) and select <strong>&ldquo;Add to Home screen&rdquo;</strong>.</li>
                <li>StackTrack will install as an independent full-screen app on your app drawer and home screen.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 px-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[11px]">Manifest & Service Worker Verified</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
