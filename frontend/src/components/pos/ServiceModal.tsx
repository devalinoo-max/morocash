import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Product } from '../../types';
import { Wrench, X, Check, Sparkles } from 'lucide-react';
import { MoneyInput } from '../common/UIStates';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddService: (serviceProduct: Product) => void;
}

const DEFAULT_RECENT_SERVICES = [
  'Livraison à Cocody',
  'Retouche vêtement',
  'Pose / Installation',
  'Réparation',
  'Nettoyage / Pressing',
];

const RECENT_SERVICES_KEY = 'morocash_recent_services';

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  onAddService,
}) => {
  const { showToast, addProduct } = useApp();
  const [serviceName, setServiceName] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [recentServices, setRecentServices] = useState<string[]>(DEFAULT_RECENT_SERVICES);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SERVICES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentServices(parsed.slice(0, 5));
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectRecent = (name: string) => {
    setServiceName(name);
  };

  const handleConfirm = async () => {
    if (!serviceName.trim()) {
      showToast('Précise le nom du service', 'warning');
      return;
    }
    if (amount <= 0) {
      showToast('Entre un montant valide supérieur à 0', 'warning');
      return;
    }

    const trimmedName = serviceName.trim();

    // Update recent services storage (up to 5)
    try {
      const updated = [trimmedName, ...recentServices.filter((s) => s.toLowerCase() !== trimmedName.toLowerCase())].slice(0, 5);
      setRecentServices(updated);
      localStorage.setItem(RECENT_SERVICES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }

    // If saveToCatalog is checked, persist into products catalog. Un service
    // NON sauvegardé au catalogue n'a pas d'id réel côté backend — toute
    // commande le contenant échouera (PRODUCT_NOT_FOUND) à la validation, le
    // backend exigeant un vrai Product pour chaque ligne de commande (limite
    // connue de ce prototype, pas encore de "ligne libre" côté serveur).
    let createdProduct: Product;
    if (saveToCatalog) {
      const created = await addProduct({
        name: trimmedName,
        salePrice: amount,
        purchasePrice: 0,
        stock: 999,
        alertThreshold: 0,
        category: 'SERVICES',
        unit: 'prestation',
        isService: true,
      });
      if (!created) return;
      createdProduct = created;
      showToast(`Service "${trimmedName}" ajouté au catalogue`, 'success');
    } else {
      createdProduct = {
        id: `service-${Date.now()}`,
        name: trimmedName,
        category: 'SERVICES',
        salePrice: amount,
        purchasePrice: 0,
        stock: 999,
        alertThreshold: 0,
        unit: 'prestation',
        isService: true,
        salesCount: 0,
        createdAt: new Date().toISOString(),
        syncStatus: 'SYNCED',
      };
    }

    onAddService(createdProduct);
    onClose();
    setServiceName('');
    setAmount(0);
    setSaveToCatalog(false);
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-[460px] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-indigo-100" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ajouter un service</h3>
              <p className="text-[11px] text-indigo-100">Facturation d'une prestation sans stock physique</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {/* Champ 1: Quel service ? */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-1.5">
              Quel service ? *
            </label>
            <input
              id="input-service-name"
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="Ex : Livraison à Cocody, Retouche..."
              autoFocus
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5] transition-all"
            />
          </div>

          {/* Champ 2: Combien tu factures ? */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-1.5">
              Combien tu factures ? *
            </label>
            <MoneyInput
              id="input-service-amount"
              value={amount}
              onChange={(val) => setAmount(val)}
              placeholder="0"
            />
          </div>

          {/* Quick amount shortcuts */}
          <div className="flex gap-1.5">
            {[500, 1000, 2000, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v)}
                className="flex-1 py-1.5 rounded-xl bg-indigo-50/70 hover:bg-indigo-100 text-[#4F46E5] font-bold text-xs transition-colors cursor-pointer"
              >
                +{v} F
              </button>
            ))}
          </div>

          {/* 5 Derniers services saisis sous forme de pastilles */}
          {recentServices.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Services fréquents :
              </span>
              <div className="flex flex-wrap gap-1.5">
                {recentServices.map((svc) => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => handleSelectRecent(svc)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      serviceName === svc
                        ? 'bg-[#4F46E5] text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Case à cocher: Enregistrer ce service dans mon catalogue */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
              <input
                id="checkbox-save-service-catalog"
                type="checkbox"
                checked={saveToCatalog}
                onChange={(e) => setSaveToCatalog(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-[#4F46E5] rounded-sm focus:ring-[#4F46E5]"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">
                  Enregistrer ce service dans mon catalogue
                </span>
                <span className="text-slate-500 text-[11px]">
                  Il sera disponible directement dans tes produits pour les prochaines commandes
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer transition-colors"
          >
            Annuler
          </button>
          <button
            id="btn-confirm-add-service"
            type="button"
            onClick={handleConfirm}
            disabled={!serviceName.trim() || amount <= 0}
            className="h-11 px-5 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 disabled:opacity-40 text-white text-xs sm:text-sm font-bold shadow-md cursor-pointer flex items-center gap-2 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Ajouter à la commande</span>
          </button>
        </div>
      </div>
    </div>
  );
};
