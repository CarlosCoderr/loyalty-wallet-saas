'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'loading') router.replace(status === 'authenticated' ? '/scan' : '/login');
  }, [status, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center text-brand-600">
      <Spinner className="size-8" />
    </main>
  );
}
