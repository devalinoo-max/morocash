/**
 * Code d'affilié capté sur un lien /a/CODE, gardé jusqu'à l'inscription.
 * localStorage (et non sessionStorage comme l'intention de formule) : le
 * visiteur peut découvrir MoroCash par le lien et ne créer sa boutique que
 * quelques jours plus tard. Le code expire au bout de 30 jours ; un nouveau
 * lien remplace l'ancien.
 */
const KEY = 'morocash_affiliate_ref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9]{3,20}$/;

/** /a/KONE23 → « KONE23 », sinon null. */
export function affiliateCodeFromPath(pathname: string): string | null {
  const match = /^\/a\/([^/]+)\/?$/i.exec(pathname);
  if (!match) return null;
  const code = decodeURIComponent(match[1]);
  return CODE_PATTERN.test(code) ? code.toUpperCase() : null;
}

export function saveAffiliateCode(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // stockage indisponible : l'inscription se fera sans affilié
  }
}

export function readAffiliateCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof parsed.code !== 'string' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > TTL_MS || !CODE_PATTERN.test(parsed.code)) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearAffiliateCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à faire
  }
}
