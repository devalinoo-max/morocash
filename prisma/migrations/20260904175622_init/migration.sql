-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ESSAI', 'ACTIF', 'IMPAYE', 'SUSPENDU', 'RESILIE');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('COMMERCE', 'SERVICES', 'MIXTE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'SELLER', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PRODUIT', 'SERVICE');

-- CreateEnum
CREATE TYPE "CodeFormat" AS ENUM ('EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'CODE39', 'ITF14', 'QR', 'DATAMATRIX', 'INTERNE');

-- CreateEnum
CREATE TYPE "CodeOrigin" AS ENUM ('GENERE', 'SCANNE', 'PHOTO', 'MANUEL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAYEE', 'PARTIELLE', 'CREDIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "DiscountMode" AS ENUM ('POURCENTAGE', 'MONTANT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('COMMANDE', 'REMBOURSEMENT_DETTE');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('VALIDE', 'ANNULE');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ENTREE', 'SORTIE', 'RETOUR', 'CASSE', 'PERTE', 'INVENTAIRE');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('ENTREE', 'SORTIE');

-- CreateEnum
CREATE TYPE "CashOrigin" AS ENUM ('COMMANDE', 'REMBOURSEMENT', 'DEPENSE', 'APPORT', 'RETRAIT');

-- CreateEnum
CREATE TYPE "RegisterStatus" AS ENUM ('OUVERTE', 'FERMEE');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('PRODUIT', 'DEPENSE');

-- CreateEnum
CREATE TYPE "ExpenseOrigin" AS ENUM ('MANUELLE', 'AUTO_STOCK');

-- CreateEnum
CREATE TYPE "SubPeriod" AS ENUM ('MENSUEL', 'ANNUEL');

-- CreateEnum
CREATE TYPE "SubPayState" AS ENUM ('INITIE', 'REUSSI', 'ECHOUE', 'EXPIRE');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prixMensuel" INTEGER NOT NULL,
    "prixAnnuel" INTEGER NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxProduits" INTEGER NOT NULL,
    "rapportsComparatifs" BOOLEAN NOT NULL DEFAULT false,
    "exportExcel" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "typeActivite" "ActivityType" NOT NULL DEFAULT 'COMMERCE',
    "ville" TEXT,
    "pays" TEXT NOT NULL DEFAULT 'CI',
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "logoUrl" TEXT,
    "planId" TEXT,
    "statut" "BusinessStatus" NOT NULL DEFAULT 'ESSAI',
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "remiseMaxVendeur" INTEGER NOT NULL DEFAULT 0,
    "seuilEcartComptage" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "periode" "SubPeriod" NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "montant" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "montant" INTEGER NOT NULL,
    "methode" "PaymentMethod" NOT NULL,
    "referenceInterne" TEXT NOT NULL,
    "referencePasserelle" TEXT,
    "statut" "SubPayState" NOT NULL DEFAULT 'INITIE',
    "payloadWebhook" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "total" INTEGER NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "compteur" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "systeme" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'PRODUIT',
    "prixVente" INTEGER NOT NULL,
    "prixAchat" INTEGER NOT NULL DEFAULT 0,
    "cmp" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "seuilAlerte" INTEGER NOT NULL DEFAULT 0,
    "unite" TEXT NOT NULL DEFAULT 'pièce',
    "categoryId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "isPrincipale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCode" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "format" "CodeFormat" NOT NULL,
    "origine" "CodeOrigin" NOT NULL,
    "estPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "note" TEXT,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "sousTotal" INTEGER NOT NULL,
    "remiseMode" "DiscountMode",
    "remiseValeur" INTEGER,
    "remiseMontant" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "coutTotal" INTEGER NOT NULL,
    "statutPaiement" "PaymentStatus" NOT NULL,
    "statut" "OrderStatus" NOT NULL DEFAULT 'VALIDEE',
    "motifAnnulation" TEXT,
    "annuleeParId" TEXT,
    "annuleeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "libelle" TEXT NOT NULL,
    "qte" INTEGER NOT NULL,
    "prixUnitaire" INTEGER NOT NULL,
    "coutUnitaire" INTEGER NOT NULL,
    "totalLigne" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT,
    "clientUuid" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "methode" "PaymentMethod" NOT NULL,
    "type" "PaymentKind" NOT NULL,
    "statut" "PaymentState" NOT NULL DEFAULT 'VALIDE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "note" TEXT,
    "justificatifUrl" TEXT,
    "methode" "PaymentMethod" NOT NULL DEFAULT 'ESPECES',
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "origine" "ExpenseOrigin" NOT NULL DEFAULT 'MANUELLE',
    "receptionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "stockAvant" INTEGER NOT NULL,
    "stockApres" INTEGER NOT NULL,
    "prixAchatUnitaire" INTEGER,
    "coutUnitaire" INTEGER NOT NULL,
    "motif" TEXT,
    "fournisseur" TEXT,
    "note" TEXT,
    "justificatifUrl" TEXT,
    "orderId" TEXT,
    "receptionId" TEXT,
    "countId" TEXT,
    "annule" BOOLEAN NOT NULL DEFAULT false,
    "mouvementInverseId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReception" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "fournisseur" TEXT,
    "note" TEXT,
    "justificatifUrl" TEXT,
    "totalArticles" INTEGER NOT NULL,
    "totalMontant" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "perimetre" TEXT NOT NULL DEFAULT 'TOUT',
    "nbProduits" INTEGER NOT NULL,
    "nbEcarts" INTEGER NOT NULL,
    "ecartUnites" INTEGER NOT NULL,
    "ecartValeur" INTEGER NOT NULL,
    "commentaire" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ouverteParId" TEXT NOT NULL,
    "ouverteLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fondDepart" INTEGER NOT NULL,
    "fermeeParId" TEXT,
    "fermeeLe" TIMESTAMP(3),
    "montantAttendu" INTEGER,
    "montantCompte" INTEGER,
    "ecart" INTEGER,
    "commentaireEcart" TEXT,
    "statut" "RegisterStatus" NOT NULL DEFAULT 'OUVERTE',

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "origine" "CashOrigin" NOT NULL,
    "paymentId" TEXT,
    "referenceId" TEXT,
    "montant" INTEGER NOT NULL,
    "methode" "PaymentMethod" NOT NULL,
    "motif" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nbCommandes" INTEGER NOT NULL DEFAULT 0,
    "totalVendu" INTEGER NOT NULL DEFAULT 0,
    "recu" INTEGER NOT NULL DEFAULT 0,
    "aCredit" INTEGER NOT NULL DEFAULT 0,
    "coutMarchandises" INTEGER NOT NULL DEFAULT 0,
    "margeBrute" INTEGER NOT NULL DEFAULT 0,
    "totalDepenses" INTEGER NOT NULL DEFAULT 0,
    "gagne" INTEGER NOT NULL DEFAULT 0,
    "creancesTotales" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "userId" TEXT,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "anciennesValeurs" JSONB,
    "nouvellesValeurs" JSONB,
    "motif" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Business_statut_idx" ON "Business"("statut");

-- CreateIndex
CREATE INDEX "Subscription_businessId_dateFin_idx" ON "Subscription"("businessId", "dateFin");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_referenceInterne_key" ON "SubscriptionPayment"("referenceInterne");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_businessId_statut_idx" ON "SubscriptionPayment"("businessId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_numero_key" ON "Invoice"("numero");

-- CreateIndex
CREATE INDEX "User_telephone_idx" ON "User"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "User_businessId_telephone_key" ON "User"("businessId", "telephone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "OtpCode_telephone_expiresAt_idx" ON "OtpCode"("telephone", "expiresAt");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_cle_key" ON "RateLimit"("cle");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessId_nom_type_key" ON "Category"("businessId", "nom", "type");

-- CreateIndex
CREATE INDEX "Product_businessId_actif_idx" ON "Product"("businessId", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_nom_key" ON "Product"("businessId", "nom");

-- CreateIndex
CREATE INDEX "ProductImage_productId_ordre_idx" ON "ProductImage"("productId", "ordre");

-- CreateIndex
CREATE INDEX "ProductCode_businessId_code_idx" ON "ProductCode"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCode_businessId_code_key" ON "ProductCode"("businessId", "code");

-- CreateIndex
CREATE INDEX "Customer_businessId_archive_idx" ON "Customer"("businessId", "archive");

-- CreateIndex
CREATE INDEX "Customer_businessId_telephone_idx" ON "Customer"("businessId", "telephone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientUuid_key" ON "Order"("clientUuid");

-- CreateIndex
CREATE INDEX "Order_businessId_createdAt_idx" ON "Order"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_numero_key" ON "Order"("businessId", "numero");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_clientUuid_key" ON "Payment"("clientUuid");

-- CreateIndex
CREATE INDEX "Payment_businessId_createdAt_idx" ON "Payment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_customerId_statut_idx" ON "Payment"("customerId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_clientUuid_key" ON "Expense"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_receptionId_key" ON "Expense"("receptionId");

-- CreateIndex
CREATE INDEX "Expense_businessId_date_idx" ON "Expense"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_clientUuid_key" ON "StockMovement"("clientUuid");

-- CreateIndex
CREATE INDEX "StockMovement_businessId_createdAt_idx" ON "StockMovement"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_businessId_type_idx" ON "StockMovement"("businessId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StockReception_clientUuid_key" ON "StockReception"("clientUuid");

-- CreateIndex
CREATE INDEX "StockReception_businessId_createdAt_idx" ON "StockReception"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_clientUuid_key" ON "StockCount"("clientUuid");

-- CreateIndex
CREATE INDEX "StockCount_businessId_createdAt_idx" ON "StockCount"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CashRegister_businessId_statut_idx" ON "CashRegister"("businessId", "statut");

-- CreateIndex
CREATE INDEX "CashRegister_businessId_ouverteLe_idx" ON "CashRegister"("businessId", "ouverteLe");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_clientUuid_key" ON "CashMovement"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_paymentId_key" ON "CashMovement"("paymentId");

-- CreateIndex
CREATE INDEX "CashMovement_businessId_createdAt_idx" ON "CashMovement"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_cashRegisterId_idx" ON "CashMovement"("cashRegisterId");

-- CreateIndex
CREATE INDEX "DailyStats_businessId_date_idx" ON "DailyStats"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStats_businessId_date_key" ON "DailyStats"("businessId", "date");

-- CreateIndex
CREATE INDEX "Notification_businessId_lu_idx" ON "Notification"("businessId", "lu");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entite_entiteId_idx" ON "AuditLog"("entite", "entiteId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCode" ADD CONSTRAINT "ProductCode_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCode" ADD CONSTRAINT "ProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "StockReception"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "StockReception"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReception" ADD CONSTRAINT "StockReception_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReception" ADD CONSTRAINT "StockReception_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_ouverteParId_fkey" FOREIGN KEY ("ouverteParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_fermeeParId_fkey" FOREIGN KEY ("fermeeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStats" ADD CONSTRAINT "DailyStats_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
