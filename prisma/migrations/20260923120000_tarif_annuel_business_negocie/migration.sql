-- Tarif annuel négocié pour la formule Business, propre à une boutique.
-- NULL = prix public du plan (199 000 F). Renseigné à la main au cas par cas,
-- c'est le serveur qui l'applique au paiement (voir subscriptions/service.ts).
ALTER TABLE "Business" ADD COLUMN "tarifAnnuelBusiness" INTEGER;
