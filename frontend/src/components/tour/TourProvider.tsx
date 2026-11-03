import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useApp } from '../../context/AppContext';
import {
  ONBOARDING_VIERGE,
  fetchOnboarding,
  mergeOnboarding,
  saveOnboarding,
  type OnboardingPatch,
  type OnboardingState,
} from '../../api/onboarding';
import { BULLE_PAR_ECRAN, INDEX_ACTE_3, SCENARIOS } from './scenarios';
import { TourOverlay } from './TourOverlay';
import { TourFelicitations } from './TourFelicitations';
import type { TourApi, TourApp, TourScenarioId, TourStep } from './types';

/** Délai entre l'affichage du tableau de bord et la première bulle. */
const DELAI_PREMIERE_BULLE_MS = 1000;
/**
 * Délai avant de conclure qu'un compte a déjà des ventes — et donc n'a rien à
 * apprendre. Le temps que la liste du bon compte remplace celle d'avant.
 */
const DELAI_CONFIRMATION_VENTES_MS = 2500;

/** Rythme auquel on relit la condition d'avancement d'une bulle « Appuie ». */
const PULSATION_MS = 150;

const CLE_LOCALE = (userId: string) => `morocash_tour_${userId}`;

const TourContext = createContext<TourApi | null>(null);

/**
 * Accès à la visite guidée. Rend un objet inerte hors du fournisseur, pour
 * qu'un écran puisse proposer « Revoir la visite » sans se soucier de savoir
 * s'il est monté dans l'app ou dans un test.
 */
export function useTour(): TourApi {
  return (
    useContext(TourContext) ?? {
      scenario: null,
      step: null,
      index: 0,
      total: 0,
      suivant: () => {},
      passer: () => {},
      rejouerAccueil: () => {},
      lancerParcours: () => {},
      parcoursRestant: false,
    }
  );
}

// ── Stockage local ────────────────────────────────────────────────────────
// L'écran en cours lit et écrit ici, tout de suite : la bulle ne doit jamais
// attendre le réseau pour passer. Le serveur est rattrapé juste après.

function lireLocal(userId: string): OnboardingState {
  try {
    const brut = localStorage.getItem(CLE_LOCALE(userId));
    if (!brut) return ONBOARDING_VIERGE;
    const lu = JSON.parse(brut) as Partial<OnboardingState>;
    return {
      visiteAccueilVue: lu.visiteAccueilVue === true,
      parcoursFait: lu.parcoursFait === true,
      parcoursEtape: typeof lu.parcoursEtape === 'number' ? lu.parcoursEtape : 0,
      bullesVues: Array.isArray(lu.bullesVues) ? lu.bullesVues.filter((v) => typeof v === 'string') : [],
    };
  } catch {
    // Stockage indisponible (navigation privée, quota) : la visite se joue
    // quand même, elle ne se souviendra simplement pas d'elle-même.
    return ONBOARDING_VIERGE;
  }
}

