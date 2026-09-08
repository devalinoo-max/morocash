'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from './LogoutButton';
import { LogoMark } from '../../_components/Logo';

const NAV_ITEMS = [
  { href: '/admin', label: 'Vue d’ensemble' },
  { href: '/admin/businesses', label: 'Boutiques' },
  { href: '/admin/audit-logs', label: 'Journal d’audit' },
];

export function Sidebar({ adminNom, adminEmail }: { adminNom: string; adminEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-300">
      <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-5">
        <LogoMark size={32} />
        <div>
          <p className="text-sm font-bold text-white">
            Moro<span className="text-indigo-400">Cash</span>
          </p>
          <p className="text-[11px] text-slate-500">Back-office</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-4">
        <p className="truncate text-xs font-semibold text-slate-200">{adminNom}</p>
        <p className="mb-3 truncate text-[11px] text-slate-500">{adminEmail}</p>
        <LogoutButton />
      </div>
    </aside>
  );
}
