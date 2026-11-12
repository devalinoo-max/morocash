import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

/**
 * Numéros de la connexion par code WhatsApp : tous les pays. Validation et
 * normalisation entièrement déléguées à libphonenumber-js, sans règle maison.
 * Forme interne : E.164 sans le « + » (indicatif + numéro, ex. 2250170345808,
 * 33612345678). Pour la Côte d'Ivoire, la bibliothèque garde les 10 chiffres
 * avec le 0 de tête, comme les comptes existants.
 */

export const DEFAULT_COUNTRY: CountryCode = 'CI';

function asCountry(code?: string | null): CountryCode | undefined {
  return code && /^[A-Za-z]{2}$/.test(code) ? (code.toUpperCase() as CountryCode) : undefined;
}

/**
 * Nettoie la saisie (espaces, points, tirets, « + », « 00 »…) et renvoie le
 * numéro E.164 sans « + », ou null s'il n'est pas valide pour son pays.
 * `country` sert quand la saisie n'a pas d'indicatif (défaut : Côte d'Ivoire).
 */
export function normalizePhone(raw: string, country?: string | null): string | null {
  const text = raw.trim().replace(/^00(?=\d)/, '+');
  const parsed = parsePhoneNumberFromString(text, asCountry(country) ?? DEFAULT_COUNTRY);
  return parsed?.isValid() ? parsed.number.slice(1) : null;
}

/**
 * Forme E.164 d'un numéro déjà ENREGISTRÉ, même invalide ou ancien : sert
 * seulement à le comparer. `country` : pays de la boutique du compte.
 */
function storedToE164(stored: string, country?: string | null): string[] {
  const digits = stored.replace(/\D/g, '');
  if (digits.length < 6) return [];
  const forms = new Set<string>();
  const local = parsePhoneNumberFromString(stored, asCountry(country) ?? DEFAULT_COUNTRY);
  if (local) forms.add(local.number.slice(1));
  // Parfois enregistré avec son indicatif, sans « + ».
  const international = parsePhoneNumberFromString(`+${digits}`);
  if (international) forms.add(international.number.slice(1));
  return [...forms];
}

/** Retire un 0 de tête national après l'indicatif (anciens formats, 0 omis ou gardé). */
function looseKey(e164: string, dialCode: string): string {
  return e164.startsWith(dialCode) ? dialCode + e164.slice(dialCode.length).replace(/^0+/, '') : e164;
}

/**
 * Le numéro enregistré désigne-t-il ce numéro normalisé ? Les deux sont
 * comparés après normalisation : « 0170345808 », « 01 70 34 58 08 » et
 * « 225 0170345808 » retrouvent le même compte.
 */
export function phonesMatch(stored: string, storedCountry: string | null | undefined, target: string): boolean {
  const targetParsed = parsePhoneNumberFromString(`+${target}`);
  const dial = targetParsed?.countryCallingCode ?? '';
  return storedToE164(stored, storedCountry).some(
    (form) => form === target || (dial !== '' && looseKey(form, dial) === looseKey(target, dial))
  );
}

/** Les 8 derniers chiffres : filtre SQL large avant la comparaison exacte en JS. */
export function phoneTail(e164: string): string {
  return e164.slice(-8);
}

/** « 2250170345808 » → « +225 01 70 XX XX 08 » : seuls les 2 derniers chiffres restent visibles. */
export function maskPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(`+${e164}`);
  if (!parsed) return `+${e164.slice(0, 2)} XX XX XX ${e164.slice(-2)}`;
  const n = parsed.nationalNumber;
  const head = n.slice(0, 2);
  const hidden = n.slice(2, -2).replace(/\d/g, 'X').replace(/(X{2})(?=X)/g, '$1 ');
  return `+${parsed.countryCallingCode} ${head}${hidden ? ' ' + hidden : ''} ${n.slice(-2)}`;
}
