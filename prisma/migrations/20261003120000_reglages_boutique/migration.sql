-- Réglages de l'app partagés entre les appareils d'une même boutique.
-- null : la boutique n'a encore rien envoyé, chaque appareil garde les siens.
ALTER TABLE "Business" ADD COLUMN "reglages" JSONB;
