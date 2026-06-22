import * as reg from './registries';
import type { AppNode, DiagramPluginDep, IconNodeData } from '../types';

const CORE = 'com.nodra.core';

/**
 * Derive which plugins a diagram depends on, by mapping each node back to the
 * plugin that registered it: a node's type → nodeTypes source, an icon node's
 * `iconRef` → the block that owns that ref → its source. Core contributions are
 * excluded. `carry` (the previously-saved deps) preserves dependencies on
 * plugins that aren't installed right now, so we never silently drop a record we
 * can't re-derive. Result is persisted as DiagramFile.plugins.
 */
export function derivePlugins(
  nodes: AppNode[],
  carry: DiagramPluginDep[] = [],
): DiagramPluginDep[] {
  const out = new Map<string, DiagramPluginDep>();

  const add = (src: string | undefined) => {
    if (!src || src === CORE || out.has(src)) return;
    const m = reg.pluginManifests.get(src);
    out.set(src, m ? { id: src, name: m.name, version: m.version } : { id: src });
  };

  for (const n of nodes) add(reg.nodeTypes.sourceOf(n.type ?? 'default'));

  // Icon nodes reference a block by its ref, not its id — index ref → sources.
  // Several plugins may register the same ref; keep them all so none is dropped.
  const refSources = new Map<string, Set<string>>();
  for (const [id, entry] of reg.blocks.entries()) {
    const src = reg.blocks.sourceOf(id);
    if (!src || src === CORE) continue;
    let set = refSources.get(entry.ref);
    if (!set) refSources.set(entry.ref, (set = new Set()));
    set.add(src);
  }
  for (const n of nodes) {
    if (n.type !== 'icon') continue;
    const sources = refSources.get((n.data as IconNodeData).iconRef);
    if (sources) for (const s of sources) add(s);
  }

  // Keep deps whose plugin isn't installed now (can't re-derive their mapping).
  for (const dep of carry) {
    if (dep?.id && !out.has(dep.id) && !reg.pluginManifests.get(dep.id)) {
      out.set(dep.id, dep);
    }
  }

  return [...out.values()];
}
