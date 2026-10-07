-- Mot de passe oublié par e-mail (OtpCode.email/canal), et avantage des inscrits
-- avec un code d'affiliation : durée d'essai et réduction du premier paiement.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "dureeEssaiJours" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "reductionPremierPaiement" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionPayment" ADD COLUMN     "remiseAffiliation" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OtpCode" ADD COLUMN     "canal" TEXT NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "email" TEXT,
ALTER COLUMN "telephone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AffiliateSettings" ADD COLUMN     "joursEssaiOfferts" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "reductionPremierPaiement" INTEGER NOT NULL DEFAULT 10;

-- CreateIndex
CREATE INDEX "OtpCode_email_expiresAt_idx" ON "OtpCode"("email", "expiresAt");

