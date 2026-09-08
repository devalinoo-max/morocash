import ExcelJS from 'exceljs';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

export async function generateExcelTable(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
  headerRow: { flexDirection: 'row', borderBottom: '1pt solid #000000', paddingVertical: 4 },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #cccccc', paddingVertical: 2 },
  cell: { flex: 1 },
  headerCell: { flex: 1, fontWeight: 700 },
});

export async function generatePdfTable(
  title: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerRow}>
          {headers.map((h, i) => (
            <Text key={i} style={styles.headerCell}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((cell, ci) => (
              <Text key={ci} style={styles.cell}>
                {String(cell)}
              </Text>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
