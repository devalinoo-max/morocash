import React, { useState } from 'react';
import { X, FileText, Image as ImageIcon, Loader2, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  downloadBlob,
  exportFileName,
  loadCatalogPhotos,
  renderCatalogPng,
  toCatalogRows,
} from '../../utils/catalogExport';

type ExportFormat = 'PDF_IMAGES' | 'IMAGE_SIMPLE';

interface CatalogExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CatalogExportModal: React.FC<CatalogExportModalProps> = ({ isOpen, onClose }) => {
  const { products, settings, showToast } = useApp();
  const [running, setRunning] = useState<ExportFormat | null>(null);

  if (!isOpen) return null;

  const handleExport = async (format: ExportFormat) => {
    if (products.length === 0) {
      showToast('Ton catalogue est vide : rien à exporter.', 'warning');
      return;
    }
    setRunning(format);
    try {
      const rows = toCatalogRows(products);
      if (format === 'IMAGE_SIMPLE') {
        const blob = await renderCatalogPng(rows, settings.shopName);
        downloadBlob(blob, exportFileName(settings.shopName, 'png'));
      } else {
        const [photos, { renderCatalogPdf }] = await Promise.all([
          loadCatalogPhotos(rows),
          import('./catalogPdf'),
        ]);
        const blob = await renderCatalogPdf(rows, photos, settings.shopName);
        downloadBlob(blob, exportFileName(settings.shopName, 'pdf'));
        const missing = rows.filter((r, i) => r.photo && !photos[i]).length;
        if (missing > 0) {
          showToast(`Catalogue exporté — ${missing} photo${missing > 1 ? 's' : ''} n'ont pas pu être chargée${missing > 1 ? 's' : ''}.`, 'warning');
        }
      }
      onClose();
    } catch (err) {
      console.error(err);
      showToast("L'export a échoué. Réessaie.", 'error');
    } finally {
      setRunning(null);
    }
  };

  const option = (format: ExportFormat, icon: React.ReactNode, title: string, description: string, id: string) => (
    <button
      id={id}
      type="button"
      disabled={running !== null}
      onClick={() => handleExport(format)}
      className="w-full p-3.5 rounded-2xl border border-slate-200 hover:border-[#4F46E5] hover:bg-indigo-50/40 text-left flex items-center gap-3 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
    >
      <span className="w-10 h-10 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shrink-0">
        {running === format ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-bold text-slate-900">{title}</span>
        <span className="block text-[12px] text-slate-500">
          {running === format ? 'Préparation du fichier…' : description}
        </span>
      </span>
      <Download className="w-4 h-4 text-slate-400 shrink-0" />
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={() => running === null && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-export-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 id="catalog-export-title" className="text-[15px] font-[750] text-slate-900 leading-tight">
              Exporter le catalogue
            </h3>
            <p className="text-[11px] text-slate-500 leading-tight">
              {products.length} produit{products.length > 1 ? 's' : ''} · choisis un format
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running !== null}
            aria-label="Fermer"
            className="w-9 h-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          {option(
            'PDF_IMAGES',
            <FileText className="w-5 h-5" />,
            'PDF avec images',
            'Un document avec la photo de chaque produit',
            'btn-export-catalog-pdf'
          )}
          {option(
            'IMAGE_SIMPLE',
            <ImageIcon className="w-5 h-5" />,
            'Image simple',
            'Une image PNG, sans les photos — facile à partager',
            'btn-export-catalog-image'
          )}
        </div>
      </div>
    </div>
  );
};
