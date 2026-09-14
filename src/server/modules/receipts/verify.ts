import { runInTenantTransaction } from '@/server/repositories/base';

const CUID_RE = /^c[^\s-]{8,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifiedReceipt {
  shopName: string;
  shopCity: string | null;
  numero: string;
  createdAt: Date;
  clientFirstName: string | null;
  items: { libelle: string; qte: number; totalLigne: number }[];
  sousTotal: number;
  remiseMontant: number;
  total: number;
  paye: number;
  cancelled: boolean;
}

/**
 * Lecture publique d'un reçu, pour le lien encodé dans son QR code.
 *
 * Pas de session : le lien lui-même est la preuve. Il faut connaître à la fois
 * la boutique et le clientUuid de la commande (UUID v4 aléatoire) — un numéro
 * de reçu, séquentiel, ne suffit jamais. Le contenu est celui du reçu remis au
 * client, sans son téléphone ni ses autres dettes.
 */
export async function findVerifiedReceipt(
  businessId: string,
  clientUuid: string
): Promise<VerifiedReceipt | null> {
  if (!CUID_RE.test(businessId) || !UUID_RE.test(clientUuid)) return null;

  return runInTenantTransaction(businessId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { businessId, clientUuid },
      include: { items: true, payments: true, customer: true, business: true },
    });
    if (!order) return null;

    const paye = order.payments
      .filter((p) => p.statut === 'VALIDE')
      .reduce((acc, p) => acc + p.montant, 0);

    return {
      shopName: order.business.nom,
      shopCity: order.business.ville,
      numero: order.numero,
      createdAt: order.createdAt,
      clientFirstName: order.customer?.nom?.trim().split(/\s+/)[0] || null,
      items: order.items.map((it) => ({ libelle: it.libelle, qte: it.qte, totalLigne: it.totalLigne })),
      sousTotal: order.sousTotal,
      remiseMontant: order.remiseMontant,
      total: order.total,
      paye,
      cancelled: order.statut === 'ANNULEE',
    };
  });
}
