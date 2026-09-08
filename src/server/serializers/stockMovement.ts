import type { StockMovement, UserRole } from '@prisma/client';

/**
 * Filtrage par rôle AVANT la réponse (spec §0 règle 7) : un SELLER ne reçoit
 * jamais coutUnitaire (CMP) ni prixAchatUnitaire — GET /stock/movements
 * renvoyait jusqu'ici les enregistrements Prisma bruts à tous les rôles, même
 * classe de bug déjà trouvée et corrigée pour /orders (voir serializers/order.ts).
 */
export function serializeStockMovement(m: StockMovement, role: UserRole) {
  if (role !== 'SELLER') return m;
  const { coutUnitaire, prixAchatUnitaire, ...rest } = m;
  return rest;
}

export function serializeStockMovementList(movements: StockMovement[], role: UserRole) {
  return movements.map((m) => serializeStockMovement(m, role));
}
