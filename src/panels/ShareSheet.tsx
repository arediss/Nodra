import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useCollabStore } from '../collab/session';
import { usePresenceStore, localPeer, setPeerName, getPeerName } from '../collab/presence';
import { useDocsStore } from '../docs-store';
import { useUiStore } from '../ui-store';
import './ShareSheet.css';

const TUNNEL_KEY = 'pfd:tunnelBase';
const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const normBase = (b: string): string => {
  let s = b.trim().replace(/\/+$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
};

function PeersList() {
  const peers = usePresenceStore((s) => s.peers);
  const sharedDocs = useCollabStore((s) => s.sharedDocs);
  const list = Object.values(peers);
  if (list.length === 0) return null;
  const docName = (id: string | null) =>
    id ? sharedDocs.find((d) => d.docId === id)?.name ?? 'un doc' : null;
  return (
    <ul className="shr-peers">
      {list.map((p) => {
        const name = docName(p.activeDocId);
        return (
          <li key={p.id} className="shr-peer">
            <span className="shr-peer-dot" style={{ background: p.color }} />
            <span className="shr-peer-name">{p.name || 'Pair'}</span>
            <span className="shr-peer-where muted">
              {name ? `sur « ${name} »` : 'doc privé'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ShareSheet() {
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
      showToast('Lien copié');
    } catch {
      showToast('Copie impossible');
    }
  };
  const commitName = () => setPeerName(name);
  const onTunnel = (v: string) => {
    setTunnel(v);
    localStorage.setItem(TUNNEL_KEY, v);
  };
  const tunnelLink = info && tunnel.trim() ? `${normBase(tunnel)}/#room=${info.token}` : '';

  return (
    <div className="sheet-overlay" onMouseDown={close}>
      <div
        className="sheet sheet-sm"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Partager"
      >
        <div className="sheet-header">
          <Icon icon="lucide:share-2" width={18} height={18} />
          <h2 className="sheet-title">Partager</h2>
          <button type="button" className="sheet-close" onClick={close} aria-label="Fermer">
            <Icon icon="mdi:close" width={16} height={16} />
          </button>
        </div>

        <div className="sheet-body">
          {/* Display name (used by presence + cursors) */}
          <label className="shr-label" htmlFor="shr-name">Ton prénom</label>
          <input
            id="shr-name"
            className="input shr-name"
            placeholder="ex. Quentin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
          />

          {/* Document picker — choose what to share + per-doc permission */}
          {canHost ? (
            <>
              <label className="shr-label shr-label-mt">Documents à partager</label>
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
                          title={canEditOf(d.id) ? 'Édition autorisée' : 'Lecture seule'}
                          onClick={() => setDocEdit(d.id, !canEditOf(d.id))}
                        >
                          <Icon
                            icon={canEditOf(d.id) ? 'mdi:pencil' : 'mdi:pencil-off'}
                            width={13}
                            height={13}
                          />
                          {canEditOf(d.id) ? 'Édition' : 'Lecture'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="shr-doc-toggle"
                        data-on={shared}
                        onClick={() => (shared ? unshareDoc(d.id) : void shareDoc(d.id))}
                      >
                        {shared ? 'Partagé' : 'Partager'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="shr-hint shr-label-mt">
              Le partage se lance depuis l'application de bureau Nodra.
            </p>
          )}

          {/* Links + peers when a session is live */}
          {inSession && (
            <>
              <div className="shr-status shr-status-mt">
                <span className="shr-dot" data-on={status === 'connected'} />
                {status === 'connected' ? 'en ligne' : 'connexion…'} · {peerCount} pair
                {peerCount > 1 ? 's' : ''}
              </div>
              <PeersList />

              {role === 'host' && info && (
                <>
                  <label className="shr-label shr-label-mt">Lien — même réseau (LAN)</label>
                  <div className="shr-url">
                    <input className="input" readOnly value={info.guest_url}
                      onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn" onClick={() => copy(info.guest_url)}>
                      <Icon icon="mdi:content-copy" width={14} height={14} />
                    </button>
                  </div>

                  <label className="shr-label shr-label-mt">Lien internet (via un tunnel)</label>
                  <input
                    className="input shr-tunnel-input"
                    placeholder="Colle l'URL de ton tunnel, ex. https://xxx.trycloudflare.com"
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
                      Lance <code>cloudflared tunnel --url http://localhost:{info.port}</code>,
                      puis colle l'URL <code>https://…</code> ci-dessus.
                    </p>
                  )}
                </>
              )}

              <button type="button" className="btn btn-danger shr-action" onClick={() => leave()}>
                <Icon icon={role === 'host' ? 'mdi:stop-circle-outline' : 'mdi:exit-to-app'}
                  width={15} height={15} />
                {role === 'host' ? 'Arrêter le partage' : 'Quitter la session'}
              </button>
            </>
          )}

          {error && <p className="shr-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
