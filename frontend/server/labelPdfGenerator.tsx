import React from 'react';
import { Document, Page, View, Text, Image, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

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
  champs: LabelField[];
  format: LabelFormat;
  tailleTexte: LabelTextSize;
  typeCode: LabelCodeType;
  traitsDecoupe: boolean;
  startIndex?: number; // 1-based index (default 1)
  customDimensions?: {
    width: number; // in mm
    height: number; // in mm
  };
}

// Convert mm to points (72 pt / 25.4 mm = 2.83464567 pt/mm)
const mmToPt = (mm: number) => mm * 2.83464567;

interface SheetConfig {
  name: string;
  pageSize: [number, number] | string;
  isCustomSize?: boolean;
  cols: number;
  rows: number;
  labelWidthPt: number;
  labelHeightPt: number;
  marginLeftPt: number;
  marginTopPt: number;
  gapXPt: number;
  gapYPt: number;
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
        labelWidthPt: mmToPt(63),
        labelHeightPt: mmToPt(34),
        marginLeftPt: mmToPt(10.5),
        marginTopPt: mmToPt(12.5),
        gapXPt: 0,
        gapYPt: 0,
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
        labelWidthPt: mmToPt(70),
        labelHeightPt: mmToPt(42),
        marginLeftPt: mmToPt(0),
        marginTopPt: mmToPt(1.5),
        gapXPt: 0,
        gapYPt: 0,
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
        labelWidthPt: mmToPt(105),
        labelHeightPt: mmToPt(48),
        marginLeftPt: mmToPt(0),
        marginTopPt: mmToPt(4.5),
        gapXPt: 0,
        gapYPt: 0,
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
        labelWidthPt: mmToPt(38),
        labelHeightPt: mmToPt(21),
        marginLeftPt: mmToPt(10),
        marginTopPt: mmToPt(12),
        gapXPt: 0,
        gapYPt: 0,
        maxLabelsPerSheet: 65,
      };
    }
    case 'thermal_58': {
      // 58 mm width x 40 mm height single label
      const w = mmToPt(58);
      const h = mmToPt(40);
      return {
        name: 'thermal_58',
        pageSize: [w, h],
        isCustomSize: true,
        cols: 1,
        rows: 1,
        labelWidthPt: w,
        labelHeightPt: h,
        marginLeftPt: 0,
        marginTopPt: 0,
        gapXPt: 0,
        gapYPt: 0,
        maxLabelsPerSheet: 1,
      };
    }
    case 'custom':
    default: {
      const wMm = options.customDimensions?.width || 63;
      const hMm = options.customDimensions?.height || 34;
      const wPt = mmToPt(wMm);
      const hPt = mmToPt(hMm);
      return {
        name: 'custom',
        pageSize: [wPt, hPt],
        isCustomSize: true,
        cols: 1,
        rows: 1,
        labelWidthPt: wPt,
        labelHeightPt: hPt,
        marginLeftPt: 0,
        marginTopPt: 0,
        gapXPt: 0,
        gapYPt: 0,
        maxLabelsPerSheet: 1,
      };
    }
  }
}

// Fetch image safely and convert to base64, with 3000ms timeout
async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;

  try {
    let fetchUrl = url;
    // Optimize Cloudinary URLs to 300px
    if (fetchUrl.includes('cloudinary.com') && fetchUrl.includes('/upload/')) {
      fetchUrl = fetchUrl.replace('/upload/', '/upload/w_300,c_limit,q_auto/');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
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
      margin: 0,
    });
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch (err) {
    console.error('Error generating QR SVG:', err);
    return '';
  }
}

// Generate 1D Barcode as SVG Data URI with bwip-js
function generateBarcodeDataUri(text: string): string {
  try {
    const cleanText = text.replace(/[^A-Za-z0-9]/g, '') || text;
    const svg = bwipjs.toSVG({
      bcid: 'code128',
      text: cleanText,
      scale: 2,
      height: 10,
      includetext: false,
    });
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  } catch (err) {
    console.error('Error generating barcode SVG:', err);
    return '';
  }
}

