import type { Permission } from './types';

/** One entry in the registry index (plugins.json). */
export type RegistryEntry = {
  id: string;
  name: string;
  version: string;
  api_version: string;
  description?: string;
  author?: string;
  permissions?: Permission[];
  category?: string;
  keywords?: string[];
  download_url: string;
  sha256: string;
};

/** SimplyTerm-style index URL. Override via localStorage('pfd:registryUrl'). */
export const DEFAULT_REGISTRY_URL =
  'https://arediss.github.io/nodra-plugin-registry/plugins.json';

export function registryUrl(): string {
  try {
    return localStorage.getItem('pfd:registryUrl') || DEFAULT_REGISTRY_URL;
  } catch {
    return DEFAULT_REGISTRY_URL;
  }
}

const isEntry = (e: unknown): e is RegistryEntry => {
  const x = e as RegistryEntry;
  return (
    !!e &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.version === 'string' &&
    typeof x.download_url === 'string' &&
    /^https:\/\//.test(x.download_url) &&
    /^[0-9a-fA-F]{64}$/.test(x.sha256 as unknown as string)
  );
};

/** Fetch + validate the registry index. Accepts `[...]` or `{ plugins: [...] }`. */
export async function fetchRegistry(url = registryUrl()): Promise<RegistryEntry[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
  const data: unknown = await res.json();
  const list = Array.isArray(data)
    ? data
    : (data as { plugins?: unknown[] })?.plugins;
  if (!Array.isArray(list)) throw new Error('invalid registry index');
  // Drop malformed/insecure entries; cap the list defensively.
  return list.filter(isEntry).slice(0, 500);
}
