-- Notifications programmées : envoi différé par le cron (voir /api/cron/push-scheduled).
ALTER TABLE "PushBroadcast" ADD COLUMN "statut" TEXT NOT NULL DEFAULT 'ENVOYE';
ALTER TABLE "PushBroadcast" ADD COLUMN "programmeLe" TIMESTAMP(3);
ALTER TABLE "PushBroadcast" ADD COLUMN "envoyeLe" TIMESTAMP(3);

-- Les envois déjà faits l'ont été à leur création.
UPDATE "PushBroadcast" SET "envoyeLe" = "createdAt";

CREATE INDEX "PushBroadcast_statut_programmeLe_idx" ON "PushBroadcast"("statut", "programmeLe");
