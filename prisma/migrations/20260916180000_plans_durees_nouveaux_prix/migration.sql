-- Abonnements payables sur 1, 3, 6 ou 12 mois.
ALTER TYPE "SubPeriod" ADD VALUE 'TRIMESTRIEL';
ALTER TYPE "SubPeriod" ADD VALUE 'SEMESTRIEL';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "prixTrimestriel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prixSemestriel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxCommandesMois" INTEGER NOT NULL DEFAULT 0;

-- Grille de prix et quotas (3 formules : Essai, Solo, Business).
-- Les abonnements déjà payés gardent leur montant et leurs dates.
UPDATE "Plan" SET
  "prixMensuel" = 9900,
  "prixTrimestriel" = 27600,
  "prixSemestriel" = 51700,
  "prixAnnuel" = 99000,
  "maxUsers" = 2,
  "maxProduits" = 1000,
  "maxCommandesMois" = 900
WHERE "code" = 'SOLO';

UPDATE "Plan" SET
  "prixMensuel" = 19900,
  "prixTrimestriel" = 55500,
  "prixSemestriel" = 103900,
  "prixAnnuel" = 199000,
  "maxUsers" = 10,
  "maxProduits" = 0,
  "maxCommandesMois" = 0
WHERE "code" = 'BUSINESS';
