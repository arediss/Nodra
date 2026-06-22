import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useAppUpdate } from '../lib/app-update';
import './UpdateBanner.css';

/**
 * Top banner for APPLICATION updates (distinct from the component-bloc UpdateBanner).
 * Surfaces only once the updater has found a newer release; reuses the shared
 * .update-banner styling.
 */
export function AppUpdateBanner() {
  const { t } = useTranslation();
  const status = useAppUpdate((s) => s.status);
  const version = useAppUpdate((s) => s.version);
  const progress = useAppUpdate((s) => s.progress);
  const dismissed = useAppUpdate((s) => s.dismissed);
  const install = useAppUpdate((s) => s.install);
  const dismiss = useAppUpdate((s) => s.dismiss);

  const visible =
    !dismissed &&
    (status === 'available' ||
      status === 'downloading' ||
      status === 'ready' ||
      status === 'error');
  if (!visible) return null;

  const isWarn = status === 'error';
  const text =
    status === 'available'
      ? t('appupdate.available', { version })
      : status === 'downloading'
        ? t('appupdate.downloading', { percent: Math.round(progress * 100) })
        : status === 'ready'
          ? t('appupdate.ready')
          : t('appupdate.failed');

  return (
    <div
      className={'update-banner' + (isWarn ? ' update-banner-warn' : '')}
      role="status"
    >
      <span className="update-banner-dot">
        <Icon
          icon={isWarn ? 'mdi:alert-outline' : 'mdi:rocket-launch-outline'}
          width={14}
          height={14}
        />
      </span>
      <span className="update-banner-text">{text}</span>
      {status === 'available' && (
        <button
          type="button"
          className="btn btn-primary update-banner-action"
          onClick={() => void install()}
        >
          {t('appupdate.install')}
        </button>
      )}
      {status !== 'downloading' && status !== 'ready' && (
        <button
          type="button"
          className="update-banner-close"
          aria-label={t('appupdate.dismiss')}
          onClick={dismiss}
        >
          <Icon icon="mdi:close" width={15} height={15} />
        </button>
      )}
    </div>
  );
}
