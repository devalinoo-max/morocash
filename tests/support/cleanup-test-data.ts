import type { PrismaClient } from '@prisma/client';

// Les tests (isolation, RLS, idempotence, sérialisation…) créent des Business
// réels via registerBusiness() contre la vraie base Neon — pas de transaction
// annulée, cf. vitest.config.mts. Ces boutiques portent toujours un nom du
// type "Test Isolation A", "Verif Stage7", "Boutique E2E Flow"… d'où le filtre.
const TEST_NAME_NEEDLES = ['test', 'e2e', 'verif'];

export async function findTestBusinessIds(prisma: PrismaClient): Promise<string[]> {
  const businesses = await prisma.business.findMany({
    where: {
      OR: TEST_NAME_NEEDLES.map((needle) => ({
        nom: { contains: needle, mode: 'insensitive' as const },
      })),
    },
    select: { id: true },
  });
  return businesses.map((b) => b.id);
}

/**
 * Supprime des Business et tout ce qui en dépend, dans l'ordre imposé par les
 * contraintes de clé étrangère (aucun onDelete: Cascade en base hormis
 * Session→User). L'ordre ci-dessous va des tables enfants vers les tables
 * parentes ; le déplacer casse une FK.
 */
/**
 * Le nettoyage passe par un client branche sur le role proprietaire
 * (voir tests/global-teardown.ts) : avec le role applicatif, la RLS masque les
 * lignes a supprimer et chaque `deleteMany` ne supprime rien.
 *
 * Les boutiques sont traitees par lots : une seule transaction sur plusieurs
 * centaines de boutiques depasse le timeout, echoue en entier, et ne nettoie
 * donc rien du tout.
 */
const CHUNK_SIZE = 25;

export async function deleteBusinesses(prisma: PrismaClient, businessIds: string[]): Promise<{ businesses: number }> {
  if (businessIds.length === 0) return { businesses: 0 };

  let supprimees = 0;
  for (let i = 0; i < businessIds.length; i += CHUNK_SIZE) {
    const lot = businessIds.slice(i, i + CHUNK_SIZE);
    await deleteBusinessChunk(prisma, lot);
    supprimees += lot.length;
  }
  return { businesses: supprimees };
}

async function deleteBusinessChunk(prisma: PrismaClient, businessIds: string[]): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const where = { businessId: { in: businessIds } };

      const orderIds = (await tx.order.findMany({ where, select: { id: true } })).map((o) => o.id);
      const productIds = (await tx.product.findMany({ where, select: { id: true } })).map((p) => p.id);

      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });

      await tx.cashMovement.deleteMany({ where });
      await tx.payment.deleteMany({ where });
      await tx.stockMovement.deleteMany({ where });
      await tx.expense.deleteMany({ where });
      await tx.stockReception.deleteMany({ where });
      await tx.stockCount.deleteMany({ where });
      await tx.order.deleteMany({ where });
      await tx.customer.deleteMany({ where });
      await tx.cashRegister.deleteMany({ where });
      await tx.productCode.deleteMany({ where });
      await tx.product.deleteMany({ where });
      await tx.category.deleteMany({ where });
      await tx.notification.deleteMany({ where });
      await tx.dailyStats.deleteMany({ where });
      await tx.auditLog.deleteMany({ where });
      await tx.subscriptionPayment.deleteMany({ where });
      await tx.invoice.deleteMany({ where });
      await tx.subscription.deleteMany({ where });
      await tx.user.deleteMany({ where }); // cascade -> Session
      await tx.business.deleteMany({ where: { id: { in: businessIds } } });
    },
    { timeout: 60_000 },
  );
}
