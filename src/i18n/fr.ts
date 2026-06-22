/**
 * Core UI translations — FR, the source of truth.
 *
 * Flat, dot-namespaced keys (i18next runs with keySeparator/nsSeparator off, so
 * the dots are literal). `en.ts` is typed as `Dict`, so a missing or renamed key
 * is a TypeScript error — the two dictionaries can never drift.
 *
 * Migration is incremental: keys are added area-by-area as strings move off
 * hardcoded JSX onto t(). Plugins register their OWN namespaces via host.i18n.
 */
export const fr = {
  // Settings → Appearance
  'settings.appearance': 'Apparence',
  'settings.theme': 'Thème',
  'settings.themeSub': 'Clair, sombre, ou suivre le système',
  'theme.light': 'Clair',
  'theme.dark': 'Sombre',
  'theme.system': 'Auto',
  'settings.language': 'Langue',
  'settings.languageSub': "Langue de l'interface",
};

export type Dict = typeof fr;
