export type Lang = 'fr' | 'en';

const KEY = 'pfd:lang';

/** Persisted UI language; defaults to French. Mirrors lib/theme.ts. */
export function loadLang(): Lang {
  try {
    const l = localStorage.getItem(KEY);
    if (l === 'fr' || l === 'en') return l;
  } catch {
    /* ignore */
  }
  return 'fr';
}

export function saveLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
}
