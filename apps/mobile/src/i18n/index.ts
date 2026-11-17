import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { BRAND } from '@/config/brand';
import en from './locales/en';
import lt from './locales/lt';
import lv from './locales/lv';
import et from './locales/et';
import pl from './locales/pl';

export const LANGUAGES = [
  { code: 'lt', label: 'Lietuvių' },
  { code: 'en', label: 'English' },
  { code: 'lv', label: 'Latviešu' },
  { code: 'et', label: 'Eesti' },
  { code: 'pl', label: 'Polski' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Lithuanian is the default; use the device language only if we support it. */
export function detectLanguage(): LanguageCode {
  const device = getLocales()[0]?.languageCode ?? 'lt';
  return (LANGUAGES.find((l) => l.code === device)?.code ?? 'lt') as LanguageCode;
}

export function initI18n(lng: LanguageCode) {
  if (i18n.isInitialized) {
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
    return i18n;
  }
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, lt: { translation: lt }, lv: { translation: lv }, et: { translation: et }, pl: { translation: pl } },
    lng,
    fallbackLng: ['en', 'lt'],
    interpolation: { escapeValue: false, defaultVariables: { app: BRAND.name } },
    returnNull: false,
  });
  return i18n;
}

export default i18n;
