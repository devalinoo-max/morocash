-- Renouvellement d'abonnement : durée achetée, dates de fin avant/après,
-- idempotence du bouton « Payer ».
ALTER TABLE "SubscriptionPayment" ADD COLUMN "nombreMois" INTEGER;
ALTER TABLE "SubscriptionPayment" ADD COLUMN "dateFinAvant" TIMESTAMP(3);
ALTER TABLE "SubscriptionPayment" ADD COLUMN "dateFinApres" TIMESTAMP(3);
ALTER TABLE "SubscriptionPayment" ADD COLUMN "clientUuid" TEXT;
ALTER TABLE "SubscriptionPayment" ADD COLUMN "urlPaiement" TEXT;
CREATE UNIQUE INDEX "SubscriptionPayment_clientUuid_key" ON "SubscriptionPayment"("clientUuid");

-- Reprise : durée et dates des paiements déjà réussis, tirées de leur abonnement.
UPDATE "SubscriptionPayment" sp
SET "nombreMois" = CASE s."periode"
      WHEN 'MENSUEL' THEN 1 WHEN 'TRIMESTRIEL' THEN 3 WHEN 'SEMESTRIEL' THEN 6 ELSE 12 END,
    "dateFinApres" = s."dateFin"
FROM "Subscription" s
WHERE sp."subscriptionId" = s."id" AND sp."statut" = 'REUSSI' AND sp."nombreMois" IS NULL;

-- Suivi des ventes par commercial.
ALTER TABLE "Business" ADD COLUMN "suiviCommercialActif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "estCommercial" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Commercial" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commercial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Commercial_userId_key" ON "Commercial"("userId");
CREATE INDEX "Commercial_businessId_actif_idx" ON "Commercial"("businessId", "actif");
ALTER TABLE "Commercial" ADD CONSTRAINT "Commercial_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commercial" ADD CONSTRAINT "Commercial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "commercialId" TEXT;
ALTER TABLE "Order" ADD COLUMN "canal" TEXT;
CREATE INDEX "Order_commercialId_idx" ON "Order"("commercialId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_commercialId_fkey" FOREIGN KEY ("commercialId") REFERENCES "Commercial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
