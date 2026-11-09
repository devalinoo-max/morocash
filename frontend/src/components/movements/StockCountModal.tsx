import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useHardwareScanner } from '../../hooks/useHardwareScanner';
import { resolveKeyboardScan } from '../../utils/hardwareScanner';
import { useApp } from '../../context/AppContext';
import {
  X,
  ClipboardList,
  Search,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Equal,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  CalendarDays,
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { toDateInputValue } from '../../utils/period';
import { hasPermission } from '../../data/permissions';

interface StockCountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Comptage en cours, gardé sur cet appareil le temps de l'inventaire. */
const CLE_BROUILLON = 'morocash:inventaire-en-cours';

interface BrouillonInventaire {
  counts: { [id: string]: number };
  motifs: { [id: string]: string };
  commentaire: string;
  dateComptage: string;
}

/**
 * Le brouillon est un confort, jamais une source de vérité : navigation
 * privée, stockage plein ou refusé, et la lecture échoue. On repart alors
 * d'un comptage vide plutôt que d'empêcher d'inventorier.
 */
function lireBrouillon(): BrouillonInventaire | null {
  try {
    const brut = localStorage.getItem(CLE_BROUILLON);
    if (!brut) return null;
    const parsed = JSON.parse(brut) as Partial<BrouillonInventaire>;
    if (!parsed || typeof parsed !== 'object' || !parsed.counts) return null;
    return {
      counts: parsed.counts ?? {},
      motifs: parsed.motifs ?? {},
      commentaire: parsed.commentaire ?? '',
      dateComptage: parsed.dateComptage ?? '',
    };
  } catch {
    return null;
  }
}

function ecrireBrouillon(brouillon: BrouillonInventaire) {
  try {
    localStorage.setItem(CLE_BROUILLON, JSON.stringify(brouillon));
  } catch {
    // Rien à faire : le comptage continue en mémoire.
  }
}

function effacerBrouillon() {
  try {
    localStorage.removeItem(CLE_BROUILLON);
  } catch {
    // Idem : un brouillon résiduel sera écrasé au prochain comptage.
  }
}

export const StockCountModal: React.FC<StockCountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, recordStockCount, findProductByCode, settings, showToast } = useApp();

  // Le prix d'achat se cache sur la permission, pas sur le rôle : un vendeur
  // à qui le patron a coché « Voir les prix d'achat » doit les voir.
  const isVendeur = !hasPermission(settings, 'VOIR_PRIX_ACHAT');
  const physicalProducts = useMemo(
    () => products.filter((p) => !p.isService),
    [products]
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();
    physicalProducts.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [physicalProducts]);

  const [perimetre, setPerimetre] = useState('Tout le magasin');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [commentaire, setCommentaire] = useState('');
  // Un inventaire se fait rideau baissé, le dimanche, et se saisit le lundi :
  // la date part d'aujourd'hui et se recule jusqu'au jour du comptage.
  const [dateComptage, setDateComptage] = useState(toDateInputValue(new Date()));

  // Quantités saisies : un produit absent vaut son stock théorique. On ne les
  // pré-remplit plus avec le stock du moment où l'onglet s'est affiché — la
  // fenêtre reste montée, et après une vente elle proposait l'ancien stock,
  // donc un faux écart que la validation enregistrait.
  const [counts, setCounts] = useState<{ [id: string]: number }>({});
  // Pourquoi tel article ne tombe pas juste, écrit au moment où on le constate
  // — deux jours plus tard, plus personne ne s'en souvient.
  const [motifs, setMotifs] = useState<{ [id: string]: string }>({});
  // Vrai dès qu'un brouillon a été repris : on le dit, sinon on croirait que
  // la fenêtre a gardé des chiffres d'on ne sait où.
  const [brouillonRepris, setBrouillonRepris] = useState(false);
  // Produits déjà passés au scan pendant ce comptage. Un ref et non un état :
  // une douchette enchaîne deux lectures avant que l'écran ait suivi.
  const scannedIds = useRef<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    scannedIds.current = new Set();
    setScanInput('');
    setScanError(null);

    // Un inventaire de magasin prend des heures : fermer la fenêtre, répondre
    // à un client, revenir. Le comptage en cours est donc gardé sur l'appareil
    // et repris tel quel. Il ne voyage pas d'un téléphone à l'autre — c'est
    // une limite assumée, pas un oubli.
    const brouillon = lireBrouillon();
    if (brouillon) {
      setCounts(brouillon.counts);
      setMotifs(brouillon.motifs);
      if (brouillon.commentaire) setCommentaire(brouillon.commentaire);
      if (brouillon.dateComptage) setDateComptage(brouillon.dateComptage);
      setBrouillonRepris(Object.keys(brouillon.counts).length > 0);
    } else {
      setCounts({});
      setMotifs({});
      setBrouillonRepris(false);
    }
  }, [isOpen]);

  // Le brouillon suit la saisie. Écrire à chaque frappe coûte moins cher que
  // de perdre une heure de comptage sur une fermeture d'onglet.
  useEffect(() => {
    if (!isOpen) return;
    ecrireBrouillon({ counts, motifs, commentaire, dateComptage });
  }, [isOpen, counts, motifs, commentaire, dateComptage]);

  const countScannedCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const match = findProductByCode(code);
    if (!match) {
      // Plus d'alert() : elle bloquait la douchette jusqu'au clic sur « OK ».
      setScanError(`Aucun produit trouvé pour le code « ${code} »`);
      return;
    }
    // Chaque scan = un article physiquement compté. Le premier scan part de
    // 0 : partir du stock théorique donnait 11 pour un seul article scanné
    // sur un stock de 10.
    const alreadyScanned = scannedIds.current.has(match.id);
    scannedIds.current.add(match.id);
    setCounts((prev) => ({
      ...prev,
      [match.id]: alreadyScanned ? (prev[match.id] ?? 0) + 1 : 1,
    }));
    setScanError(null);
    setScanInput('');
  };

  // Douchette, où que soit le curseur dans la fenêtre.
  useHardwareScanner((scan) => countScannedCode(resolveKeyboardScan(products, scan).code), {
    enabled: isOpen,
  });

  if (!isOpen) return null;

  // Filter products by perimeter category and search
  const filteredProducts = physicalProducts.filter((p) => {
    if (selectedCategory !== 'ALL' && p.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.internalCode && p.internalCode.toLowerCase().includes(q)) ||
        (p.productCodes && p.productCodes.some((c) => c.code.toLowerCase().includes(q)));
      return matchName || matchCode;
    }
    return true;
  });

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    countScannedCode(scanInput);
  };

  const handleQtyChange = (productId: string, val: number) => {
    setCounts((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  };

  /** Marque l'article compté au stock annoncé : le geste le plus fréquent. */
  const marquerConforme = (productId: string, stock: number) => {
    setCounts((prev) => ({ ...prev, [productId]: Math.max(0, stock) }));
  };

  /** Rend l'article à l'état « pas encore compté ». */
  const annulerComptage = (productId: string) => {
    setCounts((prev) => {
      const suite = { ...prev };
      delete suite[productId];
      return suite;
    });
    setMotifs((prev) => {
      const suite = { ...prev };
      delete suite[productId];
      return suite;
    });
    scannedIds.current.delete(productId);
  };

  const handleMotifChange = (productId: string, motif: string) => {
    setMotifs((prev) => ({ ...prev, [productId]: motif }));
  };

  // Un article n'entre dans l'inventaire que s'il a été compté. Avant, toute
  // ligne non saisie était repliée sur son stock théorique et enregistrée
  // comme vérifiée : un comptage de 40 articles sur 300 affirmait que les 300
  // étaient conformes.
  const estCompte = (productId: string) => counts[productId] !== undefined;

  const produitsComptes = filteredProducts.filter((p) => estCompte(p.id));
  const produitsNonComptes = filteredProducts.filter((p) => !estCompte(p.id));

  // Calculate gaps — sur les seuls articles comptés.
  let totalEcarts = 0;
  let ecartUnites = 0;
  let ecartValeur = 0;
  let valeurComptee = 0;

  produitsComptes.forEach((p) => {
    const counted = counts[p.id] as number;
    const diff = counted - p.stock;
    valeurComptee += counted * (p.purchasePrice || 0);
    if (diff !== 0) {
      totalEcarts += 1;
      ecartUnites += diff;
      ecartValeur += diff * (p.purchasePrice || 0);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (produitsComptes.length === 0) {
      showToast('Compte au moins un article avant de valider', 'warning');
      return;
    }

    // Valider un inventaire partiel est légitime — on inventorie souvent un
    // rayon à la fois. Mais cela doit être un choix, pas une surprise : les
    // articles non comptés gardent leur stock, et on le dit avant.
    if (produitsNonComptes.length > 0) {
      const confirme = window.confirm(
        `${countLabel(produitsNonComptes.length, 'article non compté', 'articles non comptés')} sur ${filteredProducts.length}.\n\n` +
          `Leur stock ne sera pas touché et l'inventaire ne les couvrira pas.\n\nValider quand même ?`
      );
      if (!confirme) return;
    }

    const itemsToRecord = produitsComptes.map((p) => ({
      productId: p.id,
      countedQty: counts[p.id] as number,
      motif: motifs[p.id]?.trim() || undefined,
    }));

    const result = await recordStockCount({
      perimetre:
        selectedCategory === 'ALL' ? perimetre : `Catégorie ${selectedCategory}`,
      items: itemsToRecord,
      commentaire: commentaire.trim() || undefined,
      dateOperation: dateComptage || undefined,
    });

    if (result) {
      effacerBrouillon();
      onClose();
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-mc shadow-2xl border border-mc-line w-full max-w-3xl my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                Comptage / Inventaire
              </h2>
              <p className="text-xs text-indigo-200 font-medium">
                Inventaire physique : confrontez le stock réel au stock théorique
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Top Controls: Perimeter & Scan input */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Périmètre
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-bold text-mc-ink focus:bg-white focus:border-mc-primary focus:outline-none"
              >
                <option value="ALL">Tout le magasin ({physicalProducts.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    Rayon : {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Jour du comptage physique, distinct du jour de la saisie. */}
            <div>
              <label
                htmlFor="comptage-date"
                className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1"
              >
                Date du comptage
              </label>
              <div className="relative">
                <CalendarDays className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  id="comptage-date"
                  type="date"
                  value={dateComptage}
                  max={toDateInputValue(new Date())}
                  onChange={(e) => setDateComptage(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-bold text-mc-ink focus:bg-white focus:border-mc-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Scan rapide (Code-barres / Code maison)
              </label>
              <form onSubmit={handleScanSubmit} className="relative">
                <ScanLine className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-scanner-input
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scannez un article pour ajouter +1 au comptage..."
                  className="w-full pl-9 pr-20 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-semibold text-mc-ink focus:bg-white focus:border-mc-primary focus:outline-none"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-mc-primary text-white rounded-lg text-[11px] font-bold hover:bg-mc-primary-dark cursor-pointer"
                >
                  Scanner
                </button>
              </form>
              {scanError && (
                <p role="alert" className="mt-1 text-[11px] font-bold text-rose-600">
                  {scanError}
                </p>
              )}
            </div>
          </div>

          {/* Brouillon repris : sans ce mot, on retrouverait des chiffres
              déjà saisis sans savoir d'où ils viennent. */}
          {brouillonRepris && (
            <div className="p-3 rounded-xl bg-mc-primary-tint border border-[#DAD6FC] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-mc-primary-dark">
                Comptage en cours repris sur cet appareil.
              </span>
              <button
                type="button"
                onClick={() => {
                  setCounts({});
                  setMotifs({});
                  scannedIds.current = new Set();
                  effacerBrouillon();
                  setBrouillonRepris(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#DAD6FC] hover:border-mc-primary text-mc-primary-dark font-bold text-[11px] cursor-pointer"
              >
                Repartir de zéro
              </button>
            </div>
          )}

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer par nom de produit dans cette liste..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-medium text-mc-ink focus:bg-white focus:border-mc-primary focus:outline-none"
            />
          </div>

          {/* Products Table */}
          <div className="border border-mc-line rounded-xl overflow-hidden shadow-xs">
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-[11px] font-extrabold uppercase text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Produit</th>
                    <th className="py-2.5 px-2 text-center">Théorique</th>
                    <th className="py-2.5 px-3 text-center">Compté réel</th>
                    <th className="py-2.5 px-3 text-right">Écart</th>
                    {!isVendeur && (
                      <th className="py-2.5 px-3 text-right">Impact valeur</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {filteredProducts.map((prod) => {
                    const compte = estCompte(prod.id);
                    const counted = compte ? (counts[prod.id] as number) : prod.stock;
                    const diff = compte ? counted - prod.stock : 0;
                    const diffValue = diff * (prod.purchasePrice || 0);

                    return (
                      <tr
                        key={prod.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          !compte ? 'bg-slate-50/60' : diff !== 0 ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-mc-ink leading-tight">
                            {prod.name}
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {prod.internalCode || prod.barcode || '—'}
                          </span>
                        </td>

                        <td className="py-2.5 px-2 text-center font-bold text-mc-soft">
                          {prod.stock} {prod.unit || 'u'}
                        </td>

                        <td className="py-2.5 px-3">
                          {/* Tant qu'on n'a rien saisi, la case reste vide :
                              elle ne propose pas une réponse à la question
                              qu'elle pose. « Conforme » est le raccourci du
                              cas le plus fréquent — le rayon tombe juste. */}
                          {!compte ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => marquerConforme(prod.id, prod.stock)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold cursor-pointer"
                              >
                                Conforme
                              </button>
                              <input
                                type="number"
                                min="0"
                                value=""
                                placeholder="Qté"
                                onChange={(e) =>
                                  handleQtyChange(prod.id, Number(e.target.value))
                                }
                                className="w-16 text-center font-extrabold text-xs py-1 rounded border border-dashed border-slate-300 bg-white text-mc-ink placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-mc-primary"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleQtyChange(prod.id, counted - 1)}
                                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center cursor-pointer"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={counted}
                                onChange={(e) =>
                                  handleQtyChange(prod.id, Number(e.target.value))
                                }
                                className={`w-14 text-center font-extrabold text-xs py-1 rounded border focus:outline-none ${
                                  diff !== 0
                                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                                    : 'border-mc-line bg-white text-mc-ink'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => handleQtyChange(prod.id, counted + 1)}
                                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => annulerComptage(prod.id)}
                                title="Marquer comme non compté"
                                className="ml-0.5 text-[10px] font-bold text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          )}

                          {/* Le motif n'apparaît que là où il y a quelque chose
                              à expliquer : sur un rayon conforme, un champ de
                              plus serait du bruit. */}
                          {compte && diff !== 0 && (
                            <input
                              type="text"
                              value={motifs[prod.id] ?? ''}
                              onChange={(e) => handleMotifChange(prod.id, e.target.value)}
                              placeholder="Pourquoi cet écart ? (facultatif)"
                              className="mt-1.5 w-full px-2 py-1 rounded-lg border border-amber-200 bg-amber-50/60 text-[11px] text-mc-ink placeholder:text-amber-700/50 focus:outline-none focus:border-amber-400"
                            />
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right font-extrabold">
                          {!compte ? (
                            <span className="inline-flex items-center gap-0.5 text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                              Non compté
                            </span>
                          ) : diff === 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                              <Equal className="w-3 h-3" /> 0
                            </span>
                          ) : diff > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                              <ArrowUpRight className="w-3 h-3" /> +{diff}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[11px]">
                              <ArrowDownRight className="w-3 h-3" /> {diff}
                            </span>
                          )}
                        </td>

                        {!isVendeur && (
                          <td className="py-2.5 px-3 text-right font-bold text-xs">
                            {!compte || diff === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-700">
                                +{formatFCFA(diffValue)}
                              </span>
                            ) : (
                              <span className="text-rose-700">
                                {formatFCFA(diffValue)}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reste à compter : un inventaire se fait rayon par rayon, et il
              faut pouvoir voir d'un coup ce qui n'a pas encore été vu. */}
          {produitsNonComptes.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-mc-line flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-600">
                {countLabel(
                  produitsNonComptes.length,
                  'article pas encore compté',
                  'articles pas encore comptés'
                )}
                {' — '}leur stock ne sera pas touché.
              </span>
              <button
                type="button"
                onClick={() => {
                  // Déclarer tout le reste conforme d'un geste : sur un rayon
                  // qui tombe juste, saisir 60 fois le même chiffre ferait
                  // abandonner l'inventaire avant la fin.
                  setCounts((prev) => {
                    const suite = { ...prev };
                    produitsNonComptes.forEach((p) => {
                      suite[p.id] = Math.max(0, p.stock);
                    });
                    return suite;
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-mc-line hover:border-mc-primary hover:text-mc-primary font-bold text-[11px] cursor-pointer"
              >
                Tout le reste est conforme
              </button>
            </div>
          )}

          {/* Global inventory comment */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Commentaire de l’inventaire (facultatif)
            </label>
            <input
              type="text"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Ex: Comptage de fin de semaine, contrôle rayon lait..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs text-mc-ink focus:bg-white focus:border-mc-primary focus:outline-none"
            />
          </div>

          {/* Gaps Summary Banner */}
          <div className="p-3.5 rounded-xl bg-mc-ink text-white flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              {/* Le chiffre qui disait « vérifiés » comptait en réalité les
                  articles du périmètre, comptés ou non. Il dit maintenant
                  l'avancement réel. */}
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Comptés
                </span>
                <span className="font-extrabold text-sm text-white">
                  {produitsComptes.length}{' '}
                  <span className="text-slate-400 font-bold">/ {filteredProducts.length}</span>
                </span>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Écarts constatés
                </span>
                <span
                  className={`font-extrabold text-sm ${
                    totalEcarts > 0 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {countLabel(totalEcarts, 'produit')}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Solde unités
                </span>
                <span className="font-extrabold text-sm text-white">
                  {ecartUnites > 0 ? `+${ecartUnites}` : ecartUnites}
                </span>
              </div>
            </div>

            {!isVendeur && (
              <div className="flex items-center gap-4 text-right">
                {/* Ce qu'un inventaire sert à établir : ce que vaut, ce jour,
                    la marchandise qu'on a vue de ses yeux. */}
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">
                    Valeur comptée
                  </span>
                  <span className="font-extrabold text-sm text-white">
                    {formatFCFA(valeurComptee)}
                  </span>
                </div>
                {totalEcarts > 0 && (
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">
                      Écart valeur total
                    </span>
                    <span
                      className={`font-extrabold text-sm ${
                        ecartValeur >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {ecartValeur >= 0 ? `+${formatFCFA(ecartValeur)}` : formatFCFA(ecartValeur)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-mc-line flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-mc-line rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white rounded-xl text-xs font-extrabold shadow-md shadow-indigo-700/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Valider le comptage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
