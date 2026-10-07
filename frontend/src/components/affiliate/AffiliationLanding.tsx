import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgePercent,
  ChevronDown,
  Eye,
  MessageCircle,
  Repeat,
  Smartphone,
  Store,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { fetchAffiliateProgram, registerAffiliate, type AffiliateProgram } from '../../api/affiliate';
import { ApiError } from '../../api/client';
import { COUNTRIES, DEFAULT_COUNTRY, type CountryOption } from '../../data/countries';
import { formatMoney } from '../../utils/currency';
import { supportWhatsappUrl } from '../../utils/support';
import { Logo } from '../common/Logo';
import { PinInput } from '../common/PinInput';
import { AFFILIATE_SPACE_PATH, AFFILIATION_TERMS_PATH, PRIVACY_PATH } from './paths';

/**
 * Page publique du programme d'affiliation (/affiliation), sans connexion.
 * Montants, exemples, seuil de retrait et avantage des inscrits viennent des
 * réglages du back-office (GET /affiliate/program) : jamais écrits en dur.
 */

const INDIGO = '#4F46E5';
const SECTION = 'px-4 sm:px-6 py-14 md:py-24';
const CONTAINER = 'max-w-[1080px] mx-auto';
const SECTION_TITLE = 'text-[24px] leading-[30px] md:text-[36px] md:leading-[42px] font-extrabold text-[#17162B] tracking-tight';
const PILL =
  'inline-flex items-center justify-center gap-2 h-[52px] px-6 rounded-full font-bold text-base transition-opacity hover:opacity-90 cursor-pointer';
const FIELD =
  'w-full h-12 px-3.5 rounded-xl border border-slate-200 bg-white text-base text-slate-900 outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-[#4F46E5]';

const SUPPORT_MESSAGE = "Bonjour, j'ai une question sur le programme d'affiliation MoroCash.";

