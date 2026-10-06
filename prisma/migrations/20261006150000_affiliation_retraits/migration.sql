-- Espace affilié : prénom de l'affilié, et destination de chaque retrait
-- (opérateur mobile money + numéro de réception) pour que l'admin sache où payer.
ALTER TABLE "Affiliate" ADD COLUMN "nom" TEXT;
ALTER TABLE "AffiliatePayout" ADD COLUMN "operateur" "PaymentMethod";
ALTER TABLE "AffiliatePayout" ADD COLUMN "numeroReception" TEXT;
