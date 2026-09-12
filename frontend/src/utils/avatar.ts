/**
 * Vignette à initiales.
 *
 * La couleur est dérivée du nom : elle ne bouge jamais pour un client donné,
 * et deux noms voisins tombent sur des teintes différentes — c'est ce qui
 * permet de reconnaître une ligne d'un coup d'œil, sans la lire.
 */
const AVATAR_COLORS = [
  '#4F46E5',
  '#0891B2',
  '#059669',
  '#D97706',
  '#DB2777',
  '#7C3AED',
  '#0284C7',
  '#CA8A04',
  '#DC2626',
  '#0D9488',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Tout ce qui n'est ni lettre ni chiffre est écarté avant de découper : un nom
// saisi « A— » ou « -Yao » donnait sinon une vignette « A— », qui ne se lit pas
// comme des initiales mais comme un bug.
const NON_ALPHANUM = /[^\p{L}\p{N}]+/gu;

/**
 * Toujours deux caractères quand le nom en contient assez.
 *
 * « Mamadou Koné » → « MK » ; « Allo » → « AL » ; « A » → « A ».
 * Un seul mot rend ses deux premières lettres plutôt qu'une seule : une
 * vignette d'une lettre se confond avec toutes les autres du même rayon.
 */
export function avatarInitials(name: string | undefined | null): string {
  const mots = (name ?? '')
    .split(/\s+/)
    .map((m) => m.replace(NON_ALPHANUM, ''))
    .filter(Boolean);

  if (mots.length === 0) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();

  return (mots[0].charAt(0) + mots[1].charAt(0)).toUpperCase();
}
