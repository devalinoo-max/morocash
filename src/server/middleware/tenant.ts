import type { Prisma } from '@prisma/client';

/**
 * Pose la variable de session Postgres lue par les policies RLS (spec §3.1) :
 * `current_setting('app.business_id', true)`. Doit être appelée en tête de toute
 * transaction applicative, avant toute requête sur une table à businessId.
 */
export async function setTenantContext(
  tx: Prisma.TransactionClient,
  businessId: string
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.business_id', ${businessId}, true)`;
}
