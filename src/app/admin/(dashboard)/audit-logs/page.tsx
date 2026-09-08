'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, adminErrorMessage } from '../../_lib/adminApi';
import type { AdminAuditLog, AdminBusiness } from '../../_lib/types';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fr-FR');
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .get<{ businesses: AdminBusiness[] }>('/businesses?limit=200')
      .then((d) => setBusinesses(d.businesses))
      .catch(() => setBusinesses([]));
  }, []);

  const loadLogs = useCallback(async (opts: { append?: boolean; afterCursor?: string } = {}) => {
    const setBusy = opts.append ? setIsLoadingMore : setIsLoading;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (businessId) params.set('businessId', businessId);
      params.set('limit', '50');
      if (opts.afterCursor) params.set('cursor', opts.afterCursor);
      const data = await adminApi.get<{ logs: AdminAuditLog[] }>(`/audit-logs?${params.toString()}`);
      setLogs((prev) => (opts.append ? [...prev, ...data.logs] : data.logs));
      setHasMore(data.logs.length === 50);
      setCursor(data.logs.at(-1)?.id);
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const businessName = (id: string | null) => businesses.find((b) => b.id === id)?.nom ?? id ?? '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-slate-500">Actions sensibles effectuées par les boutiques et l&apos;admin.</p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600">Filtrer par boutique :</label>
        <select
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900"
        >
          <option value="">Toutes les boutiques</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nom}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Boutique</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entité</th>
              <th className="px-4 py-3">Auteur</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucune entrée.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(log.createdAt)}</td>
                <td className="px-4 py-3 text-slate-600">{businessName(log.businessId)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{log.action}</td>
                <td className="px-4 py-3 text-slate-600">
                  {log.entite}
                  {log.entiteId ? <span className="text-slate-400"> #{log.entiteId.slice(-6)}</span> : null}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {log.adminUserId ? 'Admin MoroCash' : log.userId ? 'Boutique' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => loadLogs({ append: true, afterCursor: cursor })}
            disabled={isLoadingMore}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-60"
          >
            {isLoadingMore ? 'Chargement…' : 'Charger plus'}
          </button>
        </div>
      )}
    </div>
  );
}
