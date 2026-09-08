import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { getAdminSessionFromCookies } from '@/server/modules/admin/session';

export interface AdminContext {
  adminUserId: string;
  nom: string;
  email: string;
}

/**
 * Garde dédié aux routes `/api/v1/admin/*` — jamais partagé avec `requireSession()`
 * (tenant), volontairement dans un fichier séparé pour qu'aucune route n'importe
 * les deux par erreur (spec : AdminUser est l'exception cross-tenant scopée à la
 * règle §0.1, jamais un chemin d'accès aux données d'une boutique).
 */
export async function requireAdminSession(): Promise<AdminContext> {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'Session administrateur invalide ou expirée.');
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: session.adminUserId } });
  if (!admin || !admin.actif) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'Compte administrateur introuvable ou désactivé.');
  }

  return { adminUserId: admin.id, nom: admin.nom, email: admin.email };
}
