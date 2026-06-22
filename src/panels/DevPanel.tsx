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
import { useTranslation, Trans } from 'react-i18next';
import './PluginsPanel.css';

type DevRow = { id: string; name: string; version: string };

/**
 * The Développeur tab (desktop only): pick a dev folder, see the detected built
 * plugins with per-plugin enable/disable + live status, plus the local .zip install
 * fallback. Automatic hot-reload runs in the background (see loader startDevWatch).
 */
export function DevPanel() {
  const { t } = useTranslation();
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
      showToast(t('dev.dirSetToast'));
      await refresh();
    } catch (e) {
      showToast(t('dev.failed', { message: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  // Manual fallback (automatic hot-reload normally handles this): reload all dev plugins.
  const onReloadDev = async () => {
    setBusy('__devreload__');
    try {
      await reloadDevPlugins();
      showToast(t('dev.reloadedToast'));
      await refresh();
    } catch (e) {
      showToast(t('dev.failed', { message: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  // Per-plugin enable/disable: flip the persisted set, then load/unload live.
  const onToggle = async (row: DevRow, nowEnabled: boolean) => {
    toggleDevPlugin(row.id);
    try {
      await setDevPluginEnabled(row.id, nowEnabled);
      showToast(
        nowEnabled
          ? t('dev.enabledToast', { name: row.name })
          : t('dev.disabledToast', { name: row.name }),
      );
    } catch (e) {
      showToast(t('dev.failed', { message: (e as Error).message }));
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
      showToast(t('dev.installedToast', { name }));
    } catch (e) {
      showToast(t('dev.failed', { message: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  if (!isDesktop) {
    return (
      <p className="muted set-p plug-webnote">
        <Icon icon="mdi:information-outline" width={14} height={14} /> {t('dev.desktopOnly')}
      </p>
    );
  }

  return (
    <>
      {/* Dev folder: load built plugins directly, with automatic hot-reload. */}
      <section className="set-card">
        <div className="set-card-title">{t('dev.dirTitle')}</div>
        <div className="set-card-body">
          <p className="muted set-p">
            <Trans
              i18nKey="dev.dirBody"
              values={{ dir: devPluginsDir ?? t('dev.noDir') }}
              components={{ s: <strong />, c: <code /> }}
            />
          </p>
          <div className="plug-dev-actions">
            <button
              type="button"
              className="btn btn-primary plug-btn"
              disabled={busy === '__devdir__'}
              onClick={() => void onPickDevDir()}
            >
              {busy === '__devdir__' ? '…' : t('dev.pickDir')}
            </button>
            <button
              type="button"
              className="btn plug-btn"
              disabled={!devPluginsDir || busy === '__devreload__'}
              onClick={() => void onReloadDev()}
            >
              {busy === '__devreload__' ? '…' : t('dev.reloadManual')}
            </button>
          </div>
          {devPluginsDir && (
            <p className="muted set-p plug-hotreload">
              <Icon icon="mdi:autorenew" width={14} height={14} />{' '}
              <Trans i18nKey="dev.hotReload" components={{ c: <code /> }} />
            </p>
          )}
          <p className="muted set-p">
            <Trans i18nKey="dev.buildContinuous" components={{ c: <code /> }} />
          </p>
        </div>
      </section>

      {/* Detected dev plugins: per-plugin enable/disable + live status. */}
      <section className="set-card">
        <div className="set-card-title">
          {t('dev.detectedTitle')}
          <button
            type="button"
            className="btn-icon plug-refresh"
            title={t('dev.refresh')}
            aria-label={t('dev.refresh')}
            onClick={() => void refresh()}
          >
            <Icon icon="mdi:refresh" width={15} height={15} />
          </button>
        </div>
        <div className="set-card-body">
          {!devPluginsDir && (
            <p className="muted set-p">{t('dev.pickDirFirst')}</p>
          )}
          {devPluginsDir && rows.length === 0 && (
            <p className="muted set-p">
              <Trans i18nKey="dev.noneDetected" components={{ c: <code /> }} />
            </p>
          )}
          {rows.map((row) => {
            const enabled = !devDisabled.includes(row.id);
            const isLoaded = loadedIds.includes(row.id);
            const stateLabel = enabled
              ? isLoaded
                ? t('dev.stateLoaded')
                : t('dev.statePending')
              : t('dev.stateDisabled');
            return (
              <label className="switch-row" key={row.id}>
                <span className="switch-label">
                  {row.name} {row.version && <span className="plug-version">v{row.version}</span>}
                  <span className="switch-sub">
                    <code>{row.id}</code> — {stateLabel}
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
        <div className="set-card-title">{t('dev.installFileTitle')}</div>
        <div className="set-card-body">
          <p className="muted set-p">
            <Trans i18nKey="dev.installFileBody" components={{ c: <code /> }} />
          </p>
          <button
            type="button"
            className="btn btn-primary plug-btn"
            disabled={busy === '__file__'}
            onClick={() => void onInstallFile()}
          >
            {busy === '__file__' ? '…' : t('dev.installFileBtn')}
          </button>
        </div>
      </section>
    </>
  );
}
