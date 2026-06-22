import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useCollabStore } from '../collab/session';
import { usePresenceStore, localPeer, setPeerName, getPeerName } from '../collab/presence';
import { useDocsStore } from '../docs-store';
import { useUiStore } from '../ui-store';
import './ShareSheet.css';

const TUNNEL_KEY = 'pfd:tunnelBase';
const isTauri =
  typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

const normBase = (b: string): string => {
  let s = b.trim();
  // Strip trailing slashes without regex backtracking (avoids ReDoS).
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end--;
  s = s.slice(0, end);
  if (s && !/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
};

function PeersList() {
  const { t } = useTranslation();
  const peers = usePresenceStore((s) => s.peers);
  const sharedDocs = useCollabStore((s) => s.sharedDocs);
  const list = Object.values(peers);
  if (list.length === 0) return null;
  const docName = (id: string | null) =>
    id ? sharedDocs.find((d) => d.docId === id)?.name ?? t('share.aDoc') : null;
  return (
    <ul className="shr-peers">
      {list.map((p) => {
        const name = docName(p.activeDocId);
        return (
          <li key={p.id} className="shr-peer">
            <span className="shr-peer-dot" style={{ background: p.color }} />
            <span className="shr-peer-name">{p.name || t('collab.peer')}</span>
            <span className="shr-peer-where muted">
              {name ? t('share.peerOnDoc', { name }) : t('share.privateDoc')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ShareSheet() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.shareOpen);
  const close = useUiStore((s) => s.closeShare);
  const showToast = useUiStore((s) => s.showToast);

  const status = useCollabStore((s) => s.status);
  const role = useCollabStore((s) => s.role);
  const info = useCollabStore((s) => s.info);
  const error = useCollabStore((s) => s.error);
  const sharedDocs = useCollabStore((s) => s.sharedDocs);
  const shareDoc = useCollabStore((s) => s.shareDoc);
  const unshareDoc = useCollabStore((s) => s.unshareDoc);
  const setDocEdit = useCollabStore((s) => s.setDocEdit);
  const leave = useCollabStore((s) => s.leave);
  const peerCount = usePresenceStore((s) => Object.keys(s.peers).length);

  const docs = useDocsStore((s) => s.docs);
  const activeId = useDocsStore((s) => s.activeId);

  const [name, setName] = useState(() => getPeerName());
  const [tunnel, setTunnel] = useState(() => localStorage.getItem(TUNNEL_KEY) ?? '');

  // Reflect the current display name each time the panel opens.
  useEffect(() => {
    if (open) setName(getPeerName());
  }, [open]);

  if (!open) return null;

  const inSession = role !== null;
  const canHost = isTauri || inSession; // a web guest can publish into a joined session
  const myShared = sharedDocs.filter((e) => e.ownerId === localPeer.id);
  const isShared = (id: string) => myShared.some((e) => e.docId === id);
  const canEditOf = (id: string) =>
    sharedDocs.find((e) => e.docId === id)?.canEdit ?? true;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('share.linkCopied'));
    } catch {
      showToast(t('share.copyFailed'));
    }
  };
  const commitName = () => setPeerName(name);
  const onTunnel = (v: string) => {
    setTunnel(v);
    localStorage.setItem(TUNNEL_KEY, v);
  };
  const tunnelLink = info && tunnel.trim() ? `${normBase(tunnel)}/#room=${info.token}` : '';

  return (
    <div
      className="sheet-overlay"
      onMouseDown={close}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
      }}
      role="button"
      tabIndex={-1}
    >
      <div
        className="sheet sheet-sm"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('share.title')}
      >
        <div className="sheet-header">
          <Icon icon="lucide:share-2" width={18} height={18} />
          <h2 className="sheet-title">{t('share.title')}</h2>
          <button type="button" className="sheet-close" onClick={close} aria-label={t('common.close')}>
            <Icon icon="mdi:close" width={16} height={16} />
          </button>
        </div>

        <div className="sheet-body">
          {/* Display name (used by presence + cursors) */}
          <label className="shr-label" htmlFor="shr-name">{t('share.yourName')}</label>
          <input
            id="shr-name"
            className="input shr-name"
            placeholder={t('share.yourNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
          />

          {/* Document picker — choose what to share + per-doc permission */}
          {canHost ? (
            <>
              <div className="shr-label shr-label-mt">{t('share.docsToShare')}</div>
              <ul className="shr-doclist">
                {docs.map((d) => {
                  const shared = isShared(d.id);
                  return (
                    <li
                      key={d.id}
                      className="shr-doc"
                      data-active={d.id === activeId ? 'true' : undefined}
                    >
                      <Icon
                        className="shr-doc-ic"
                        icon={shared ? 'lucide:antenna' : 'mdi:file-outline'}
                        width={15}
                        height={15}
                      />
                      <span className="shr-doc-name">{d.name}</span>
                      {shared && (
                        <button
                          type="button"
                          className="shr-doc-perm"
                          data-on={canEditOf(d.id)}
                          title={canEditOf(d.id) ? t('share.editAllowed') : t('share.readOnly')}
                          onClick={() => setDocEdit(d.id, !canEditOf(d.id))}
                        >
                          <Icon
                            icon={canEditOf(d.id) ? 'mdi:pencil' : 'mdi:pencil-off'}
                            width={13}
                            height={13}
                          />
                          {canEditOf(d.id) ? t('share.edit') : t('share.read')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="shr-doc-toggle"
                        data-on={shared}
                        onClick={() => {
                          if (shared) unshareDoc(d.id);
                          else shareDoc(d.id);
                        }}
                      >
                        {shared ? t('share.shared') : t('share.share')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="shr-hint shr-label-mt">
              {t('share.desktopOnlyHint')}
            </p>
          )}

          {/* Links + peers when a session is live */}
          {inSession && (
            <>
              <div className="shr-status shr-status-mt">
                <span className="shr-dot" data-on={status === 'connected'} />
                {status === 'connected' ? t('share.online') : t('share.connecting')} ·{' '}
                {t('share.peerCount', { count: peerCount })}
              </div>
              <PeersList />

              {role === 'host' && info && (
                <>
                  <label className="shr-label shr-label-mt" htmlFor="shr-lan-link">{t('share.lanLink')}</label>
                  <div className="shr-url">
                    <input id="shr-lan-link" className="input" readOnly value={info.guest_url}
                      onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn" onClick={() => copy(info.guest_url)}>
                      <Icon icon="mdi:content-copy" width={14} height={14} />
                    </button>
                  </div>

                  <label className="shr-label shr-label-mt" htmlFor="shr-tunnel">{t('share.internetLink')}</label>
                  <input
                    id="shr-tunnel"
                    className="input shr-tunnel-input"
                    placeholder={t('share.tunnelPlaceholder')}
                    value={tunnel}
                    onChange={(e) => onTunnel(e.target.value)}
                  />
                  {tunnelLink ? (
                    <div className="shr-url shr-url-mt">
                      <input className="input" readOnly value={tunnelLink}
                        onFocus={(e) => e.currentTarget.select()} />
                      <button type="button" className="btn btn-primary" onClick={() => copy(tunnelLink)}>
                        <Icon icon="mdi:content-copy" width={14} height={14} />
                      </button>
                    </div>
                  ) : (
                    <p className="shr-hint">
                      <Trans
                        i18nKey="share.tunnelHint"
                        values={{ port: info.port }}
                        components={{ cmd: <code />, url: <code /> }}
                      />
                    </p>
                  )}
                </>
              )}

              <button type="button" className="btn btn-danger shr-action" onClick={() => leave()}>
                <Icon icon={role === 'host' ? 'mdi:stop-circle-outline' : 'mdi:exit-to-app'}
                  width={15} height={15} />
                {role === 'host' ? t('share.stopSharing') : t('share.leaveSession')}
              </button>
            </>
          )}

          {error && <p className="shr-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
