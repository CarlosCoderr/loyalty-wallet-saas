'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { QrScanner } from '@/components/QrScanner';
import { Button, Card, Field } from '@/components/ui';

// El QR de la tarjeta contiene su número de serie (ver pass-engine en la API)
const toSerial = (text: string) => text.trim().toUpperCase();

export default function ScanPage() {
  const router = useRouter();
  const [manual, setManual] = useState('');

  const open = (serial: string) => {
    if (serial) router.push(`/pass/${encodeURIComponent(toSerial(serial))}`);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    open(manual);
  };

  return (
    <>
      <h1 className="text-xl font-bold">Escanear tarjeta</h1>
      <QrScanner onScan={open} />
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field
            label="¿No lee el código? Escribe el número de tarjeta"
            name="serial"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Ej. DEMO-0001"
            autoCapitalize="characters"
            autoCorrect="off"
          />
          <Button type="submit" variant="secondary" disabled={!manual.trim()}>
            Buscar tarjeta
          </Button>
        </form>
      </Card>
    </>
  );
}
