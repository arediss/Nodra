import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { fr } from './fr';
import { en } from './en';
import { loadLang, saveLang, type Lang } from '../lib/lang';

/**
 * The ONE i18next instance for the app. It's shared with plugins through the
 * `__nodra` singleton (see main.tsx + scripts/build-plugin.mjs), exactly like
 * React/@xyflow, so a plugin's `useTranslation()` binds to this same instance.
 * Plugins add their own namespaces via `host.i18n.addBundle(...)`.
 *
 * Flat dotted keys: keySeparator + nsSeparator are off so `t('settings.theme')`
 * is a literal key; a plugin's namespace comes from `useTranslation('<ns>')`.
 */
void i18n.use(initReactI18next).init({
  resources: {
    fr: { core: fr },
    en: { core: en },
  },
  lng: loadLang(),
  fallbackLng: 'fr',
  defaultNS: 'core',
  fallbackNS: 'core',
  keySeparator: false,
  nsSeparator: false,
  // Single-brace {name} placeholders to match our dictionaries (i18next defaults
  // to {{name}}). escapeValue off: React already escapes, values are trusted UI text.
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
  returnNull: false,
});

/** Switch the UI language and persist it. Components re-render via react-i18next. */
export function setLang(lng: Lang): void {
  void i18n.changeLanguage(lng);
  saveLang(lng);
}

export { i18n };
