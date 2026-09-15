/**
 * Gabarit de l'étiquette « ticket » : une seule source pour le PDF serveur et
 * pour l'aperçu de la fenêtre d'impression. Toutes les mesures sont en mm ;
 * chaque rendu les convertit (points PDF ou pixels d'écran) sans rien
 * recalculer, d'où un aperçu fidèle au papier.
 */

export type LabelVariant = 'couleur' | 'claire';

// La version claire est mise en avant : proposée en premier et choisie d'office.
export const DEFAULT_LABEL_VARIANT: LabelVariant = 'claire';

export interface LabelPalette {
  paper: string;
  stroke: string;
  band: string;
  shop: string;
  brand: string;
  name: string;
  category: string;
  photoBg: string;
  photoBorder: string;
  priceBg: string;
  priceText: string;
  qrTile: string;
  caption: string;
}

export const LABEL_PALETTES: Record<LabelVariant, LabelPalette> = {
  couleur: {
    paper: '#4F46E5',
    stroke: '#4F46E5',
    band: '#4338CA',
    shop: '#FFFFFF',
    brand: '#C7D2FE',
    name: '#FFFFFF',
    category: '#C7D2FE',
    photoBg: '#FFFFFF',
    photoBorder: '#FFFFFF',
    priceBg: '#FFFFFF',
    priceText: '#4F46E5',
    qrTile: '#FFFFFF',
    caption: '#FFFFFF',
  },
  claire: {
    paper: '#FFFFFF',
    stroke: '#4F46E5',
    band: '#EEF2FF',
    shop: '#312E81',
    brand: '#6366F1',
    name: '#0F172A',
    category: '#64748B',
    photoBg: '#F8FAFC',
    photoBorder: '#C7D2FE',
    priceBg: '#4F46E5',
    priceText: '#FFFFFF',
    qrTile: '#FFFFFF',
    caption: '#4F46E5',
  },
};

export const LABEL_BRAND_TEXT = 'morocash.app';
export const LABEL_QR_CAPTION = 'Scannez pour vérifier';

/**
 * 12500 → "12 500 F". Espace ordinaire comme séparateur : toLocaleString('fr-FR')
 * insère une espace fine insécable (U+202F) absente de la police Helvetica du
 * PDF, qui l'imprimait « 12/500 ».
 */
