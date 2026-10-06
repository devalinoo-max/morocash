-- Programme d'affiliation : comptes affiliés, commissions par paiement d'abonnement, retraits.

-- CreateEnum
CREATE TYPE "AffiliatePayoutStatus" AS ENUM ('DEMANDE', 'PAYE');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "commissionAffilie" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "affiliateId" TEXT;

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "pays" TEXT NOT NULL DEFAULT 'CI',
    "codeHash" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateSession" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionPaymentId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "tauxMensuel" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,
    "renouvellement" BOOLEAN NOT NULL DEFAULT false,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "statut" "AffiliatePayoutStatus" NOT NULL DEFAULT 'DEMANDE',
    "adminUserId" TEXT,
    "payeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "seuilRetrait" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_telephone_key" ON "Affiliate"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateSession_tokenHash_key" ON "AffiliateSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AffiliateSession_affiliateId_idx" ON "AffiliateSession"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommission_subscriptionPaymentId_key" ON "AffiliateCommission"("subscriptionPaymentId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_createdAt_idx" ON "AffiliateCommission"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_payoutId_idx" ON "AffiliateCommission"("payoutId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_createdAt_idx" ON "AffiliatePayout"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliatePayout_statut_idx" ON "AffiliatePayout"("statut");

-- CreateIndex
CREATE INDEX "Business_affiliateId_idx" ON "Business"("affiliateId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_subscriptionPaymentId_fkey" FOREIGN KEY ("subscriptionPaymentId") REFERENCES "SubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Taux de départ (FCFA par mois d'abonnement payé) et seuil de retrait.
UPDATE "Plan" SET "commissionAffilie" = 1250 WHERE "code" = 'SOLO';
UPDATE "Plan" SET "commissionAffilie" = 2500 WHERE "code" = 'BUSINESS';
INSERT INTO "AffiliateSettings" ("id", "seuilRetrait", "updatedAt") VALUES ('default', 5000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
