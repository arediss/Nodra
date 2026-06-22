import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useFlowStore } from '../store';
import { useComponentsStore } from '../components-store';
import './UpdateBanner.css';

type CompData = { componentId?: string; componentVersion?: number };

export function UpdateBanner() {
  const { t } = useTranslation();
  const nodes = useFlowStore((s) => s.nodes);
  const defs = useComponentsStore((s) => s.defs);
  const [dismissed, setDismissed] = useState(false);

  const byId = new Map(defs.map((d) => [d.id, d] as const));

  const count = nodes.reduce((acc, n) => {
    if (n.type !== 'group') return acc;
    const data = n.data as CompData | undefined;
    if (!data || !data.componentId) return acc;
    const def = byId.get(data.componentId);
    if (!def) return acc;
    return def.version > (data.componentVersion ?? 0) ? acc + 1 : acc;
  }, 0);

  if (count === 0 || dismissed) return null;

  const label = t('update.outdatedBlocks', { count });

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-dot">
        <Icon icon="mdi:sync" width={14} height={14} />
      </span>
      <span className="update-banner-text">{label}</span>
      <button
        type="button"
        className="btn btn-primary update-banner-action"
        onClick={() => useComponentsStore.getState().updateAllInstances()}
      >
        {t('update.action')}
      </button>
      <button
        type="button"
        className="update-banner-close"
        aria-label={t('update.dismiss')}
        onClick={() => setDismissed(true)}
      >
        <Icon icon="mdi:close" width={15} height={15} />
      </button>
    </div>
  );
}
