// Declaration du bundle genere au build par esbuild (voir buildCommand dans
// vercel.json). Le .js voisin n'existe pas dans le depot : ce fichier donne
// son type a l'import de api/v1/receipts/pdf.ts, qui sinon ne compilerait pas.
export * from '../../server/receiptPdfGenerator';