function ecrireLocal(userId: string, etat: OnboardingState): void {
  try {
    localStorage.setItem(CLE_LOCALE(userId), JSON.stringify(etat));
  } catch {
    /* rien à faire : l'avancement vivra le temps de la session */
  }
}

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    authStatus,
    currentUser,
    uiState,
    justRegisteredShop,
    products,
    sales,
    cart,
    isNewSaleOpen,
    isNewProductOpen,
    setSaleSuccessReceipt,
    setActiveTab,
    setActiveMoreSubTab,
    activeTab,
    activeMoreSubTab,
  } = useApp();

  const userId = currentUser?.id ?? null;

  const [etat, setEtat] = useState<OnboardingState>(ONBOARDING_VIERGE);
  const [charge, setCharge] = useState(false);
  const [scenario, setScenario] = useState<TourScenarioId | null>(null);
  const [index, setIndex] = useState(0);
  const [felicitations, setFelicitations] = useState(false);
  /** Élément actuellement éclairé, pour lire un champ en cours de frappe. */
  const cibleRef = useRef<Element | null>(null);
  /** Envois qui n'ont pas atteint le serveur, à repousser au retour du réseau. */
  const aPousserRef = useRef<OnboardingPatch | null>(null);

  // ── Chargement ──────────────────────────────────────────────────────────
  // Le local d'abord (immédiat), le serveur ensuite : celui qui change de
  // téléphone retrouve son avancement, celui qui rouvre l'app ne patiente pas.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !userId) return;
    let vivant = true;

    const local = lireLocal(userId);
    setEtat(local);

    (async () => {
      try {
        const distant = await fetchOnboarding();
        if (!vivant) return;
        const fusion = mergeOnboarding(local, distant);
        setEtat(fusion);
        ecrireLocal(userId, fusion);
        // Le local savait des choses que le serveur ignorait (avancement hors
        // ligne) : on les lui pousse maintenant.
        if (JSON.stringify(fusion) !== JSON.stringify(distant)) {
          await saveOnboarding({
            ...(fusion.visiteAccueilVue ? { visiteAccueilVue: true as const } : {}),
            ...(fusion.parcoursFait ? { parcoursFait: true as const } : {}),
            parcoursEtape: fusion.parcoursEtape,
            bullesVues: fusion.bullesVues,
          }).catch(() => undefined);
        }
      } catch {
        /* hors ligne : le local fait foi jusqu'au retour du réseau */
      } finally {
        if (vivant) setCharge(true);
      }
    })();

    return () => {
      vivant = false;
    };
  }, [authStatus, userId]);

  /**
   * Enregistre un pas franchi. Le local est écrit tout de suite, le serveur au
   * mieux ; un échec réseau garde le patch de côté pour le retour en ligne.
   */
  const avancer = useCallback(
    (patch: OnboardingPatch) => {
      if (!userId) return;
      setEtat((precedent) => {
        const suivant: OnboardingState = {
          visiteAccueilVue: precedent.visiteAccueilVue || patch.visiteAccueilVue === true,
          parcoursFait: precedent.parcoursFait || patch.parcoursFait === true,
          parcoursEtape: Math.max(precedent.parcoursEtape, patch.parcoursEtape ?? 0),
          bullesVues: [...new Set([...precedent.bullesVues, ...(patch.bullesVues ?? [])])],
        };
        ecrireLocal(userId, suivant);
        return suivant;
      });
      saveOnboarding(patch).catch(() => {
        const attente = aPousserRef.current ?? {};
        aPousserRef.current = {
          ...attente,
          ...patch,
          parcoursEtape: Math.max(attente.parcoursEtape ?? 0, patch.parcoursEtape ?? 0),
          bullesVues: [...new Set([...(attente.bullesVues ?? []), ...(patch.bullesVues ?? [])])],
        };
      });
    },
    [userId]
  );

  // Retour du réseau : on repousse ce qui n'était pas passé.
  useEffect(() => {
    const surRetour = () => {
      const attente = aPousserRef.current;
      if (!attente) return;
      aPousserRef.current = null;
      saveOnboarding(attente).catch(() => {
        aPousserRef.current = attente;
      });
    };
    window.addEventListener('online', surRetour);
    return () => window.removeEventListener('online', surRetour);
  }, []);

  const ecranCourant = activeMoreSubTab ? `${activeTab}/${activeMoreSubTab}` : activeTab;

  // ── Ce que les scénarios savent de l'app ────────────────────────────────
  // `ouvrirNouveauProduit` et `ouvrirNouvelleVente` ont disparu d'ici, et ce
  // n'est pas un oubli : la visite ne doit jamais changer d'écran toute seule.
  // Chaque acte commence désormais par une bulle « Appuie » sur le bouton qui
  // y mène, et c'est le commerçant qui l'ouvre — c'est ainsi qu'il apprend où
  // appuyer la prochaine fois. `ouvrirEcran` ne reste que pour les deux
  // boutons « Continuer » sur lesquels il appuie lui-même.
  const app: TourApp = useMemo(
    () => ({
      nbProduits: products.length,
      nbVentes: sales.length,
      nbArticlesPanier: cart.length,
      venteOuverte: isNewSaleOpen,
      produitOuvert: isNewProductOpen,
      ecran: ecranCourant,
      ouvrirEcran: (tab, subTab) => {
        setActiveTab(tab);
        setActiveMoreSubTab(subTab ?? null);
      },
      fermerRecu: () => setSaleSuccessReceipt(null),
    }),
    [
      products.length,
      sales.length,
      cart.length,
      isNewSaleOpen,
      isNewProductOpen,
      ecranCourant,
      setActiveTab,
      setActiveMoreSubTab,
      setSaleSuccessReceipt,
    ]
  );

  const steps = scenario ? SCENARIOS[scenario].steps : [];
  const step: TourStep | null = steps[index] ?? null;

  // ── Un compte qui sait déjà ne se fait pas guider ────────────────────────
  // Au moins une vente enregistrée : ni visite d'accueil, ni parcours. On le
  // grave pour que ce soit définitif, même après un changement de téléphone.
  //
  // On ne s'y fie qu'une fois les données posées : juste après une connexion,
  // la liste des ventes peut encore porter l'instantané hors ligne du compte
  // précédent, et un compte tout neuf se voyait alors priver de sa visite.
  const dejaClient = uiState === 'READY' && sales.length > 0;
  const parcoursEnCours = etat.parcoursEtape > 0 && !etat.parcoursFait;

  useEffect(() => {
    if (!charge || !dejaClient) return;
    if (etat.visiteAccueilVue && etat.parcoursFait) return;
    // Un parcours entamé va jusqu'au bout : la vente qu'on vient d'enregistrer
    // ensemble ne fait pas de ce commerçant quelqu'un qui sait déjà.
    if (parcoursEnCours) return;
    // Une visite lancée volontairement depuis l'Aide n'est pas interrompue.
    if (scenario !== null) return;
    // Un délai de grâce : si la liste se vide juste après (elle appartenait au
    // compte d'avant), rien n'est écrit et la visite reste due.
    const minuteur = window.setTimeout(() => {
      avancer({ visiteAccueilVue: true, parcoursFait: true });
    }, DELAI_CONFIRMATION_VENTES_MS);
    return () => window.clearTimeout(minuteur);
  }, [charge, dejaClient, etat.visiteAccueilVue, etat.parcoursFait, parcoursEnCours, scenario, avancer]);

  // ── Lancement de la visite d'accueil ────────────────────────────────────
  // Une seule fois dans la vie du compte, une seconde après l'affichage du
  // tableau de bord, et jamais pendant l'écran de bienvenue post-inscription.
  const accueilLance = useRef(false);
  useEffect(() => {
    if (!charge || accueilLance.current) return;
    if (authStatus !== 'authenticated' || justRegisteredShop) return;
    if (etat.visiteAccueilVue || dejaClient) return;
    if (activeTab !== 'home') return;

    // Le verrou se pose au déclenchement, pas à l'armement : si l'état change
    // dans la seconde d'attente (lecture du serveur qui arrive, onglet qui se
    // fixe), l'effet rejoue et réarme le minuteur. Posé trop tôt, il faisait
    // perdre le lancement pour de bon — la visite ne s'ouvrait jamais.
    const minuteur = window.setTimeout(() => {
      accueilLance.current = true;
      setScenario('accueil');
      setIndex(0);
    }, DELAI_PREMIERE_BULLE_MS);
    return () => window.clearTimeout(minuteur);
  }, [charge, authStatus, justRegisteredShop, etat.visiteAccueilVue, dejaClient, activeTab]);

  // ── Reprise du parcours interrompu ──────────────────────────────────────
  // L'app fermée en plein milieu rouvre à la bonne étape. « Passer » posant
  // `parcoursFait`, une visite abandonnée volontairement ne revient jamais.
  const repriseFaite = useRef(false);
  useEffect(() => {
    if (!charge || repriseFaite.current) return;
    if (authStatus !== 'authenticated' || justRegisteredShop) return;
    if (!parcoursEnCours) return;

    const etape = Math.min(etat.parcoursEtape, SCENARIOS.parcours.steps.length - 1);
    repriseFaite.current = true;
    setScenario('parcours');
    setIndex(etape);
  }, [charge, authStatus, justRegisteredShop, parcoursEnCours, etat.parcoursEtape]);

  // ── Bulles isolées de première visite ───────────────────────────────────
  useEffect(() => {
    if (!charge || scenario !== null || felicitations) return;
    // Tant que l'accueil ou le parcours reste à faire, ces bulles attendent :
    // deux voiles d'affilée sur le même écran, personne ne le supporte.
    if (!etat.visiteAccueilVue) return;

    const attendue = BULLE_PAR_ECRAN[ecranCourant];
    if (!attendue || etat.bullesVues.includes(attendue)) return;

    setScenario(attendue);
    setIndex(0);
  }, [charge, scenario, felicitations, etat.visiteAccueilVue, etat.bullesVues, ecranCourant]);

  // ── Avancement ──────────────────────────────────────────────────────────

  /** Marque un scénario comme terminé, quelle qu'en soit la raison. */
  const clore = useCallback(
    (quel: TourScenarioId) => {
      setScenario(null);
      setIndex(0);
      setFelicitations(false);
      if (quel === 'accueil') avancer({ visiteAccueilVue: true });
      else if (quel === 'parcours') {
        // L'acte 3 vient d'expliquer l'écran « Mes chiffres » : sa bulle de
        // première visite n'a plus rien à ajouter, et deux voiles d'affilée au
        // même endroit, personne ne le supporte.
        avancer({ parcoursFait: true, visiteAccueilVue: true, bullesVues: ['ecran-rapports'] });
      }
      else avancer({ bullesVues: [quel] });
    },
    [avancer]
  );

  const allerA = useCallback(
    (prochain: number) => {
      if (!scenario) return;
      const total = SCENARIOS[scenario].steps.length;
      if (prochain >= total) {
        clore(scenario);
        return;
      }
      if (scenario === 'parcours') {
        // L'étape atteinte est notée à chaque pas : c'est elle qui permet de
        // reprendre au bon endroit si l'app se ferme à la seconde suivante.
        avancer({ parcoursEtape: prochain });
        // Fin de l'acte 2 : les félicitations s'intercalent avant l'acte 3.
        if (prochain === INDEX_ACTE_3) {
          setFelicitations(true);
          setIndex(prochain);
          return;
        }
      }
      setIndex(prochain);
    },
    [scenario, clore, avancer]
  );

  // Trois appuis très rapides sur « Suivant » sont trois événements distincts,
  // et chacun lisait sa propre valeur d'`index` avant que le rendu suivant
  // n'arrive : on sautait trois étapes d'un coup. Le verrou retient l'étape
  // déjà validée et ignore les appuis suivants jusqu'au changement d'étape.
  const dejaAvanceRef = useRef<string | null>(null);

  const suivant = useCallback(() => {
    if (!step) return;
    const cle = `${scenario}:${step.id}`;
    if (dejaAvanceRef.current === cle) return;
    dejaAvanceRef.current = cle;

    // Le bouton « Continuer » d'une bulle de passage ramène au tableau de
    // bord. C'est un appui du commerçant, pas une initiative de la visite.
    step.action?.(app);

    // La cinquième bulle d'accueil est le seul endroit d'où part le parcours.
    if (scenario === 'accueil' && step.id === 'accueil-enchainer') {
      avancer({ visiteAccueilVue: true });
      setScenario('parcours');
      setIndex(0);
      return;
    }
    allerA(index + 1);
  }, [step, scenario, index, allerA, avancer, app]);

  const passer = useCallback(() => {
    if (scenario) clore(scenario);
  }, [scenario, clore]);

  // Chaque entrée dans une étape prépare l'écran : changer d'onglet, ouvrir
  // une fenêtre, déplier un volet. Une fois par étape, pas à chaque rendu.
  const prepareeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!step || felicitations) return;
    const cle = `${scenario}:${step.id}`;
    if (prepareeRef.current === cle) return;
    prepareeRef.current = cle;
    step.prepare?.(app);
    // `app` est volontairement hors des dépendances : il change à chaque vente
    // et chaque produit, et `prepare` ne doit tourner qu'une fois par étape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, step, felicitations]);

  // Une bulle « Appuie » n'a pas de bouton : on relit sa condition en boucle
  // courte, pour qu'elle passe au moment où l'appui a lieu.
  //
  // C'est le SEUL endroit du moteur qui avance sans que personne n'ait appuyé
  // sur « Suivant », et il est fermé aux bulles « Remplis » : une bulle posée
  // sur un champ de saisie qui avançait dès que le contenu devenait valide
  // sautait au bout de deux lettres, et le voile venait recouvrir le champ que
  // le commerçant était encore en train de remplir. Il ne pouvait plus écrire.
  useEffect(() => {
    if (!step || step.kind !== 'appuie' || felicitations) return;

    const verifier = () => {
      if (step.passeQuandVisible) {
        const apparu = document.querySelector(step.passeQuandVisible);
        if (apparu) {
          allerA(index + 1);
          return;
        }
      }
      if (step.passeQuand?.(app, cibleRef.current)) {
        allerA(index + 1);
      }
    };

    const horloge = window.setInterval(verifier, PULSATION_MS);
    return () => window.clearInterval(horloge);
  }, [step, felicitations, app, index, allerA]);

  // La vente vient d'être enregistrée, mais l'app n'en a pas encore la trace
  // (envoi perdu, liste pas encore rafraîchie) : plutôt qu'un écran de
  // félicitations vide, on passe directement à l'explication du bénéfice.
  useEffect(() => {
    if (felicitations && sales.length === 0) {
      setFelicitations(false);
      setIndex(INDEX_ACTE_3);
    }
  }, [felicitations, sales.length]);

  const onCible = useCallback((el: Element | null) => {
    cibleRef.current = el;
  }, []);

  // Repère absent de cet écran : on saute la bulle sans rien afficher.
  const onCibleAbsente = useCallback(() => {
    allerA(index + 1);
  }, [allerA, index]);

  const api: TourApi = useMemo(
    () => ({
      scenario,
      step,
      index,
      total: steps.length,
      suivant,
      passer,
      rejouerAccueil: () => {
        setFelicitations(false);
        setScenario('accueil');
        setIndex(0);
      },
      lancerParcours: () => {
        setFelicitations(false);
        setScenario('parcours');
        setIndex(etat.parcoursFait ? 0 : Math.min(etat.parcoursEtape, SCENARIOS.parcours.steps.length - 1));
      },
      parcoursRestant: charge && !etat.parcoursFait && !dejaClient,
    }),
    [scenario, step, index, steps.length, suivant, passer, etat.parcoursFait, etat.parcoursEtape, charge, dejaClient]
  );

  // La dernière vente enregistrée : celle que la personne vient de faire.
  const derniereVente = sales.length > 0 ? sales[0] : null;

  return (
    <TourContext.Provider value={api}>
      {children}

      {/* Félicitations plein écran, entre l'acte 2 et l'acte 3. Sans vente à
          montrer (cas improbable d'un envoi perdu), on enchaîne directement. */}
      {felicitations && derniereVente && (
        <TourFelicitations
          sale={derniereVente}
          products={products}
          onContinuer={() => {
            // Le reçu s'est ouvert tout seul derrière les félicitations, et
            // l'acte 3 commence par désigner un onglet de la barre du bas :
            // on referme le reçu et on revient au tableau de bord, d'où le
            // commerçant prendra lui-même le chemin de ses chiffres.
            setSaleSuccessReceipt(null);
            setActiveTab('home');
            setActiveMoreSubTab(null);
            setFelicitations(false);
            setIndex(INDEX_ACTE_3);
          }}
          onPasser={passer}
        />
      )}

      {scenario && step && !felicitations && (
        <TourOverlay
          step={step}
          index={index}
          total={steps.length}
          cle={`${scenario}:${step.id}`}
          onSuivant={suivant}
          onPasser={passer}
          onCibleAbsente={onCibleAbsente}
          onCible={onCible}
        />
      )}
    </TourContext.Provider>
  );
};
