import type { Dict } from './fr';

/**
 * Per-key translation context — a translator aid, NOT used at runtime.
 *
 * To add a locale (human or AI): read `fr.ts` (the source strings) together with
 * this file (what each string is / where it appears / tone & length constraints),
 * and produce `<lang>.ts`. The context removes ambiguity that plain strings can't
 * convey (e.g. "Auto" = follow the OS theme; a button label must stay short).
 *
 * Typed `Record<keyof Dict, string>`, so every translation key MUST have a context
 * note — a missing one is a compile error. Keep this in sync as keys are added.
 */
export const context: Record<keyof Dict, string> = {
  // Settings → Appearance
  'settings.appearance': 'Settings → Appearance: the card/section title.',
  'settings.theme': 'Settings → Appearance: label for the theme selector (light / dark / system).',
  'settings.themeSub': 'Settings → Appearance: sub-label under "Theme" describing the options. One short line.',
  'theme.light': 'Theme option = light mode. One word, shown on a small segmented button.',
  'theme.dark': 'Theme option = dark mode. One word, shown on a small segmented button.',
  'theme.system': 'Theme option = follow the OS theme. Short label ("Auto"), on a small segmented button.',
  'settings.language': 'Settings → Appearance: label for the UI language selector.',
  'settings.languageSub': 'Settings → Appearance: sub-label under "Language". One short line.',
};
