import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Las pruebas E2E compilan con otra API (NEXT_PUBLIC_API_URL) en su propia carpeta
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // TypeScript 7 ya no expone la API JS que usa Next para revisar tipos durante el build.
  // Los tipos se revisan con `npm run typecheck` (tsc --noEmit), que también corre en CI.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // El service worker debe poder controlar toda la app y no quedar cacheado viejo
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
