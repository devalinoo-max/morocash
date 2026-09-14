import { useApp } from '../../context/AppContext';
import type { ReceiptSettings } from '../../types';
import { MAX_SAVED_SIZES, readPrintPrefs, type ReceiptPrintPrefs, type SavedPrintSize } from '../../utils/receiptPrint';
import type { PrintDraft } from './PrintFormatPicker';

const RECEIPT_DEFAULTS: ReceiptSettings = {
  showLogo: true,
  showShopName: true,
  showPhone: true,
  showAddress: false,
  showSellerName: true,
  showCustomerName: true,
  showQrCode: true,
  showMessage: true,
  showWatermark: true,
  defaultFormat: 'TEXT',
  prefix: 'CMD',
};

/** Lecture et écriture du format d'impression mémorisé par la boutique. */
export function usePrintPrefs() {
  const { settings, updateSettings } = useApp();
  const prefs = readPrintPrefs(settings.receiptSettings);

  const write = (patch: Partial<ReceiptPrintPrefs>) => {
    updateSettings({ receiptSettings: { ...RECEIPT_DEFAULTS, ...settings.receiptSettings, ...patch } });
  };

  const saveSize = (size: SavedPrintSize): boolean => {
    if (prefs.taillesEnregistrees.length >= MAX_SAVED_SIZES) return false;
    write({ taillesEnregistrees: [...prefs.taillesEnregistrees, size] });
    return true;
  };

  const deleteSize = (index: number) => {
    write({ taillesEnregistrees: prefs.taillesEnregistrees.filter((_, i) => i !== index) });
  };

  return { prefs, write, saveSize, deleteSize };
}

/** Garde la sélection cohérente quand une taille enregistrée disparaît. */
export function draftAfterDelete(draft: PrintDraft, deleted: number): PrintDraft {
  if (!draft.choice.startsWith('SAVED:')) return draft;
  const current = Number(draft.choice.slice(6));
  if (current === deleted) return { ...draft, choice: '58' };
  if (current > deleted) return { ...draft, choice: `SAVED:${current - 1}` };
  return draft;
}
