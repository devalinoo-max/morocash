/**
 * Retrouver cote serveur ce qui a ete saisi hors ligne.
 *
 * Une creation de produit ou de client peut aboutir en base sans que la
 * reponse revienne (delai depasse sur Vercel pendant le reveil de la base,
 * reseau qui tombe en vol). Le produit existe alors sur le serveur, mais
 * l'appareil n'en connait pas l'identifiant : la commande qui le vend partait
 * avec l'id local et le serveur la refusait indefiniment (« un article du
 * panier n'est pas un produit enregistre sur le serveur »).
 *
 * Avant de recreer, on cherche donc un exemplaire deja present, par son nom.
 */

/** Un identifiant attribue par le serveur (cuid), jamais un id local (uuid). */
export function isServerId(id: string | undefined | null): boolean {
  return typeof id === 'string' && /^c[^\s-]{8,}$/i.test(id);
}

export function normalizeName(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Le produit du catalogue serveur qui porte ce nom (le plus recent s'il y en a plusieurs). */
export function findProductByName<T extends { id: string; nom: string; actif?: boolean; createdAt?: string }>(
  serverProducts: T[],
  nom: string
): T | undefined {
  const wanted = normalizeName(nom);
  return serverProducts
    .filter((p) => p.actif !== false && normalizeName(p.nom) === wanted)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}

/**
 * Le client serveur de ce nom. Si les deux cotes ont un numero, il doit
 * correspondre : deux « Mme Kone » aux numeros differents sont deux clientes.
 */
export function findCustomerByNameAndPhone<
  T extends { id: string; nom: string; telephone: string | null; archive?: boolean; createdAt?: string },
>(serverCustomers: T[], nom: string, telephone?: string | null): T | undefined {
  const wanted = normalizeName(nom);
  const phone = digits(telephone);
  return serverCustomers
    .filter((c) => c.archive !== true && normalizeName(c.nom) === wanted)
    .filter((c) => !phone || !digits(c.telephone) || digits(c.telephone).endsWith(phone.slice(-8)))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}
