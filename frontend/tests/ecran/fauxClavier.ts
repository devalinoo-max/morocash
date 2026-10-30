/**
 * Clavier logiciel simulé, pour le banc d'essai de l'assistant.
 *
 * Un navigateur piloté n'ouvre pas le clavier d'un téléphone. On remplace donc
 * window.visualViewport par une mesure pilotée depuis le test, qui se comporte
 * comme sur Android et iOS : la page garde toute sa hauteur (window.innerHeight
 * ne bouge pas), seule la zone visible rétrécit par le bas.
 *
 * Le test appelle window.simulerClavier(336) pour ouvrir un clavier de 336 px,
 * et window.simulerClavier(0) pour le refermer.
 */

class FauxViewport extends EventTarget {
  hauteurClavier = 0;

  get height(): number {
    return window.innerHeight - this.hauteurClavier;
  }
  get width(): number {
    return window.innerWidth;
  }
  // Clavier ouvert sans défilement de la page : la zone visible commence en haut.
  get offsetTop(): number {
    return 0;
  }
  get offsetLeft(): number {
    return 0;
  }
  get pageTop(): number {
    return 0;
  }
  get pageLeft(): number {
    return 0;
  }
  get scale(): number {
    return 1;
  }
}

export function installerFauxClavier(): void {
  const vv = new FauxViewport();
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
  Object.assign(window, {
    simulerClavier(px: number) {
      vv.hauteurClavier = px;
      vv.dispatchEvent(new Event('resize'));
    },
  });
}
