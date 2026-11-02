import { requireAdminSession } from '@/server/guards/admin';
import { deleteBusiness, deleteBusinessSchema, auditAdminAction } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';
import { assertCsrf } from '@/server/middleware/csrf';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Suppression définitive d'une boutique : comptes de test, démos, doublons
 * créés par erreur. Irréversible — le corps doit porter le nom exact de la
 * boutique, vérifié côté serveur (deleteBusiness), pour qu'un appel au mauvais
 * identifiant ne puisse pas effacer une vraie boutique.
 *
 * La trace d'audit est écrite APRÈS la suppression et sans businessId : la
 * boutique n'existe plus, et son propre journal est parti avec elle. Elle
 * reste consultable dans la page Journal, entite = Business.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();
    await assertCsrf();

    const body = await request.json().catch(() => null);
    const parsed = deleteBusinessSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const resume = await deleteBusiness(id, parsed.data);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      action: 'ADMIN_BUSINESS_DELETED',
      entite: 'Business',
      entiteId: id,
      nouvellesValeurs: {
        nom: resume.nom,
        motif: parsed.data.motif ?? null,
        lignesSupprimees: resume.lignes,
        total: resume.total,
      },
    });

    return ok({ supprime: resume });
  } catch (error) {
    return fail(error);
  }
}
