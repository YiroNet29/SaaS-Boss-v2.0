import type { Metadata, Viewport } from 'next';
import './globals.css';

const description =
  'Mobile-first multi-tenant SaaS stack & renewal tracker for solo founders managing services, domains, costs, and key rotations.';

export const metadata: Metadata = {
  title: 'StackTrack',
  description,
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  openGraph: { title: 'StackTrack', description, type: 'website' },
  twitter: { card: 'summary_large_image' },
  appleWebApp: { capable: true, title: 'StackTrack', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

const registerServiceWorker = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full bg-slate-950 dark:bg-slate-950 light:bg-stone-50 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
        <div id="root" className="h-full">
          {children}
        </div>
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} />
      </body>
    </html>
  );
}
