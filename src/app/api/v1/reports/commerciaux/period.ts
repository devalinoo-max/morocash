import { AppError } from '@/server/shared/errors';

/** Période en jours entiers : from / to au format AAAA-MM-JJ, jour local du serveur comme les autres rapports. */
export function parsePeriod(url: URL): { from: Date; to: Date } {
  const parse = (name: string) => {
    const raw = url.searchParams.get(name);
    const m = raw ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
    if (!m) throw new AppError('VALIDATION_ERROR', `Paramètre "${name}" invalide (AAAA-MM-JJ attendu).`);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const from = parse('from');
  const to = parse('to');
  if (to < from) throw new AppError('VALIDATION_ERROR', 'La date de fin précède la date de début.');
  return { from, to };
}
