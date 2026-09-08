import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, BarcodeFormat, CodeOrigin } from '../../types';
import {
  X,
  Camera,
  Upload,
  Keyboard,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Zap,
  ZapOff,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  decodeBarcodeFromPhotoBlob,
  validateBarcodeChecksum,
  playScanSuccessBeep,
} from '../../utils/barcodeEngine';

interface AddCodeModalProps {
  isOpen: boolean;
  product: Product;
  onClose: () => void;
  onCodeAdded?: (code: string) => void;
}

type AddCodeTab = 'CAMERA' | 'PHOTO' | 'MANUAL';

export const AddCodeModal: React.FC<AddCodeModalProps> = ({
  isOpen,
  product,
  onClose,
  onCodeAdded,
}) => {
  const { addProductCode, transferProductCode, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<AddCodeTab>('CAMERA');

  // Camera scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Photo analysis state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoDetectionResult, setPhotoDetectionResult] = useState<{
    code: string;
    format: BarcodeFormat;
  } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Manual input state
  const [manualCode, setManualCode] = useState('');
  const [checksumWarningDismissed, setChecksumWarningDismissed] = useState(false);

  // Conflict state (Uniqueness rule: code already used in this shop)
  const [conflict, setConflict] = useState<{
    code: string;
    format: BarcodeFormat;
    origin: CodeOrigin;
    conflictingProduct: Product;
  } | null>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab('CAMERA');
      setCameraError(null);
      setPhotoDetectionResult(null);
      setPhotoError(null);
      setManualCode('');
      setChecksumWarningDismissed(false);
      setConflict(null);
    } else {
      stopCamera();
    }
  }, [isOpen]);

  // Handle Tab Switch
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'CAMERA') {
        startCamera();
      } else {
        stopCamera();
      }
    }
  }, [activeTab, isOpen]);

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
    setIsCameraActive(false);
    setIsTorchOn(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Caméra non supportée sur ce navigateur.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        if (track && 'getCapabilities' in track) {
          const caps = (track as any).getCapabilities();
          if (caps && caps.torch) {
            setHasTorch(true);
          }
        }

        // Start scanning frames
        scanFrameLoop();
      }
    } catch (err: any) {
      console.warn('Camera error:', err);
      setCameraError(
        'Impossible d’accéder à la caméra. Vérifie les permissions ou utilise l’import de photo.'
      );
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

  const scanFrameLoop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanFrameLoop);
      return;
    }

    // Try native BarcodeDetector if present
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
            'itf',
            'qr_code',
            'data_matrix',
          ],
        });
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const raw = barcodes[0].rawValue.trim();
          handleRecognizedCode(raw, 'SCANNE');
          return;
        }
      } catch {
        // Continue loop
      }
    }

    animFrameRef.current = requestAnimationFrame(scanFrameLoop);
  };

  const handleRecognizedCode = (code: string, origin: CodeOrigin) => {
    const clean = code.trim();
    if (!clean) return;

    playScanSuccessBeep();
    stopCamera();

    const validation = validateBarcodeChecksum(clean);
    const res = addProductCode(product.id, clean, validation.format, origin, false);

    if (!res.success) {
      if (res.conflictProduct) {
        setConflict({
          code: clean,
          format: validation.format,
          origin,
          conflictingProduct: res.conflictProduct,
        });
      } else {
        showToast(res.message || 'Impossible d’ajouter ce code', 'error');
      }
    } else {
      if (onCodeAdded) onCodeAdded(clean);
      onClose();
    }
  };

  // Handle Photo selection
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingPhoto(true);
    setPhotoError(null);
    setPhotoDetectionResult(null);

    try {
      const result = await decodeBarcodeFromPhotoBlob(file);
      if (result && result.code) {
        playScanSuccessBeep();
        setPhotoDetectionResult(result);
      } else {
        setPhotoError(
          'Je n’arrive pas à lire ce code. Reprends la photo bien en face, sans reflet, avec le code bien net et qui remplit l’écran.'
        );
      }
    } catch (err) {
      setPhotoError(
        'Une erreur est survenue lors de l’analyse de la photo. Essaie avec une photo plus nette ou saisis le code à la main.'
      );
    } finally {
      setIsAnalyzingPhoto(false);
      // Reset input value so same photo can be reselected if needed
      e.target.value = '';
    }
  };

  const confirmPhotoAssociation = () => {
    if (!photoDetectionResult) return;
    const { code, format } = photoDetectionResult;
    const res = addProductCode(product.id, code, format, 'PHOTO', false);

    if (!res.success) {
      if (res.conflictProduct) {
        setConflict({
          code,
          format,
          origin: 'PHOTO',
          conflictingProduct: res.conflictProduct,
        });
      } else {
        showToast(res.message || 'Impossible d’ajouter ce code', 'error');
      }
    } else {
      if (onCodeAdded) onCodeAdded(code);
      onClose();
    }
  };

  // Manual code submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) {
      showToast('Saisis au moins un code', 'warning');
      return;
    }

    const validation = validateBarcodeChecksum(clean);
    if (!validation.isValidChecksum && !checksumWarningDismissed) {
      // Show warning without blocking
      setChecksumWarningDismissed(true);
      return;
    }

    const res = addProductCode(product.id, clean, validation.format, 'MANUEL', false);
    if (!res.success) {
      if (res.conflictProduct) {
        setConflict({
          code: clean,
          format: validation.format,
          origin: 'MANUEL',
          conflictingProduct: res.conflictProduct,
        });
      } else {
        showToast(res.message || 'Erreur lors de l’enregistrement du code', 'error');
      }
    } else {
      if (onCodeAdded) onCodeAdded(clean);
      onClose();
    }
  };

  // Conflict Resolution: Transfer code from other product
  const handleConfirmTransfer = () => {
    if (!conflict) return;
    transferProductCode(conflict.conflictingProduct.id, product.id, conflict.code);
    if (onCodeAdded) onCodeAdded(conflict.code);
    setConflict(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Ajouter un code scannable
            </h3>
            <p className="text-xs text-slate-500 line-clamp-1">
              Pour : {product.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Tabs in requested order: 1. Caméra, 2. Importer une photo, 3. Taper à la main */}
        <div className="grid grid-cols-3 p-1.5 mx-4 mt-3 bg-slate-100 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('CAMERA')}
            className={`py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'CAMERA'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">1. Caméra</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PHOTO')}
            className={`py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'PHOTO'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">2. Photo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MANUAL')}
            className={`py-2 px-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'MANUAL'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">3. Clavier</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Uniqueness Conflict Modal Alert */}
          {conflict && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3 animate-in zoom-in-95">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold text-amber-950">
                    Ce code est déjà utilisé dans ta boutique !
                  </p>
                  <p className="mt-1">
                    Le code <strong className="font-mono bg-amber-100 px-1 py-0.5 rounded">{conflict.code}</strong> est
                    déjà attribué à <strong>{conflict.conflictingProduct.name}</strong>.
                  </p>
                  <p className="mt-1 text-amber-800">
                    Tu veux l'y enlever et le mettre sur <strong>{product.name}</strong> ?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmTransfer}
                  className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  Oui, transférer le code
                </button>
                <button
                  type="button"
                  onClick={() => setConflict(null)}
                  className="py-2 px-3 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-100/50 cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: CAMERA SCANNER */}
          {activeTab === 'CAMERA' && !conflict && (
            <div className="space-y-3">
              <div className="relative aspect-square max-w-[280px] mx-auto rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Reticle / Viewfinder Frame */}
                <div className="absolute inset-8 rounded-2xl border-2 border-dashed border-indigo-400/80 pointer-events-none flex items-center justify-center">
                  <div className="w-full h-0.5 bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
                </div>

                {/* Torch button */}
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md ${
                      isTorchOn
                        ? 'bg-amber-400 text-slate-900 ring-2 ring-white'
                        : 'bg-slate-800/80 text-white hover:bg-slate-700'
                    }`}
                    title="Allumer la lampe / torche"
                  >
                    {isTorchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-4 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="text-xs text-white leading-relaxed">
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('PHOTO')}
                      className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                    >
                      Essayer l'import photo
                    </button>
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-slate-500 font-medium">
                Pointe l’appareil vers le code-barres imprimé sur l'emballage.
              </p>
            </div>
          )}

          {/* TAB 2: PHOTO IMPORT */}
          {activeTab === 'PHOTO' && !conflict && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />

              {!photoDetectionResult && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-50 hover:bg-indigo-50/20 transition-all text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      {isAnalyzingPhoto ? 'Analyse de l’image...' : 'Prendre ou choisir une photo'}
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">
                      Formats supportés : EAN-13, EAN-8, UPC-A, Code 128, QR Code...
                    </span>
                  </div>
                  {isAnalyzingPhoto && (
                    <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold">
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Optimisation du contraste et lecture...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Photo Analysis Success Confirmation */}
              {photoDetectionResult && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3 animate-in zoom-in-95">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">
                        Code trouvé avec succès !
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-base font-black font-mono text-emerald-950 tracking-wider">
                          {photoDetectionResult.code}
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800">
                          {photoDetectionResult.format}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 mt-1">
                        C'est bien le code de ce produit ?
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={confirmPhotoAssociation}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      Oui, associer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoDetectionResult(null);
                        fileInputRef.current?.click();
                      }}
                      className="py-2.5 px-3 rounded-xl bg-white border border-emerald-300 text-emerald-900 text-xs font-semibold hover:bg-emerald-100/50 cursor-pointer"
                    >
                      Non, réessayer
                    </button>
                  </div>
                </div>
              )}

              {/* Photo Analysis Failure Message */}
              {photoError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed text-rose-900">
                      {photoError}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      Reprendre une photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('MANUAL')}
                      className="py-2 px-3 rounded-xl bg-white border border-rose-300 text-rose-900 text-xs font-semibold hover:bg-rose-100/50 cursor-pointer"
                    >
                      Taper à la main
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MANUAL INPUT */}
          {activeTab === 'MANUAL' && !conflict && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Numéro du code-barres *
                </label>
                <div className="relative">
                  <input
                    id="input-manual-barcode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9A-Za-z\-]*"
                    autoFocus
                    value={manualCode}
                    onChange={(e) => {
                      setManualCode(e.target.value);
                      setChecksumWarningDismissed(false);
                    }}
                    placeholder="Ex: 6009510800210"
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-200 font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                  />
                  {manualCode.trim() && (
                    <span className="absolute right-3 top-3.5 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {validateBarcodeChecksum(manualCode).format}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Détection automatique du format (EAN-13, EAN-8, UPC, Code 128...).
                </p>
              </div>

              {/* Checksum Warning (Non-blocking) */}
              {checksumWarningDismissed && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Clé de contrôle douteuse</span>
                  </div>
                  <p>
                    Ce code semble mal recopié selon l'algorithme officiel. Tu veux quand même l’enregistrer ?
                  </p>
                </div>
              )}

              <button
                id="btn-confirm-manual-code"
                type="submit"
                className="w-full py-3.5 px-4 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>
                  {checksumWarningDismissed ? 'Enregistrer quand même' : 'Associer ce code au produit'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
