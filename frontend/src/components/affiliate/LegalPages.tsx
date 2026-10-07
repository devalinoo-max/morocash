import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { fetchAffiliateProgram } from '../../api/affiliate';
import { formatMoney } from '../../utils/currency';
import { supportWhatsappUrl } from '../../utils/support';
import { Logo } from '../common/Logo';
import { AFFILIATION_PATH } from './paths';

/*
 * Textes provisoires, rédigés à partir du fonctionnement réel de l'app : à
 * faire relire (juriste) avant de les considérer comme définitifs.
 */

const LegalLayout: React.FC<{ title: string; updated: string; children: React.ReactNode }> = ({ title, updated, children }) => {
  useEffect(() => {
    document.title = `${title} · MoroCash`;
  }, [title]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F3F4F8] text-base leading-6 text-slate-700">
      <header className="px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-[720px] mx-auto h-16 flex items-center justify-between gap-3">
          <a href="/" aria-label="Accueil MoroCash">
            <Logo size={28} />
          </a>
          <a href={AFFILIATION_PATH} className="inline-flex items-center gap-1.5 min-h-12 font-semibold text-[#4F46E5] hover:underline">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Affiliation
          </a>
        </div>
      </header>
      <main className="px-4 sm:px-6 py-10 md:py-16">
        <article className="max-w-[720px] mx-auto bg-white rounded-2xl p-5 md:p-8 space-y-6">
          <div className="space-y-1">
            <h1 className="text-[28px] leading-[34px] md:text-[36px] md:leading-[42px] font-extrabold text-[#17162B] tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-slate-500">Dernière mise à jour : {updated}</p>
          </div>
          {children}
        </article>
      </main>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-extrabold text-[#17162B]">{title}</h2>
    {children}
  </section>
);

const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

const SupportLink: React.FC = () => (
  <a href={supportWhatsappUrl()} target="_blank" rel="noopener noreferrer" className="font-bold text-[#4F46E5] underline">
    le support MoroCash sur WhatsApp
  </a>
);

export const AffiliationTerms: React.FC = () => {
  // Seuil lu dans les réglages du back-office, comme sur la page /affiliation.
  const [seuil, setSeuil] = useState<number | null>(null);
  useEffect(() => {
    fetchAffiliateProgram()
      .then((p) => setSeuil(p.seuilRetrait))
      .catch(() => undefined);
  }, []);
  const seuilText = seuil === null ? 'un seuil minimum' : formatMoney(seuil);

  return (
    <LegalLayout title="Conditions du programme d'affiliation" updated="7 octobre 2026">
      <Section title="1. Le programme">
        <p>
          Le programme d'affiliation MoroCash permet à toute personne disposant d'un compte affilié de recommander
          MoroCash à des commerçants grâce à un lien personnel, et de recevoir une commission sur les abonnements payés
          par les boutiques inscrites avec ce lien. Le compte affilié est gratuit et distinct d'un compte boutique.
        </p>
      </Section>

      <Section title="2. Rattachement d'une boutique">
        <p>
          Une boutique est rattachée à l'affilié lorsqu'elle est créée après un passage par son lien, ou avec son code
          d'affiliation saisi à l'inscription. Elle reste rattachée à cet affilié tant qu'elle est abonnée.
        </p>
      </Section>

      <Section title="3. Calcul et versement de la commission">
        <Bullets
          items={[
            "La commission est calculée par mois d'abonnement payé, selon la formule choisie par la boutique (Solo ou Business).",
            "Elle est créditée sur le solde de l'affilié à chaque paiement d'abonnement réussi, renouvellements compris.",
            "Le montant appliqué est celui en vigueur au moment du paiement.",
          ]}
        />
      </Section>

      <Section title="4. Cas sans commission">
        <p>Aucune commission n'est due :</p>
        <Bullets
          items={[
            "pendant la période d'essai gratuite de la boutique ;",
            'sur un paiement échoué, annulé ou remboursé ;',
            'sur une boutique résiliée ou suspendue ;',
            "sur une boutique créée avec le numéro WhatsApp de l'affilié lui-même.",
          ]}
        />
      </Section>

      <Section title="5. Retrait des gains">
        <Bullets
          items={[
            <>Un retrait peut être demandé dès que le solde atteint {seuilText}.</>,
            "Le retrait porte sur la totalité du solde et est payé en mobile money (Orange Money, MTN MoMo, Wave ou Moov), au numéro indiqué par l'affilié.",
            "Un seul retrait peut être en cours à la fois.",
          ]}
        />
      </Section>

      <Section title="6. Modification des montants">
        <p>
          MoroCash peut modifier les montants des commissions et le seuil de retrait. Un changement ne s'applique qu'aux
          paiements futurs : les commissions déjà créditées ne sont jamais modifiées.
        </p>
      </Section>

      <Section title="7. Bon usage">
        <p>
          L'affilié présente MoroCash de façon honnête et n'envoie pas de messages non sollicités en masse. En cas de
          fraude ou d'abus (fausses inscriptions, usurpation, spam), MoroCash peut désactiver le compte affilié et
          refuser les commissions concernées.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Pour toute question, écris à <SupportLink />.
        </p>
      </Section>
    </LegalLayout>
  );
};

export const PrivacyPolicy: React.FC = () => (
  <LegalLayout title="Politique de confidentialité" updated="7 octobre 2026">
    <Section title="1. Données collectées">
      <Bullets
        items={[
          'Compte boutique : nom de la boutique, numéro WhatsApp, e-mail (facultatif), et les données saisies dans l’app (produits, stock, commandes, clients, dépenses).',
          'Compte affilié : prénom, nom, numéro WhatsApp, e-mail (facultatif) et numéro de réception des retraits.',
          'Paiement de l’abonnement : opérateur et statut du paiement. Les données de paiement sont traitées par notre prestataire de paiement, pas par MoroCash.',
        ]}
      />
    </Section>

    <Section title="2. Utilisation">
      <Bullets
        items={[
          'Faire fonctionner ton compte et sauvegarder tes données.',
          'Envoyer les codes de connexion ou de récupération du mot de passe, par WhatsApp ou par e-mail.',
          'Gérer l’abonnement, les commissions des affiliés et les retraits.',
          'Envoyer les notifications que tu as activées.',
        ]}
      />
      <p>MoroCash ne vend pas tes données et ne les utilise pas pour de la publicité.</p>
    </Section>

    <Section title="3. Partage">
      <p>
        Tes données ne sont partagées qu'avec les prestataires nécessaires au service (hébergement, base de données,
        envoi des messages WhatsApp et des e-mails, paiement), uniquement pour ces usages. Un affilié ne voit jamais le
        numéro ni l'e-mail des boutiques qu'il a amenées : seulement leur nom, leur formule et leurs paiements.
      </p>
    </Section>

    <Section title="4. Conservation">
      <p>Tes données sont conservées tant que ton compte est actif. Tu peux demander la fermeture de ton compte à tout moment.</p>
    </Section>

    <Section title="5. Tes droits">
      <p>
        Tu peux demander l'accès à tes données, leur correction ou leur suppression en écrivant à <SupportLink />.
      </p>
    </Section>
  </LegalLayout>
);
