/**
 * Pays UEMOA couverts par MoroCash — la valeur `code` doit rester alignée
 * avec SUPPORTED_COUNTRIES côté backend (src/server/modules/auth/register.ts).
 */
export interface CountryOption {
  code: 'CI' | 'SN' | 'BJ' | 'TG' | 'ML' | 'BF';
  label: string;
  dialCode: string;
  flag: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'CI', label: "Côte d'Ivoire", dialCode: '+225', flag: '🇨🇮' },
  { code: 'SN', label: 'Sénégal', dialCode: '+221', flag: '🇸🇳' },
  { code: 'BJ', label: 'Bénin', dialCode: '+229', flag: '🇧🇯' },
  { code: 'TG', label: 'Togo', dialCode: '+228', flag: '🇹🇬' },
  { code: 'ML', label: 'Mali', dialCode: '+223', flag: '🇲🇱' },
  { code: 'BF', label: 'Burkina Faso', dialCode: '+226', flag: '🇧🇫' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];
