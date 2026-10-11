-- Reprise des paiements enregistrés par l'ancien code entre la migration
-- « versements » et sa mise en ligne : un remboursement de dette resté sans
-- commande (la dette du client ne baissait plus), et des paiements de commande
-- sans rang ni numéro de reçu. Même répartition que la première reprise, de la
-- commande la plus ancienne à la plus récente. Rejouable sans effet.
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

    -- Versé plus que la dette : le surplus reste une ligne sans commande.
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

-- Statut des commandes dont un versement vient d'être rattaché ou n'a pas
-- encore de rang.
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
    WHERE r."orderId" = o."id" AND r."numero" IS NULL
  );

-- Rang, reste figé et numéro de reçu, seulement pour les versements qui n'en
-- ont pas : ceux déjà numérotés gardent leurs chiffres figés.
WITH rangs AS (
  SELECT p."id",
         ROW_NUMBER() OVER (PARTITION BY p."orderId" ORDER BY p."createdAt", p."id") AS n,
         o."total" - SUM(CASE WHEN p."statut" = 'VALIDE' THEN p."montant" ELSE 0 END) OVER (
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
WHERE p."id" = rangs."id" AND p."numero" IS NULL;

-- Qui a encaissé : l'auteur de la ligne de caisse du paiement.
UPDATE "Payment" p
SET "userId" = cm."userId"
FROM "CashMovement" cm
WHERE cm."paymentId" = p."id" AND p."userId" IS NULL;
