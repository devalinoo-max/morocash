import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_PERMISSIONS,
  PERMISSION_OPTIONS,
  ROLE_LABELS,
  defaultPermissionsForRole,
  hasPermission,
  type EmployeePermission,
} from '../src/data/permissions';

/**
 * Le tableau des permissions du cahier produit, recopié ici tel quel.
 *
 * C'est le seul endroit où il est écrit deux fois, volontairement : si
 * quelqu'un change une case dans le code, ce test le dit. Un faux ici ne plante
 * rien — il laisse un vendeur lire la marge du patron, ce qui ne se voit pas.
 */
const TABLEAU: Record<EmployeePermission, { owner: boolean; gestionnaire: boolean; vendeur: boolean }> = {
  ENREGISTRER_VENTE: { owner: true, gestionnaire: true, vendeur: true },
  ENCAISSER_VERSEMENT: { owner: true, gestionnaire: true, vendeur: true },
  VOIR_SES_VENTES: { owner: true, gestionnaire: true, vendeur: true },
  FAIRE_REMISE: { owner: true, gestionnaire: true, vendeur: false },
  VENDRE_A_CREDIT: { owner: true, gestionnaire: true, vendeur: false },
  ANNULER_COMMANDE: { owner: true, gestionnaire: true, vendeur: false },
  GERER_PRODUITS: { owner: true, gestionnaire: true, vendeur: false },
  GERER_STOCK: { owner: true, gestionnaire: true, vendeur: false },
  VOIR_DETTES_CLIENTS: { owner: true, gestionnaire: true, vendeur: false },
  VOIR_DEPENSES: { owner: true, gestionnaire: true, vendeur: false },
  VOIR_PRIX_ACHAT: { owner: true, gestionnaire: true, vendeur: false },
  VOIR_BENEFICE: { owner: true, gestionnaire: true, vendeur: false },
  VOIR_VENTES_EQUIPE: { owner: true, gestionnaire: true, vendeur: false },
  VOIR_RAPPORTS: { owner: true, gestionnaire: true, vendeur: false },
  CLOTURE_CAISSE: { owner: true, gestionnaire: true, vendeur: false },
  GERER_EMPLOYES: { owner: true, gestionnaire: false, vendeur: false },
  GERER_ABONNEMENT: { owner: true, gestionnaire: false, vendeur: false },
};

describe('les cases cochées d’office par rôle', () => {
  it('couvre exactement les 17 droits du cahier, sans oubli ni surplus', () => {
    expect(EMPLOYEE_PERMISSIONS).toHaveLength(17);
    expect(Object.keys(TABLEAU).sort()).toEqual([...EMPLOYEE_PERMISSIONS].sort());
  });

  it('chaque droit a sa case, avec un libellé et une aide', () => {
    expect(PERMISSION_OPTIONS.map((o) => o.code).sort()).toEqual([...EMPLOYEE_PERMISSIONS].sort());
    for (const option of PERMISSION_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.aide.length).toBeGreaterThan(0);
    }
  });

  it('les deux lignes en gras sont marquées comme sensibles, et elles seules', () => {
    const sensibles = PERMISSION_OPTIONS.filter((o) => o.sensible).map((o) => o.code);
    expect(sensibles.sort()).toEqual(['VOIR_BENEFICE', 'VOIR_PRIX_ACHAT']);
  });

  it('le vendeur part avec vendre, encaisser et voir ses ventes — rien d’autre', () => {
    const vendeur = defaultPermissionsForRole('SELLER');
    for (const code of EMPLOYEE_PERMISSIONS) {
      expect(vendeur.includes(code)).toBe(TABLEAU[code].vendeur);
    }
  });

  it('le gestionnaire a tout sauf les employés et l’abonnement', () => {
    const gestionnaire = defaultPermissionsForRole('ACCOUNTANT');
    for (const code of EMPLOYEE_PERMISSIONS) {
      expect(gestionnaire.includes(code)).toBe(TABLEAU[code].gestionnaire);
    }
  });

  it('le propriétaire a tout, sans exception', () => {
    const proprietaire = defaultPermissionsForRole('OWNER');
    for (const code of EMPLOYEE_PERMISSIONS) {
      expect(proprietaire.includes(code)).toBe(TABLEAU[code].owner);
    }
  });

  it('nomme les rôles comme l’app les affiche, « Gestionnaire » et pas « Comptable »', () => {
    expect(ROLE_LABELS).toEqual({
      OWNER: 'Propriétaire',
      ACCOUNTANT: 'Gestionnaire',
      SELLER: 'Vendeur',
    });
  });
});

