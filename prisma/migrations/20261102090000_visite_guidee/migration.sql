-- Avancement de la visite guidée, une ligne par personne (pas par boutique) :
-- un employé ajouté plus tard refait la visite pour son compte, et celui qui
-- l'a déjà faite ne la revoit jamais.
CREATE TABLE "Onboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visiteAccueilVue" BOOLEAN NOT NULL DEFAULT false,
    "parcoursFait" BOOLEAN NOT NULL DEFAULT false,
    "parcoursEtape" INTEGER NOT NULL DEFAULT 0,
    "bullesVues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Onboarding_userId_key" ON "Onboarding"("userId");

-- Le compte fermé emporte son avancement de visite : plus rien à en faire.
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
