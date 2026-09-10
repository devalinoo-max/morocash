import { z } from 'zod';
import { prisma } from '@/server/database/client';
import { setTenantContext } from '@/server/middleware/tenant';
import { hashPin } from './pin';
import { issueSessionToken } from './session';
import {
  BUSINESS_SECTORS,
  SYSTEM_EXPENSE_CATEGORY,
  starterProductCategories,
} from '@/server/modules/categories/defaults';

// Durée d'essai par défaut à la création d'une boutique — non spécifiée explicitement
// dans le cahier des charges (le champ Business.trialEndsAt existe, sa durée est un
// paramètre opérationnel laissé ouvert) ; 14 jours est une valeur de départ raisonnable,
// ajustable sans changement de schéma.
const TRIAL_DAYS = 14;

export const SUPPORTED_COUNTRIES = ['CI', 'SN', 'BJ', 'TG', 'ML', 'BF'] as const;

export const registerSchema = z.object({
  businessNom: z.string().trim().min(2).max(120),
  ville: z.string().trim().max(120).optional(),
  pays: z.enum(SUPPORTED_COUNTRIES).default('CI'),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(180).optional().or(z.literal('')),
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  pin: z.string().regex(/^\d{6}$/, 'Le code doit comporter exactement 6 chiffres'),
  // Secteur d'activité : sert uniquement à proposer des catégories de départ
  // adaptées (voir starterProductCategories). Non stocké — le commerçant peut
  // renommer, supprimer ou ignorer ces catégories dès la première minute, il
  // serait donc trompeur d'en faire un attribut durable de sa boutique.
  secteur: z.enum(BUSINESS_SECTORS).default('AUTRE'),
});

// z.input (pas z.infer/z.output) : `pays` a une valeur par défaut, donc les
// appelants (route HTTP, tests) peuvent légitimement l'omettre — registerBusiness
// re-parse ci-dessous pour que ce défaut s'applique aussi hors du chemin HTTP.
export type RegisterInput = z.input<typeof registerSchema>;

export async function registerBusiness(
  rawInput: RegisterInput,
  meta: { ip?: string; userAgent?: string }
) {
  const input = registerSchema.parse(rawInput);

  // Un même numéro peut exister dans plusieurs boutiques (spec §5) — aucune
  // vérification d'unicité globale du téléphone n'est nécessaire ici.
  // Timeout généreux comme dans withTenant() (repositories/base.ts) — le pilote
  // Neon serverless fait un aller-retour réseau par requête et peut dépasser le
  // timeout interactif par défaut de Prisma (5000 ms) sur un cold start.
  const result = await prisma.$transaction(
    async (tx) => {
      const business = await tx.business.create({
        data: {
          nom: input.businessNom,
          ville: input.ville,
          pays: input.pays,
          email: input.email || undefined,
          statut: 'ESSAI',
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      // Requis avant toute écriture sur une table protégée par RLS (Category ici) —
      // sans quoi la policy tenant_isolation rejette l'insertion (spec §3.1).
      await setTenantContext(tx, business.id);

      const codeHash = await hashPin(input.pin);
      const owner = await tx.user.create({
        data: {
          businessId: business.id,
          nom: `${input.businessNom} — Propriétaire`,
          telephone: input.telephone,
          codeHash,
          role: 'OWNER',
        },
      });

      // Catalogue déjà rangé au premier jour : le commerçant trouve des
      // catégories qui parlent de SON métier, sans avoir rien à créer avant
      // de pouvoir vendre. Il peut toutes les supprimer d'un geste.
      await tx.category.createMany({
        data: [
          {
            businessId: business.id,
            nom: SYSTEM_EXPENSE_CATEGORY,
            type: 'DEPENSE',
            systeme: true,
          },
          ...starterProductCategories(input.secteur).map((nom) => ({
            businessId: business.id,
            nom,
            type: 'PRODUIT' as const,
            systeme: false,
          })),
        ],
      });

      return { business, owner };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );

  const sessionToken = await issueSessionToken(result.owner.id, meta);

  return { ...result, sessionToken };
}
