import type { Product } from '../types';

/**
 * Exports du catalogue, fabriqués dans le navigateur : ils marchent hors ligne
 * et ne coûtent aucun appel serveur, même pour 100 produits.
 */

export interface CatalogRow {
  name: string;
  category: string;
  price: string;
  stock: string;
  photo?: string;
}

/** Montant lisible par toutes les polices : espaces simples, pas d'espace fine. */
export function formatCatalogPrice(amount: number): string {
  return `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

export function toCatalogRows(products: Product[]): CatalogRow[] {
  return [...products]
    .sort((a, b) => (a.category || '').localeCompare(b.category || '', 'fr') || a.name.localeCompare(b.name, 'fr'))
    .map((p) => ({
      name: p.name,
      category: p.category || 'Sans catégorie',
      price: formatCatalogPrice(p.salePrice),
      stock: p.isService ? 'Prestation' : `${p.stock} ${p.unit || ''}`.trim(),
      photo: p.photo || p.photos?.[0],
    }));
}

export function exportFileName(shopName: string, extension: string): string {
  const slug =
    (shopName || 'catalogue')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'catalogue';
  return `catalogue-${slug}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Photo produit réduite en JPEG (data URL) pour le PDF : le moteur PDF ne lit
 * ni le WebP ni les grandes images rapidement, et 100 photos pleine taille
 * dépasseraient largement les 5 secondes. Une photo illisible ne bloque rien :
 * la ligne sort sans image.
 */
export async function photoToJpeg(src: string, size = 160): Promise<string | undefined> {
  try {
    const res = await fetch(src, { credentials: src.startsWith('/') ? 'include' : 'omit' });
    if (!res.ok) return undefined;
    const bitmap = await createImageBitmap(await res.blob());
    const ratio = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    return undefined;
  }
}

/** Charge les photos 8 par 8 : assez vite, sans saturer un réseau mobile. */
export async function loadCatalogPhotos(rows: CatalogRow[]): Promise<(string | undefined)[]> {
  const out: (string | undefined)[] = new Array(rows.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const idx = next++;
      const src = rows[idx].photo;
      if (src) out[idx] = src.startsWith('data:image/jpeg') || src.startsWith('data:image/png') ? src : await photoToJpeg(src);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

/**
 * « Image simple » : le catalogue en une seule image PNG, sans photos — nom,
 * catégorie, prix, stock. Pensée pour être envoyée telle quelle sur WhatsApp.
 */
export async function renderCatalogPng(rows: CatalogRow[], shopName: string): Promise<Blob> {
  const scale = 2;
  const width = 900;
  const rowH = 40;
  const headerH = 110;
  const tableHeadH = 36;
  const footerH = 44;
  const height = headerH + tableHeadH + Math.max(1, rows.length) * rowH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.scale(scale, scale);

  const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const fit = (text: string, maxWidth: number) => {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
  };

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#0F172A';
  ctx.font = font(800, 28);
  ctx.fillText(fit(shopName || 'Mon catalogue', width - 64), 32, 52);
  ctx.fillStyle = '#64748B';
  ctx.font = font(500, 15);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(`Catalogue · ${rows.length} produit${rows.length > 1 ? 's' : ''} · ${date}`, 32, 80);

  const cols = { name: 32, category: 400, price: 700, stock: 868 };
  let y = headerH;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(16, y, width - 32, tableHeadH);
  ctx.fillStyle = '#475569';
  ctx.font = font(700, 13);
  ctx.fillText('PRODUIT', cols.name, y + 23);
  ctx.fillText('CATÉGORIE', cols.category, y + 23);
  ctx.textAlign = 'right';
  ctx.fillText('PRIX', cols.price, y + 23);
  ctx.fillText('STOCK', cols.stock, y + 23);
  ctx.textAlign = 'left';
  y += tableHeadH;

  rows.forEach((row, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(16, y, width - 32, rowH);
    }
    const base = y + 25;
    ctx.fillStyle = '#0F172A';
    ctx.font = font(650, 15);
    ctx.fillText(fit(row.name, cols.category - cols.name - 16), cols.name, base);
    ctx.fillStyle = '#64748B';
    ctx.font = font(500, 14);
    ctx.fillText(fit(row.category, 170), cols.category, base);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4F46E5';
    ctx.font = font(750, 15);
    ctx.fillText(row.price, cols.price, base);
    ctx.fillStyle = '#334155';
    ctx.font = font(500, 14);
    ctx.fillText(fit(row.stock, 140), cols.stock, base);
    ctx.textAlign = 'left';
    y += rowH;
  });

  ctx.fillStyle = '#94A3B8';
  ctx.font = font(500, 12);
  ctx.fillText('Catalogue généré avec MoroCash', 32, height - 18);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image non générée'))), 'image/png')
  );
}