function scrollToSignup() {
  document.getElementById('inscription')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Montant de la formule (SOLO, BUSINESS) ; null tant que les réglages ne sont pas chargés. */
function commission(program: AffiliateProgram | null, planCode: string): number | null {
  if (!program) return null;
  return program.commissions.find((c) => c.planCode === planCode)?.montant ?? 0;
}

/** Valeur chargée, sinon un trait d'attente de la même hauteur que le texte. */
const Value: React.FC<{ value: number | null; format?: (n: number) => string }> = ({ value, format = formatMoney }) =>
  value === null ? (
    <span aria-hidden className="inline-block w-16 h-[0.8em] rounded bg-current opacity-15 align-baseline" />
  ) : (
    <>{format(value)}</>
  );

export const AffiliationLanding: React.FC = () => {
  const [program, setProgram] = useState<AffiliateProgram | null>(null);
  const [programError, setProgramError] = useState(false);

  const loadProgram = () => {
    setProgramError(false);
    fetchAffiliateProgram()
      .then(setProgram)
      .catch(() => setProgramError(true));
  };

  useEffect(() => {
    document.title = "Programme d'affiliation MoroCash — gagne à chaque abonnement";
    loadProgram();
    // Arrivée par /affiliation#inscription (lien « Devenir affilié » de l'espace affilié).
    if (window.location.hash === '#inscription') window.setTimeout(scrollToSignup, 0);
  }, []);

  const solo = commission(program, 'SOLO');
  const business = commission(program, 'BUSINESS');
  const seuil = program?.seuilRetrait ?? null;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F3F4F8] text-base leading-6 text-slate-700">
      <TopBar />

      {/* Hero : texte à gauche, carte des gains à droite (chevauche le bas sur mobile). */}
      <section className="px-4 sm:px-6 pt-10 md:pt-16" style={{ background: 'linear-gradient(135deg, #17162B 0%, #4F46E5 100%)' }}>
        <div className={`${CONTAINER} grid gap-10 md:grid-cols-2 md:items-center`}>
          <div className="space-y-5 md:pb-16">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white/10 text-white text-sm font-bold">
              Programme d'affiliation
            </span>
            <h1 className="text-[32px] leading-[38px] md:text-[52px] md:leading-[58px] font-extrabold text-white tracking-tight">
              Recommande MoroCash. Gagne chaque mois.
            </h1>
            <p className="text-[#C7D2FE]">
              Pour chaque commerçant que tu amènes, tu es payé à chaque abonnement, tant qu'il reste abonné. C'est
              gratuit, et tu n'as pas besoin de boutique.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button type="button" onClick={scrollToSignup} className={`${PILL} bg-white text-[#4F46E5]`}>
                Devenir affilié
              </button>
              <a href={AFFILIATE_SPACE_PATH} className={`${PILL} border-[1.5px] border-white text-white`}>
                Se connecter
              </a>
            </div>
          </div>

          <div className="-mb-24 md:mb-[-48px]">
            <GainsCard solo={solo} business={business} error={programError} onRetry={loadProgram} />
          </div>
        </div>
      </section>

      <main>
        <section className={`${SECTION} pt-[152px] md:pt-[144px]`}>
          <div className={CONTAINER}>
            <h2 className={SECTION_TITLE}>Comment ça marche</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              <Step n={1} title="Crée ton compte affilié">
                1 minute, avec ton numéro WhatsApp. Ton lien personnel est prêt tout de suite.
              </Step>
              <Step n={2} title="Partage ton lien">
                Envoie-le sur WhatsApp à des commerçants. Ils ont{' '}
                <Value value={program?.joursEssaiOfferts ?? null} format={String} /> jours gratuits en plus à
                l'inscription.
              </Step>
              <Step n={3} title="Gagne à chaque paiement">
                Dès qu'un client que tu as amené paie son abonnement, ta commission est créditée. Retire dès{' '}
                <Value value={seuil} />.
              </Step>
            </ol>
          </div>
        </section>

        <section className={`${SECTION} pt-0 md:pt-0`}>
          <div className={CONTAINER}>
            <h2 className={SECTION_TITLE}>Pourquoi devenir affilié</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <Benefit icon={Repeat} title="Des gains qui reviennent">
                Tu gagnes à chaque renouvellement, pas une seule fois.
              </Benefit>
              <Benefit icon={BadgePercent} title="Un argument qui convainc">
                Tes contacts ont <Value value={program?.joursEssaiTotal ?? null} format={String} /> jours d'essai au
                total{program && program.reductionPremierPaiement > 0 ? ' et des réductions' : ''}.
              </Benefit>
              <Benefit icon={Eye} title="Un suivi en direct">
                Vois qui s'est inscrit, qui a payé, et ce que chacun te rapporte.
              </Benefit>
              <Benefit icon={Smartphone} title="Retrait en mobile money">
                Orange Money, MTN MoMo, Wave ou Moov, dès <Value value={seuil} />.
              </Benefit>
              <Benefit icon={Store} title="Aucune boutique requise">
                Un compte affilié suffit, et il est gratuit.
              </Benefit>
              <Benefit icon={WifiOff} title="Un outil utile">
                Commandes, stock, clients, même sans connexion.
              </Benefit>
            </div>
          </div>
        </section>

        <section className={`${SECTION} pt-0 md:pt-0`}>
          <div className={CONTAINER}>
            <h2 className={SECTION_TITLE}>Pour qui ?</h2>
            <ul className="mt-6 flex flex-wrap gap-3">
              {['Formateurs', 'Community managers', 'Comptables', 'Commerçants qui connaissent d\'autres commerçants'].map(
                (label) => (
                  <li key={label} className="px-4 py-3 rounded-full bg-white border border-slate-200 font-semibold text-[#17162B]">
                    {label}
                  </li>
                ),
              )}
            </ul>
          </div>
        </section>

        <section id="inscription" className={`${SECTION} pt-0 md:pt-0 scroll-mt-4`}>
          <div className="max-w-[480px] mx-auto">
            <h2 className={`${SECTION_TITLE} text-center`}>Crée ton compte affilié</h2>
            <SignupForm />
            <p className="mt-4 text-center text-sm text-slate-500">Gratuit. Ton lien est prêt dès que ton compte est créé.</p>
          </div>
        </section>

        <section className={`${SECTION} pt-0 md:pt-0`}>
          <div className="max-w-[720px] mx-auto">
            <h2 className={SECTION_TITLE}>Questions fréquentes</h2>
            <div className="mt-6 space-y-3">
              <Faq open question="Dois-je avoir une boutique MoroCash ?">
                Non. Il te faut seulement un compte affilié, gratuit.
              </Faq>
              <Faq question="Jusqu'à quand je gagne sur un client ?">
                À chaque paiement d'abonnement, tant que le client reste abonné. Il reste rattaché à toi.
              </Faq>
              <Faq question="Comment je suis payé ?">
                Tu demandes un retrait dès <Value value={seuil} /> de solde et tu reçois l'argent en mobile money :
                Orange Money, MTN MoMo, Wave ou Moov.
              </Faq>
              <Faq question="Que se passe-t-il pendant l'essai de mon client ?">
                Rien n'est gagné pendant l'essai. Ta commission commence au premier paiement d'abonnement.
              </Faq>
              <Faq question="Puis-je utiliser mon lien pour ma propre boutique ?">
                Non. Aucune commission n'est versée sur une boutique créée avec ton propre numéro WhatsApp.
              </Faq>
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-14 md:pb-24">
          <div
            className={`${CONTAINER} rounded-2xl px-5 py-10 md:py-14 text-center space-y-6`}
            style={{ background: 'linear-gradient(135deg, #17162B 0%, #4F46E5 100%)' }}
          >
            <h2 className="text-[24px] leading-[30px] md:text-[36px] md:leading-[42px] font-extrabold text-white">
              Prêt à commencer ?
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button type="button" onClick={scrollToSignup} className={`${PILL} w-full sm:w-auto bg-white text-[#4F46E5]`}>
                Devenir affilié
              </button>
              <a
                href={supportWhatsappUrl(SUPPORT_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${PILL} w-full sm:w-auto bg-[#25D366] text-white`}
              >
                <MessageCircle className="w-5 h-5" aria-hidden />
                Une question ? Écris-nous sur WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-4 sm:px-6 pb-10 text-center text-sm text-slate-500">
        <a href={AFFILIATION_TERMS_PATH} className="inline-flex items-center min-h-12 hover:text-[#4F46E5] hover:underline">
          Conditions du programme d'affiliation
        </a>
        <span aria-hidden className="mx-2">·</span>
        <a href={PRIVACY_PATH} className="inline-flex items-center min-h-12 hover:text-[#4F46E5] hover:underline">
          Politique de confidentialité
        </a>
      </footer>
    </div>
  );
};

const TopBar: React.FC = () => (
  <header className="px-4 sm:px-6" style={{ backgroundColor: '#17162B' }}>
    <div className={`${CONTAINER} h-16 flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-2 min-w-0">
        <a href="/" aria-label="Accueil MoroCash">
          <Logo size={30} onDark />
        </a>
        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white text-sm font-semibold">Affiliation</span>
      </div>
      <a
        href={AFFILIATE_SPACE_PATH}
        className="inline-flex items-center min-h-12 px-2 text-white font-semibold hover:underline shrink-0"
      >
        Se connecter
      </a>
    </div>
  </header>
);

const GainsCard: React.FC<{ solo: number | null; business: number | null; error: boolean; onRetry: () => void }> = ({
  solo,
  business,
  error,
  onRetry,
}) => (
  <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 6px 20px rgba(23,22,43,0.12)' }}>
    <h2 className="text-xl font-extrabold text-[#17162B]">Ce que tu gagnes</h2>
    {error ? (
      <div className="mt-4 space-y-3">
        <p>Les montants n'ont pas pu être chargés.</p>
        <button type="button" onClick={onRetry} className={`${PILL} bg-[#4F46E5] text-white`}>
          Réessayer
        </button>
      </div>
    ) : (
      <>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Rate label="Client Solo" value={solo} />
          <Rate label="Client Business" value={business} />
        </div>
        <ul className="mt-4 space-y-2">
          <Example label="3 clients Business" value={business === null ? null : business * 3} />
          <Example label="10 clients Solo" value={solo === null ? null : solo * 10} />
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          Exemples de calcul, pas une promesse de gain. Tes gains dépendent du nombre de clients que tu amènes.
        </p>
      </>
    )}
  </div>
);

const Rate: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <div className="rounded-xl bg-[#EEF2FF] p-3 sm:p-4 min-w-0">
    <p className="text-sm font-semibold text-slate-600">{label}</p>
    <p className="text-[28px] leading-[34px] sm:text-[40px] sm:leading-[44px] font-extrabold text-[#4F46E5] break-words">
      <Value value={value} />
    </p>
    <p className="text-sm text-slate-500">par mois payé</p>
  </div>
);

const Example: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <li className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-slate-100 pt-2">
    <span>{label} =</span>
    <span className="font-extrabold text-[#16A34A]">
      <Value value={value} /> par mois
    </span>
  </li>
);

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <li className="bg-white rounded-2xl p-5">
    <span
      className="inline-flex items-center justify-center w-10 h-10 rounded-full text-white font-extrabold"
      style={{ backgroundColor: INDIGO }}
    >
      {n}
    </span>
    <h3 className="mt-3 text-lg font-extrabold text-[#17162B]">{title}</h3>
    <p className="mt-1">{children}</p>
  </li>
);

