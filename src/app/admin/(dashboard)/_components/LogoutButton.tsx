'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '../../_lib/adminApi';

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await adminApi.post('/logout');
    } finally {
      router.push('/admin/login');
      router.refresh();
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="w-full rounded-lg border border-slate-800 py-2 text-xs font-semibold text-slate-400 transition-colors hover:border-slate-700 hover:text-white disabled:opacity-60"
    >
      {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  );
}
