import { describe, expect, it } from 'vitest';
import { computeRenewal } from '@/server/shared/subscription';

/**
 * Règle de prolongation, sans base de données : fin actuelle + N mois si
 * l'abonnement court encore, sinon date du paiement + N mois.
 */
const SOLO = { code: 'SOLO', prixMensuel: 15000 };
const BUSINESS = { code: 'BUSINESS', prixMensuel: 20000 };
const d = (iso: string) => new Date(`${iso}T10:00:00`);

describe('computeRenewal', () => {
  it('abonnement actif : on ajoute à la date de fin existante (05/11 + 1 mois = 05/12)', () => {
    const r = computeRenewal({
      now: d('2026-10-21'),
      statut: 'ACTIF',
      subscriptionEndsAt: d('2026-11-05'),
      planActuel: SOLO,
      planCible: SOLO,
      mois: 1,
    });
    expect(r.dateFinApres.getTime()).toBe(d('2026-12-05').getTime());
    expect(r.joursRestants).toBe(15);
    expect(r.depasseAvanceMax).toBe(false);
  });

  it('abonnement expiré : on part de la date du paiement (21/10 + 1 mois = 21/11)', () => {
    const r = computeRenewal({
      now: d('2026-10-21'),
      statut: 'ACTIF',
      subscriptionEndsAt: d('2026-10-01'),
      planActuel: SOLO,
      planCible: SOLO,
      mois: 1,
    });
    expect(r.dateFinApres.getTime()).toBe(d('2026-11-21').getTime());
  });

  it("essai : le paiement met fin à l'essai, la date part du jour du paiement", () => {
    const r = computeRenewal({
      now: d('2026-10-21'),
      statut: 'ESSAI',
      subscriptionEndsAt: null,
      planActuel: null,
      planCible: SOLO,
      mois: 3,
    });
    expect(r.dateFinApres.getTime()).toBe(d('2027-01-21').getTime());
  });

  it('changement de formule : 15 jours de Solo = 7 500 F = 11 jours de Business', () => {
    const r = computeRenewal({
      now: d('2026-10-21'),
      statut: 'ACTIF',
      subscriptionEndsAt: d('2026-11-05'),
      planActuel: SOLO,
      planCible: BUSINESS,
      mois: 1,
    });
    expect(r.conversion).toEqual({ valeur: 7500, joursConvertis: 11 });
    expect(r.dateFinApres.getTime()).toBe(d('2026-12-01').getTime());
  });

  it("12 mois toujours possibles ; bloqué seulement au-delà de 12 mois déjà payés d'avance", () => {
    const base = { now: d('2026-10-21'), statut: 'ACTIF' as const, planActuel: SOLO, planCible: SOLO };
    const r12 = computeRenewal({ ...base, subscriptionEndsAt: d('2026-11-05'), mois: 12 });
    expect(r12.depasseAvanceMax).toBe(false);
    expect(r12.dateFinApres.getTime()).toBe(d('2027-11-05').getTime());
    expect(computeRenewal({ ...base, subscriptionEndsAt: d('2027-12-01'), mois: 1 }).depasseAvanceMax).toBe(true);
  });
});
