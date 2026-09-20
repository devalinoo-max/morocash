-- Permissions cochées une par une à l'ajout d'un employé.
-- Vide par défaut : un nouvel employé n'a que ce que le propriétaire lui accorde.
ALTER TABLE "User" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Reprise des employés existants : ils gardent exactement les droits dont ils
-- disposaient avant l'introduction des permissions, sinon cette migration leur
-- retirerait du jour au lendemain des accès qu'ils utilisent déjà.
UPDATE "User"
SET "permissions" = ARRAY['GERER_STOCK']::TEXT[]
WHERE "role" = 'SELLER';

UPDATE "User"
SET "permissions" = ARRAY[
  'VOIR_MARGES',
  'VOIR_DEPENSES',
  'GERER_STOCK',
  'ANNULER_COMMANDE',
  'EXPORTER_DONNEES'
]::TEXT[]
WHERE "role" = 'ACCOUNTANT';
