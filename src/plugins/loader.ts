import { buildHost } from './host';
import type { DevSource } from './host';
import { API_VERSION } from './types';
import type { Host, PluginManifest, PluginModule } from './types';
import { i18n } from '../i18n';

const isTauri =
  typeof globalThis.window !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

const majorOf = (v: string): string => (v || '').split('.')[0] || '';

// Loaded plugins, kept so their contributions can be removed on unload/uninstall.
const loaded = new Map<string, Host>();

// Dev plugins loaded from the developer's chosen dev folder, tracked separately
// from installed ones so the in-app reload only touches dev plugins.
const devLoaded = new Set<string>();

/** Unregister everything a plugin contributed and forget it. */
export function unloadPlugin(id: string): void {
  loaded.get(id)?.dispose();
  loaded.delete(id);
}

/**
 * Load a plugin from its source text by importing it as an ES module via a
 * blob-URL (same-origin, sidesteps CSP/CORS of file/asset protocols). Exported
 * so the mechanism is testable in a plain browser, not only inside Tauri.
 */
export async function loadPluginFromSource(
  manifest: PluginManifest,
  src: string,
  dev?: DevSource,
): Promise<boolean> {
  if (majorOf(manifest.api_version) !== majorOf(API_VERSION)) {
    console.warn(
      `[plugin:${manifest.id}] api_version ${manifest.api_version} incompatible (host ${API_VERSION})`,
    );
    return false;
  }
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  try {
    const mod = (await import(/* @vite-ignore */ url)) as PluginModule;
    if (typeof mod.register !== 'function') {
      throw new TypeError('plugin has no register(host) export');
    }
    // Drop a prior load of the same id first, so reloads don't leak.
    loaded.get(manifest.id)?.dispose();
    const host = buildHost(manifest, dev);
    mod.register(host);
    loaded.set(manifest.id, host);
    return true;
  } catch (e) {
    console.error(`[plugin:${manifest.id}] load failed:`, e);
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load every plugin installed under <app-data>/plugins/. On desktop (Tauri) the
 * plugins are read via Tauri commands; on web they are fetched over HTTP from the
 * `-serve` host (GET /api/plugins + /api/plugins/<id>/<main>), so web clients get
 * the same plugins installed natively on the host machine. Async — the reactive
 * registries cover late arrival (the picker updates when packs land).
 */
export async function loadDiskPlugins(): Promise<void> {
  return isTauri ? loadDiskPluginsTauri() : loadDiskPluginsWeb();
}

/** Desktop: read plugin source through Tauri commands. */
async function loadDiskPluginsTauri(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const list = await invoke<{ id: string; manifest: PluginManifest }[]>('plugins_list');
    for (const { manifest } of list) {
      try {
        const src = await invoke<string>('plugin_read', {
          id: manifest.id,
          file: manifest.main || 'index.js',
        });
        await loadPluginFromSource(manifest, src);
      } catch (e) {
        console.error(`[plugin:${manifest.id}] read failed:`, e);
      }
    }
  } catch (e) {
    console.error('[plugins] loadDiskPlugins failed:', e);
  }
}

/**
 * Web: fetch the manifests and each plugin's entry module over HTTP. A missing
 * endpoint (older host / 404 / network error) means "no disk plugins" — never
 * throws, the core still runs with its bundled builtins.
 */
async function loadDiskPluginsWeb(): Promise<void> {
  let list: { id: string; manifest: PluginManifest }[];
  try {
    const res = await fetch('/api/plugins');
    if (!res.ok) return;
    list = (await res.json()) as { id: string; manifest: PluginManifest }[];
  } catch {
    return; // endpoint absent or unreachable -> no disk plugins.
  }
  if (!Array.isArray(list)) return;
  for (const { manifest } of list) {
    try {
      const res = await fetch(`/api/plugins/${manifest.id}/${manifest.main || 'index.js'}`);
      if (!res.ok) continue;
      const src = await res.text();
      await loadPluginFromSource(manifest, src);
    } catch (e) {
      console.error(`[plugin:${manifest.id}] fetch failed:`, e);
    }
  }
}

// localStorage keys mirrored from ui-store (read directly to avoid importing the
// store into the loader). Must stay in sync with ui-store.ts.
const DEV_DIR_KEY = 'pfd:devPluginsDir';
const DEV_DISABLED_KEY = 'pfd:devPluginsDisabled';

/** Read the persisted dev-plugins folder directly (avoids importing the store). */
function devPluginsDir(): string | null {
  try {
    const v = localStorage.getItem(DEV_DIR_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Read the persisted set of disabled dev-plugin ids directly. */
function devDisabledSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DEV_DISABLED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

type DevListEntry = { id: string; manifest: PluginManifest; base: string };

/** Discover the dev plugins under the chosen folder (desktop only; [] otherwise). */
async function fetchDevList(dir: string): Promise<DevListEntry[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DevListEntry[]>('dev_plugins_list', { dir });
}

/** Load one discovered dev plugin's code and register it; track it on success. */
async function loadOneDev(dir: string, entry: DevListEntry): Promise<boolean> {
  const { manifest, base } = entry;
  // Code path is relative to the dev dir: "<sub>/[dist/]<main>".
  const codePath = `${base}/${manifest.main || 'index.js'}`;
  const { invoke } = await import('@tauri-apps/api/core');
  const src = await invoke<string>('dev_plugin_read', { dir, rel: codePath });
  // Pass the dev source so host.assetUrl() reads assets from this folder
  // (over Tauri IPC) instead of the installed-plugin HTTP endpoint.
  const ok = await loadPluginFromSource(manifest, src, { dir, base });
  if (ok) devLoaded.add(manifest.id);
  return ok;
}

/**
 * Load built plugins DIRECTLY from the developer's chosen dev folder (desktop only;
 * no-op on web or when no dir is set). Each immediate subfolder that contains a built
 * plugin (dist/manifest.json preferred, else flat manifest.json) is loaded in place —
 * nothing is copied. Tracked in `devLoaded` so reload only touches dev plugins. Loads
 * AFTER installed plugins so a dev id can predictably override an installed one.
 */
export async function loadDevPlugins(): Promise<void> {
  if (!isTauri) return; // dev loading is desktop-only
  const dir = devPluginsDir();
  if (!dir) return; // no dev folder chosen
  const disabled = devDisabledSet();
  try {
    const list = await fetchDevList(dir);
    for (const entry of list) {
      if (disabled.has(entry.id)) continue; // developer-disabled: skip
      try {
        await loadOneDev(dir, entry);
      } catch (e) {
        console.error(`[plugin:${entry.id}] dev read failed:`, e);
      }
    }
  } catch (e) {
    console.error('[plugins] loadDevPlugins failed:', e);
  }
}

/**
 * The dev plugins detected under the chosen folder, for the Développeur UI list.
 * Desktop only — empty on web or when no dev folder is set. Never throws.
 */
export async function listDevPlugins(): Promise<{ id: string; name: string; version: string }[]> {
  if (!isTauri) return [];
  const dir = devPluginsDir();
  if (!dir) return [];
  try {
    const list = await fetchDevList(dir);
    return list.map((e) => ({
      id: e.id,
      name: e.manifest.name ?? e.id,
      version: e.manifest.version ?? '',
    }));
  } catch (e) {
    console.error('[plugins] listDevPlugins failed:', e);
    return [];
  }
}

/** The dev-plugin ids currently loaded (registered) — for the UI status. */
export function getDevLoadedIds(): string[] {
  return [...devLoaded];
}

/**
 * Reload a single dev plugin: unload it (if loaded), then load just that id from
 * the dev folder. Looks it up in dev_plugins_list and registers its current code.
 * No-op on web / when no dev folder is set / when the id isn't found.
 */
export async function reloadDevPlugin(id: string): Promise<boolean> {
  if (!isTauri) return false;
  const dir = devPluginsDir();
  if (!dir) return false;
  if (devLoaded.has(id)) {
    unloadPlugin(id);
    devLoaded.delete(id);
  }
  try {
    const list = await fetchDevList(dir);
    const entry = list.find((e) => e.id === id);
    if (!entry) return false;
    return await loadOneDev(dir, entry);
  } catch (e) {
    console.error(`[plugin:${id}] reload failed:`, e);
    return false;
  }
}

/**
 * Enable/disable a single dev plugin live. Enable -> (re)load it from the dev
 * folder; disable -> unload it and drop it from the loaded set. The caller owns
 * persisting the disabled set (ui-store.toggleDevPlugin).
 */
export async function setDevPluginEnabled(id: string, enabled: boolean): Promise<void> {
  if (enabled) {
    await reloadDevPlugin(id);
  } else if (devLoaded.has(id)) {
    unloadPlugin(id);
    devLoaded.delete(id);
  }
}

/**
 * Live-reload the dev plugins: unload every currently-loaded dev plugin, then load
 * the dev folder again. The reactive registries make the UI update without a restart.
 */
export async function reloadDevPlugins(): Promise<void> {
  for (const id of devLoaded) unloadPlugin(id);
  devLoaded.clear();
  await loadDevPlugins();
}

// ── Automatic hot-reload watcher ───────────────────────────────────────────────
// Polls dev_plugins_fingerprint each tick; reloads any ENABLED dev plugin whose
// built code file changed. The developer never clicks reload during normal dev.

const WATCH_INTERVAL_MS = 1500;
// Last observed code-file signature per dev plugin id. Seeded on the FIRST tick
// without reloading (boot already loaded them), so only later changes trigger.
const lastSig = new Map<string, string>();
let watchTimer: ReturnType<typeof setInterval> | null = null;
let watchSeeded = false;
// Guard against overlapping ticks: skip a tick while a reload is still in flight.
let watchBusy = false;

/** Apply one fingerprint: record its sig and reload the plugin if it changed. */
async function applyDevFingerprint(
  id: string,
  sig: string,
  disabled: Set<string>,
): Promise<void> {
  const prev = lastSig.get(id);
  lastSig.set(id, sig);
  if (!watchSeeded) return; // first observation: seed only, never reload
  if (disabled.has(id)) return; // disabled plugins aren't hot-reloaded
  if (prev === undefined) {
    // A newly-appeared enabled plugin -> load it.
    await reloadDevPlugin(id);
    console.log(`[plugins] dev plugin ${id} apparu — chargé`);
    showToastSafe(i18n.t('loader.pluginLoaded', { id }));
  } else if (prev !== sig) {
    // Built code changed -> reload just this one.
    await reloadDevPlugin(id);
    console.log(`[plugins] dev plugin ${id} rechargé (changement détecté)`);
    showToastSafe(i18n.t('loader.pluginReloaded', { id }));
  }
}

/** Unload any tracked dev plugin no longer present and forget stale signatures. */
function pruneVanishedDevPlugins(seen: Set<string>): void {
  // A loaded dev plugin that vanished from the list -> unload it.
  for (const id of [...devLoaded]) {
    if (!seen.has(id)) {
      unloadPlugin(id);
      devLoaded.delete(id);
      lastSig.delete(id);
      console.log(`[plugins] dev plugin ${id} disparu — déchargé`);
    }
  }
  // Drop signatures for ids no longer present so a re-add re-seeds cleanly.
  for (const id of [...lastSig.keys()]) if (!seen.has(id)) lastSig.delete(id);
}

async function watchTick(): Promise<void> {
  if (watchBusy) return; // a previous tick's reload is still running
  const dir = devPluginsDir();
  if (!dir) {
    // No dev folder (cleared at runtime): forget seeded state so re-pick re-seeds.
    lastSig.clear();
    watchSeeded = false;
    return;
  }
  watchBusy = true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const fps = await invoke<{ id: string; sig: string }[]>('dev_plugins_fingerprint', { dir });
    const disabled = devDisabledSet(); // read live so toggles take effect at once
    const seen = new Set<string>();

    for (const { id, sig } of fps) {
      seen.add(id);
      await applyDevFingerprint(id, sig, disabled);
    }

    pruneVanishedDevPlugins(seen);

    watchSeeded = true; // subsequent ticks compare against the seeded sigs
  } catch (e) {
    console.error('[plugins] dev watch tick failed:', e);
  } finally {
    watchBusy = false;
  }
}

/** Show a toast without importing the store at module top (avoids a cycle). */
function showToastSafe(msg: string): void {
  void import('../ui-store').then((m) => m.useUiStore.getState().showToast(msg)).catch(() => {});
}

/**
 * Start the dev hot-reload watcher (desktop only; self-noops on web). Idempotent —
 * a second call is ignored. Reads the dev dir + disabled set live each tick, so it
 * adapts to the developer changing the folder or toggling plugins at runtime.
 */
export function startDevWatch(): void {
  if (!isTauri) return; // desktop-only
  if (watchTimer) return; // already running
  watchTimer = setInterval(() => void watchTick(), WATCH_INTERVAL_MS);
}

/** Stop the dev hot-reload watcher and reset its seed state. */
export function stopDevWatch(): void {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
  lastSig.clear();
  watchSeeded = false;
}
