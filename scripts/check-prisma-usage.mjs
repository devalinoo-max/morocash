#!/usr/bin/env node
// Vérifie que les modules métier tenant-scopés (src/server/modules/*, hors auth/)
// et les routes API tenant-scopées (src/app/api/v1/*, hors auth/) n'appellent jamais
// Prisma directement — tout doit passer par `scoped(businessId)` (spec §3.2).
//
// L'authentification (src/server/modules/auth/, src/app/api/v1/auth/) est exclue :
// login/OTP/sessions/rate-limit opèrent AVANT que businessId soit connu (recherche
// d'un téléphone à travers toutes les boutiques) ou sur des tables sans businessId
// (Session, OtpCode, RateLimit) — le repository tenant-scopé ne s'y applique pas.
// Les guards (src/server/guards/) et middlewares (src/server/middleware/) sont la
// couche fondatrice qui établit businessId ; ils sont exclus pour la même raison.
// Le back-office admin (src/server/modules/admin/, src/app/api/v1/admin/) est
// exclu lui aussi : AdminUser est l'exception délibérée et scopée à la règle §0.1
// — ses routes sont volontairement cross-tenant (métriques globales, gestion de
// toutes les boutiques), donc hors du périmètre de `scoped(businessId)`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [
  'src/server/modules',
  'src/app/api/v1',
];
const EXCLUDE_SEGMENTS = ['auth', 'repositories', 'database', 'admin'];

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (EXCLUDE_SEGMENTS.includes(entry)) continue;
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of collectFiles(abs)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (/\bprisma\./.test(line) && !line.trim().startsWith('//')) {
        violations.push(`${relative(ROOT, file)}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error('Appels Prisma directs détectés en dehors des repositories :\n');
  violations.forEach((v) => console.error('  ' + v));
  console.error('\nTout accès aux données tenant-scopées doit passer par scoped(businessId).');
  process.exit(1);
}

console.log('OK — aucun appel Prisma direct hors repositories dans les modules métier.');
