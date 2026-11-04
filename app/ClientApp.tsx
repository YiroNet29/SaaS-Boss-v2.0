'use client';

import dynamic from 'next/dynamic';

// The app reads localStorage and window on first render, so it runs in the browser only.
const App = dynamic(() => import('@/App'), { ssr: false });

export default function ClientApp() {
  return <App />;
}
