import { prisma } from '@/server/database/client';
import type { Prisma } from '@prisma/client';
import { setTenantContext } from '@/server/middleware/tenant';

export { setTenantContext };

/**
 * Exécute `fn` dans une transaction ayant posé `app.business_id` — condition requise
 * pour que les policies RLS s'appliquent (spec §3.1). Le rôle applicatif Neon
 * (morocash_app) n'a pas BYPASSRLS : sans ce contexte, toute lecture sur une table
 * protégée renvoie 0 ligne et toute écriture est rejetée par la policy.
 */
// Le pilote serverless Neon fait un aller-retour réseau par requête (pas de
// connexion locale persistante) — les transactions multi-étapes (ex. création de
// commande, §7.1) dépassent facilement le timeout interactif par défaut de Prisma
// (5000 ms). Une marge généreuse évite des échecs sporadiques sans risquer de
// verrous longs, les transactions restant courtes en nombre de requêtes.
const DEFAULT_TRANSACTION_TIMEOUT_MS = 15_000;
const DEFAULT_TRANSACTION_MAX_WAIT_MS = 10_000;

function withTenant<T>(
  businessId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await setTenantContext(tx, businessId);
      return fn(tx);
    },
    {
      isolationLevel: options?.isolationLevel,
      timeout: options?.timeout ?? DEFAULT_TRANSACTION_TIMEOUT_MS,
      maxWait: options?.maxWait ?? DEFAULT_TRANSACTION_MAX_WAIT_MS,
    }
  );
}

/**
 * Point d'entrée public pour les transactions métier complexes multi-modèles
 * (ex. réception de stock, création de commande) qui ne se réduisent pas aux
 * méthodes CRUD simples de `scoped()`. Reste la SEULE façon d'obtenir un accès
 * transactionnel à Prisma depuis un module métier — `prisma` lui-même ne doit
 * jamais être importé en dehors de ce dossier (spec §3.2).
 */
export function runInTenantTransaction<T>(
  businessId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }
): Promise<T> {
  return withTenant(businessId, fn, options);
}

/**
 * Toute donnée liée à une boutique doit passer par ce repository.
 * Toute occurrence de `prisma.` en dehors de ce dossier est un bug (spec §3.2).
 */
