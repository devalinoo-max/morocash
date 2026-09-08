import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/database/client';
import { registerBusiness } from '@/server/modules/auth/register';
import { login } from '@/server/modules/auth/login';
import { validateSessionToken } from '@/server/modules/auth/session';

/**
 * Test de sécurité obligatoire #1 (spec §12) : isolation A/B.
 * Le compte A n'obtient aucune donnée de B, ni en lecture (session, RLS),
 * ni via un identifiant deviné (businessId d'un autre compte au login).
 *
 * Couvre à ce stade (étape 2) : session/authentification + RLS au niveau base.
 * À étendre au fil des étapes suivantes avec les routes de lecture/écriture
 * tenant-scopées (produits, commandes, etc.) au fur et à mesure qu'elles existent.
 */
function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

describe('Isolation tenant A/B', () => {
  it("la session de A ne référence jamais la boutique de B, et réciproquement", async () => {
    const phoneA = uniquePhone('1');
    const phoneB = uniquePhone('2');

    const a = await registerBusiness(
      { businessNom: 'Test Isolation A', telephone: phoneA, pin: '111111' },
      {}
    );
    const b = await registerBusiness(
      { businessNom: 'Test Isolation B', telephone: phoneB, pin: '222222' },
      {}
    );

    expect(a.business.id).not.toBe(b.business.id);

    const sessionA = await validateSessionToken(a.sessionToken);
    const sessionB = await validateSessionToken(b.sessionToken);

    expect(sessionA?.businessId).toBe(a.business.id);
    expect(sessionA?.businessId).not.toBe(b.business.id);
    expect(sessionB?.businessId).toBe(b.business.id);
    expect(sessionB?.businessId).not.toBe(a.business.id);
  });

  it("deviner le businessId d'un autre compte au login échoue (AUTH_INVALID_PIN)", async () => {
    const phoneA = uniquePhone('3');
    const phoneB = uniquePhone('4');

    const a = await registerBusiness(
      { businessNom: 'Test Guess A', telephone: phoneA, pin: '111111' },
      {}
    );
    const b = await registerBusiness(
      { businessNom: 'Test Guess B', telephone: phoneB, pin: '222222' },
      {}
    );

    // A essaie de se connecter avec son propre téléphone+PIN mais en visant la
    // boutique de B (businessId deviné) — doit échouer, pas de session émise.
    await expect(
      login({ telephone: phoneA, pin: '111111', businessId: b.business.id }, {})
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_PIN' });
  });

  it('la RLS empêche la lecture des catégories de B quand le contexte pointe sur A', async () => {
    const phoneA = uniquePhone('5');
    const phoneB = uniquePhone('6');

    const a = await registerBusiness(
      { businessNom: 'Test RLS A', telephone: phoneA, pin: '111111' },
      {}
    );
    const b = await registerBusiness(
      { businessNom: 'Test RLS B', telephone: phoneB, pin: '222222' },
      {}
    );

    const visibleForA = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.business_id', ${a.business.id}, true)`;
      return tx.category.findMany({ where: { businessId: b.business.id } });
    });

    expect(visibleForA).toHaveLength(0);

    const ownCategoriesForA = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.business_id', ${a.business.id}, true)`;
      return tx.category.findMany({ where: { businessId: a.business.id } });
    });

    expect(ownCategoriesForA.length).toBeGreaterThan(0);
  });
});
