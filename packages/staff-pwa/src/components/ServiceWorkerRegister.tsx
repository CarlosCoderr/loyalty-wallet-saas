'use client';

import { useEffect } from 'react';

// Registra /sw.js solo en producción: en desarrollo un service worker sirve archivos viejos.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual; solo no se puede instalar/offline
    });
  }, []);
  return null;
}
