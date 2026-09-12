/**
 * Accord du pluriel, en français.
 *
 * Le « (s) » entre parenthèses est un raccourci de développeur : il se lit
 * « commande(s) » et se prononce mal. En français, zéro et un restent au
 * singulier ; au-delà, on accorde.
 */
export function plural(count: number, singulier: string, pluriel?: string): string {
  const auPluriel = pluriel ?? `${singulier}s`;
  return Math.abs(count) >= 2 ? auPluriel : singulier;
}

/** « 0 commande », « 1 commande », « 4 commandes ». */
export function countLabel(count: number, singulier: string, pluriel?: string): string {
  return `${count} ${plural(count, singulier, pluriel)}`;
}
