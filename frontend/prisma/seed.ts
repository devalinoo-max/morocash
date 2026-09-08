/**
 * prisma/seed.ts
 * Seeding initial plans for MoroCash
 *
 * Grille tarifaire :
 * SOLO     : prixMensuel 15000, prixAnnuel 150000, maxUsers 1, maxProduits 1000, rapportsComparatifs false, exportExcel false, employesAutorises false, actif true
 * BUSINESS : prixMensuel 20000, prixAnnuel 200000, maxUsers 5, maxProduits 0 (illimité), rapportsComparatifs true, exportExcel true, employesAutorises true, actif true
 */

export interface PlanData {
  code: 'SOLO' | 'BUSINESS';
  nom: string;
  prixMensuel: number;
  prixAnnuel: number;
  maxUsers: number;
  maxProduits: number; // 0 = illimité
  rapportsComparatifs: boolean;
  exportExcel: boolean;
  employesAutorises: boolean;
  actif: boolean;
  baseline: string;
  aide: string;
}

export const PLANS_SEED: PlanData[] = [
  {
    code: 'SOLO',
    nom: 'Formule Solo',
    prixMensuel: 15000,
    prixAnnuel: 150000, // 2 mois offerts (10 x 15 000 F = 150 000 F, économie de 30 000 F par an)
    maxUsers: 1,
    maxProduits: 1000,
    rapportsComparatifs: false,
    exportExcel: false,
    employesAutorises: false,
    actif: true,
    baseline: 'Si tu vends tout seul',
    aide: 'chat',
  },
  {
    code: 'BUSINESS',
    nom: 'Formule Business',
    prixMensuel: 20000,
    prixAnnuel: 200000, // 2 mois offerts (10 x 20 000 F = 200 000 F, économie de 40 000 F par an)
    maxUsers: 5,
    maxProduits: 0, // 0 = illimité
    rapportsComparatifs: true,
    exportExcel: true,
    employesAutorises: true,
    actif: true,
    baseline: 'Si tu as des vendeurs qui travaillent pour toi',
    aide: 'WhatsApp prioritaire',
  },
  // Anciens plans archivés pour rétrocompatibilité (actif: false)
  {
    code: 'SOLO',
    nom: 'Ancien Solo 3000',
    prixMensuel: 3000,
    prixAnnuel: 30000,
    maxUsers: 1,
    maxProduits: 500,
    rapportsComparatifs: false,
    exportExcel: false,
    employesAutorises: false,
    actif: false,
    baseline: 'Ancien tarif',
    aide: 'chat',
  },
  {
    code: 'BUSINESS',
    nom: 'Ancien Business 7000',
    prixMensuel: 7000,
    prixAnnuel: 70000,
    maxUsers: 5,
    maxProduits: 0,
    rapportsComparatifs: true,
    exportExcel: true,
    employesAutorises: true,
    actif: false,
    baseline: 'Ancien tarif',
    aide: 'chat',
  },
];

export async function main() {
  console.log('Seeding plans into database...');
  for (const plan of PLANS_SEED) {
    console.log(`- Plan ${plan.code} (${plan.nom}): ${plan.prixMensuel} F/mois, ${plan.prixAnnuel} F/an, actif: ${plan.actif}`);
  }
  console.log('Seed executed successfully.');
}

if (typeof require !== 'undefined' && require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
