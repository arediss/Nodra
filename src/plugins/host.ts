import * as reg from './registries';
import { API_VERSION } from './types';
import type { Host, PluginManifest, Permission } from './types';
import { searchIcons, getCatalog } from '../icons/catalog';
import { flowBridge } from './flowBridge';
import { useUiStore } from '../ui-store';
import { newId } from '../store';

/**
 * Build the capability-gated SDK handed to a plugin's `register(host)`.
 * V1 trust model (like SimplyTerm): permissions gate the host API for ergonomics
 * and clarity — they are NOT a security sandbox. A loaded plugin runs with full
 * app-level access; hard isolation is a later brick.
 */
/**
 * Where a dev plugin's files live: the developer-chosen `dir` and the plugin's
 * `base` subfolder RELATIVE to it (e.g. "myplugin/dist"). Passed to `buildHost`
 * for plugins loaded directly from the dev folder so `assetUrl()` can read their
 * assets over Tauri IPC instead of the installed-plugin HTTP endpoint.
 */
export type DevSource = { dir: string; base: string };

export function buildHost(manifest: PluginManifest, dev?: DevSource): Host {
  const cleanups: Array<() => void> = [];
  // Object URLs minted for dev-plugin assets, revoked on dispose() to avoid leaks.
  const assetUrls: string[] = [];
  // A disk manifest is untrusted JSON — tolerate a missing/non-array permissions.
  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const can = (p: Permission) => perms.includes(p);
  // Warn once per missing permission — a plugin polling a gated read must not
  // flood the console.
  const warned = new Set<Permission>();
  const deny = (p: Permission) => {
    if (warned.has(p)) return;
    warned.add(p);
    console.warn(`[plugin:${manifest.id}] permission "${p}" requise`);
  };

  // Register through `r` only if the plugin holds permission `p`.
  const gated =
    <A extends unknown[]>(p: Permission, r: (...a: A) => () => void) =>
    (...a: A) => {
      if (!can(p)) return deny(p);
      cleanups.push(r(...a));
    };

  // Tag every contribution with this plugin's id so diagrams can derive deps.
  const src = { source: manifest.id };

  // Record the manifest so a diagram can resolve this id to a name/version.
  cleanups.push(
    reg.pluginManifests.register(
      manifest.id,
      { id: manifest.id, name: manifest.name, version: manifest.version },
      src,
    ),
  );

  return {
    api_version: API_VERSION,
    manifest,
    blocks: {
      register: (pack) => {
        if (!can('blocks')) return deny('blocks');
        for (const e of pack) cleanups.push(reg.blocks.register(e.id, e, src));
      },
      // Read is harmless — no permission gate (importers need it to resolve icons).
      search: (query, provider) => searchIcons(query, provider),
      all: () => getCatalog(),
    },
    nodeTypes: { register: gated('node-types', (t, c) => reg.nodeTypes.register(t, c, src)) },
    importers: { register: gated('importers', (d) => reg.importers.register(d.id, d, src)) },
    exporters: { register: gated('exporters', (d) => reg.exporters.register(d.id, d, src)) },
    panels: { register: gated('panels', (d) => reg.panels.register(d.id, d, src)) },
    commands: { register: gated('commands', (d) => reg.commands.register(d.id, d, src)) },
    flow: {
      getNodes: () => (can('flow-read') ? flowBridge.getNodes() : (deny('flow-read'), [])),
      getEdges: () => (can('flow-read') ? flowBridge.getEdges() : (deny('flow-read'), [])),
      getSelection: () =>
        can('flow-read')
          ? flowBridge.getSelection()
          : (deny('flow-read'), { nodeId: null, edgeId: null }),
      toDiagram: () =>
        can('flow-read')
          ? flowBridge.toDiagram()
          : (deny('flow-read'), { version: 1, name: '', nodes: [], edges: [] }),
      fitView: (options) => {
        if (!can('flow-read')) return deny('flow-read');
        flowBridge.fitView(options);
      },
      subscribe: (listener) => {
        if (!can('flow-read')) {
          deny('flow-read');
          return () => {};
        }
        const un = flowBridge.subscribe(listener);
        // Self-dequeue so an early manual unsubscribe and dispose() don't both
        // fire it (and the plugin can't hold a stale cleanup).
        const wrapped = () => {
          un();
          const i = cleanups.indexOf(wrapped);
          if (i >= 0) cleanups.splice(i, 1);
        };
        cleanups.push(wrapped);
        return wrapped;
      },
      setNodes: (nodes) => {
        if (!can('flow-write')) return deny('flow-write');
        flowBridge.setNodes(nodes);
      },
      setEdges: (edges) => {
        if (!can('flow-write')) return deny('flow-write');
        flowBridge.setEdges(edges);
      },
      loadDiagram: (file) => {
        if (!can('flow-write')) return deny('flow-write');
        flowBridge.loadDiagram(file);
      },
      selectEdge: (id) => {
        if (!can('flow-write')) return deny('flow-write');
        flowBridge.selectEdge(id);
      },
    },
    ui: {
      openPanel: (id) => useUiStore.getState().openPanel(id),
      closePanel: () => useUiStore.getState().closePanel(),
      showToast: (m) => useUiStore.getState().showToast(m),
    },
    utils: { newId },
    // Resolve a plugin-relative asset path to a fetchable URL. Strip any traversal
    // from the relative path first (defense in depth; the Rust readers re-check).
    assetUrl: (rel) => {
      const clean = String(rel).replace(/^[/\\]+/, '').replace(/\.\.[/\\]?/g, '');
      if (!dev) {
        // Installed plugin: served from disk under /api/plugins/<id>/ (web) — the
        // same path the desktop loader maps. Synchronous string URL.
        return `/api/plugins/${manifest.id}/${clean}`;
      }
      // Dev plugin: loaded in place from the dev folder with no HTTP endpoint.
      // Read its bytes over Tauri IPC and mint an object URL (revoked on dispose).
      return (async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const bytes = await invoke<number[]>('dev_plugin_read_bytes', {
          dir: dev.dir,
          rel: `${dev.base}/${clean}`,
        });
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
        assetUrls.push(url);
        return url;
      })();
    },
    log: (...args) => console.log(`[plugin:${manifest.id}]`, ...args),
    dispose: () => {
      for (const c of cleanups) c();
      cleanups.length = 0;
      for (const u of assetUrls) URL.revokeObjectURL(u);
      assetUrls.length = 0;
    },
  };
}
