import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// Fonts for the Noir Gold, Ember and Sage themes. Served from this site (no Google request in the
// browser) and not preloaded: a browser only downloads the one the chosen theme uses.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
  preload: false,
});
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap', preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap', preload: false });

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



export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full ${cormorant.variable} ${fraunces.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body className="h-full bg-slate-950 dark:bg-slate-950 light:bg-stone-50 text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
        <div id="root" className="h-full">
          {children}
        </div>
      </body>
    </html>
  );
}
