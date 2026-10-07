import { prisma } from '@/server/database/client';
import { guardRead } from '@/server/guards';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';
import { isBusinessLocked, getTrialDaysLeft } from '@/server/shared/subscription';

export async function GET() {
  try {
    const ctx = await guardRead();
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'Utilisateur introuvable.');
    }

    // Chaque ouverture de l'app passe ici : c'est la « dernière visite » des
    // relances d'inactivité. Au plus une écriture par heure.
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 60 * 60 * 1000) {
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    }

    const plan = ctx.business.planId
      ? await prisma.plan.findUnique({ where: { id: ctx.business.planId }, select: { code: true } })
      : null;

    return ok({
      user: {
        id: user.id,
        nom: user.nom,
        telephone: user.telephone,
        role: user.role,
        // L'app masque les écrans auxquels la personne n'a pas droit ; le
        // serveur refuse de toute façon les appels correspondants (guards).
        permissions: user.permissions,
      },
      business: {
        id: ctx.business.id,
        nom: ctx.business.nom,
        statut: ctx.business.statut,
        typeActivite: ctx.business.typeActivite,
        devise: ctx.business.devise,
        ville: ctx.business.ville,
        pays: ctx.business.pays,
        email: ctx.business.email,
        planCode: plan?.code ?? null,
        trialEndsAt: ctx.business.trialEndsAt,
        subscriptionEndsAt: ctx.business.subscriptionEndsAt,
        trialDaysLeft: getTrialDaysLeft(ctx.business),
        dureeEssaiJours: ctx.business.dureeEssaiJours,
        locked: isBusinessLocked(ctx.business),
        cashRegisterMode: ctx.business.cashRegisterMode,
        // Réglages partagés entre les appareils de la boutique (null tant que
        // le propriétaire n'en a envoyé aucun).
        reglages: ctx.business.reglages ?? null,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
