import { ApiError, csrfHeaders } from './client';

/**
 * Export d'une période en PDF ou en Excel.
 *
 * Le chemin passe à côté de `api.*` : ces réponses sont binaires, alors que le
 * client commun lit du JSON et échouerait sur « Réponse invalide du serveur ».
 */

export type ExportType =
  | 'orders'
  | 'expense-lines'
  | 'products'
  | 'customers'
  | 'expenses'
  | 'payment-methods'
  | 'daily'
  | 'monthly';

export type ExportFormat = 'pdf' | 'excel';

export interface ExportRequest {
  type: ExportType;
  format: ExportFormat;
  from?: Date;
  to?: Date;
  /**
   * Les lignes réellement affichées, quand l'écran filtre au-delà de la
   * période (statut, vendeur, recherche). Le fichier doit contenir ce que le
   * commerçant avait sous les yeux, ni plus ni moins.
   */
  ids?: string[];
}

const EXTENSIONS: Record<ExportFormat, string> = { pdf: 'pdf', excel: 'xlsx' };

/** « commandes-2026-09-01-au-2026-10-15.pdf » */
function nomFichier(req: ExportRequest): string {
  const jour = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const periode = req.from && req.to ? `-${jour(req.from)}-au-${jour(req.to)}` : '';
  return `${req.type}${periode}.${EXTENSIONS[req.format]}`;
}

/**
 * Demande le fichier et le fait enregistrer par le navigateur.
 *
 * Une erreur du serveur revient en JSON (offre sans export Excel, permission
 * manquante) : on la relit pour afficher son message au lieu d'enregistrer un
 * fichier illisible.
 */
export async function downloadExport(req: ExportRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/v1/exports', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
      body: JSON.stringify({
        type: req.type,
        format: req.format,
        from: req.from?.toISOString(),
        to: req.to?.toISOString(),
        ids: req.ids,
      }),
    });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'Impossible de joindre le serveur.' });
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!response.ok || contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    const erreur = payload?.error;
    throw new ApiError(
      erreur ?? { code: 'SERVER_ERROR', message: "L'export n'a pas pu être préparé." }
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier(req);
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
  } finally {
    // Libéré au tour suivant : révoquer tout de suite annule le
    // téléchargement sur certains navigateurs mobiles.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