describe('ce que l’écran a le droit de montrer', () => {
  it('C1 et C2 — un vendeur ne voit ni prix d’achat, ni bénéfice, ni rapports', () => {
    const vendeur = { role: 'SELLER', permissions: defaultPermissionsForRole('SELLER') };
    expect(hasPermission(vendeur, 'VOIR_PRIX_ACHAT')).toBe(false);
    expect(hasPermission(vendeur, 'VOIR_BENEFICE')).toBe(false);
    expect(hasPermission(vendeur, 'VOIR_RAPPORTS')).toBe(false);
    // Mais il vend et il encaisse : c'est tout son métier.
    expect(hasPermission(vendeur, 'ENREGISTRER_VENTE')).toBe(true);
    expect(hasPermission(vendeur, 'ENCAISSER_VERSEMENT')).toBe(true);
  });

  it('C4 — un gestionnaire voit les rapports mais ne gère pas les employés', () => {
    const gestionnaire = { role: 'ACCOUNTANT', permissions: defaultPermissionsForRole('ACCOUNTANT') };
    expect(hasPermission(gestionnaire, 'VOIR_RAPPORTS')).toBe(true);
    expect(hasPermission(gestionnaire, 'GERER_EMPLOYES')).toBe(false);
    expect(hasPermission(gestionnaire, 'GERER_ABONNEMENT')).toBe(false);
  });

  it('C5 — cocher « Voir le bénéfice » pour un vendeur le lui ouvre', () => {
    const vendeur = {
      role: 'SELLER',
      permissions: [...defaultPermissionsForRole('SELLER'), 'VOIR_BENEFICE'],
    };
    expect(hasPermission(vendeur, 'VOIR_BENEFICE')).toBe(true);
    // Et seulement celui-là : le prix d'achat reste caché.
    expect(hasPermission(vendeur, 'VOIR_PRIX_ACHAT')).toBe(false);
  });

  it('le propriétaire a tout sans qu’aucune case soit cochée', () => {
    const patron = { role: 'OWNER', permissions: [] };
    for (const code of EMPLOYEE_PERMISSIONS) {
      expect(hasPermission(patron, code)).toBe(true);
    }
  });

  it('personne de connecté : aucun droit, jamais', () => {
    expect(hasPermission(null, 'ENREGISTRER_VENTE')).toBe(false);
    expect(hasPermission(undefined, 'VOIR_BENEFICE')).toBe(false);
  });

  it('les anciens codes stockés en base gardent leur sens', () => {
    // « Voir les marges et bénéfices » couvrait les deux lignes en gras : un
    // employé à qui son patron l'avait accordé ne doit pas le perdre.
    const ancien = { role: 'SELLER', permissions: ['VOIR_MARGES'] };
    expect(hasPermission(ancien, 'VOIR_PRIX_ACHAT')).toBe(true);
    expect(hasPermission(ancien, 'VOIR_BENEFICE')).toBe(true);
    expect(hasPermission(ancien, 'VOIR_RAPPORTS')).toBe(false);

    const exportateur = { role: 'ACCOUNTANT', permissions: ['EXPORTER_DONNEES'] };
    expect(hasPermission(exportateur, 'VOIR_RAPPORTS')).toBe(true);
  });

  it('un code inconnu n’accorde rien et ne plante pas', () => {
    const bizarre = { role: 'SELLER', permissions: ['VOIR_TOUT_LE_MONDE'] };
    for (const code of EMPLOYEE_PERMISSIONS) {
      expect(hasPermission(bizarre, code)).toBe(false);
    }
  });
});
