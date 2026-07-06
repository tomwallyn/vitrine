import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

import de from './locales/de';
import enGB from './locales/en-GB';
import enUS from './locales/en-US';
import es from './locales/es';
import fr from './locales/fr';
import pt from './locales/pt';

/** Locales supportées (clé i18n → catalogue). Anglais distingué US/UK. */
const translations = {
  'en-US': enUS,
  'en-GB': enGB,
  fr,
  es,
  pt,
  de,
} as const;

export type SupportedLocale = keyof typeof translations;

export const i18n = new I18n(translations, {
  defaultLocale: 'en-US',
  enableFallback: true, // clé absente → repli sur en-US
});

/**
 * Résout la langue du device vers une locale supportée :
 * 1. correspondance exacte du tag (en-US, en-GB) ;
 * 2. anglais → en-GB si région GB, sinon en-US ;
 * 3. fr / es / pt / de → variante générique ;
 * 4. sinon anglais US (fallback demandé).
 */
export function resolveLocale(): SupportedLocale {
  for (const l of Localization.getLocales()) {
    const tag = l.languageTag as SupportedLocale;
    if (tag in translations) return tag;
    const lang = l.languageCode;
    if (lang === 'en') return l.regionCode === 'GB' ? 'en-GB' : 'en-US';
    if (lang === 'fr' || lang === 'es' || lang === 'pt' || lang === 'de') return lang;
  }
  return 'en-US';
}

i18n.locale = resolveLocale();

/**
 * Traduit une clé de catalogue.
 * - interpolation : `t('common.credits', { count: 10 })` → « 10 crédits »
 * - pluriel : clés `{ one, other }` pilotées par `count`.
 */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}
