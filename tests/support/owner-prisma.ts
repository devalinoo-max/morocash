import 'dotenv/config';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

/**
 * Client de LECTURE pour les tests, branche sur DIRECT_URL (role proprietaire).
 *
 * Le client applicatif (src/server/database/client.ts) passe par DATABASE_URL,
 * donc par le role restreint morocash_app, sans BYPASSRLS. Hors d'une
 * transaction ayant pose `app.business_id` — ce que fait runInTenantTransaction,
 * jamais un test — la policy tenant_isolation rend invisibles toutes les lignes
 * des tables protegees : un `count()` renvoie 0 et un `findUniqueOrThrow` leve
 * P2025, alors meme que la ligne existe.
 *
 * Un test qui verifie l'etat de la base APRES un appel metier doit donc lire
 * par ici, sans quoi il echoue (ou pire, passe) pour une mauvaise raison.
 */
neonConfig.webSocketConstructor = ws;

export const ownerPrisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
  log: ['error'],
});
