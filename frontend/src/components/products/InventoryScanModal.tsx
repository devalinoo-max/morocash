import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import {
  ClipboardCheck,
  X,
  Scan,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Zap,
  ZapOff,
  SwitchCamera,
  Keyboard,
} from 'lucide-react';
import { playScanSuccessBeep } from '../../utils/barcodeEngine';

interface InventoryScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CountedItem {
  product: Product;
  countedQty: number;
  theoreticalQty: number;
}

export const InventoryScanModal: React.FC<InventoryScanModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, updateProduct, findProductByCode, showToast } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);

  // Scanned / counted inventory records
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);

  // Manual input
  const [manualCode, setManualCode] = useState('');

  // Initialize
  useEffect(() => {
    if (isOpen) {
      setCounts({});
      setLastScannedProduct(null);
      setCameraError(null);
      startCamera(facingMode);
    } else {
      stopCamera();
    }
  }, [isOpen, facingMode]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsTorchOn(false);
  };

  const startCamera = async (mode: 'environment' | 'user') => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Caméra non disponible.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const track = stream.getVideoTracks()[0];
        if (track && 'getCapabilities' in track) {
          const caps = (track as any).getCapabilities();
          if (caps && caps.torch) {
            setHasTorch(true);
          }
        }

        scanLoop();
      }
    } catch {
      setCameraError('Impossible d’accéder à la caméra.');
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const next = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: next }],
        });
        setIsTorchOn(next);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const scanLoop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const now = Date.now();
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const raw = barcodes[0].rawValue.trim();
          if (raw !== lastScannedCodeRef.current || now - lastScanTimeRef.current > 1200) {
            lastScannedCodeRef.current = raw;
            lastScanTimeRef.current = now;
            handleRegisterScan(raw);
          }
        }
      } catch {
        // Continue loop
      }
    }

    animFrameRef.current = requestAnimationFrame(scanLoop);
  };

  const handleRegisterScan = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;

    const prod = findProductByCode(clean);
    if (prod) {
      playScanSuccessBeep();
      setLastScannedProduct(prod);
      setCounts((prev) => ({
        ...prev,
        [prod.id]: (prev[prod.id] || 0) + 1,
      }));
    } else {
      showToast(`Code non reconnu (${clean})`, 'warning');
    }
  };

  const updateItemCount = (productId: string, delta: number) => {
    setCounts((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  // List of counted items with comparison
  const countedItems: CountedItem[] = Object.keys(counts).map((productId) => {
    const p = products.find((prod) => prod.id === productId)!;
    return {
      product: p,
      countedQty: counts[productId],
      theoreticalQty: p.stock,
    };
  });

  // Apply all adjustments in 1 click
  const handleApplyAllAdjustments = async () => {
    const toUpdate = countedItems.filter((item) => item.countedQty !== item.theoreticalQty);
    await Promise.all(toUpdate.map((item) => updateProduct(item.product.id, { stock: item.countedQty })));

    showToast(`Inventaire validé : stock de ${toUpdate.length} article(s) mis à jour !`, 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Inventaire physique en continu</h3>
              <p className="text-xs text-slate-300">
                Passe dans les rayons et scanne · L'écart se calcule en direct
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video stream viewport (Collapsible / Compact) */}
        <div className="bg-slate-950 text-white relative">
          <div className="relative h-44 sm:h-52 w-full overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder */}
            <div className="absolute inset-x-8 inset-y-4 rounded-2xl border-2 border-indigo-400/80 pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />
            </div>

            {/* Quick overlay controls */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isTorchOn ? 'bg-amber-400 text-black' : 'bg-black/40 text-white'
                  }`}
                >
                  {isTorchOn ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                className="w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Simulation chips for desktop */}
            <div className="absolute bottom-2 inset-x-2 flex gap-1 overflow-x-auto no-scrollbar">
              {products.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleRegisterScan(p.internalCode || p.barcode || p.id)}
                  className="px-2 py-1 bg-black/70 border border-white/20 rounded-lg text-[10px] font-bold text-white whitespace-nowrap hover:bg-indigo-600"
                >
                  +1 {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Counted Items List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Articles scannés ({countedItems.length})
            </span>
            {countedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setCounts({})}
                className="text-xs text-slate-500 hover:text-rose-600 font-semibold"
              >
                Réinitialiser les scans
              </button>
            )}
          </div>

          {countedItems.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <Scan className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">Aucun scan pour le moment</p>
              <p className="text-[11px]">
                Vise un code-barres ou un code maison avec la caméra ci-dessus.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {countedItems.map((item) => {
                const diff = item.countedQty - item.theoreticalQty;
                const isMatch = diff === 0;
                return (
                  <div
                    key={item.product.id}
                    className={`p-3 rounded-2xl border transition-all ${
                      isMatch
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-amber-50/40 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {item.product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                          <span className="text-slate-500">
                            Théorique : <strong>{item.theoreticalQty}</strong>
                          </span>
                          <span>•</span>
                          <span className="text-indigo-700 font-bold">
                            Compté : <strong>{item.countedQty}</strong>
                          </span>
                          <span>•</span>
                          <span
                            className={`font-black px-1.5 py-0.2 rounded-md ${
                              isMatch
                                ? 'bg-emerald-100 text-emerald-800'
                                : diff > 0
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            Écart : {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-1.5 shrink-0 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                        <button
                          type="button"
                          onClick={() => updateItemCount(item.product.id, -1)}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs text-slate-900">
                          {item.countedQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateItemCount(item.product.id, 1)}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Manual Code Input */}
          <div className="pt-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRegisterScan(manualCode);
                    setManualCode('');
                  }
                }}
                placeholder="Ou taper un code (MC-... ou EAN)"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold"
              />
              <button
                type="button"
                onClick={() => {
                  handleRegisterScan(manualCode);
                  setManualCode('');
                }}
                className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100"
          >
            Fermer
          </button>

          <button
            id="btn-confirm-inventory-adjust"
            type="button"
            disabled={countedItems.length === 0}
            onClick={handleApplyAllAdjustments}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Ajuster le stock en 1 clic</span>
          </button>
        </div>
      </div>
    </div>
  );
};
