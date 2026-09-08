import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { CodeFormat } from '@prisma/client';
import { generateBarcodePngBuffer } from '@/server/integrations/qr';

const styles = StyleSheet.create({
  page: { padding: 10, flexDirection: 'row', flexWrap: 'wrap' },
  label: {
    width: 180,
    height: 110,
    border: '1pt solid #000000',
    margin: 4,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nom: { fontSize: 10, marginBottom: 2, textAlign: 'center' },
  prix: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  code: { width: 140, height: 45 },
});

export interface LabelItem {
  nom: string;
  prixVente: number;
  code: string;
  format: CodeFormat;
}

async function toDataUrl(item: LabelItem): Promise<string> {
  const buffer = await generateBarcodePngBuffer(item.format, item.code);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/** Étiquette pour un seul produit — PDF (route GET /products/:id/label). */
export async function generateSingleLabelPdf(item: LabelItem): Promise<Buffer> {
  return generateLabelsSheetPdf([item]);
}

/** Planche PDF multi-produits (route POST /products/labels). */
export async function generateLabelsSheetPdf(items: LabelItem[]): Promise<Buffer> {
  const images = await Promise.all(items.map(toDataUrl));

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {items.map((item, idx) => (
          <View style={styles.label} key={idx}>
            <Text style={styles.nom}>{item.nom}</Text>
            <Text style={styles.prix}>{item.prixVente} FCFA</Text>
            <Image src={images[idx]} style={styles.code} />
          </View>
        ))}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
