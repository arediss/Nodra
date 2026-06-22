import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { fetchRegistry, registryUrl, type RegistryEntry } from '../plugins/remoteRegistry';
import {
  listInstalled,
  installPlugin,
  removePlugin,
  isDesktop,
  type InstalledPlugin,
} from '../plugins/manage';
import { useUiStore } from '../ui-store';
import { useTranslation, Trans } from 'react-i18next';
import './PluginsPanel.css';

type Row = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  permissions?: string[];
  entry?: RegistryEntry; // present if in the registry
  installed?: string; // installed version, if installed
};

/** Is `a` a strictly newer semver than `b`? Unparseable parts count as 0. */
function semverGt(a: string, b: string): boolean {
  const parse = (v: string) =>
    v.trim().replace(/^v/, '').split('+')[0].split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

function mergeRows(entries: RegistryEntry[], installed: InstalledPlugin[]): Row[] {
  const byId = new Map<string, Row>();
  for (const e of entries) {
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      version: e.version,
      description: e.description,
      author: e.author,
      permissions: e.permissions,
      entry: e,
    });
  }
  for (const p of installed) {
    const m = p.manifest;
    const row = byId.get(p.id);
    if (row) row.installed = m.version;
    else
      byId.set(p.id, {
        id: p.id,
        name: m.name ?? p.id,
        version: m.version,
        description: m.description,
        author: m.author,
        permissions: m.permissions,
        installed: m.version,
      });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function PluginsPanel() {
  const { t } = useTranslation();
  const showToast = useUiStore((s) => s.showToast);
  const setPluginsDirty = useUiStore((s) => s.setPluginsDirty);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const reqId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++reqId.current;
    setStatus('loading');
    const [reg, inst] = await Promise.allSettled([fetchRegistry(), listInstalled()]);
    if (id !== reqId.current) return; // a newer refresh superseded this one
    const entries = reg.status === 'fulfilled' ? reg.value : [];
    const installed = inst.status === 'fulfilled' ? inst.value : [];
    setRows(mergeRows(entries, installed));
    setStatus(reg.status === 'rejected' && entries.length === 0 ? 'error' : 'ready');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onInstall = async (row: Row) => {
    if (!row.entry) return;
    setBusy(row.id);
    try {
      await installPlugin(row.entry);
      setPluginsDirty(true);
      showToast(t('pluginspanel.installedToast', { name: row.name }));
      await refresh();
    } catch (e) {
      showToast(t('pluginspanel.failed', { message: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async (row: Row) => {
    setBusy(row.id);
    try {
      await removePlugin(row.id);
      setPluginsDirty(true);
      showToast(t('pluginspanel.removedToast', { name: row.name }));
      await refresh();
    } catch (e) {
      showToast(t('pluginspanel.failed', { message: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {!isDesktop && (
        <p className="muted set-p plug-webnote">
          <Icon icon="mdi:information-outline" width={14} height={14} /> {t('pluginspanel.webNote')}
        </p>
      )}

      <section className="set-card">
        <div className="set-card-title">
          {t('pluginspanel.catalogTitle')}
          <button
            type="button"
            className="btn-icon plug-refresh"
            title={t('pluginspanel.refresh')}
            aria-label={t('pluginspanel.refresh')}
            onClick={() => void refresh()}
          >
            <Icon icon="mdi:refresh" width={15} height={15} />
          </button>
        </div>
        <div className="set-card-body">
          {status === 'loading' && <p className="muted">{t('pluginspanel.loadingCatalog')}</p>}
          {status === 'error' && (
            <p className="muted">
              <Trans
                i18nKey="pluginspanel.catalogUnreachable"
                values={{ url: registryUrl() }}
                components={{ c: <code /> }}
              />
            </p>
          )}
          {status === 'ready' && rows.length === 0 && (
            <p className="muted">{t('pluginspanel.empty')}</p>
          )}

          <div className="plug-list">
            {rows.map((row) => {
              const updatable =
                !!row.entry && !!row.installed && semverGt(row.entry.version, row.installed);
              const isBusy = busy === row.id;
              return (
                <div className="plug-row" key={row.id}>
                  <div className="plug-info">
                    <div className="plug-head">
                      <span className="plug-name">{row.name}</span>
                      <span className="plug-version">v{row.installed ?? row.version}</span>
                      {row.installed && (
                        <span className="plug-badge" data-on>
                          {t('pluginspanel.installedBadge')}
                        </span>
                      )}
                    </div>
                    {row.description && <div className="plug-desc">{row.description}</div>}
                    <div className="plug-meta">
                      {row.author && <span className="plug-author">{row.author}</span>}
                      {(row.permissions ?? []).map((p) => (
                        <span className="plug-perm" key={p}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="plug-actions">
                    {updatable && (
                      <button
                        type="button"
                        className="btn btn-primary plug-btn"
                        disabled={!isDesktop || isBusy}
                        onClick={() => void onInstall(row)}
                      >
                        {isBusy ? '…' : t('pluginspanel.update', { version: row.entry!.version })}
                      </button>
                    )}
                    {!row.installed && row.entry && (
                      <button
                        type="button"
                        className="btn btn-primary plug-btn"
                        disabled={!isDesktop || isBusy}
                        onClick={() => void onInstall(row)}
                      >
                        {isBusy ? '…' : t('pluginspanel.install')}
                      </button>
                    )}
                    {row.installed && (
                      <button
                        type="button"
                        className="btn btn-danger plug-btn"
                        disabled={!isDesktop || isBusy}
                        onClick={() => void onRemove(row)}
                      >
                        {isBusy ? '…' : t('pluginspanel.uninstall')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
