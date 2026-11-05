'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

// The app reads localStorage and window on first render, so it runs in the browser only.
const App = dynamic(() => import('@/App'), { ssr: false });

export default function ClientApp() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return <App />;
}
