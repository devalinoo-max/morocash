/**
 * Numéro WhatsApp du support MoroCash, avec indicatif, chiffres seuls.
 * VITE_SUPPORT_WHATSAPP le remplace au build si elle est renseignée.
 */
export const SUPPORT_WHATSAPP =
  String(import.meta.env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '') || '2250566093875';

/** Conversation WhatsApp avec le support, message pré-rempli facultatif. */
export function supportWhatsappUrl(text?: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
