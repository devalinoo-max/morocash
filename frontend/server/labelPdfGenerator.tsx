import React from 'react';
import { Document, Page, View, Text, Image, Svg, Path, Font, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import {
  LABEL_BRAND_TEXT,
  LABEL_PALETTES,
  LABEL_QR_CAPTION,
  DEFAULT_LABEL_VARIANT,
  formatLabelPrice,
  perforationPath,
  ticketLayout,
  type LabelVariant,
} from '../src/utils/labelTicket';

export interface LabelProductData {
  id: string;
  name: string;
  salePrice: number;
  previousPrice?: number;
  purchasePrice?: number;
  stock?: number;
  unit?: string;
  category?: string;
  barcode?: string;
  internalCode?: string;
  photo?: string;
  photos?: string[];
}

export interface LabelShopSettings {
  shopName?: string;
  showLogo?: boolean;
  shopCode?: string;
}

export type LabelField =
  | 'nom'
  | 'prix'
  | 'code'
  | 'photo'
  | 'boutique'
  | 'logo'
  | 'stock'
  | 'unite'
  | 'categorie'
  | 'codeChiffres'
  | 'dateImpression'
  | 'ancienPrix';

export type LabelFormat =
  | '24_63x34'
  | '21_70x42'
  | '12_105x48'
  | '65_38x21'
  | 'thermal_58'
  | 'custom';

export type LabelTextSize = 'PETIT' | 'NORMAL' | 'GRAND';
export type LabelCodeType = 'QR' | 'BARCODE' | 'BOTH';

export interface LabelOptions {
  /**
   * Hérités des anciens réglages. Le gabarit ticket est fixe (boutique, photo,
   * nom, catégorie, prix, QR) : ces champs ne changent plus l'étiquette.
   */
  champs?: LabelField[];
  tailleTexte?: LabelTextSize;
  typeCode?: LabelCodeType;
  traitsDecoupe?: boolean;
  format: LabelFormat;
  variante?: LabelVariant;
  startIndex?: number; // 1-based index (default 1)
  customDimensions?: {
    width: number; // in mm
    height: number; // in mm
  };
}

// Pas de césure : « Filet de protec-tion » se lisait mal sur une étiquette.
// Un mot trop long passe entier à la ligne suivante.
Font.registerHyphenationCallback((word) => [word]);

// Convert mm to points (72 pt / 25.4 mm = 2.83464567 pt/mm)
const mmToPt = (mm: number) => mm * 2.83464567;

interface SheetConfig {
  name: string;
  pageSize: [number, number] | string;
  isCustomSize?: boolean;
  cols: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginLeftPt: number;
  marginTopPt: number;
  maxLabelsPerSheet: number;
}

function getSheetConfig(options: LabelOptions): SheetConfig {
  switch (options.format) {
    case '24_63x34': {
      // 3 cols x 8 rows on A4 (210 x 297 mm)
      // 3 * 63 = 189 mm -> lateral margins (210 - 189) / 2 = 10.5 mm
      // 8 * 34 = 272 mm -> vertical margins (297 - 272) / 2 = 12.5 mm
      return {
        name: '24_63x34',
        pageSize: 'A4',
        cols: 3,
        rows: 8,
        labelWidthMm: 63,
        labelHeightMm: 34,
        marginLeftPt: mmToPt(10.5),
        marginTopPt: mmToPt(12.5),
        maxLabelsPerSheet: 24,
      };
    }
    case '21_70x42': {
      // 3 cols x 7 rows on A4
      // 3 * 70 = 210 mm -> 0 lateral margin
      // 7 * 42 = 294 mm -> top margin (297 - 294) / 2 = 1.5 mm
      return {
        name: '21_70x42',
        pageSize: 'A4',
        cols: 3,
        rows: 7,
        labelWidthMm: 70,
        labelHeightMm: 42,
        marginLeftPt: mmToPt(0),
        marginTopPt: mmToPt(1.5),
        maxLabelsPerSheet: 21,
      };
    }
    case '12_105x48': {
      // 2 cols x 6 rows on A4
      // 2 * 105 = 210 mm
      // 6 * 48 = 288 mm -> margin (297 - 288) / 2 = 4.5 mm
      return {
        name: '12_105x48',
        pageSize: 'A4',
        cols: 2,
        rows: 6,
        labelWidthMm: 105,
        labelHeightMm: 48,
        marginLeftPt: mmToPt(0),
        marginTopPt: mmToPt(4.5),
        maxLabelsPerSheet: 12,
      };
    }
    case '65_38x21': {
      // 5 cols x 13 rows on A4
      // 5 * 38 = 190 mm -> (210 - 190) / 2 = 10 mm
      // 13 * 21 = 273 mm -> (297 - 273) / 2 = 12 mm
      return {
        name: '65_38x21',
        pageSize: 'A4',
        cols: 5,
        rows: 13,
        labelWidthMm: 38,
        labelHeightMm: 21,
        marginLeftPt: mmToPt(10),
        marginTopPt: mmToPt(12),
        maxLabelsPerSheet: 65,
      };
    }
    case 'thermal_58': {
      // 58 mm width x 40 mm height single label
      return {
        name: 'thermal_58',
        pageSize: [mmToPt(58), mmToPt(40)],
        isCustomSize: true,
        cols: 1,
        rows: 1,
        labelWidthMm: 58,
        labelHeightMm: 40,
        marginLeftPt: 0,
        marginTopPt: 0,
        maxLabelsPerSheet: 1,
      };
    }
    case 'custom':
    default: {
      const wMm = options.customDimensions?.width || 63;
      const hMm = options.customDimensions?.height || 34;
      return {
        name: 'custom',
        pageSize: [mmToPt(wMm), mmToPt(hMm)],
        isCustomSize: true,
        cols: 1,
        rows: 1,
        labelWidthMm: wMm,
        labelHeightMm: hMm,
        marginLeftPt: 0,
        marginTopPt: 0,
        maxLabelsPerSheet: 1,
      };
    }
  }
}

// Le moteur PDF ne lit que le JPEG et le PNG : toute autre image ferait
// échouer la planche entière, la case photo reste alors vide.
const isPdfImage = (src: string) => /^data:image\/(jpe?g|png)[;,]/i.test(src);

// Fetch image safely and convert to base64, with 3000ms timeout
async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return isPdfImage(url) ? url : null;

  try {
    let fetchUrl = url;
    // Optimize Cloudinary URLs to 300px
    if (fetchUrl.includes('cloudinary.com') && fetchUrl.includes('/upload/')) {
      fetchUrl = fetchUrl.replace('/upload/', '/upload/w_300,c_limit,f_jpg,q_auto/');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;
    return isPdfImage(dataUri) ? dataUri : null;
  } catch {
    // Fail silently so label still prints without photo
    return null;
  }
}

// Generate QR Code as SVG Data URI
async function generateQrDataUri(text: string): Promise<string> {
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      // Zone de silence : sans marge blanche autour du symbole, un lecteur
      // n'en trouve pas les bords, surtout sur le fond indigo du ticket. La
      // norme demande 4 modules ; 2 suffisent en pratique et gardent les
      // modules assez gros sur une petite étiquette.
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch (err) {
    console.error('Error generating QR SVG:', err);
    return '';
  }
}

interface PreparedProductLabel {
  product: LabelProductData;
  qrDataUri: string;
  photoBase64: string | null;
}

export async function generateLabelsPdfBuffer({
  products,
  copies,
  options,
  settings,
}: {
  products: LabelProductData[];
  copies: Record<string, number>;
  options: LabelOptions;
  settings?: LabelShopSettings;
}): Promise<Buffer> {
  const config = getSheetConfig(options);
  const startIndex = Math.max(1, options.startIndex || 1);
  const palette = LABEL_PALETTES[options.variante === 'couleur' ? 'couleur' : DEFAULT_LABEL_VARIANT];
  const shopName = settings?.shopName?.trim() || 'Ma boutique';

  // 1. Prepare assets for all selected products
  const preparedMap = new Map<string, PreparedProductLabel>();

  await Promise.all(
    products.map(async (p) => {
      const copyCount = copies[p.id] || 0;
      if (copyCount <= 0) return;

      const codeText = p.internalCode || p.barcode || p.id;
      const qrDataUri = await generateQrDataUri(codeText);
      const photoUrl = p.photo || p.photos?.[0];
      const photoBase64 = photoUrl ? await fetchImageAsBase64(photoUrl) : null;

      preparedMap.set(p.id, { product: p, qrDataUri, photoBase64 });
    })
  );

  // 2. Build flat list of items
  const labelList: (PreparedProductLabel | null)[] = [];

  // If startIndex > 1 and on multi-label page, prepend empty slots
  if (startIndex > 1 && config.maxLabelsPerSheet > 1) {
    for (let i = 1; i < startIndex; i++) {
      labelList.push(null); // empty skipped slot
    }
  }

  products.forEach((p) => {
    const count = copies[p.id] || 0;
    const prep = preparedMap.get(p.id);
    if (prep && count > 0) {
      for (let i = 0; i < count; i++) {
        labelList.push(prep);
      }
    }
  });

  // 3. Chunk into sheets/pages
  const sheets: (PreparedProductLabel | null)[][] = [];
  const chunkSize = config.maxLabelsPerSheet;
  for (let i = 0; i < labelList.length; i += chunkSize) {
    sheets.push(labelList.slice(i, i + chunkSize));
  }

  // 4. Un seul gabarit pour toute la planche : le prix le plus long fixe la
  // taille du prix de toutes les étiquettes.
  const priceChars = Math.max(
    0,
    ...Array.from(preparedMap.values()).map((p) => formatLabelPrice(p.product.salePrice).length)
  );
  const L = ticketLayout(config.labelWidthMm, config.labelHeightMm, priceChars);
  const pt = mmToPt;
  const labelW = pt(L.width);
  const labelH = pt(L.height);
  const outline = perforationPath(L, pt(1));
  const box = (b: { x: number; y: number; w?: number; h?: number }) => ({
    position: 'absolute' as const,
    left: pt(b.x),
    top: pt(b.y),
    ...(b.w !== undefined ? { width: pt(b.w) } : {}),
    ...(b.h !== undefined ? { height: pt(b.h) } : {}),
  });

  // Single label component
  const SingleLabel = ({ item }: { item: PreparedProductLabel | null; key?: React.Key }) => {
    if (!item) {
      return <View style={{ width: labelW, height: labelH, backgroundColor: '#ffffff' }} />;
    }

    const { product, qrDataUri, photoBase64 } = item;

    return (
      <View style={{ width: labelW, height: labelH, position: 'relative', backgroundColor: '#ffffff' }}>
        {/* Ticket dentelé */}
        <Svg
          width={labelW}
          height={labelH}
          viewBox={`0 0 ${labelW} ${labelH}`}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <Path d={outline} fill={palette.paper} stroke={palette.stroke} strokeWidth={pt(L.strokeW)} />
        </Svg>

        {/* Bandeau de marque */}
        <View
          style={{
            ...box(L.header),
            backgroundColor: palette.band,
            borderRadius: pt(L.radius),
            paddingHorizontal: pt(L.header.padX),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: pt(L.header.shopFs),
              fontFamily: 'Helvetica-Bold',
              color: palette.shop,
              maxLines: 1,
              textOverflow: 'ellipsis',
              paddingRight: pt(L.header.padX),
            }}
          >
            {shopName}
          </Text>
          <Text style={{ fontSize: pt(L.header.brandFs), fontFamily: 'Helvetica', color: palette.brand }}>
            {LABEL_BRAND_TEXT}
          </Text>
        </View>

        {/* Case photo : même place et même taille, qu'il y ait une photo ou non */}
        <View
          style={{
            ...box({ x: L.photo.x, y: L.photo.y, w: L.photo.size, h: L.photo.size }),
            backgroundColor: palette.photoBg,
            borderWidth: pt(L.strokeW),
            borderColor: palette.photoBorder,
            borderRadius: pt(L.radius),
            overflow: 'hidden',
          }}
        >
          {photoBase64 && (
            <Image src={photoBase64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </View>

        {/* Nom (2 lignes réservées) et catégorie */}
        <View style={box({ x: L.text.x, y: L.text.y, w: L.text.w })}>
          <View style={{ height: pt(L.text.nameLineH * 2) }}>
            <Text
              style={{
                fontSize: pt(L.text.nameFs),
                fontFamily: 'Helvetica-Bold',
                color: palette.name,
                lineHeight: 1.15,
                maxLines: 2,
                textOverflow: 'ellipsis',
              }}
            >
              {product.name}
            </Text>
          </View>
          <Text
            style={{
              fontSize: pt(L.text.categoryFs),
              fontFamily: 'Helvetica',
              color: palette.category,
              maxLines: 1,
              textOverflow: 'ellipsis',
              marginTop: pt(L.text.nameFs * 0.15),
            }}
          >
            {product.category || ' '}
          </Text>
        </View>

        {/* Encadré prix */}
        <View
          style={{
            ...box(L.price),
            backgroundColor: palette.priceBg,
            borderRadius: pt(L.radius),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: pt(L.price.fs),
              fontFamily: 'Helvetica-Bold',
              color: palette.priceText,
              lineHeight: 1,
              maxLines: 1,
            }}
          >
            {formatLabelPrice(product.salePrice)}
          </Text>
        </View>

        {/* QR en bas */}
        <View
          style={{
            ...box({ x: L.qr.x, y: L.qr.y, w: L.qr.size, h: L.qr.size }),
            backgroundColor: palette.qrTile,
            borderRadius: pt(L.radius * 0.6),
          }}
        >
          {qrDataUri ? <Image src={qrDataUri} style={{ width: '100%', height: '100%' }} /> : null}
        </View>
        <View style={{ ...box(L.caption), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: pt(L.caption.fs), fontFamily: 'Helvetica-Bold', color: palette.caption }}>
            {LABEL_QR_CAPTION}
          </Text>
        </View>
      </View>
    );
  };

  // 5. Construct Document
  const doc = (
    <Document title="Planche Étiquettes MoroCash" author="MoroCash">
      {sheets.map((sheetItems, pageIdx) => {
        if (config.cols === 1 && config.rows === 1) {
          // Single ticket per page (e.g. thermal or custom 1-up)
          const singleItem = sheetItems[0] || null;
          return (
            <Page
              key={pageIdx}
              size={config.pageSize as any}
              style={{
                padding: 0,
                margin: 0,
                backgroundColor: '#ffffff',
              }}
            >
              <SingleLabel item={singleItem} />
            </Page>
          );
        }

        // Grid of labels on page
        return (
          <Page
            key={pageIdx}
            size="A4"
            style={{
              paddingTop: config.marginTopPt,
              paddingLeft: config.marginLeftPt,
              backgroundColor: '#ffffff',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignContent: 'flex-start',
            }}
          >
            {sheetItems.map((item, itemIdx) => (
              <SingleLabel key={itemIdx} item={item} />
            ))}
          </Page>
        );
      })}
    </Document>
  );

  return await renderToBuffer(doc);
}
