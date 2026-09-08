import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import {
  Scan,
  X,
  Check,
  Volume2,
  Plus,
  ArrowRight,
  Zap,
  ZapOff,
  SwitchCamera,
  AlertTriangle,
  ShoppingCart,
  AlertCircle,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import { playScanSuccessBeep } from '../../utils/barcodeEngine';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductScanned: (product: Product) => void;
  onOpenQuickProductWithBarcode?: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onProductScanned,
  onOpenQuickProductWithBarcode,
}) => {
  const { products, cart, cartTotal, cartItemCount, findProductByCode, showToast } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Notifications during continuous scanning
  const [scannedFeedback, setScannedFeedback] = useState<{
    product: Product;
    quantityInCart: number;
    isStockOut: boolean;
  } | null>(null);

  const [unknownCode, setUnknownCode] = useState<string | null>(null);

  // Initialize camera when opened
  useEffect(() => {
    if (isOpen) {
      setScannedFeedback(null);
      setUnknownCode(null);
      setCameraError(null);
      setShowManualInput(false);
      startCamera(facingMode);
    } else {
      stopCamera();
    }
  }, [isOpen, facingMode]);

  // Clean up on unmount
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
        setCameraError('Caméra non disponible sur cet appareil.');
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

        // Check torch support
        const track = stream.getVideoTracks()[0];
        if (track && 'getCapabilities' in track) {
          const caps = (track as any).getCapabilities();
          if (caps && caps.torch) {
            setHasTorch(true);
          }
        }

        scanVideoLoop();
      }
    } catch (err) {
      console.warn('Camera access denied or failed:', err);
      setCameraError('Impossible d’accéder à la caméra. Vérifie les autorisations.');
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
        console.error('Torch toggle failed', err);
      }
    }
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const scanVideoLoop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanVideoLoop);
      return;
    }

    const now = Date.now();
    // Native BarcodeDetector
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        const detector = new BarcodeDetectorClass({
          formats: [
            'ean_13',
            'ean_8',
            'upc_a',
            'upc_e',
            'code_128',
            'code_39',
            'qr_code',
          ],
        });
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const raw = barcodes[0].rawValue.trim();
          // Debounce same code scans (1200ms throttle for identical code)
          if (raw !== lastScannedCodeRef.current || now - lastScanTimeRef.current > 1200) {
            lastScannedCodeRef.current = raw;
            lastScanTimeRef.current = now;
            handleRecognizedCode(raw);
          }
        }
      } catch {
        // Continue
      }
    }

    animFrameRef.current = requestAnimationFrame(scanVideoLoop);
  };

  const handleRecognizedCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Look for product in local catalog
    const found = findProductByCode(trimmed);

    if (found) {
      playScanSuccessBeep();

      // Add to cart (auto-increments if already in cart)
      onProductScanned(found);

      // Check new quantity in cart
      const existingInCart = cart.find((i) => i.product.id === found.id);
      const newQty = (existingInCart?.quantity || 0) + 1;
      const isStockOut = found.stock <= 0;

      setUnknownCode(null);
      setScannedFeedback({
        product: found,
        quantityInCart: newQty,
        isStockOut,
      });

      // Banner stays for 1.5s then auto-fades
      setTimeout(() => {
        setScannedFeedback((curr) => {
          if (curr?.product.id === found.id) return null;
          return curr;
        });
      }, 1500);
    } else {
      // Unknown code detected
      setScannedFeedback(null);
      setUnknownCode(trimmed);
      showToast(`Code non reconnu (${trimmed})`, 'warning');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-slate-950 flex flex-col justify-between text-white select-none animate-in fade-in duration-150">
      {/* ========================================================================= */}
      {/* 1. TOP OVERLAY BAR */}
      {/* ========================================================================= */}
      <div className="relative z-20 px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-indigo-400">
            <Scan className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Scan continu MoroCash
            </h3>
            <p className="text-[11px] text-slate-300">
              Vise le code · Reste ouvert pour scanner à la chaîne
            </p>
          </div>
        </div>

        {/* Action icons: Torch, Switch Cam, Close */}
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isTorchOn
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-white shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              title="Activer la torche"
            >
              {isTorchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={switchCamera}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Changer de caméra"
          >
            <SwitchCamera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput)}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Saisie manuelle"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors ml-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CAMERA VIEWFINDER & RETICLE FRAME */}
      {/* ========================================================================= */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Darkened Mask Vignette around reticle */}
        <div className="absolute inset-0 pointer-events-none bg-black/45 backdrop-contrast-125" />

        {/* Clear Centered Viewfinder Window */}
        <div className="relative z-10 w-[270px] sm:w-[320px] aspect-[4/3] rounded-3xl border-2 border-indigo-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] pointer-events-none flex items-center justify-center overflow-hidden">
          {/* Laser scanning bar */}
          <div className="w-full h-0.5 bg-rose-500 shadow-[0_0_12px_#f43f5e] animate-pulse" />

          {/* Corner brackets */}
          <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-white rounded-tl-lg" />
          <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-white rounded-tr-lg" />
          <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-white rounded-bl-lg" />
          <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-white rounded-br-lg" />
        </div>

        {/* Camera error message fallback */}
        {cameraError && (
          <div className="relative z-20 max-w-xs p-4 bg-slate-900/90 rounded-2xl border border-slate-700 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
            >
              Utiliser le clavier
            </button>
          </div>
        )}

        {/* Simulation chips on desktop / demo */}
        <div className="absolute top-3 left-4 right-4 z-20 flex flex-wrap gap-1.5 justify-center pointer-events-auto">
          {products.slice(0, 4).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleRecognizedCode(p.internalCode || p.barcode || p.id)}
              className="px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 text-[11px] font-bold text-white hover:bg-indigo-600 hover:border-indigo-400 cursor-pointer transition-all shadow-md"
            >
              ⚡ {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DYNAMIC NOTIFICATION BANNERS */}
      {/* ========================================================================= */}
      <div className="relative z-20 px-4 space-y-2">
        {/* GREEN BANNER: Product Added (Visible for 1.5s) */}
        {scannedFeedback && (
          <div className="p-3.5 rounded-2xl bg-emerald-600 text-white shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-150">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black truncate">
                  {scannedFeedback.product.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-emerald-100 font-semibold">
                  <span>{formatMoney(scannedFeedback.product.salePrice)} FCFA</span>
                  <span>•</span>
                  <span className="bg-white/25 px-2 py-0.5 rounded-full font-bold">
                    {scannedFeedback.quantityInCart} dans le panier
                  </span>
                </div>
              </div>
            </div>

            {scannedFeedback.isStockOut && (
              <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg bg-amber-400 text-slate-950 shrink-0">
                ⚠️ Rupture
              </span>
            )}
          </div>
        )}

        {/* OUT OF STOCK WARNING (NEVER BLOCKS SALE) */}
        {scannedFeedback?.isStockOut && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-500/90 backdrop-blur-md text-slate-950 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Attention, il ne t'en reste plus en stock ! (Produit ajouté quand même)</span>
          </div>
        )}

        {/* ORANGE BANNER: UNKNOWN CODE */}
        {unknownCode && (
          <div className="p-3.5 rounded-2xl bg-amber-500 text-slate-950 shadow-xl space-y-2.5 animate-in slide-in-from-bottom duration-150">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-slate-950 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black">
                  Ce code n'existe pas dans ton catalogue
                </p>
                <p className="text-[11px] font-mono mt-0.5 text-slate-900 font-bold">
                  Code : {unknownCode}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                id="btn-create-scanned-product"
                onClick={() => {
                  if (onOpenQuickProductWithBarcode) {
                    onOpenQuickProductWithBarcode(unknownCode);
                    onClose();
                  }
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Créer ce produit</span>
              </button>
              <button
                type="button"
                onClick={() => setUnknownCode(null)}
                className="py-2 px-3 rounded-xl bg-white/30 hover:bg-white/40 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Ignorer
              </button>
            </div>
          </div>
        )}

        {/* MANUAL INPUT POPUP */}
        {showManualInput && (
          <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-xl space-y-2">
            <span className="text-xs font-bold text-slate-300 block">
              Saisir le code à la main :
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRecognizedCode(manualCode);
                    setManualCode('');
                  }
                }}
                placeholder="Ex: MC-A7K2X-000001 ou EAN-13"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => {
                  handleRecognizedCode(manualCode);
                  setManualCode('');
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Valider
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM FLOATING CART BAR & "TERMINÉ" BUTTON */}
      {/* ========================================================================= */}
      <div className="relative z-20 p-4 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between gap-3">
        {/* Cart summary badge */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center relative shadow-md">
            <ShoppingCart className="w-5 h-5" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-black">
                {cartItemCount}
              </span>
            )}
          </div>
          <div>
            <span className="text-xs text-slate-300 block">Panier en cours</span>
            <span className="text-base font-black text-white">
              {formatMoney(cartTotal)} FCFA
            </span>
          </div>
        </div>

        {/* Terminé Button */}
        <button
          type="button"
          id="btn-scanner-finish"
          onClick={onClose}
          className="py-3 px-6 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-black text-sm flex items-center gap-2 shadow-xl cursor-pointer transition-all active:scale-95"
        >
          <span>Terminé</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
