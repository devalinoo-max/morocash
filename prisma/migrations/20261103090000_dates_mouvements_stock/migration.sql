-- Date déclarée de l'opération de stock, distincte de la date de saisie.
-- La marchandise arrive le samedi et se note le lundi ; la casse se constate à
-- la fermeture et se déclare le lendemain. `createdAt` reste la trace de la
-- saisie : c'est elle qui permet de voir qu'un mouvement a été antidaté.
ALTER TABLE "StockMovement" ADD COLUMN "dateOperation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StockReception" ADD COLUMN "dateOperation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StockCount" ADD COLUMN "dateOperation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- L'existant n'a jamais été antidaté : sa date d'opération est sa date de
-- saisie. Sans ce rattrapage, tout l'historique porterait la date de la
-- migration et les comptes par période seraient faux.
UPDATE "StockMovement" SET "dateOperation" = "createdAt";
UPDATE "StockReception" SET "dateOperation" = "createdAt";
UPDATE "StockCount" SET "dateOperation" = "createdAt";

-- Date limite de consommation du lot reçu, par article : vide pour tout ce qui
-- ne périme pas, c'est-à-dire la plupart des articles.
ALTER TABLE "StockMovement" ADD COLUMN "datePeremption" TIMESTAMP(3);

CREATE INDEX "StockMovement_businessId_dateOperation_idx" ON "StockMovement"("businessId", "dateOperation");