export function formatLabelPrice(amount: number | undefined | null): string {
  const n = Math.round(Number(amount) || 0);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${digits} F`;
}

export interface TicketLayout {
  width: number;
  height: number;
  /** Étiquette plus haute que large : les blocs s'empilent au lieu de deux colonnes. */
  stacked: boolean;
  notchR: number;
  strokeW: number;
  pad: number;
  radius: number;
  header: { x: number; y: number; w: number; h: number; padX: number; shopFs: number; brandFs: number };
  photo: { x: number; y: number; size: number };
  text: { x: number; y: number; w: number; nameFs: number; nameLineH: number; categoryFs: number };
  price: { x: number; y: number; w: number; h: number; fs: number };
  qr: { x: number; y: number; size: number };
  caption: { x: number; y: number; w: number; h: number; fs: number };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Place chaque bloc pour une étiquette de `width` × `height` mm. `priceChars`
 * est la longueur du prix le plus long de la planche : la taille du prix est la
 * même pour toutes les étiquettes, et le plus long tient encore dans son cadre.
 */
export function ticketLayout(width: number, height: number, priceChars = 8): TicketLayout {
  // Échelle par rapport à l'étiquette de référence 63 × 34 mm.
  const k = clamp(Math.min(width / 63, height / 34), 0.6, 1);
  const notchR = 0.8 * k;
  const strokeW = 0.3 * k;
  const pad = 2 * notchR + 0.5 * k;
  const gap = 0.7 * k;
  const radius = 0.8 * k;
  const headerH = 4.2 * k;
  const captionH = 2.3 * k;
  const captionFs = 1.5 * k;

  const innerW = width - 2 * pad;
  const bodyY = pad + headerH + gap;
  const bodyH = Math.max(0, height - pad - bodyY);
  const stacked = width < height;

  const header = {
    x: pad,
    y: pad,
    w: innerW,
    h: headerH,
    padX: 1.2 * k,
    shopFs: headerH * 0.42,
    brandFs: headerH * 0.3,
  };

  const priceFsFor = (boxW: number, boxH: number) =>
    Math.max(0, Math.min(boxH * 0.58, (boxW - 2 * k) / (Math.max(4, priceChars) * 0.58)));

  const textGap = 1.2 * k;

  if (!stacked) {
    const colGap = 1.4 * k;
    const qrSize = Math.max(0, Math.min(bodyH - captionH, innerW * 0.42));
    const infoW = Math.max(0, innerW - qrSize - colGap);
    const priceH = bodyH * 0.38;
    const photoSize = Math.max(0, Math.min(infoW * 0.34, bodyH - priceH - gap));
    const nameFs = Math.min(photoSize * 0.3, 2.9 * k);
    const qrX = pad + infoW + colGap;
    return {
      width,
      height,
      stacked,
      notchR,
      strokeW,
      pad,
      radius,
      header,
      photo: { x: pad, y: bodyY, size: photoSize },
      text: {
        x: pad + photoSize + textGap,
        y: bodyY,
        w: Math.max(0, infoW - photoSize - textGap),
        nameFs,
        nameLineH: nameFs * 1.15,
        categoryFs: nameFs * 0.72,
      },
      price: {
        x: pad,
        y: bodyY + bodyH - priceH,
        w: infoW,
        h: priceH,
        fs: priceFsFor(infoW, priceH),
      },
      qr: { x: qrX, y: bodyY + bodyH - captionH - qrSize, size: qrSize },
      caption: { x: qrX, y: bodyY + bodyH - captionH, w: qrSize, h: captionH, fs: captionFs },
    };
  }

  const rowH = Math.min(innerW * 0.28, bodyH * 0.22);
  const priceH = rowH * 0.85;
  const qrSize = Math.max(0, Math.min(innerW * 0.85, bodyH - rowH - priceH - 2 * gap - captionH));
  const nameFs = Math.min(rowH * 0.3, 2.9 * k);
  const qrY = bodyY + rowH + gap + priceH + gap;
  return {
    width,
    height,
    stacked,
    notchR,
    strokeW,
    pad,
    radius,
    header,
    photo: { x: pad, y: bodyY, size: rowH },
    text: {
      x: pad + rowH + textGap,
      y: bodyY,
      w: Math.max(0, innerW - rowH - textGap),
      nameFs,
      nameLineH: nameFs * 1.15,
      categoryFs: nameFs * 0.72,
    },
    price: { x: pad, y: bodyY + rowH + gap, w: innerW, h: priceH, fs: priceFsFor(innerW, priceH) },
    qr: { x: pad + (innerW - qrSize) / 2, y: qrY, size: qrSize },
    caption: { x: pad, y: qrY + qrSize, w: innerW, h: captionH, fs: captionFs },
  };
}

/**
 * Contour du ticket : un rectangle dont les 4 bords sont mordus de demi-cercles,
 * comme la dentelure d'un timbre. `scale` convertit les mm vers l'unité du rendu.
 */
export function perforationPath(layout: TicketLayout, scale = 1): string {
  const { width, height, notchR: r, strokeW } = layout;
  const inset = strokeW / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;
  const pitch = r * 3.4;
  const f = (v: number) => (v * scale).toFixed(3);

  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  let d = `M${f(x0)} ${f(y0)}`;
  for (let e = 0; e < 4; e++) {
    const [px, py] = corners[e];
    const [qx, qy] = corners[(e + 1) % 4];
    const len = Math.hypot(qx - px, qy - py);
    const ux = (qx - px) / len;
    const uy = (qy - py) / len;
    // Les coins restent pleins : les encoches se répartissent entre eux.
    const usable = len - 2 * r * 1.5;
    const n = Math.max(1, Math.floor(usable / pitch));
    const step = usable / n;
    for (let i = 0; i < n; i++) {
      const t = r * 1.5 + step * (i + 0.5);
      const cx = px + ux * t;
      const cy = py + uy * t;
      // Sens de parcours horaire : l'arc anti-horaire (drapeau 0) creuse vers l'intérieur.
      d += ` L${f(cx - ux * r)} ${f(cy - uy * r)} A${f(r)} ${f(r)} 0 0 0 ${f(cx + ux * r)} ${f(cy + uy * r)}`;
    }
    d += ` L${f(qx)} ${f(qy)}`;
  }
  return `${d} Z`;
}
