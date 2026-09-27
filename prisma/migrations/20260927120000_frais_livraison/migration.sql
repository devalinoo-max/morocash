-- Frais de livraison facturés au client, ajoutés au total après la remise.
-- 0 par défaut : les commandes existantes restent inchangées.
ALTER TABLE "Order" ADD COLUMN "fraisLivraison" INTEGER NOT NULL DEFAULT 0;
