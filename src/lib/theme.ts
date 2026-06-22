export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'pfd:theme';

export function loadTheme(): ThemeMode {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}

const prefersDark = (): boolean => {
  try {
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

const resolve = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode !== 'system') return mode;
  return prefersDark() ? 'dark' : 'light';
};

/** Set the resolved theme on <html data-theme>. CSS variables key off this. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolve(mode);
}

/** Re-apply when the OS theme flips, but only while in 'system' mode. */
export function watchSystemTheme(getMode: () => ThemeMode): () => void {
  let mq: MediaQueryList;
  try {
    mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return () => {};
  }
  const onChange = () => {
    if (getMode() === 'system') applyTheme('system');
  };
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
