-- Tarif mensuel négocié pour la formule Business, propre à une boutique.
-- Pendant de "tarifAnnuelBusiness" pour la durée d'un mois : NULL = prix
-- public du plan, une valeur = montant réellement demandé au paiement.
ALTER TABLE "Business" ADD COLUMN "tarifMensuelBusiness" INTEGER;
