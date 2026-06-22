import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useFlowStore } from '../store';
import { useUiStore } from '../ui-store';
import * as registries from '../plugins/registries';
import { useRegistryVersion } from '../plugins/useRegistry';
import { isDesktop, installPlugin } from '../plugins/manage';
import { fetchRegistry, type RegistryEntry } from '../plugins/remoteRegistry';
import type { DiagramPluginDep } from '../types';
import './UpdateBanner.css';

/** Spec 10bis: warn when the open diagram declares plugins that aren't present.
 *  Data is already safe (UnknownNode); this is just the proactive fix prompt.
 *  Reacts to filePlugins (open another doc) and pluginManifests (after reload). */
export function MissingPluginsBanner() {
  const { t } = useTranslation();
  const filePlugins = useFlowStore((s) => s.filePlugins);
  // Don't evaluate until the first disk-plugin load attempt has resolved, else
  // the banner flashes a false "missing" before plugins finish registering.
  const pluginsLoaded = useUiStore((s) => s.pluginsLoaded);
  // Re-evaluate the missing set whenever a plugin (un)registers.
  useRegistryVersion(registries.pluginManifests);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const missing: DiagramPluginDep[] = filePlugins.filter(
    (p) => !registries.pluginManifests.get(p.id),
  );
  // A different diagram (different missing set) re-arms a dismissed banner.
  const missingKey = missing
    .map((d) => d.id)
    .sort((a, b) => a.localeCompare(b))
    .join(',');
  useEffect(() => {
    setDismissed(false);
  }, [missingKey]);

  if (!pluginsLoaded || missing.length === 0 || dismissed) return null;

  const names = missing.map((d) => d.name || d.id).join(', ');

  const onInstall = async (dep: DiagramPluginDep) => {
    setBusy(dep.id);
    try {
      const entries = await fetchRegistry();
      const entry = entries.find((e: RegistryEntry) => e.id === dep.id);
      if (!entry) {
        useUiStore.getState().showToast(t('banner.pluginNotInCatalog'));
        return;
      }
      await installPlugin(entry);
      useUiStore.getState().setPluginsDirty(true);
      useUiStore.getState().showToast(t('banner.pluginInstalled', { name: entry.name }));
      // User acted — hide this banner; PluginsReloadBanner now drives the reload.
      setDismissed(true);
    } catch (e) {
      useUiStore.getState().showToast(t('banner.installFailed', { error: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  // Desktop only: a single missing dep can be installed in place.
  const installable = isDesktop && missing.length === 1 ? missing[0] : null;

  return (
    <output className="update-banner update-banner-warn">
      <span className="update-banner-dot">
        <Icon icon="mdi:puzzle-remove-outline" width={14} height={14} />
      </span>
      <span className="update-banner-text">
        {t('banner.missingPlugins', { names })}
      </span>
      {installable && (
        <button
          type="button"
          className="btn btn-primary update-banner-action"
          disabled={busy === installable.id}
          onClick={() => void onInstall(installable)}
        >
          {busy === installable.id ? '…' : t('banner.install')}
        </button>
      )}
      <button
        type="button"
        className="btn update-banner-action"
        onClick={() => useUiStore.getState().openSettings('plugins')}
      >
        {t('banner.managePlugins')}
      </button>
      <button
        type="button"
        className="update-banner-close"
        aria-label={t('banner.dismiss')}
        onClick={() => setDismissed(true)}
      >
        <Icon icon="mdi:close" width={15} height={15} />
      </button>
    </output>
  );
}
