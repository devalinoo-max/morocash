import { api } from './client';

/**
 * Avancement de la visite guidée, tel que le serveur le conserve. Les champs
 * ne font que monter : un booléen posé ne redevient pas faux, l'étape ne
 * recule pas, la liste d'écrans vus ne rétrécit pas.
 */
export interface OnboardingState {
  visiteAccueilVue: boolean;
  parcoursFait: boolean;
  parcoursEtape: number;
  bullesVues: string[];
}

/** Ce que l'app envoie : seulement ce qui vient de changer. */
export type OnboardingPatch = Partial<{
  visiteAccueilVue: true;
  parcoursFait: true;
  parcoursEtape: number;
  bullesVues: string[];
}>;

export const ONBOARDING_VIERGE: OnboardingState = {
  visiteAccueilVue: false,
  parcoursFait: false,
  parcoursEtape: 0,
  bullesVues: [],
};

export async function fetchOnboarding(): Promise<OnboardingState> {
  const result = await api.get<{ onboarding: OnboardingState }>('/onboarding');
  return result.onboarding;
}

/** Le serveur fusionne et renvoie l'état consolidé (le sien + ce patch). */
export async function saveOnboarding(patch: OnboardingPatch): Promise<OnboardingState> {
  const result = await api.patch<{ onboarding: OnboardingState }>('/onboarding', patch);
  return result.onboarding;
}

/** Union de deux états, dans n'importe quel ordre : local et serveur. */
export function mergeOnboarding(a: OnboardingState, b: OnboardingState): OnboardingState {
  return {
    visiteAccueilVue: a.visiteAccueilVue || b.visiteAccueilVue,
    parcoursFait: a.parcoursFait || b.parcoursFait,
    parcoursEtape: Math.max(a.parcoursEtape, b.parcoursEtape),
    bullesVues: [...new Set([...a.bullesVues, ...b.bullesVues])],
  };
}
