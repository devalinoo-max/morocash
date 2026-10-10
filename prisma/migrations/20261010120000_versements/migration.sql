-- Paiement partiel : chaque paiement devient un « versement » rattaché à une
-- commande, avec son rang, son reste figé, son numéro de reçu et son auteur.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "numero" INTEGER,
ADD COLUMN     "resteApres" INTEGER,
ADD COLUMN     "numeroRecu" TEXT,
ADD COLUMN     "userId" TEXT,
ADD COLUMN     "motifAnnulation" TEXT,
ADD COLUMN     "annuleParId" TEXT,
ADD COLUMN     "annuleLe" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise des anciens remboursements de dette. Ils étaient enregistrés sans
-- commande : la dette du client baissait, mais ses commandes restaient
-- « impayées » pour toujours. Chacun est réparti sur les commandes impayées du
-- client, de la plus ancienne à la plus récente, comme le fait désormais
-- l'encaissement. La somme des montants ne change pas ; la ligne de caisse est
-- découpée de la même façon pour que chaque versement garde la sienne.
DO $$
DECLARE
  p RECORD;
  o RECORD;
  cm RECORD;
  restant INTEGER;
  part INTEGER;
  idx INTEGER;
  nouvel_id TEXT;
BEGIN
  FOR p IN
    SELECT * FROM "Payment"
    WHERE "orderId" IS NULL AND "customerId" IS NOT NULL AND "statut" = 'VALIDE'
    ORDER BY "createdAt", "id"
  LOOP
    restant := p."montant";
    idx := 0;
    SELECT * INTO cm FROM "CashMovement" WHERE "paymentId" = p."id";

    FOR o IN
      SELECT ord."id",
             ord."total" - COALESCE((
               SELECT SUM(pp."montant") FROM "Payment" pp
               WHERE pp."orderId" = ord."id" AND pp."statut" = 'VALIDE'
             ), 0) AS reste
      FROM "Order" ord
      WHERE ord."customerId" = p."customerId"
        AND ord."businessId" = p."businessId"
        AND ord."statut" <> 'ANNULEE'
      ORDER BY ord."createdAt", ord."id"
    LOOP
      EXIT WHEN restant <= 0;
      CONTINUE WHEN o.reste <= 0;
      part := LEAST(restant, o.reste);

      IF idx = 0 THEN
        UPDATE "Payment" SET "orderId" = o."id", "montant" = part WHERE "id" = p."id";
        IF cm."id" IS NOT NULL THEN
          UPDATE "CashMovement" SET "montant" = part WHERE "id" = cm."id";
        END IF;
      ELSE
        nouvel_id := p."id" || '-' || (idx + 1);
        INSERT INTO "Payment" ("id", "businessId", "orderId", "customerId", "clientUuid", "montant", "methode", "type", "statut", "createdAt")
        VALUES (nouvel_id, p."businessId", o."id", p."customerId", p."clientUuid" || ':' || (idx + 1), part, p."methode", p."type", 'VALIDE', p."createdAt");
        IF cm."id" IS NOT NULL THEN
          INSERT INTO "CashMovement" ("id", "businessId", "cashRegisterId", "clientUuid", "type", "origine", "paymentId", "referenceId", "montant", "methode", "motif", "userId", "createdAt")
          VALUES (cm."id" || '-' || (idx + 1), cm."businessId", cm."cashRegisterId", p."clientUuid" || ':' || (idx + 1) || ':cash', cm."type", cm."origine", nouvel_id, cm."referenceId", part, cm."methode", cm."motif", cm."userId", cm."createdAt");
        END IF;
      END IF;

      restant := restant - part;
      idx := idx + 1;
    END LOOP;

    -- Le client avait versé plus que sa dette : le surplus reste une ligne sans
    -- commande, pour que ni la caisse ni le total reçu ne perdent un franc.
    IF restant > 0 AND idx > 0 THEN
      nouvel_id := p."id" || '-surplus';
      INSERT INTO "Payment" ("id", "businessId", "orderId", "customerId", "clientUuid", "montant", "methode", "type", "statut", "createdAt")
      VALUES (nouvel_id, p."businessId", NULL, p."customerId", p."clientUuid" || ':surplus', restant, p."methode", p."type", 'VALIDE', p."createdAt");
      IF cm."id" IS NOT NULL THEN
        INSERT INTO "CashMovement" ("id", "businessId", "cashRegisterId", "clientUuid", "type", "origine", "paymentId", "referenceId", "montant", "methode", "motif", "userId", "createdAt")
        VALUES (cm."id" || '-surplus', cm."businessId", cm."cashRegisterId", p."clientUuid" || ':surplus:cash', cm."type", cm."origine", nouvel_id, cm."referenceId", restant, cm."methode", cm."motif", cm."userId", cm."createdAt");
      END IF;
    END IF;
  END LOOP;
END $$;

-- Statut des commandes qui viennent de recevoir un ancien remboursement.
UPDATE "Order" o
SET "statutPaiement" = (CASE
  WHEN s.paye >= o."total" THEN 'PAYEE'
  WHEN s.paye > 0 THEN 'PARTIELLE'
  ELSE 'CREDIT'
END)::"PaymentStatus"
FROM (
  SELECT "orderId", SUM("montant") AS paye
  FROM "Payment"
  WHERE "orderId" IS NOT NULL AND "statut" = 'VALIDE'
  GROUP BY "orderId"
) s
WHERE s."orderId" = o."id"
  AND o."statut" <> 'ANNULEE'
  AND EXISTS (
    SELECT 1 FROM "Payment" r
    WHERE r."orderId" = o."id" AND r."type" = 'REMBOURSEMENT_DETTE'
  );

-- Rang, reste figé et numéro de reçu de tous les versements existants.
WITH rangs AS (
  SELECT p."id",
         ROW_NUMBER() OVER (PARTITION BY p."orderId" ORDER BY p."createdAt", p."id") AS n,
         o."total" - SUM(p."montant") OVER (
           PARTITION BY p."orderId" ORDER BY p."createdAt", p."id" ROWS UNBOUNDED PRECEDING
         ) AS reste,
         o."numero" AS numero_commande
  FROM "Payment" p
  JOIN "Order" o ON o."id" = p."orderId"
)
UPDATE "Payment" p
SET "numero" = rangs.n,
    "resteApres" = GREATEST(rangs.reste, 0),
    "numeroRecu" = 'REC-' || regexp_replace(rangs.numero_commande, '^CMD-', '') || '-V' || rangs.n
FROM rangs
WHERE p."id" = rangs."id";

-- Qui a encaissé : l'auteur de la ligne de caisse du paiement.
UPDATE "Payment" p
SET "userId" = cm."userId"
FROM "CashMovement" cm
WHERE cm."paymentId" = p."id" AND p."userId" IS NULL;
