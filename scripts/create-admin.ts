import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateSecret } from 'otplib';
import { prisma } from '../src/server/database/client';

// Crée (ou réactive avec un nouveau mot de passe) un accès à l'espace /admin.
// Usage : npx tsx scripts/create-admin.ts <email> [nom]
// Le mot de passe est généré puis affiché une seule fois ; ADMIN_PASSWORD
// permet d'en imposer un.
(async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  const nom = process.argv[3]?.trim() || 'Administrateur MoroCash';
  if (!email || !email.includes('@')) {
    console.error('Usage : npx tsx scripts/create-admin.ts <email> [nom]');
    process.exit(1);
  }

  const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, actif: true },
    // totpSecret : colonne obligatoire mais plus utilisée (2FA retiré).
    create: { email, nom, passwordHash, totpSecret: generateSecret() },
  });

  console.log(`Accès admin prêt : ${admin.email}`);
  console.log(`Mot de passe : ${password}`);
  await prisma.$disconnect();
})();
