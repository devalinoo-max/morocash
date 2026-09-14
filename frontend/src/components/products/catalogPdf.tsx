import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import type { CatalogRow } from '../../utils/catalogExport';

/**
 * « PDF avec images » : une ligne par produit, sa photo à gauche. Chargé à la
 * demande (import dynamique) : le moteur PDF ne pèse sur l'app que le jour où
 * quelqu'un exporte.
 */

const st = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#0F172A' },
  shop: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, color: '#64748B', marginTop: 4, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  photo: { width: 44, height: 44, borderRadius: 4, objectFit: 'cover', marginRight: 10 },
  noPhoto: { width: 44, height: 44, borderRadius: 4, marginRight: 10, backgroundColor: '#F1F5F9' },
  main: { flex: 1, paddingRight: 8 },
  name: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  category: { color: '#64748B', fontSize: 9, marginTop: 2 },
  price: { width: 90, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#4F46E5', fontSize: 11 },
  stock: { width: 80, textAlign: 'right', color: '#334155', fontSize: 9 },
  footer: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#94A3B8' },
});

/** Helvetica du PDF ne connaît pas certains caractères typographiques. */
const safe = (text: string) => text.replace(/[  ]/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

export async function renderCatalogPdf(
  rows: CatalogRow[],
  photos: (string | undefined)[],
  shopName: string
): Promise<Blob> {
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const doc = (
    <Document title={`Catalogue ${shopName}`} author="MoroCash">
      <Page size="A4" style={st.page}>
        <Text style={st.shop}>{safe(shopName || 'Mon catalogue')}</Text>
        <Text style={st.sub}>
          {safe(`Catalogue · ${rows.length} produit${rows.length > 1 ? 's' : ''} · ${date}`)}
        </Text>
        {rows.map((row, i) => (
          <View key={i} style={st.row} wrap={false}>
            {photos[i] ? <Image src={photos[i]} style={st.photo} /> : <View style={st.noPhoto} />}
            <View style={st.main}>
              <Text style={st.name}>{safe(row.name)}</Text>
              <Text style={st.category}>{safe(row.category)}</Text>
            </View>
            <Text style={st.price}>{row.price}</Text>
            <Text style={st.stock}>{safe(row.stock)}</Text>
          </View>
        ))}
        <View style={st.footer} fixed>
          <Text>Catalogue généré avec MoroCash</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return pdf(doc).toBlob();
}
