import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { ReceiptData } from './receiptText';

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10 },
  header: { marginBottom: 12, textAlign: 'center' },
  nom: { fontSize: 14, fontWeight: 700 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  hr: { borderBottom: '1pt solid #000000', marginVertical: 6 },
  total: { fontSize: 12, fontWeight: 700, marginTop: 4 },
});

/** Reçu PDF — une commande par page (route GET /orders/:id/receipt?format=pdf). */
export async function generateReceiptPdf({ order, business, customer }: ReceiptData): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A6" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.nom}>{business.nom}</Text>
          {business.ville ? <Text>{business.ville}</Text> : null}
        </View>

        <Text>Commande : {order.numero}</Text>
        <Text>Date : {order.createdAt.toLocaleString('fr-FR')}</Text>
        <Text>Client : {customer.nom}</Text>

        <View style={styles.hr} />

        {order.items.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text>
              {item.libelle} x{item.qte}
            </Text>
            <Text>{item.totalLigne} FCFA</Text>
          </View>
        ))}

        <View style={styles.hr} />

        <View style={styles.row}>
          <Text>Sous-total</Text>
          <Text>{order.sousTotal} FCFA</Text>
        </View>
        {order.remiseMontant > 0 && (
          <View style={styles.row}>
            <Text>Remise</Text>
            <Text>-{order.remiseMontant} FCFA</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.total}>TOTAL</Text>
          <Text style={styles.total}>{order.total} FCFA</Text>
        </View>
        <Text>Statut paiement : {order.statutPaiement}</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
