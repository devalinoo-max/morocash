-- Le détail d'un inventaire, article par article. Jusqu'ici un comptage ne
-- gardait que ses totaux : les articles trouvés conformes ne produisant aucun
-- mouvement, ils ne laissaient aucune trace. On ne pouvait donc pas dire ce
-- qui avait été vérifié, ni relire un inventaire après coup.
--
-- Un article absent de cette table n'a pas été compté : ce n'est pas la même
-- chose qu'un article compté conforme, et l'inventaire ne prétend rien à son
-- sujet.
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stockTheorique" INTEGER NOT NULL,
    "stockCompte" INTEGER NOT NULL,
    "ecart" INTEGER NOT NULL,
    "coutUnitaire" INTEGER NOT NULL,
    "valeurEcart" INTEGER NOT NULL,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- Un article ne peut être compté qu'une fois par inventaire.
CREATE UNIQUE INDEX "StockCountLine_countId_productId_key" ON "StockCountLine"("countId", "productId");
CREATE INDEX "StockCountLine_businessId_countId_idx" ON "StockCountLine"("businessId", "countId");

ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Les lignes n'ont pas de vie propre : elles suivent leur inventaire.
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey"
    FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Même cloisonnement par boutique que les autres tables porteuses de
-- businessId (voir scripts/apply-rls.ts) : posé ici pour qu'une table neuve ne
-- reste jamais ouverte, même si le script n'est pas relancé après déploiement.
ALTER TABLE "StockCountLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCountLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StockCountLine";
CREATE POLICY tenant_isolation ON "StockCountLine"
    USING ("businessId" = current_setting('app.business_id', true));

-- Valeur du stock effectivement compté, et écart en valeur signé : un
-- inventaire doit dire si le stock réel vaut plus ou moins que ce que le
-- système annonçait. `ecartValeur` reste en valeur absolue, c'est ce qu'il a
-- toujours voulu dire et l'historique est écrit ainsi.
ALTER TABLE "StockCount" ADD COLUMN "valeurStockComptee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockCount" ADD COLUMN "ecartValeurNette" INTEGER NOT NULL DEFAULT 0;
