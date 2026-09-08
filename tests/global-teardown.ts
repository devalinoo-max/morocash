import { prisma } from '../src/server/database/client';
import { findTestBusinessIds, deleteBusinesses } from './support/cleanup-test-data';

const COUNTDOWN_SECONDS = 30;

async function countdown(seconds: number) {
  for (let remaining = seconds; remaining > 0; remaining--) {
    process.stdout.write(`\r🧹 Nettoyage des données de test dans ${remaining}s... (Ctrl+C pour annuler)   `);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stdout.write('\r🧹 Nettoyage des données de test en cours...                                   \n');
}

export default function setup() {
  return async function teardown() {
    if (process.env.SKIP_TEST_CLEANUP === '1') {
      console.log('🧹 Nettoyage sauté (SKIP_TEST_CLEANUP=1).');
      await prisma.$disconnect();
      return;
    }

    await countdown(COUNTDOWN_SECONDS);

    const businessIds = await findTestBusinessIds(prisma);
    const { businesses } = await deleteBusinesses(prisma, businessIds);

    console.log(`✅ Nettoyage terminé : ${businesses} boutique(s) de test supprimée(s).`);

    await prisma.$disconnect();
  };
}
