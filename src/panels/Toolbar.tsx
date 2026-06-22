import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../ui-store';
import { useCollabStore } from '../collab/session';
import { usePresenceStore } from '../collab/presence';
import { WindowControls } from './WindowControls';
import { HamburgerMenu } from './HamburgerMenu';
import { HistoryMenu } from './HistoryMenu';
import { DocTabs } from './DocTabs';
import './Toolbar.css';

export function Toolbar() {
  const { t } = useTranslation();
  const openShare = useUiStore((s) => s.openShare);
  const inSession = useCollabStore((s) => s.role !== null);
  const connected = useCollabStore((s) => s.status === 'connected');
  const peerCount = usePresenceStore((s) => Object.keys(s.peers).length);

  return (
    <header className="tb-bar" data-tauri-drag-region>
      <div className="tb-zone tb-zone-left" data-tauri-drag-region>
        <WindowControls />
        <HamburgerMenu />
      </div>

      <span className="tb-sep" />

      <DocTabs />

      <div className="tb-zone tb-zone-right" data-tauri-drag-region>
        <HistoryMenu />
        <button
          type="button"
          className="tb-share"
          data-on={inSession ? 'true' : undefined}
          onClick={openShare}
          title={t('toolbar.share')}
          aria-label={t('toolbar.share')}
        >
          <Icon icon="mdi:account-multiple-plus-outline" width={18} height={18} />
          {inSession && (
            <span className="tb-share-dot" data-state={connected ? 'live' : 'connecting'} />
          )}
          {inSession && peerCount > 0 && (
            <span className="tb-share-count">{peerCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}
