import { z } from 'zod';
import { scoped } from '@/server/repositories/base';

/**
 * Avancement de la visite guidée. Tout est optionnel : l'app n'envoie que ce
 * qui vient de changer, à chaque bulle franchie.
 *
 * Rien ici ne permet de revenir en arrière — pas de `false`, pas d'étape qui
 * décroît, pas de liste d'écrans qui rétrécit. C'est volontaire : le serveur
 * ne fait que fusionner (voir `onboarding.merge`), donc un envoi en retard
 * arrivé après un envoi plus avancé ne peut pas effacer le plus avancé.
 */
export const patchOnboardingSchema = z.object({
  visiteAccueilVue: z.literal(true).optional(),
  parcoursFait: z.literal(true).optional(),
  parcoursEtape: z.number().int().min(0).max(100).optional(),
  bullesVues: z.array(z.string().max(40)).max(40).optional(),
});

export type PatchOnboardingInput = z.infer<typeof patchOnboardingSchema>;

export interface OnboardingState {
  visiteAccueilVue: boolean;
  parcoursFait: boolean;
  parcoursEtape: number;
  bullesVues: string[];
}

function serialize(row: {
  visiteAccueilVue: boolean;
  parcoursFait: boolean;
  parcoursEtape: number;
  bullesVues: string[];
}): OnboardingState {
  return {
    visiteAccueilVue: row.visiteAccueilVue,
    parcoursFait: row.parcoursFait,
    parcoursEtape: row.parcoursEtape,
    bullesVues: row.bullesVues,
  };
}

/**
 * État de départ renvoyé quand la personne n'est pas (ou plus) rattachée à
 * cette boutique : rien de vu. L'app affichera la visite, ce qui est sans
 * conséquence — la session sera de toute façon refusée à l'écriture suivante.
 */
const VIERGE: OnboardingState = {
  visiteAccueilVue: false,
  parcoursFait: false,
  parcoursEtape: 0,
  bullesVues: [],
};

export async function getOnboarding(businessId: string, userId: string): Promise<OnboardingState> {
  const row = await scoped(businessId).onboarding.ensure(userId);
  return row ? serialize(row) : VIERGE;
}

export async function patchOnboarding(
  businessId: string,
  userId: string,
  input: PatchOnboardingInput
): Promise<OnboardingState> {
  const row = await scoped(businessId).onboarding.merge(userId, input);
  return row ? serialize(row) : VIERGE;
}
