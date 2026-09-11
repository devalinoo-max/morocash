import 'dotenv/config';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';
import { findTestBusinessIds, deleteBusinesses } from './support/cleanup-test-data';

const COUNTDOWN_SECONDS = 30;

/**
 * Client dedie au nettoyage, branche sur DIRECT_URL (role proprietaire).
 *
 * Le client applicatif (src/server/database/client.ts) passe par DATABASE_URL,
 * c'est-a-dire le role restreint morocash_app, sans BYPASSRLS : hors d'une
 * transaction ayant pose `app.business_id`, la policy tenant_isolation rend
 * invisibles toutes les lignes des tables protegees (Order, Product,
 * StockMovement...). Les `deleteMany` du nettoyage supprimaient donc ZERO
 * ligne, en silence, puis butaient sur une contrainte de cle etrangere au
 * moment de supprimer les utilisateurs — et les boutiques de test
 * s'accumulaient dans la vraie base (plus de 600 constatees).
 */
function createOwnerClient(): PrismaClient {
  neonConfig.webSocketConstructor = ws;
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }), log: ['error'] });
}

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
      return;
    }

    await countdown(COUNTDOWN_SECONDS);

    const prisma = createOwnerClient();
    try {
      const businessIds = await findTestBusinessIds(prisma);
      const { businesses } = await deleteBusinesses(prisma, businessIds);
      console.log(`✅ Nettoyage terminé : ${businesses} boutique(s) de test supprimée(s).`);
    } catch (error) {
      // Un nettoyage qui echoue ne doit pas faire passer une suite verte pour
      // rouge, mais il ne doit pas non plus passer inapercu : c'est ce silence
      // qui avait laisse s'accumuler les boutiques de test.
      console.error('⚠️  Nettoyage des données de test incomplet :', error);
    } finally {
      await prisma.$disconnect();
    }
  };
}
