import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Segmented } from '../sales/SalesKit';
import { DateRangeInputs, DATE_RANGE_LABEL } from '../common/DateRangeInputs';
import { formatMoney } from '../../utils/formatters';
import {
  fetchCommercialSales,
  fetchCommerciauxReport,
  type CommercialRow,
  type CommercialSale,
  type CommerciauxReport as Report,
} from '../../api/commerciaux';

type Preset = 'today' | 'week' | 'month' | 'custom';

/** AAAA-MM-JJ en heure locale (le serveur découpe les jours de la même façon). */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeOf(preset: Preset, custom: { start: string; end: string }): { from: string; to: string } {
  const now = new Date();
  if (preset === 'today') return { from: iso(now), to: iso(now) };
  if (preset === 'week') {
    // Semaine du lundi à aujourd'hui.
    const lundi = new Date(now);
    lundi.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: iso(lundi), to: iso(now) };
  }
  if (preset === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  const [a, b] = custom.start <= custom.end ? [custom.start, custom.end] : [custom.end, custom.start];
  return { from: a, to: b };
}

/**
 * Tableau de bord des commerciaux. Tous les chiffres viennent du serveur :
 * l'écran n'additionne rien. Deux colonnes distinctes, toujours : le chiffre
 * d'affaires (ce qui a été vendu) et l'encaissé (l'argent réellement reçu).
 */
export const CommerciauxReport: React.FC = () => {
  const [preset, setPreset] = useState<Preset>('month');
  const today = iso(new Date());
  const [custom, setCustom] = useState({ start: today, end: today });
  const { from, to } = useMemo(() => rangeOf(preset, custom), [preset, custom]);

  const [report, setReport] = useState<Report | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommercialRow | null>(null);

  useEffect(() => {
    let annule = false;
    setReport(null);
    setErreur(null);
    fetchCommerciauxReport(from, to)
      .then((r) => !annule && setReport(r))
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : 'Chargement impossible.'));
    return () => {
      annule = true;
    };
  }, [from, to]);

  if (detail) {
    return <VentesDuCommercial row={detail} from={from} to={to} onBack={() => setDetail(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="min-w-0">
          <Segmented<Preset>
            id="btn-commerciaux-period"
            label="Période"
            value={preset}
            onChange={setPreset}
            options={[
              { id: 'today', label: "Aujourd'hui" },
              { id: 'week', label: 'Cette semaine' },
              { id: 'month', label: 'Ce mois' },
              { id: 'custom', label: DATE_RANGE_LABEL },
            ]}
          />
        </div>
        {preset === 'custom' && (
          <DateRangeInputs
            id="commerciaux-range"
            start={custom.start}
            end={custom.end}
            onStartChange={(start) => setCustom((c) => ({ ...c, start }))}
            onEndChange={(end) => setCustom((c) => ({ ...c, end }))}
          />
        )}
      </div>

      {erreur ? (
        <p className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-900">{erreur}</p>
      ) : !report ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#5B4BF0]" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mc-line overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="bg-slate-50 text-mc-soft">
              <tr>
                <th className="text-left font-bold px-3 py-2.5">Commercial</th>
                <th className="text-right font-bold px-3 py-2.5">Ventes</th>
                <th className="text-right font-bold px-3 py-2.5">Chiffre d’affaires</th>
                <th className="text-right font-bold px-3 py-2.5">Encaissé</th>
                <th className="text-right font-bold px-3 py-2.5">Reste dû</th>
                <th className="text-right font-bold px-3 py-2.5">Panier moyen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((r) => (
                <tr
                  key={r.commercialId ?? 'non-attribue'}
                  onClick={() => setDetail(r)}
                  className="text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <td className={`px-3 py-2.5 font-bold ${r.commercialId ? 'text-mc-ink' : 'text-mc-soft italic'}`}>
                    {r.nom}
                    {!r.actif && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">(inactif)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.ventes}</td>
                  <td className="px-3 py-2.5 text-right">{formatMoney(r.chiffreAffaires)}</td>
                  <td className="px-3 py-2.5 text-right font-extrabold text-emerald-700">{formatMoney(r.encaisse)}</td>
                  <td className={`px-3 py-2.5 text-right ${r.resteDu > 0 ? 'text-rose-600 font-bold' : ''}`}>
                    {formatMoney(r.resteDu)}
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.panierMoyen === null ? '—' : formatMoney(r.panierMoyen)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-extrabold text-mc-ink">
              <tr>
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right">{report.total.ventes}</td>
                <td className="px-3 py-2.5 text-right">{formatMoney(report.total.chiffreAffaires)}</td>
                <td className="px-3 py-2.5 text-right text-emerald-700">{formatMoney(report.total.encaisse)}</td>
                <td className="px-3 py-2.5 text-right">{formatMoney(report.total.resteDu)}</td>
                <td className="px-3 py-2.5 text-right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[11px] text-mc-soft">
        Classés par argent encaissé. Encaissé = argent reçu sur la période, y compris sur des ventes plus anciennes.
        Une vente annulée sort des totaux. Touche une ligne pour voir ses ventes.
      </p>
    </div>
  );
};

const VentesDuCommercial: React.FC<{ row: CommercialRow; from: string; to: string; onBack: () => void }> = ({
  row,
  from,
  to,
  onBack,
}) => {
  const [ventes, setVentes] = useState<CommercialSale[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchCommercialSales(row.commercialId, from, to)
      .then((v) => !annule && setVentes(v))
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : 'Chargement impossible.'));
    return () => {
      annule = true;
    };
  }, [row.commercialId, from, to]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-mc-primary cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Tous les commerciaux
      </button>
      <h3 className="text-lg font-extrabold text-mc-ink">{row.nom}</h3>

      {erreur ? (
        <p className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-900">{erreur}</p>
      ) : !ventes ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#5B4BF0]" />
        </div>
      ) : ventes.length === 0 ? (
        <p className="text-sm text-mc-soft">Aucune vente sur cette période.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-mc-line overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead className="bg-slate-50 text-mc-soft">
              <tr>
                <th className="text-left font-bold px-3 py-2.5">Date</th>
                <th className="text-left font-bold px-3 py-2.5">Client</th>
                <th className="text-right font-bold px-3 py-2.5">Montant</th>
                <th className="text-right font-bold px-3 py-2.5">Encaissé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventes.map((v) => (
                <tr key={v.orderId} className={v.annulee ? 'text-slate-400 line-through' : 'text-slate-700'}>
                  <td className="px-3 py-2.5 whitespace-nowrap">{new Date(v.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-3 py-2.5">
                    {v.client}
                    {v.annulee && <span className="ml-1.5 no-underline text-[10px] font-bold">(annulée)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatMoney(v.montant)}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{formatMoney(v.encaisse)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
