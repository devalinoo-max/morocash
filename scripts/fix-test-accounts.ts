import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/server/database/client';

// Remet les comptes de test sur des PIN à 6 chiffres (l'application refuse tout autre format).
(async () => {
  const a = await prisma.user.updateMany({
    where: { telephone: '2250700000001' },
    data: { codeHash: await bcrypt.hash('123456', 12) },
  });
  console.log('Alpha mis à jour:', a.count);

  if (!(await prisma.user.findFirst({ where: { telephone: '2250700000002' } }))) {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'SOLO' } });
    const b = await prisma.business.create({
      data: { nom: 'Boutique Beta', ville: 'Bouaké', typeActivite: 'COMMERCE', statut: 'ACTIF', planId: plan.id },
    });
    await prisma.user.create({
      data: {
        businessId: b.id,
        nom: 'Boutique Beta — Propriétaire',
        telephone: '2250700000002',
        codeHash: await bcrypt.hash('567890', 12),
        role: 'OWNER',
      },
    });
    await prisma.category.create({ data: { businessId: b.id, nom: 'Achat marchandise', type: 'DEPENSE', systeme: true } });
    await prisma.category.create({ data: { businessId: b.id, nom: 'Divers', type: 'PRODUIT', systeme: false } });
    console.log('Beta créée:', b.id);
  }

  // Mot de passe admin : fourni par la variable d'environnement, jamais écrit en dur.
  const adminPassword = process.env.ADMIN_NEW_PASSWORD;
  if (adminPassword) {
    const r = await prisma.adminUser.updateMany({
      where: { email: 'admin@morocash.dev' },
      data: { passwordHash: await bcrypt.hash(adminPassword, 12), actif: true },
    });
    console.log('Admin mis à jour:', r.count);
  }

  await prisma.$disconnect();
})();
