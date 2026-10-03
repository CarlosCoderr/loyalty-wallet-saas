'use client';

import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable';

/**
 * Lector de QR con la cámara trasera. Llama a onScan una sola vez por lectura;
 * para leer otra tarjeta, el padre vuelve a montar el componente.
 * La cámara solo funciona en https o en localhost.
 */
export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [state, setState] = useState<CameraState>('starting');

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false; // React StrictMode monta dos veces: la primera cámara debe apagarse

    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoRef.current!, (result, _err, ctrl) => {
        if (result && !cancelled) {
          cancelled = true;
          ctrl.stop();
          navigator.vibrate?.(80);
          onScanRef.current(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (cancelled) c.stop();
        else setState('scanning');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-900">
      <video ref={videoRef} className="size-full object-cover" muted playsInline />
      {state === 'scanning' && (
        <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
      )}
      {state !== 'scanning' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
          {state === 'starting' && 'Abriendo la cámara…'}
          {state === 'denied' && 'No hay permiso para usar la cámara. Actívalo en el navegador o escribe el número de la tarjeta.'}
          {state === 'unavailable' &&
            'No se pudo abrir la cámara (requiere https o localhost). Escribe el número de la tarjeta abajo.'}
        </div>
      )}
    </div>
  );
}
