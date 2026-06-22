import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { pickAndInstallPlugin, pickDevPluginsDir, isDesktop } from '../plugins/manage';
import {
  loadDevPlugins,
  reloadDevPlugins,
  listDevPlugins,
  getDevLoadedIds,
  setDevPluginEnabled,
} from '../plugins/loader';
import { useUiStore } from '../ui-store';
import './PluginsPanel.css';

type DevRow = { id: string; name: string; version: string };

/**
 * The Développeur tab (desktop only): pick a dev folder, see the detected built
 * plugins with per-plugin enable/disable + live status, plus the local .zip install
 * fallback. Automatic hot-reload runs in the background (see loader startDevWatch).
 */
export function DevPanel() {
  const showToast = useUiStore((s) => s.showToast);
  const setPluginsDirty = useUiStore((s) => s.setPluginsDirty);
  const devPluginsDir = useUiStore((s) => s.devPluginsDir);
  const setDevPluginsDir = useUiStore((s) => s.setDevPluginsDir);
  const devDisabled = useUiStore((s) => s.devDisabled);
  const toggleDevPlugin = useUiStore((s) => s.toggleDevPlugin);
  const [rows, setRows] = useState<DevRow[]>([]);
  // Loaded ids snapshot (the loader's Set isn't reactive — refresh it explicitly).
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const reqId = useRef(0);

  // Re-read the detected dev plugins + currently-loaded ids.
  const refresh = useCallback(async () => {
    const id = ++reqId.current;
    const list = await listDevPlugins();
    if (id !== reqId.current) return; // superseded
    setRows(list);
    setLoadedIds(getDevLoadedIds());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, devPluginsDir]);

  // Dev loop: choose a dev folder; plugins load DIRECTLY from there (no copy, no reload).
  const onPickDevDir = async () => {
    setBusy('__devdir__');
    try {
      const dir = await pickDevPluginsDir();
      if (!dir) return; // cancelled
      setDevPluginsDir(dir);
      await loadDevPlugins();
      showToast('Dossier de dev défini — plugins chargés');
      await refresh();
    } catch (e) {
      showToast(`Échec : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // Manual fallback (automatic hot-reload normally handles this): reload all dev plugins.
  const onReloadDev = async () => {
    setBusy('__devreload__');
    try {
      await reloadDevPlugins();
      showToast('Plugins de dev rechargés');
      await refresh();
    } catch (e) {
      showToast(`Échec : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // Per-plugin enable/disable: flip the persisted set, then load/unload live.
  const onToggle = async (row: DevRow, nowEnabled: boolean) => {
    toggleDevPlugin(row.id);
    try {
      await setDevPluginEnabled(row.id, nowEnabled);
      showToast(`${row.name} ${nowEnabled ? 'activé' : 'désactivé'}`);
    } catch (e) {
      showToast(`Échec : ${(e as Error).message}`);
    } finally {
      await refresh();
    }
  };

  // Developer path: install a local plugin.zip the user picked on disk.
  const onInstallFile = async () => {
    setBusy('__file__');
    try {
      const installed = await pickAndInstallPlugin();
      if (!installed) return; // cancelled
      setPluginsDirty(true);
      const name = installed.manifest.name ?? installed.id;
      showToast(`${name} installé — recharge pour activer`);
    } catch (e) {
      showToast(`Échec : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  if (!isDesktop) {
    return (
      <p className="muted set-p plug-webnote">
        <Icon icon="mdi:information-outline" width={14} height={14} /> Le mode développeur
        nécessite l'app bureau (Tauri).
      </p>
    );
  }

  return (
    <>
      {/* Dev folder: load built plugins directly, with automatic hot-reload. */}
      <section className="set-card">
        <div className="set-card-title">Dossier de dev</div>
        <div className="set-card-body">
          <p className="muted set-p">
            Boucle de dev rapide : charge les plugins <strong>construits</strong> directement
            depuis un dossier (sans copie). Dossier actuel :{' '}
            <code>{devPluginsDir ?? 'Aucun dossier de dev défini'}</code>.
          </p>
          <div className="plug-dev-actions">
            <button
              type="button"
              className="btn btn-primary plug-btn"
              disabled={busy === '__devdir__'}
              onClick={() => void onPickDevDir()}
            >
              {busy === '__devdir__' ? '…' : 'Choisir le dossier de dev'}
            </button>
            <button
              type="button"
              className="btn plug-btn"
              disabled={!devPluginsDir || busy === '__devreload__'}
              onClick={() => void onReloadDev()}
            >
              {busy === '__devreload__' ? '…' : 'Recharger (manuel)'}
            </button>
          </div>
          {devPluginsDir && (
            <p className="muted set-p plug-hotreload">
              <Icon icon="mdi:autorenew" width={14} height={14} /> Hot-reload actif — chaque{' '}
              <code>dist/</code> reconstruit est rechargé automatiquement. Le bouton «&nbsp;Recharger
              (manuel)&nbsp;» reste un secours.
            </p>
          )}
          <p className="muted set-p">
            Construis en continu avec{' '}
            <code>npm run build:plugin -- plugins/&lt;name&gt; --watch</code>.
          </p>
        </div>
      </section>

      {/* Detected dev plugins: per-plugin enable/disable + live status. */}
      <section className="set-card">
        <div className="set-card-title">
          Plugins détectés
          <button
            type="button"
            className="btn-icon plug-refresh"
            title="Rafraîchir"
            aria-label="Rafraîchir"
            onClick={() => void refresh()}
          >
            <Icon icon="mdi:refresh" width={15} height={15} />
          </button>
        </div>
        <div className="set-card-body">
          {!devPluginsDir && (
            <p className="muted set-p">Choisis d'abord un dossier de dev ci-dessus.</p>
          )}
          {devPluginsDir && rows.length === 0 && (
            <p className="muted set-p">
              Aucun plugin construit détecté. Lance <code>npm run build:plugin</code> pour produire
              un <code>dist/</code>.
            </p>
          )}
          {rows.map((row) => {
            const enabled = !devDisabled.includes(row.id);
            const isLoaded = loadedIds.includes(row.id);
            return (
              <label className="switch-row" key={row.id}>
                <span className="switch-label">
                  {row.name} {row.version && <span className="plug-version">v{row.version}</span>}
                  <span className="switch-sub">
                    <code>{row.id}</code> — {enabled ? (isLoaded ? 'chargé' : 'en attente') : 'désactivé'}
                  </span>
                </span>
                <div className="switch" data-on={enabled ? 'true' : undefined}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => void onToggle(row, e.target.checked)}
                  />
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Local .zip install: test the final artifact without the registry. */}
      <section className="set-card">
        <div className="set-card-title">Installer depuis un fichier</div>
        <div className="set-card-body">
          <p className="muted set-p">
            Teste l'artefact final : choisis le <code>plugin.zip</code> produit par{' '}
            <code>npm run build:plugin</code>.
          </p>
          <button
            type="button"
            className="btn btn-primary plug-btn"
            disabled={busy === '__file__'}
            onClick={() => void onInstallFile()}
          >
            {busy === '__file__' ? '…' : 'Installer depuis un fichier (.zip)'}
          </button>
        </div>
      </section>
    </>
  );
}