const Benefit: React.FC<{ icon: LucideIcon; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-2xl p-5">
    <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
      <Icon className="w-5 h-5" aria-hidden />
    </span>
    <h3 className="mt-3 text-lg font-extrabold text-[#17162B]">{title}</h3>
    <p className="mt-1">{children}</p>
  </div>
);

const Faq: React.FC<{ question: string; open?: boolean; children: React.ReactNode }> = ({ question, open, children }) => (
  <details open={open} className="group bg-white rounded-2xl">
    <summary className="flex items-center justify-between gap-3 min-h-12 px-5 py-4 cursor-pointer list-none font-bold text-[#17162B] [&::-webkit-details-marker]:hidden">
      {question}
      <ChevronDown className="w-5 h-5 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" aria-hidden />
    </summary>
    <p className="px-5 pb-5 -mt-1">{children}</p>
  </details>
);

// ─── Inscription ───

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Impossible de joindre le serveur. Réessaie.';
}

const SignupForm: React.FC = () => {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinsMatch = pin.length === 6 && pin === pinConfirm;
  const canSubmit = accepted && pinsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!prenom.trim() || !nom.trim()) {
      setError('Indique ton prénom et ton nom.');
      return;
    }
    if (!/^\d{8,15}$/.test(telephone)) {
      setError('Numéro WhatsApp invalide (8 à 15 chiffres).');
      return;
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Adresse e-mail invalide.');
      return;
    }
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await registerAffiliate({
        prenom: prenom.trim(),
        nom: nom.trim(),
        telephone,
        pays: country.code,
        email: email.trim().toLowerCase(),
        pin,
      });
      // Session ouverte par le serveur : l'espace affilié s'ouvre avec le lien prêt.
      window.location.assign(AFFILIATE_SPACE_PATH);
    } catch (err) {
      setError(errorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 bg-white rounded-2xl p-5 space-y-4">
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor="aff-prenom" className="block mb-1 text-sm font-bold text-slate-700">
            Prénom
          </label>
          <input id="aff-prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} className={FIELD} />
        </div>
        <div className="min-w-0">
          <label htmlFor="aff-nom" className="block mb-1 text-sm font-bold text-slate-700">
            Nom
          </label>
          <input id="aff-nom" autoComplete="family-name" value={nom} onChange={(e) => setNom(e.target.value)} className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor="aff-phone" className="block mb-1 text-sm font-bold text-slate-700">
          Numéro WhatsApp
        </label>
        <div className="flex h-12 rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4F46E5] focus-within:border-[#4F46E5]">
          <select
            aria-label="Indicatif pays"
            value={country.code}
            onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? DEFAULT_COUNTRY)}
            className="bg-slate-50 pl-3 pr-1 text-sm font-bold text-slate-700 border-r border-slate-200 shrink-0 cursor-pointer outline-none"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.dialCode}
              </option>
            ))}
          </select>
          <input
            id="aff-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
            placeholder="0708091011"
            className="w-full min-w-0 px-3 text-base text-slate-900 outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="aff-email" className="block mb-1 text-sm font-bold text-slate-700">
          E-mail <span className="font-normal text-slate-500">(optionnel)</span>
        </label>
        <input
          id="aff-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
        <p className="mt-1 text-sm text-slate-500">Pour récupérer ton mot de passe par e-mail.</p>
      </div>

      <div>
        <label htmlFor="aff-pin" className="block mb-1.5 text-sm font-bold text-slate-700">
          Mot de passe à 6 chiffres
        </label>
        <PinInput id="aff-pin" value={pin} onChange={setPin} />
      </div>

      <div>
        <label htmlFor="aff-pin-confirm" className="block mb-1.5 text-sm font-bold text-slate-700">
          Confirmation du mot de passe
        </label>
        <PinInput id="aff-pin-confirm" value={pinConfirm} onChange={setPinConfirm} />
        {pinConfirm.length === 6 && pin !== pinConfirm && (
          <p className="mt-1.5 text-sm font-semibold text-rose-600">Les deux mots de passe ne sont pas identiques.</p>
        )}
      </div>

      <label className="flex items-start gap-3 min-h-12 py-1 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 w-5 h-5 shrink-0 accent-[#4F46E5] cursor-pointer"
        />
        <span>
          J'accepte les{' '}
          <a href={AFFILIATION_TERMS_PATH} target="_blank" rel="noopener" className="font-bold text-[#4F46E5] underline">
            conditions du programme d'affiliation
          </a>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`${PILL} w-full bg-[#4F46E5] text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50`}
      >
        {isSubmitting ? 'Création du compte…' : 'Devenir affilié'}
        {!isSubmitting && <ArrowRight className="w-5 h-5" aria-hidden />}
      </button>

      <p className="text-center text-sm text-slate-600">
        Déjà affilié ?{' '}
        <a href={AFFILIATE_SPACE_PATH} className="inline-flex items-center min-h-12 font-bold text-[#4F46E5] hover:underline">
          Se connecter
        </a>
      </p>
    </form>
  );
};
