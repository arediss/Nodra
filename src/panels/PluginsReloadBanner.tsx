import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useUiStore } from '../ui-store';
import './UpdateBanner.css';

/** Shown once plugins were installed/removed this session: they only load at
 *  startup, so prompt a reload to activate the change. Dismissible. */
export function PluginsReloadBanner() {
  const dirty = useUiStore((s) => s.pluginsDirty);
  const [dismissed, setDismissed] = useState(false);

  if (!dirty || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-dot">
        <Icon icon="mdi:restart" width={14} height={14} />
      </span>
      <span className="update-banner-text">
        Plugins modifiés — redémarre pour les activer
      </span>
      <button
        type="button"
        className="btn btn-primary update-banner-action"
        onClick={() => window.location.reload()}
      >
        Recharger
      </button>
      <button
        type="button"
        className="update-banner-close"
        aria-label="Ignorer"
        onClick={() => setDismissed(true)}
      >
        <Icon icon="mdi:close" width={15} height={15} />
      </button>
    </div>
  );
}
