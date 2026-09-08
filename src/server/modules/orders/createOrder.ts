import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { upsertDailyStatsForOrder } from '@/server/modules/reports/dailyStats';
import { ensureOpenRegisterForPayment } from '@/server/modules/cash/service';
import type { UserRole, CashRegisterMode } from '@prisma/client';

export const orderItemInputSchema = z.object({
  productId: z.string().cuid(),
  qte: z.number().int().positive(),
});

export const createOrderSchema = z.object({
  clientUuid: z.string().uuid(),
  customerId: z.string().cuid(),
  items: z.array(orderItemInputSchema).min(1),
  remiseMode: z.enum(['POURCENTAGE', 'MONTANT']).optional(),
  remiseValeur: z.number().int().nonnegative().optional(),
  montantRecu: z.number().int().nonnegative().default(0),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface CreateOrderContext {
  businessId: string;
  userId: string;
  role: UserRole;
  remiseMaxVendeur: number;
  cashRegisterMode: CashRegisterMode;
}

function formatOrderNumero(date: Date, sequence: number): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `CMD-${yyyy}${mm}${dd}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Implémente spec §7.1 littéralement, dans l'ordre des 11 étapes, en transaction
 * Serializable. Chaque commentaire numéroté correspond à l'étape du document.
 */
export async function createOrder(ctx: CreateOrderContext, input: CreateOrderInput) {
  return runInTenantTransaction(
    ctx.businessId,
    async (tx) => {
      // 1. Idempotence
      const existing = await tx.order.findUnique({ where: { clientUuid: input.clientUuid } });
      if (existing) {
        return { status: 'DUPLICATE' as const, order: existing };
      }

      // Client obligatoire (spec §7.1) — customerId non-nullable, vérifié aussi
      // pour appartenance à la boutique.
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, businessId: ctx.businessId },
      });
      if (!customer) {
        throw new AppError('CUSTOMER_REQUIRED', 'Client introuvable pour cette boutique.');
      }

      // 2. Charger les produits, vérifier l'appartenance à la boutique
      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId: ctx.businessId },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      if (productById.size !== productIds.length) {
        throw new AppError('PRODUCT_NOT_FOUND', 'Un ou plusieurs produits sont introuvables.');
      }

      // 3. Recalculer sousTotal — IGNORER les montants envoyés par le client
      // 4. Figer coutUnitaire = product.cmp sur chaque ligne
      let sousTotal = 0;
      const lines = input.items.map((item) => {
        const product = productById.get(item.productId)!;
        const totalLigne = product.prixVente * item.qte;
        sousTotal += totalLigne;
        return {
          productId: product.id,
          libelle: product.nom,
          qte: item.qte,
          prixUnitaire: product.prixVente,
          coutUnitaire: product.cmp,
          totalLigne,
        };
      });

      // Remise — calcul serveur uniquement (spec §7.1)
      let remiseMontant = 0;
      if (input.remiseMode && input.remiseValeur !== undefined) {
        remiseMontant =
          input.remiseMode === 'POURCENTAGE'
            ? Math.round((sousTotal * input.remiseValeur) / 100)
            : input.remiseValeur;
        remiseMontant = Math.min(remiseMontant, sousTotal);

        if (ctx.role === 'SELLER') {
          const tauxEffectif =
            input.remiseMode === 'POURCENTAGE'
              ? input.remiseValeur
              : sousTotal > 0
                ? Math.round((remiseMontant / sousTotal) * 100)
                : 0;
          if (tauxEffectif > ctx.remiseMaxVendeur) {
            throw new AppError(
              'DISCOUNT_ABOVE_LIMIT',
              'Remise supérieure à la limite autorisée pour un vendeur.'
            );
          }
        }
      }

      const total = sousTotal - remiseMontant;
      const coutTotal = lines.reduce((acc, l) => acc + l.coutUnitaire * l.qte, 0);

      if (input.montantRecu > total) {
        throw new AppError('PAYMENT_EXCEEDS_REMAINING', 'Le montant reçu dépasse le total de la commande.');
      }

      // 7. Statut déduit du montant reçu, jamais choisi par le client
      const statutPaiement =
        input.montantRecu === 0 ? 'CREDIT' : input.montantRecu >= total ? 'PAYEE' : 'PARTIELLE';

      // Un paiement encaissé exige une caisse, puisque le CashMovement qu'il
      // déclenche (étape 9) référence obligatoirement une caisse. En mode
      // LIBRE (défaut), ensureOpenRegisterForPayment en ouvre une virtuelle
      // silencieusement si besoin ; en mode STRICT, elle reste bloquante
      // (spec §7.4, CASH_REGISTER_CLOSED) si aucune caisse n'est ouverte.
      let openRegister = null;
      if (input.montantRecu > 0) {
        openRegister = await ensureOpenRegisterForPayment(tx, ctx);
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const countToday = await tx.order.count({
        where: { businessId: ctx.businessId, createdAt: { gte: startOfDay } },
      });
      const numero = formatOrderNumero(new Date(), countToday + 1);

      // 5. Créer Order + OrderItem
      const order = await tx.order.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          customerId: customer.id,
          clientUuid: input.clientUuid,
          numero,
          sousTotal,
          remiseMode: input.remiseMode,
          remiseValeur: input.remiseValeur,
          remiseMontant,
          total,
          coutTotal,
          statutPaiement,
          items: { create: lines },
        },
      });

      // 6. Créer Payment si montantRecu > 0
      let payment = null;
      if (input.montantRecu > 0) {
        payment = await tx.payment.create({
          data: {
            businessId: ctx.businessId,
            orderId: order.id,
            customerId: customer.id,
            clientUuid: `${input.clientUuid}:payment`,
            montant: input.montantRecu,
            methode: input.methode,
            type: 'COMMANDE',
          },
        });
      }

      // 8. Décrémenter le stock + StockMovement SORTIE par ligne
      for (const line of lines) {
        const product = productById.get(line.productId)!;
        const stockAvant = product.stock;
        const stockApres = stockAvant - line.qte;
        await tx.product.update({ where: { id: product.id }, data: { stock: stockApres } });
        await tx.stockMovement.create({
          data: {
            businessId: ctx.businessId,
            productId: product.id,
            clientUuid: `${input.clientUuid}:stock:${product.id}`,
            type: 'SORTIE',
            quantite: -line.qte,
            stockAvant,
            stockApres,
            coutUnitaire: product.cmp,
            orderId: order.id,
            userId: ctx.userId,
          },
        });
        productById.set(product.id, { ...product, stock: stockApres });
      }

      // 9. CashMovement UNIQUEMENT si un paiement existe (spec §0 règle 6)
      let cashMovement = null;
      if (payment && openRegister) {
        cashMovement = await tx.cashMovement.create({
          data: {
            businessId: ctx.businessId,
            cashRegisterId: openRegister.id,
            clientUuid: `${input.clientUuid}:cash`,
            type: 'ENTREE',
            origine: 'COMMANDE',
            paymentId: payment.id,
            montant: payment.montant,
            methode: payment.methode,
            userId: ctx.userId,
          },
        });
      }

      // 10. Mettre à jour DailyStats du jour
      await upsertDailyStatsForOrder(tx, ctx.businessId, {
        totalVendu: total,
        recu: input.montantRecu,
        coutMarchandises: coutTotal,
      });

      // 11. AuditLog
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: 'ORDER_CREATED',
          entite: 'Order',
          entiteId: order.id,
          nouvellesValeurs: { total, statutPaiement, numero },
        },
      });

      return { status: 'CREATED' as const, order, payment, cashMovement };
    },
    { isolationLevel: 'Serializable' }
  );
}
