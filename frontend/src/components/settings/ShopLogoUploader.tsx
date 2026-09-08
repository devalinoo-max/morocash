import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, Trash2, Store, Move, Check, Sparkles, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ShopLogoUploaderProps {
  logoUrl?: string;
  logoTransparentUrl?: string;
  onLogoChange: (logoUrl: string | undefined, logoTransparentUrl?: string) => void;
  shopName: string;
}

export const ShopLogoUploader: React.FC<ShopLogoUploaderProps> = ({
  logoUrl,
  onLogoChange,
  shopName,
}) => {
  const { showToast } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isPngOrSvg, setIsPngOrSvg] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Shop initials for placeholder
  const initials = shopName
    ? shopName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('')
    : 'MC';

  // Read file and initiate crop / compression
  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!file) return;

      if (file.size > 15 * 1024 * 1024) {
        showToast('Le fichier dépasse la limite de 15 Mo', 'error');
        return;
      }

      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/heic', 'image/heif'];
      const isSvg = file.type === 'image/svg+xml' || file.name.endsWith('.svg');
      const isPng = file.type === 'image/png' || file.name.endsWith('.png');
      setIsPngOrSvg(isPng || isSvg);

      setIsProcessing(true);

      try {
        let blob: Blob = file;
        // Check for HEIC
        if (file.type.includes('heic') || file.name.endsWith('.heic')) {
          try {
            const heic2any = (await import('heic2any')).default;
            const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
            blob = Array.isArray(converted) ? converted[0] : converted;
          } catch (e) {
            console.warn('HEIC fallback', e);
          }
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setCropImageSrc(result);
          setZoom(1);
          setPanOffset({ x: 0, y: 0 });
          setIsProcessing(false);
        };
        reader.onerror = () => {
          setIsProcessing(false);
          showToast('Erreur lors de la lecture du fichier', 'error');
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        setIsProcessing(false);
        showToast('Erreur lors du traitement de l’image', 'error');
      }
    },
    [showToast]
  );

  // Global paste handler (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              handleFileSelected(file);
              showToast('Image collée depuis le presse-papier', 'success');
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFileSelected, showToast]);

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  // Perform square crop and browser compression (512x512, WebP quality 85, target under 80 Ko)
  const applyCrop = () => {
    if (!cropImageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const outputSize = 512;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        showToast('Erreur canvas', 'error');
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Clear transparent
      ctx.clearRect(0, 0, outputSize, outputSize);

      // Compute bounding box based on zoom and panOffset
      const naturalAspect = img.width / img.height;
      let baseW = outputSize;
      let baseH = outputSize;

      if (naturalAspect > 1) {
        baseH = outputSize;
        baseW = outputSize * naturalAspect;
      } else {
        baseW = outputSize;
        baseH = outputSize / naturalAspect;
      }

      const drawW = baseW * zoom;
      const drawH = baseH * zoom;
      const drawX = (outputSize - drawW) / 2 + panOffset.x;
      const drawY = (outputSize - drawH) / 2 + panOffset.y;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // WebP compression at 85 quality
      const finalWebpUrl = canvas.toDataURL('image/webp', 0.85);

      // If PNG or SVG, save transparent PNG version too
      let finalTransparentUrl: string | undefined = undefined;
      if (isPngOrSvg) {
        finalTransparentUrl = canvas.toDataURL('image/png');
      }

      onLogoChange(finalWebpUrl, finalTransparentUrl);
      setCropImageSrc(null);
      showToast('Logo enregistré avec succès', 'success');
    };
    img.src = cropImageSrc;
  };

  const cancelCrop = () => {
    setCropImageSrc(null);
  };

  const handleRemove = () => {
    onLogoChange(undefined, undefined);
    showToast('Logo retiré', 'info');
  };

  return (
    <div id="shop-logo-manager" className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        {/* 120px Square Zone */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-[120px] h-[120px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center relative shrink-0 transition-all overflow-hidden select-none ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50 scale-102'
              : 'border-[#E2E8F0] bg-slate-50/60 hover:bg-slate-50'
          }`}
        >
          {logoUrl ? (
            <div className="w-full h-full relative group">
              <img
                src={logoUrl}
                alt={shopName}
                className="w-full h-full object-contain p-1.5"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Changer de logo"
                  className="px-2 py-1 rounded bg-white text-slate-900 text-[10px] font-bold shadow-xs cursor-pointer"
                >
                  Modifier
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-extrabold text-base shadow-xs mb-1.5">
                {initials}
              </div>
              <span className="text-[10px] font-bold text-slate-400 leading-tight">Aucun logo</span>
            </div>
          )}

          {isProcessing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>

        {/* Action buttons & explanations */}
        <div className="flex-1 space-y-2.5">
          <p className="text-xs text-slate-500 leading-relaxed max-w-md">
            {logoUrl
              ? 'Ton logo est configuré. Il s’affiche automatiquement sur tes reçus numériques et sur les étiquettes de tes articles.'
              : 'Ajoute ton logo, il apparaîtra sur tes reçus et tes étiquettes.'}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {/* Camera */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-slate-600" />
              <span>Prendre une photo</span>
            </button>

            {/* File */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Choisir un fichier</span>
            </button>

            {/* Delete button if logo exists */}
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer ml-auto sm:ml-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Retirer le logo</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            JPG, PNG, WEBP, HEIC, SVG · 15 Mo max · Glisser-déposer ou Ctrl+V
          </p>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* Live Preview Vignette: "Voici comment il apparaîtra sur ton reçu" */}
      <div className="pt-2 border-t border-slate-100">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
          Voici comment il apparaîtra sur ton reçu
        </span>

        <div className="inline-flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80 max-w-sm">
          <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1 shrink-0 shadow-2xs overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Vignette reçu" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <Store className="w-5 h-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-bold text-slate-900 truncate uppercase">
              {shopName || 'MoroCash Store'}
            </h5>
            <p className="text-[10px] text-slate-400 truncate">Reçu N° CMD-2026-0042 • Payé</p>
          </div>
        </div>
      </div>

      {/* Interactive Crop Modal if user picked an image */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Move className="w-4 h-4 text-indigo-600" />
                <span>Ajuster le recadrage carré</span>
              </h3>
            </div>

            <p className="text-xs text-slate-500">
              Fais glisser l'image ou ajuste le zoom pour centrer ton logo dans le carré.
            </p>

            {/* Crop canvas area */}
            <div
              className="relative w-64 h-64 mx-auto rounded-2xl overflow-hidden border-2 border-indigo-500 bg-slate-900 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => {
                setIsDraggingCrop(true);
                dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
              }}
              onMouseMove={(e) => {
                if (isDraggingCrop) {
                  setPanOffset({
                    x: e.clientX - dragStartRef.current.x,
                    y: e.clientY - dragStartRef.current.y,
                  });
                }
              }}
              onMouseUp={() => setIsDraggingCrop(false)}
              onMouseLeave={() => setIsDraggingCrop(false)}
            >
              <img
                src={cropImageSrc}
                alt="Aperçu recadrage"
                className="max-w-none transition-transform pointer-events-none"
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                }}
                draggable={false}
              />
              <div className="absolute inset-0 border border-white/20 pointer-events-none rounded-2xl" />
            </div>

            {/* Zoom Slider */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-500">
                <span>Zoom</span>
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={cancelCrop}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={applyCrop}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Valider le logo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
