import { guardRead } from '@/server/guards';
import { AppError } from '@/server/shared/errors';
import { fail } from '@/server/shared/response';

/**
 * Lecture d'un code-barres/QR depuis une photo (spec §8).
 * Le cahier des charges liste cette route mais ne spécifie aucune bibliothèque de
 * décodage côté serveur en §1.3 (qrcode et bwip-js ne font que générer des codes,
 * pas les lire). Faute de dépendance de décodage validée avec l'utilisateur, cette
 * route renvoie explicitement CODE_UNREADABLE plutôt que de fabriquer un résultat —
 * à compléter quand une bibliothèque de lecture (ex. @zxing/library) sera choisie.
 */
export async function POST() {
  try {
    await guardRead();
    throw new AppError(
      'CODE_UNREADABLE',
      "La lecture de code depuis une photo n'est pas encore implémentée côté serveur."
    );
  } catch (error) {
    return fail(error);
  }
}
