-- Relances automatiques d'inactivité (app pas ouverte, ou aucune vente, depuis 3 jours).
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "derniereRelanceAt" TIMESTAMP(3);

-- Point de départ : la dernière connexion connue.
UPDATE "User" SET "lastSeenAt" = "lastLoginAt";
