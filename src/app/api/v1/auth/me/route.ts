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

    const plan = ctx.business.planId
      ? await prisma.plan.findUnique({ where: { id: ctx.business.planId }, select: { code: true } })
      : null;

    return ok({
      user: { id: user.id, nom: user.nom, telephone: user.telephone, role: user.role },
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
        locked: isBusinessLocked(ctx.business),
        cashRegisterMode: ctx.business.cashRegisterMode,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
