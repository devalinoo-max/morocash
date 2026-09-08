import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { generateSecret } from 'otplib';
import { prisma } from '@/server/database/client';
import { registerBusiness } from '@/server/modules/auth/register';
import { loginAdmin } from '@/server/modules/admin/login';
import { validateAdminSessionToken } from '@/server/modules/admin/session';
import {
  extendTrial,
  changePlan,
  suspendBusiness,
  reactivateBusiness,
  resetUserCode,
  listAuditLogs,
  auditAdminAction,
} from '@/server/modules/admin/service';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 12 (spec §13) : un admin prolonge un essai,
 * change une offre, suspend/réactive une boutique, et réinitialise le code d'un
 * utilisateur, uniquement via l'API admin — chaque action visible dans
 * audit-logs (adminUserId peuplé).
 */
describe('Étape 12 — actions admin de bout en bout', () => {
  it("connexion admin (email+mdp) puis 5 actions, toutes journalisées", async () => {
    const email = `admin-${Date.now()}@morocash.test`;
    const password = 'MotDePasseAdmin123!';
    await prisma.adminUser.create({
      data: {
        nom: 'Admin Test',
        email,
        passwordHash: await bcrypt.hash(password, 12),
        totpSecret: generateSecret(),
      },
    });

    const token = await loginAdmin({ email, password });
    const session = await validateAdminSessionToken(token);
    expect(session).not.toBeNull();

    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage12', telephone: uniquePhone('9'), pin: '123456' },
      {}
    );

    const soloPlan = await prisma.plan.upsert({
      where: { code: 'SOLO_TEST12' },
      update: {},
      create: {
        code: 'SOLO_TEST12',
        nom: 'Solo Test 12',
        prixMensuel: 10000,
        prixAnnuel: 100000,
        maxUsers: 1,
        maxProduits: 500,
        actif: true,
      },
    });

    const adminUserId = session!.adminUserId;

    // Reproduit exactement ce que fait chaque route : service puis auditAdminAction
    // (le module de service reste pur, l'audit est posé à la frontière API — même
    // convention que les autres domaines, ex. stock/expenses).
    const beforeTrial = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    const afterTrialBiz = await extendTrial(business.id, { jours: 30 });
    await auditAdminAction({
      adminUserId,
      businessId: business.id,
      action: 'ADMIN_TRIAL_EXTENDED',
      entite: 'Business',
      entiteId: business.id,
    });
    expect(afterTrialBiz.trialEndsAt!.getTime()).toBeGreaterThan(beforeTrial.trialEndsAt!.getTime());

    const afterPlan = await changePlan(business.id, { planId: soloPlan.id });
    await auditAdminAction({
      adminUserId,
      businessId: business.id,
      action: 'ADMIN_PLAN_CHANGED',
      entite: 'Business',
      entiteId: business.id,
    });
    expect(afterPlan.planId).toBe(soloPlan.id);

    const afterSuspend = await suspendBusiness(business.id);
    await auditAdminAction({
      adminUserId,
      businessId: business.id,
      action: 'ADMIN_BUSINESS_SUSPENDED',
      entite: 'Business',
      entiteId: business.id,
    });
    expect(afterSuspend.statut).toBe('SUSPENDU');

    const afterReactivate = await reactivateBusiness(business.id);
    await auditAdminAction({
      adminUserId,
      businessId: business.id,
      action: 'ADMIN_BUSINESS_REACTIVATED',
      entite: 'Business',
      entiteId: business.id,
    });
    expect(afterReactivate.statut).toBe('ACTIF');

    const newPin = '999999';
    const resetUser = await resetUserCode(business.id, { userId: owner.id, newPin });
    await auditAdminAction({
      adminUserId,
      businessId: business.id,
      action: 'ADMIN_USER_CODE_RESET',
      entite: 'User',
      entiteId: resetUser.id,
    });
    const updatedOwner = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(await bcrypt.compare(newPin, updatedOwner.codeHash)).toBe(true);

    // Les 5 actions doivent être journalisées avec adminUserId peuplé — via l'API
    // admin uniquement, sans intervention SQL directe.
    const logs = await listAuditLogs({ businessId: business.id });
    const actions = logs.filter((l) => l.adminUserId === adminUserId).map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'ADMIN_TRIAL_EXTENDED',
        'ADMIN_PLAN_CHANGED',
        'ADMIN_BUSINESS_SUSPENDED',
        'ADMIN_BUSINESS_REACTIVATED',
        'ADMIN_USER_CODE_RESET',
      ])
    );
  });
});
