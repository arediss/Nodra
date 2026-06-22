import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useUiStore } from '../ui-store';
import './UpdateBanner.css';

/** Shown once plugins were installed/removed this session: they only load at
 *  startup, so prompt a reload to activate the change. Dismissible. */
export function PluginsReloadBanner() {
  const { t } = useTranslation();
  const dirty = useUiStore((s) => s.pluginsDirty);
  const [dismissed, setDismissed] = useState(false);

  if (!dirty || dismissed) return null;

  return (
    <output className="update-banner">
      <span className="update-banner-dot">
        <Icon icon="mdi:restart" width={14} height={14} />
      </span>
      <span className="update-banner-text">
        {t('banner.pluginsChanged')}
      </span>
      <button
        type="button"
        className="btn btn-primary update-banner-action"
        onClick={() => globalThis.location.reload()}
      >
        {t('banner.reload')}
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
