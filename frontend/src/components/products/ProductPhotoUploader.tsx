import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Plus,
  X,
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { processImageFile, ImageProcessError } from '../../utils/imageProcessor';

interface ProductPhotoUploaderProps {
  photos: string[];
  onChangePhotos: (photos: string[]) => void;
  maxPhotos?: number;
}

export const ProductPhotoUploader: React.FC<ProductPhotoUploaderProps> = ({
  photos,
  onChangePhotos,
  maxPhotos = 3,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFilesSelected(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [photos]);

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    setErrorMessage(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const availableSlots = maxPhotos - photos.length;
    if (availableSlots <= 0) {
      setErrorMessage(`Maximum ${maxPhotos} photos autorisées.`);
      return;
    }

    const filesToProcess = files.slice(0, availableSlots);
    setIsProcessing(true);
    setProgress(15);

    const newPhotos = [...photos];

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const res = await processImageFile(file, file.name, (pct) => {
          const overall = Math.round(((i + pct / 100) / filesToProcess.length) * 100);
          setProgress(overall);
        });
        newPhotos.push(res.dataUrl);
      }
      onChangePhotos(newPhotos);
    } catch (err: any) {
      const error = err as ImageProcessError;
      if (error && error.message) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          "L'image n'est pas partie. La photo reste sur ton téléphone, elle s'enverra toute seule après."
        );
      }
    } finally {
      setIsProcessing(false);
      setProgress(0);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    onChangePhotos(updated);
  };

  const handleMove = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= photos.length) return;
    const copy = [...photos];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    onChangePhotos(copy);
  };

  // Drag & Drop handlers
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
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-2xl transition-all ${
        isDragging
          ? 'border-2 border-dashed border-[#4F46E5] bg-indigo-50/50 p-4'
          : 'border border-slate-200 bg-slate-50/60 p-3 sm:p-3.5'
      }`}
    >
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
      />

      {/* Header bar with photo count */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-800">Photos du produit</span>
          <span className="text-[11px] font-semibold text-slate-400">
            ({photos.length}/{maxPhotos} max)
          </span>
        </div>
        {photos.length > 0 && (
          <span className="text-[10px] text-slate-500 font-medium">
            Glisse ou utilise les flèches pour réordonner
          </span>
        )}
      </div>

      {/* Processing indicator / Progress bar */}
      {isProcessing && (
        <div className="mb-3 p-2.5 rounded-xl bg-white border border-indigo-100 shadow-xs space-y-1.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>Optimisation et conversion WebP...</span>
            </div>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4F46E5] transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error alert */}
      {errorMessage && (
        <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Existing Photos Grid with Reordering & Main Badge */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        {photos.map((url, idx) => {
          const isMain = idx === 0;
          return (
            <div
              key={idx}
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs group shrink-0"
            >
              <img
                src={url}
                alt={`Photo ${idx + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />

              {/* Main Photo Badge */}
              {isMain && (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#4F46E5] text-white text-[9px] font-black tracking-wide shadow-xs">
                  Principale
                </span>
              )}

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                title="Supprimer la photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Reordering arrows in bottom overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 p-1 flex items-center justify-between opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, 'left')}
                  className="w-5 h-5 rounded-md text-white disabled:opacity-30 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  title="Déplacer vers la gauche"
                >
                  <ArrowLeft className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-white/90 font-bold">#{idx + 1}</span>
                <button
                  type="button"
                  disabled={idx === photos.length - 1}
                  onClick={() => handleMove(idx, 'right')}
                  className="w-5 h-5 rounded-md text-white disabled:opacity-30 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  title="Déplacer vers la droite"
                >
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {/* [+] Quick add slot if less than max */}
        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 flex flex-col items-center justify-center text-slate-400 hover:text-[#4F46E5] transition-all cursor-pointer shrink-0"
            title="Ajouter une photo"
          >
            <Plus className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">+ Photo</span>
          </button>
        )}
      </div>

      {/* 3 Entry Action Buttons (Prendre une photo / Choisir un fichier / Info) */}
      {photos.length < maxPhotos && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70">
          {/* 1. Prendre une photo */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 sm:flex-initial h-10 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
          >
            <Camera className="w-4 h-4 text-amber-400" />
            <span>Prendre une photo</span>
          </button>

          {/* 2. Choisir un fichier */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 sm:flex-initial h-10 px-3.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer transition-colors"
          >
            <ImageIcon className="w-4 h-4 text-indigo-600" />
            <span>Choisir un fichier</span>
          </button>

          <span className="text-[11px] text-slate-400 hidden sm:inline ml-auto">
            JPG, PNG, WEBP, HEIC, PDF • Max 15 Mo (compressé &lt;100Ko) • Ou glisse / colle (Ctrl+V)
          </span>
        </div>
      )}
    </div>
  );
};
