import React from 'react';
import {
  LABEL_BRAND_TEXT,
  LABEL_PALETTES,
  LABEL_QR_CAPTION,
  formatLabelPrice,
  perforationPath,
  ticketLayout,
  type LabelVariant,
} from '../../utils/labelTicket';

interface LabelTicketPreviewProps {
  widthMm: number;
  heightMm: number;
  /** Largeur affichée en pixels ; la hauteur suit les proportions du papier. */
  widthPx: number;
  variant: LabelVariant;
  shopName: string;
  name: string;
  category?: string;
  price: number;
  photoUrl?: string;
  qrDataUrl?: string;
  /** Longueur du prix le plus long de la planche (voir ticketLayout). */
  priceChars?: number;
}

/**
 * Aperçu à l'écran de l'étiquette ticket : mêmes mesures que le PDF serveur
 * (src/utils/labelTicket.ts), simplement converties en pixels.
 */
export const LabelTicketPreview: React.FC<LabelTicketPreviewProps> = ({
  widthMm,
  heightMm,
  widthPx,
  variant,
  shopName,
  name,
  category,
  price,
  photoUrl,
  qrDataUrl,
  priceChars,
}) => {
  const L = ticketLayout(widthMm, heightMm, priceChars ?? formatLabelPrice(price).length);
  const s = widthPx / L.width;
  const c = LABEL_PALETTES[variant];
  const px = (mm: number) => mm * s;
  const box = (x: number, y: number, w?: number, h?: number): React.CSSProperties => ({
    position: 'absolute',
    left: px(x),
    top: px(y),
    width: w !== undefined ? px(w) : undefined,
    height: h !== undefined ? px(h) : undefined,
  });

  return (
    <div
      className="relative shrink-0"
      style={{ width: widthPx, height: px(L.height), fontFamily: 'Helvetica, Arial, sans-serif' }}
    >
      <svg width={widthPx} height={px(L.height)} className="absolute inset-0 drop-shadow-sm" aria-hidden="true">
        <path d={perforationPath(L, s)} fill={c.paper} stroke={c.stroke} strokeWidth={px(L.strokeW)} />
      </svg>

      <div
        style={{
          ...box(L.header.x, L.header.y, L.header.w, L.header.h),
          background: c.band,
          borderRadius: px(L.radius),
          padding: `0 ${px(L.header.padX)}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: px(L.header.padX),
        }}
      >
        <span
          className="truncate"
          style={{ fontSize: px(L.header.shopFs), fontWeight: 700, color: c.shop, lineHeight: 1 }}
        >
          {shopName}
        </span>
        <span className="shrink-0" style={{ fontSize: px(L.header.brandFs), color: c.brand, lineHeight: 1 }}>
          {LABEL_BRAND_TEXT}
        </span>
      </div>

      <div
        className="overflow-hidden flex items-center justify-center"
        style={{
          ...box(L.photo.x, L.photo.y, L.photo.size, L.photo.size),
          background: c.photoBg,
          border: `${Math.max(0.5, px(L.strokeW))}px solid ${c.photoBorder}`,
          borderRadius: px(L.radius),
        }}
      >
        {/* Sans photo, la case reste vide, comme sur le papier. */}
        {photoUrl && <img src={photoUrl} alt={name} className="w-full h-full object-cover" />}
      </div>

      <div style={box(L.text.x, L.text.y, L.text.w)}>
        <div style={{ height: px(L.text.nameLineH * 2) }}>
          <p
            className="line-clamp-2 break-words"
            style={{ fontSize: px(L.text.nameFs), fontWeight: 700, color: c.name, lineHeight: 1.15 }}
          >
            {name}
          </p>
        </div>
        <p
          className="truncate"
          style={{
            fontSize: px(L.text.categoryFs),
            color: c.category,
            lineHeight: 1.15,
            marginTop: px(L.text.nameFs * 0.15),
          }}
        >
          {category || ' '}
        </p>
      </div>

      <div
        className="flex items-center justify-center"
        style={{
          ...box(L.price.x, L.price.y, L.price.w, L.price.h),
          background: c.priceBg,
          borderRadius: px(L.radius),
        }}
      >
        <span
          className="whitespace-nowrap"
          style={{ fontSize: px(L.price.fs), fontWeight: 700, color: c.priceText, lineHeight: 1 }}
        >
          {formatLabelPrice(price)}
        </span>
      </div>

      <div
        className="overflow-hidden"
        style={{
          ...box(L.qr.x, L.qr.y, L.qr.size, L.qr.size),
          background: c.qrTile,
          borderRadius: px(L.radius * 0.6),
        }}
      >
        {qrDataUrl && <img src={qrDataUrl} alt="QR code" className="w-full h-full" />}
      </div>
      <div
        className="flex items-center justify-center"
        style={box(L.caption.x, L.caption.y, L.caption.w, L.caption.h)}
      >
        <span
          className="whitespace-nowrap"
          style={{ fontSize: px(L.caption.fs), fontWeight: 700, color: c.caption, lineHeight: 1 }}
        >
          {LABEL_QR_CAPTION}
        </span>
      </div>
    </div>
  );
};
