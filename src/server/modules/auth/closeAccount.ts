import { prisma } from '@/server/database/client';

/**
 * Ferme la boutique à la demande du propriétaire (spec absente du cahier des
 * charges — comportement calqué sur le texte déjà affiché dans les réglages :
 * les données sont conservées, la boutique passe en lecture seule, et une
 * reconnexion dans les 90 jours restaure l'accès complet — voir `login()`).
 *
 * On réutilise le statut RESILIE (jamais posé par le back-office admin, qui ne
 * connaît que ACTIF/SUSPENDU — src/server/modules/admin/service.ts) pour ne
 * pas confondre une fermeture volontaire du propriétaire avec une suspension
 * décidée par l'administrateur de la plateforme, qu'une reconnexion ne doit
 * jamais lever silencieusement.
 */
export async function closeAccount(businessId: string): Promise<void> {
  await prisma.business.update({
    where: { id: businessId },
    data: { statut: 'RESILIE', deletedAt: new Date() },
  });

  // Ferme toutes les sessions actives de la boutique (propriétaire + employés).
  await prisma.session.deleteMany({ where: { user: { businessId } } });
}
