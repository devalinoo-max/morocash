import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { generateSecret, generateURI } from 'otplib';
import { prisma } from '../src/server/database/client';

const PIN_HASH_ROUNDS = 12;

async function seedBusiness(opts: {
  nom: string;
  ville: string;
  telephoneOwner: string;
  pinOwner: string;
}) {
  const plan = await prisma.plan.upsert({
    where: { code: 'SOLO' },
    update: {},
    create: {
      code: 'SOLO',
      nom: 'Formule Solo',
      prixMensuel: 15000,
      prixAnnuel: 150000,
      maxUsers: 1,
      maxProduits: 1000,
      rapportsComparatifs: false,
      exportExcel: false,
      actif: true,
    },
  });

  // Formule Business — jamais assignée par ce script (les boutiques de seed
  // restent en Solo), seedée ici pour que l'offre existe réellement en base
  // (utilisée par la page de tarifs et le changement d'offre côté admin).
  await prisma.plan.upsert({
    where: { code: 'BUSINESS' },
    update: {},
    create: {
      code: 'BUSINESS',
      nom: 'Formule Business',
      prixMensuel: 20000,
      prixAnnuel: 200000,
      maxUsers: 5,
      maxProduits: 0,
      rapportsComparatifs: true,
      exportExcel: true,
      actif: true,
    },
  });

  const business = await prisma.business.create({
    data: {
      nom: opts.nom,
      ville: opts.ville,
      typeActivite: 'COMMERCE',
      statut: 'ACTIF',
      planId: plan.id,
    },
  });

  const codeHash = await bcrypt.hash(opts.pinOwner, PIN_HASH_ROUNDS);
  const owner = await prisma.user.create({
    data: {
      businessId: business.id,
      nom: `${opts.nom} — Propriétaire`,
      telephone: opts.telephoneOwner,
      codeHash,
      role: 'OWNER',
    },
  });

  // Catégorie système "Achat marchandise" — exclue du calcul de "gagne" (spec §7.5).
  await prisma.category.create({
    data: {
      businessId: business.id,
      nom: 'Achat marchandise',
      type: 'DEPENSE',
      systeme: true,
    },
  });

  await prisma.category.create({
    data: {
      businessId: business.id,
      nom: 'Divers',
      type: 'PRODUIT',
      systeme: false,
    },
  });

  return { business, owner, plan };
}

async function main() {
  const a = await seedBusiness({
    nom: 'Boutique Alpha',
    ville: 'Abidjan',
    telephoneOwner: '2250700000001',
    pinOwner: '1234',
  });

  const b = await seedBusiness({
    nom: 'Boutique Beta',
    ville: 'Bouaké',
    telephoneOwner: '2250700000002',
    pinOwner: '5678',
  });

  // AdminUser de développement (spec §2 + étape 12) — email/mot de passe/TOTP
  // affichés en clair uniquement ici, à la création, jamais journalisés ailleurs.
  const adminEmail = 'admin@morocash.dev';
  const adminPassword = 'ChangeMoi123!';
  const totpSecret = generateSecret();
  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      nom: 'Administrateur MoroCash',
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, PIN_HASH_ROUNDS),
      totpSecret,
    },
  });
  const totpUri = generateURI({ issuer: 'MoroCash Admin', label: adminEmail, secret: totpSecret });

  console.log('Seed terminé :');
  console.log(`  - ${a.business.nom} (${a.business.id}), owner ${a.owner.telephone}`);
  console.log(`  - ${b.business.nom} (${b.business.id}), owner ${b.owner.telephone}`);
  console.log(`  - AdminUser ${admin.email} — mot de passe: ${adminPassword}`);
  console.log(`    Secret TOTP (à enrôler dans une app d'authentification): ${totpSecret}`);
  console.log(`    URI de provisionnement: ${totpUri}`);
}

main()
  .catch((err) => {
    console.error('Échec du seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
