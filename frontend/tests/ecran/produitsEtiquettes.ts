/**
 * Catalogue du banc d'essai des étiquettes, partagé par la page (navigateur)
 * et par le test (Node) : les deux savent ce que chaque étiquette doit porter.
 * Les prix reprennent ceux qui sortaient « 5/000F » ou « 111/111F ».
 */
export interface ProduitEtiquette {
  id: string;
  name: string;
  salePrice: number;
  category?: string;
  internalCode?: string;
  barcode?: string;
  avecPhoto: boolean;
}

export const BOUTIQUE_ETIQUETTES = 'Allo Beauté Treichville';

export const PRODUITS_ETIQUETTES: ProduitEtiquette[] = [
  { id: 'cmprod000001', name: 'bijoux', salePrice: 5000, category: 'Accessoires', internalCode: 'INT-100001', avecPhoto: true },
  { id: 'cmprod000002', name: 'nbbnb', salePrice: 111111, internalCode: 'INT-100002', avecPhoto: false },
  { id: 'cmprod000003', name: 'Filet de protection cheveux', salePrice: 700, category: 'Cheveux', internalCode: 'INT-100003', avecPhoto: true },
  {
    id: 'cmprod000004',
    name: 'Pagne wax hollandais double face motif traditionnel 6 yards',
    salePrice: 15000,
    category: 'Textile',
    internalCode: 'INT-100004',
    avecPhoto: true,
  },
  { id: 'cmprod000005', name: 'Perruque lace frontale', salePrice: 28000, category: 'Cheveux', barcode: '6001234567893', avecPhoto: false },
  { id: 'cmprod000006', name: 'Mèches brésiliennes 18"', salePrice: 12000, category: 'Cheveux', internalCode: 'INT-100006', avecPhoto: true },
  { id: 'cmprod000007', name: 'Groupe électrogène', salePrice: 1250000, category: 'Maison', internalCode: 'INT-100007', avecPhoto: true },
];

/** Ce que le QR de l'étiquette doit contenir (même règle que le générateur). */
export const codeAttendu = (p: ProduitEtiquette) => p.internalCode || p.barcode || p.id;
