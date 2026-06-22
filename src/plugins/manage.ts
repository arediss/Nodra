import { loadPluginFromSource, unloadPlugin } from './loader';
import { i18n } from '../i18n';
import type { PluginManifest } from './types';
import type { RegistryEntry } from './remoteRegistry';

export type InstalledPlugin = { id: string; manifest: PluginManifest };

export const isDesktop =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Installed plugins on disk (desktop only; empty on web). */
export async function listInstalled(): Promise<InstalledPlugin[]> {
  if (!isDesktop) return [];
  try {
    return await invoke<InstalledPlugin[]>('plugins_list');
  } catch {
    return [];
  }
}

/** Download + verify + install a registry plugin, then load it live. */
export async function installPlugin(entry: RegistryEntry): Promise<void> {
  if (!isDesktop) throw new Error(i18n.t('manage.installDesktopOnly'));
  const installed = await invoke<InstalledPlugin>('plugin_install', {
    url: entry.download_url,
    sha256: entry.sha256,
    expectedId: entry.id,
  });
  const src = await invoke<string>('plugin_read', {
    id: installed.id,
    file: installed.manifest.main || 'index.js',
  });
  const ok = await loadPluginFromSource(installed.manifest, src);
  if (!ok) {
    // Don't leave an inert plugin on disk reported as "installed".
    await invoke<void>('plugin_remove', { id: installed.id }).catch(() => {});
    throw new Error(i18n.t('manage.installInvalid'));
  }
}

/** Install a plugin from a local plugin.zip path (developer / no-registry path). */
export async function installPluginFromFile(path: string): Promise<InstalledPlugin> {
  if (!isDesktop) throw new Error(i18n.t('manage.installLocalDesktopOnly'));
  return invoke<InstalledPlugin>('plugin_install_file', { path });
}

/** Pick a single .zip via the native dialog and install it. Returns null if cancelled. */
export async function pickAndInstallPlugin(): Promise<InstalledPlugin | null> {
  if (!isDesktop) throw new Error(i18n.t('manage.installLocalDesktopOnly'));
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Plugin', extensions: ['zip'] }],
  });
  if (typeof picked !== 'string') return null; // cancelled
  // Caller sets pluginsDirty after a successful install.
  return installPluginFromFile(picked);
}

/** Pick a dev-plugins FOLDER via the native dialog. Returns the path, or null if cancelled. */
export async function pickDevPluginsDir(): Promise<string | null> {
  if (!isDesktop) throw new Error(i18n.t('manage.devDirDesktopOnly'));
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ multiple: false, directory: true });
  return typeof picked === 'string' ? picked : null; // null = cancelled
}

/** Unload (remove its contributions) then delete from disk. */
export async function removePlugin(id: string): Promise<void> {
  if (!isDesktop) throw new Error(i18n.t('manage.uninstallDesktopOnly'));
  unloadPlugin(id);
  await invoke<void>('plugin_remove', { id });
}
