import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/database/client';
import { registerBusiness } from '@/server/modules/auth/register';
import { closeAccount } from '@/server/modules/auth/closeAccount';
import { login } from '@/server/modules/auth/login';
import { requireBusinessWritable } from '@/server/guards';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Bouton "Fermer mon compte" des réglages (Mon compte) : fermeture réversible
 * d'une boutique par son propriétaire — statut RESILIE, sessions coupées,
 * lecture seule immédiate, puis restauration automatique à la prochaine
 * connexion réussie (texte déjà affiché dans l'UI avant que ce comportement
 * n'existe côté serveur).
 */
describe('Fermeture de compte par le propriétaire', () => {
  it('ferme la boutique (lecture seule, sessions coupées) puis la réactive à la reconnexion', async () => {
    const telephone = uniquePhone('9');
    const pin = '123456';
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Fermeture Compte', telephone, pin },
      {}
    );

    await closeAccount(business.id);

    const closed = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(closed.statut).toBe('RESILIE');
    expect(closed.deletedAt).not.toBeNull();

    await expect(requireBusinessWritable(business.id)).rejects.toMatchObject({
      code: 'BUSINESS_READ_ONLY',
    });

    const remainingSessions = await prisma.session.count({ where: { userId: owner.id } });
    expect(remainingSessions).toBe(0);

    const result = await login({ telephone, pin }, {});
    expect(result.status).toBe('OK');

    const reactivated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(reactivated.statut).toBe('ACTIF');
    expect(reactivated.deletedAt).toBeNull();

    await expect(requireBusinessWritable(business.id)).resolves.toBeTruthy();
  });

  it('ne réactive jamais une boutique SUSPENDU par le back-office admin', async () => {
    const telephone = uniquePhone('8');
    const pin = '123456';
    const { business } = await registerBusiness(
      { businessNom: 'Verif Suspension Admin Intacte', telephone, pin },
      {}
    );

    await prisma.business.update({ where: { id: business.id }, data: { statut: 'SUSPENDU' } });

    const result = await login({ telephone, pin }, {});
    expect(result.status).toBe('OK');

    const stillSuspended = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(stillSuspended.statut).toBe('SUSPENDU');
  });
});