export function scoped(businessId: string) {
  const where = { businessId };

  return {
    products: {
      findMany: (args: Prisma.ProductFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.product.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      findById: (id: string, args: Omit<Prisma.ProductFindFirstArgs, 'where'> = {}) =>
        withTenant(businessId, (tx) => tx.product.findFirst({ ...args, where: { id, ...where } })),
      create: (data: Omit<Prisma.ProductUncheckedCreateInput, 'businessId'>) =>
        withTenant(businessId, (tx) => tx.product.create({ data: { ...data, businessId } })),
      update: (id: string, data: Prisma.ProductUncheckedUpdateInput) =>
        withTenant(businessId, (tx) => tx.product.updateMany({ where: { id, ...where }, data })),
      hasHistory: (id: string) =>
        withTenant(businessId, async (tx) => {
          const [orderItemCount, movementCount] = await Promise.all([
            tx.orderItem.count({ where: { productId: id } }),
            tx.stockMovement.count({ where: { productId: id, ...where } }),
          ]);
          return orderItemCount > 0 || movementCount > 0;
        }),
      // Suppression réelle — n'appeler qu'après avoir vérifié hasHistory() côté service.
      delete: (id: string) =>
        withTenant(businessId, (tx) => tx.product.deleteMany({ where: { id, ...where } })),
    },

    productImages: {
      findByProduct: (productId: string) =>
        withTenant(businessId, async (tx) => {
          const product = await tx.product.findFirst({ where: { id: productId, ...where } });
          if (!product) return null;
          return tx.productImage.findMany({ where: { productId }, orderBy: { ordre: 'asc' } });
        }),
      create: (
        productId: string,
        data: Omit<Prisma.ProductImageUncheckedCreateInput, 'productId'>
      ) =>
        withTenant(businessId, async (tx) => {
          const product = await tx.product.findFirst({ where: { id: productId, ...where } });
          if (!product) return null;
          return tx.productImage.create({ data: { ...data, productId } });
        }),
      findById: (imageId: string) =>
        withTenant(businessId, async (tx) => {
          const image = await tx.productImage.findFirst({
            where: { id: imageId },
            include: { product: true },
          });
          if (!image || image.product.businessId !== businessId) return null;
          return image;
        }),
      delete: (imageId: string) =>
        withTenant(businessId, async (tx) => {
          const image = await tx.productImage.findFirst({
            where: { id: imageId },
            include: { product: true },
          });
          if (!image || image.product.businessId !== businessId) return null;
          await tx.productImage.delete({ where: { id: imageId } });
          return image;
        }),
      reorder: (productId: string, orderedIds: string[]) =>
        withTenant(businessId, async (tx) => {
          const product = await tx.product.findFirst({ where: { id: productId, ...where } });
          if (!product) return false;
          await Promise.all(
            orderedIds.map((id, idx) =>
              tx.productImage.update({ where: { id }, data: { ordre: idx } })
            )
          );
          return true;
        }),
    },

    productCodes: {
      findByProduct: (productId: string) =>
        withTenant(businessId, (tx) => tx.productCode.findMany({ where: { productId, ...where } })),
      findByCode: (code: string) =>
        withTenant(businessId, (tx) => tx.productCode.findFirst({ where: { code, ...where } })),
      create: (data: Omit<Prisma.ProductCodeUncheckedCreateInput, 'businessId'>) =>
        withTenant(businessId, (tx) => tx.productCode.create({ data: { ...data, businessId } })),
      delete: (id: string) =>
        withTenant(businessId, (tx) => tx.productCode.deleteMany({ where: { id, ...where } })),
    },

    customers: {
      findMany: (args: Prisma.CustomerFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.customer.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      findById: (id: string) =>
        withTenant(businessId, (tx) => tx.customer.findFirst({ where: { id, ...where } })),
      create: (data: Omit<Prisma.CustomerUncheckedCreateInput, 'businessId'>) =>
        withTenant(businessId, (tx) => tx.customer.create({ data: { ...data, businessId } })),
      update: (id: string, data: Prisma.CustomerUncheckedUpdateInput) =>
        withTenant(businessId, (tx) => tx.customer.updateMany({ where: { id, ...where }, data })),
    },

    orders: {
      findMany: (args: Prisma.OrderFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.order.findMany({
            include: { items: true, payments: true },
            ...args,
            where: { ...where, ...args.where },
          })
        ),
      findById: (id: string) =>
        withTenant(businessId, (tx) =>
          tx.order.findFirst({ where: { id, ...where }, include: { items: true, payments: true } })
        ),
      findByClientUuid: (clientUuid: string) =>
        withTenant(businessId, (tx) => tx.order.findFirst({ where: { clientUuid, ...where } })),
    },

    payments: {
      findMany: (args: Prisma.PaymentFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.payment.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      findById: (id: string) =>
        withTenant(businessId, (tx) => tx.payment.findFirst({ where: { id, ...where } })),
    },

    expenses: {
      findMany: (args: Prisma.ExpenseFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.expense.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      findById: (id: string) =>
        withTenant(businessId, (tx) => tx.expense.findFirst({ where: { id, ...where } })),
      update: (id: string, data: Prisma.ExpenseUncheckedUpdateInput) =>
        withTenant(businessId, (tx) => tx.expense.updateMany({ where: { id, ...where }, data })),
    },

    categories: {
      findMany: (args: Prisma.CategoryFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.category.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      findById: (id: string) =>
        withTenant(businessId, (tx) => tx.category.findFirst({ where: { id, ...where } })),
      create: (data: Omit<Prisma.CategoryUncheckedCreateInput, 'businessId'>) =>
        withTenant(businessId, (tx) => tx.category.create({ data: { ...data, businessId } })),
      update: (id: string, data: Prisma.CategoryUncheckedUpdateInput) =>
        withTenant(businessId, (tx) => tx.category.updateMany({ where: { id, ...where }, data })),
      delete: (id: string) =>
        withTenant(businessId, (tx) => tx.category.deleteMany({ where: { id, ...where } })),
      /** Nombre de produits et de dépenses qui s'appuient sur chaque catégorie. */
      usageCounts: () =>
        withTenant(businessId, async (tx) => {
          const [products, expenses] = await Promise.all([
            tx.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
            tx.expense.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
          ]);
          const counts = new Map<string, number>();
          for (const row of products) {
            if (row.categoryId) counts.set(row.categoryId, row._count._all);
          }
          for (const row of expenses) {
            counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + row._count._all);
          }
          return counts;
        }),
      /** Déplace tous les produits d'une catégorie vers une autre (ou aucune). */
      moveProducts: (fromCategoryId: string, toCategoryId: string | null) =>
        withTenant(businessId, async (tx) => {
          const result = await tx.product.updateMany({
            where: { ...where, categoryId: fromCategoryId },
            data: { categoryId: toCategoryId },
          });
          return result.count;
        }),
    },

    movements: {
      findMany: (args: Prisma.StockMovementFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.stockMovement.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      findById: (id: string) =>
        withTenant(businessId, (tx) => tx.stockMovement.findFirst({ where: { id, ...where } })),
    },

    cash: {
      currentRegister: () =>
        withTenant(businessId, (tx) =>
          tx.cashRegister.findFirst({ where: { ...where, statut: 'OUVERTE' } })
        ),
      findRegisterById: (id: string) =>
        withTenant(businessId, (tx) => tx.cashRegister.findFirst({ where: { id, ...where } })),
      movements: (args: Prisma.CashMovementFindManyArgs = {}) =>
        withTenant(businessId, (tx) =>
          tx.cashMovement.findMany({ ...args, where: { ...where, ...args.where } })
        ),
      history: () =>
        withTenant(businessId, (tx) =>
          tx.cashRegister.findMany({ where, orderBy: { ouverteLe: 'desc' } })
        ),
    },

    // User n'est pas couvert par RLS (spec §3.1 ne le liste pas) — pas besoin de
    // contexte tenant, le filtre applicatif businessId suffit.
    users: {
      findMany: (args: Prisma.UserFindManyArgs = {}) =>
        prisma.user.findMany({ ...args, where: { ...where, ...args.where } }),
      findById: (id: string) => prisma.user.findFirst({ where: { id, ...where } }),
      create: (data: Omit<Prisma.UserUncheckedCreateInput, 'businessId'>) =>
        prisma.user.create({ data: { ...data, businessId } }),
      update: (id: string, data: Prisma.UserUncheckedUpdateInput) =>
        prisma.user.updateMany({ where: { id, ...where }, data }),
    },
  };
}
