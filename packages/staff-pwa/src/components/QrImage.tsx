'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Muestra un texto como QR (p. ej. el enlace de Apple Wallet para que el cliente lo escanee). */
export function QrImage({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [value]);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL generada en el cliente
    <img src={src} alt={label} width={320} height={320} className="mx-auto size-64 rounded-xl bg-white p-2" />
  ) : (
    <div className="mx-auto size-64 animate-pulse rounded-xl bg-slate-100" />
  );
}
