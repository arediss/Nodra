// Generic reactive registry: one master implementation reused for every
// extension point (blocks, node types, importers…). Plugins fill it via the
// host SDK; the core reads it. Pub/sub so React views re-render when a plugin
// (un)registers, while non-React code just calls all()/get().

export type Registry<T> = {
  /**
   * Register a value by id; returns an unregister fn (used on plugin removal).
   * `opts.source` records the plugin id that owns this entry, so a diagram can
   * later derive which plugins it depends on (see derivePlugins).
   */
  register(id: string, value: T, opts?: { source?: string }): () => void;
  get(id: string): T | undefined;
  /** The plugin id that registered `id`, if any (diagram dependency tracking). */
  sourceOf(id: string): string | undefined;
  all(): T[];
  entries(): [string, T][];
  version(): number;
  subscribe(listener: () => void): () => void;
};

export function createRegistry<T>(): Registry<T> {
  const items = new Map<string, T>();
  const sources = new Map<string, string>();
  const listeners = new Set<() => void>();
  let ver = 0;

  const bump = () => {
    ver += 1;
    for (const l of listeners) l();
  };

  return {
    register(id, value, opts) {
      items.set(id, value);
      if (opts?.source) sources.set(id, opts.source);
      bump();
      return () => {
        // Only delete if still ours — a newer registration must win.
        if (items.get(id) === value) {
          items.delete(id);
          sources.delete(id);
          bump();
        }
      };
    },
    get: (id) => items.get(id),
    sourceOf: (id) => sources.get(id),
    all: () => [...items.values()],
    entries: () => [...items.entries()],
    version: () => ver,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
