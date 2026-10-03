'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useSession } from '@/lib/session';

// Todas las pantallas de caja requieren sesión; si expira, se vuelve al login.
export default function CajaLayout({ children }: { children: ReactNode }) {
  const { status, session, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || !session) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-brand-600">
        <Spinner className="size-8" />
      </main>
    );
  }

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold ${pathname.startsWith(href) ? 'bg-brand-600 text-white' : 'text-slate-600'}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-slate-200 bg-white/95 px-5 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{session.tenant.name}</p>
            <p className="truncate text-xs text-slate-500">
              {session.user.fullName ?? session.user.email}
              {session.user.branchName ? ` · ${session.user.branchName}` : ''}
            </p>
          </div>
          <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={logout}>
            Salir
          </Button>
        </div>
        <nav className="flex gap-2 rounded-xl bg-slate-100 p-1">
          {tab('/scan', 'Escanear')}
          {tab('/customers/new', 'Nuevo cliente')}
        </nav>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-5 py-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">{children}</main>
    </div>
  );
}
