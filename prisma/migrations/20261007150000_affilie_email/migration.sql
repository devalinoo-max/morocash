-- E-mail facultatif de l'affilié (mot de passe oublié par e-mail), unique.

-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_email_key" ON "Affiliate"("email");
