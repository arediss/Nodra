import * as registries from '../plugins/registries';

export type IconSource = 'iconify' | 'svg';

export type IconEntry = {
  /** stable unique id, e.g. "bi:aws-lambda" (builtin) or "aws:Lambda" (generated) */
  id: string;
  name: string;
  /** 'aws' | 'gcp' | 'azure' | 'brand' | 'general' | 'network' | 'security' | ... */
  provider: string;
  category: string;
  source: IconSource;
  /** iconify icon id (source 'iconify') OR public path to an svg (source 'svg') */
  ref: string;
  keywords?: string[];
};

// Blocks now live in the reactive registry (filled by registerBuiltins + plugins).
// These stay synchronous functions: every caller invokes them at interaction
// time, never at module-init, so the registry is always populated by then.

export function getCatalog(): IconEntry[] {
  return registries.blocks.all();
}

export function getProviders(): string[] {
  return ['all', ...new Set(getCatalog().map((e) => e.provider))];
}

export function searchIcons(query: string, provider = 'all'): IconEntry[] {
  const q = query.trim().toLowerCase();
  return getCatalog().filter((e) => {
    if (provider !== 'all' && e.provider !== provider) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.provider.toLowerCase().includes(q) ||
      (e.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false)
    );
  });
}

export function getIcon(id: string): IconEntry | undefined {
  return registries.blocks.get(id);
}
