import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The service worker must never be cached by the browser, or app updates get stuck.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