interface PreparedProductLabel {
  product: LabelProductData;
  qrDataUri: string;
  barcodeDataUri: string;
  photoBase64: string | null;
  codeText: string;
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

  // 1. Prepare assets for all selected products
  const productMap = new Map<string, LabelProductData>();
  products.forEach((p) => productMap.set(p.id, p));

  const preparedMap = new Map<string, PreparedProductLabel>();

  const todayStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  // Load photos & generate barcodes concurrently
  await Promise.all(
    products.map(async (p) => {
      const copyCount = copies[p.id] || 0;
      if (copyCount <= 0) return;

      const codeText = p.internalCode || p.barcode || p.id;
      const qrDataUri = await generateQrDataUri(codeText);

      let barcodeDataUri = '';
      if (p.barcode && (options.typeCode === 'BARCODE' || options.typeCode === 'BOTH')) {
        barcodeDataUri = generateBarcodeDataUri(p.barcode);
      } else if (options.typeCode === 'BARCODE' || options.typeCode === 'BOTH') {
        barcodeDataUri = generateBarcodeDataUri(codeText);
      }

      let photoBase64: string | null = null;
      if (options.champs.includes('photo') && options.format !== '65_38x21') {
        const photoUrl = p.photo || p.photos?.[0];
        if (photoUrl) {
          photoBase64 = await fetchImageAsBase64(photoUrl);
        }
      }

      preparedMap.set(p.id, {
        product: p,
        qrDataUri,
        barcodeDataUri,
        photoBase64,
        codeText,
      });
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

  // 4. Determine font sizes according to options.tailleTexte
  const isSmall = options.tailleTexte === 'PETIT';
  const isLarge = options.tailleTexte === 'GRAND';

  const priceFontSize = isSmall ? 11 : isLarge ? 16 : 13.5;
  const nameFontSize = isSmall ? 7 : isLarge ? 9.5 : 8;
  const metaFontSize = 6;

  // Single label component
  const SingleLabel = ({ item }: { item: PreparedProductLabel | null; key?: React.Key }) => {
    if (!item) {
      return (
        <View
          style={{
            width: config.labelWidthPt,
            height: config.labelHeightPt,
            borderWidth: options.traitsDecoupe ? 0.4 : 0,
            borderColor: '#e2e8f0',
            borderStyle: 'dashed',
            backgroundColor: '#ffffff',
          }}
        />
      );
    }

    const { product, qrDataUri, barcodeDataUri, photoBase64, codeText } = item;
    const hasPhoto = Boolean(photoBase64) && options.champs.includes('photo') && options.format !== '65_38x21';
    const showShop = options.champs.includes('boutique') && Boolean(settings?.shopName);
    const showPrice = options.champs.includes('prix');
    const showName = options.champs.includes('nom');
    const showCode = options.champs.includes('code');
    const showDigits = options.champs.includes('codeChiffres');
    const showDate = options.champs.includes('dateImpression');
    const showStock = options.champs.includes('stock') && product.stock !== undefined;
    const showUnit = options.champs.includes('unite') && Boolean(product.unit);
    const showCategory = options.champs.includes('categorie') && Boolean(product.category);
    const showOldPrice = options.champs.includes('ancienPrix') && Boolean(product.previousPrice && product.previousPrice > product.salePrice);

    // Code rendering dimensions
    const isTinyFormat = options.format === '65_38x21';
    const qrSizePt = isTinyFormat ? mmToPt(17) : mmToPt(20);
    const barcodeWidthPt = isTinyFormat ? mmToPt(25) : mmToPt(32);
    const barcodeHeightPt = isTinyFormat ? mmToPt(8) : mmToPt(11);

    // Border and padding
    const innerPaddingPt = mmToPt(1.8);

    return (
      <View
        style={{
          width: config.labelWidthPt,
          height: config.labelHeightPt,
          padding: innerPaddingPt,
          borderWidth: options.traitsDecoupe ? 0.35 : 0,
          borderColor: '#cbd5e1',
          borderStyle: 'dashed',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Layout 1: WITH PHOTO (3 columns: photo on left, details center, code right) */}
        {hasPhoto ? (
          <View style={{ flexDirection: 'row', width: '100%', height: '100%', alignItems: 'center' }}>
            {/* Left Photo */}
            <View
              style={{
                width: mmToPt(18),
                height: mmToPt(18),
                marginRight: mmToPt(1.5),
                borderRadius: 2,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f1f5f9',
              }}
            >
              {photoBase64 && (
                <Image
                  src={photoBase64}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              )}
            </View>

            {/* Center Content: Name & Price */}
            <View style={{ flex: 1, height: '100%', justifyContent: 'space-between', paddingRight: mmToPt(1) }}>
              <View>
                {showShop && (
                  <Text
                    style={{
                      fontSize: metaFontSize - 0.5,
                      fontFamily: 'Helvetica',
                      color: '#475569',
                      marginBottom: 1,
                    }}
                  >
                    {settings?.shopName}
                  </Text>
                )}
                {showName && (
                  <Text
                    style={{
                      fontSize: nameFontSize,
                      fontFamily: 'Helvetica',
                      fontWeight: 'bold',
                      color: '#000000',
                      lineHeight: 1.1,
                      maxLines: 2,
                    }}
                  >
                    {product.name}
                  </Text>
                )}
                {showCategory && (
                  <Text style={{ fontSize: metaFontSize - 1, color: '#64748b' }}>
                    {product.category}
                  </Text>
                )}
              </View>

              <View>
                {showOldPrice && (
                  <Text
                    style={{
                      fontSize: metaFontSize,
                      fontFamily: 'Helvetica',
                      color: '#64748b',
                      textDecoration: 'line-through',
                    }}
                  >
                    {product.previousPrice?.toLocaleString('fr-FR')} F
                  </Text>
                )}
                {showPrice && (
                  <Text
                    style={{
                      fontSize: priceFontSize,
                      fontFamily: 'Helvetica',
                      fontWeight: 'bold',
                      color: '#000000',
                      lineHeight: 1,
                    }}
                  >
                    {product.salePrice.toLocaleString('fr-FR')} F
                  </Text>
                )}
                {(showStock || showUnit) && (
                  <Text style={{ fontSize: metaFontSize - 1, color: '#64748b', marginTop: 1 }}>
                    {showStock ? `Stock: ${product.stock}` : ''}
                    {showStock && showUnit ? ' · ' : ''}
                    {showUnit ? product.unit : ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Right: Code */}
            {showCode && (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: qrSizePt,
                }}
              >
                {options.typeCode === 'BARCODE' && barcodeDataUri ? (
                  <View style={{ alignItems: 'center' }}>
                    <Image
                      src={barcodeDataUri}
                      style={{ width: barcodeWidthPt, height: barcodeHeightPt }}
                    />
                    {showDigits && (
                      <Text
                        style={{
                          fontSize: metaFontSize,
                          fontFamily: 'Courier',
                          letterSpacing: 0.5,
                          marginTop: 1,
                          color: '#000000',
                        }}
                      >
                        {product.barcode || codeText}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Image
                      src={qrDataUri}
                      style={{ width: qrSizePt, height: qrSizePt }}
                    />
                    {showDigits && (
                      <Text
                        style={{
                          fontSize: metaFontSize - 0.5,
                          fontFamily: 'Courier',
                          letterSpacing: 0.5,
                          marginTop: 1,
                          color: '#000000',
                        }}
                      >
                        {codeText}
                      </Text>
                    )}
                  </View>
                )}
                {showDate && (
                  <Text style={{ fontSize: metaFontSize - 1.5, color: '#94a3b8', marginTop: 1 }}>
                    {todayStr}
                  </Text>
                )}
              </View>
            )}
          </View>
        ) : (
          /* Layout 2: WITHOUT PHOTO (Nom en haut sur 2 lignes · prix en gros à gauche · code à droite) */
          <View style={{ width: '100%', height: '100%', justifyContent: 'space-between' }}>
            {/* Top row: Shop name & Product name */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                {showShop && (
                  <Text
                    style={{
                      fontSize: metaFontSize,
                      fontFamily: 'Helvetica',
                      color: '#475569',
                      marginBottom: 1,
                    }}
                  >
                    {settings?.shopName}
                  </Text>
                )}
                {showDate && (
                  <Text style={{ fontSize: metaFontSize - 1, color: '#94a3b8' }}>
                    {todayStr}
                  </Text>
                )}
              </View>

              {showName && (
                <Text
                  style={{
                    fontSize: nameFontSize,
                    fontFamily: 'Helvetica',
                    fontWeight: 'bold',
                    color: '#000000',
                    lineHeight: 1.15,
                    maxLines: 2,
                  }}
                >
                  {product.name}
                </Text>
              )}
            </View>

            {/* Bottom row: Price & Details on left, Code on right */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginTop: mmToPt(1),
              }}
            >
              {/* Left price block */}
              <View style={{ justifyContent: 'flex-end', flex: 1, paddingRight: mmToPt(1.5) }}>
                {showOldPrice && (
                  <Text
                    style={{
                      fontSize: metaFontSize,
                      fontFamily: 'Helvetica',
                      color: '#64748b',
                      textDecoration: 'line-through',
                      marginBottom: 1,
                    }}
                  >
                    {product.previousPrice?.toLocaleString('fr-FR')} F
                  </Text>
                )}
                {showPrice && (
                  <Text
                    style={{
                      fontSize: priceFontSize,
                      fontFamily: 'Helvetica',
                      fontWeight: 'bold',
                      color: '#000000',
                      lineHeight: 1,
                    }}
                  >
                    {product.salePrice.toLocaleString('fr-FR')} F
                  </Text>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 1 }}>
                  {showCategory && (
                    <Text style={{ fontSize: metaFontSize - 1, color: '#64748b' }}>
                      {product.category}
                    </Text>
                  )}
                  {showCategory && (showStock || showUnit) && (
                    <Text style={{ fontSize: metaFontSize - 1, color: '#94a3b8' }}>·</Text>
                  )}
                  {showStock && (
                    <Text style={{ fontSize: metaFontSize - 1, color: '#64748b' }}>
                      Stock: {product.stock}
                    </Text>
                  )}
                  {showStock && showUnit && (
                    <Text style={{ fontSize: metaFontSize - 1, color: '#94a3b8' }}>·</Text>
                  )}
                  {showUnit && (
                    <Text style={{ fontSize: metaFontSize - 1, color: '#64748b' }}>
                      {product.unit}
                    </Text>
                  )}
                </View>
              </View>

              {/* Right: Code */}
              {showCode && (
                <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                  {options.typeCode === 'BOTH' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {barcodeDataUri && (
                        <Image
                          src={barcodeDataUri}
                          style={{ width: barcodeWidthPt * 0.8, height: barcodeHeightPt }}
                        />
                      )}
                      <Image
                        src={qrDataUri}
                        style={{ width: qrSizePt * 0.9, height: qrSizePt * 0.9 }}
                      />
                    </View>
                  ) : options.typeCode === 'BARCODE' && barcodeDataUri ? (
                    <View style={{ alignItems: 'center' }}>
                      <Image
                        src={barcodeDataUri}
                        style={{ width: barcodeWidthPt, height: barcodeHeightPt }}
                      />
                      {showDigits && (
                        <Text
                          style={{
                            fontSize: metaFontSize,
                            fontFamily: 'Courier',
                            letterSpacing: 0.5,
                            marginTop: 1,
                            color: '#000000',
                          }}
                        >
                          {product.barcode || codeText}
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center' }}>
                      <Image
                        src={qrDataUri}
                        style={{ width: qrSizePt, height: qrSizePt }}
                      />
                      {showDigits && (
                        <Text
                          style={{
                            fontSize: metaFontSize - 0.5,
                            fontFamily: 'Courier',
                            letterSpacing: 0.5,
                            marginTop: 1,
                            color: '#000000',
                          }}
                        >
                          {codeText}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}
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
