/**
 * Formule choisie sur la page de présentation (cartes 15 000 / 20 000), gardée
 * le temps de l'inscription ou de la connexion : « Mon abonnement » la reprend
 * et ouvre directement le paiement. sessionStorage : l'intention ne survit pas
 * à la fermeture de l'onglet, un clic oublié ne relance jamais un paiement.
 */
export interface PlanIntent {
  planCode: 'SOLO' | 'BUSINESS';
  periode: 'MENSUEL' | 'ANNUEL';
}

const KEY = 'morocash_plan_intent';

export function savePlanIntent(intent: PlanIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // stockage indisponible (navigation privée...) : l'utilisateur choisira à nouveau
  }
}

export function hasPlanIntent(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Lit ET efface l'intention : elle ne sert qu'une fois. */
export function takePlanIntent(): PlanIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanIntent>;
    if ((parsed.planCode === 'SOLO' || parsed.planCode === 'BUSINESS') && (parsed.periode === 'MENSUEL' || parsed.periode === 'ANNUEL')) {
      return { planCode: parsed.planCode, periode: parsed.periode };
    }
    return null;
  } catch {
    return null;
  }
}
