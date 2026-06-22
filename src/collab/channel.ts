import { createCollabDoc } from './ydoc';
import { createProvider, type CollabProvider } from './provider';
import { startBridge, type BridgeControl } from './bridge';

/**
 * One sync channel for a single shared document: a Y.Doc + a WebSocket provider
 * (room `${token}~${docId}`) + the store⇄Y bridge. Many channels can exist at once;
 * each bridge only pushes/pulls while ITS doc is the active tab (gate.viewing), so
 * switching tabs never crosses content between docs.
 */
export type Channel = {
  docId: string;
  /** owner = the peer who shared this doc (seeds it, answers sync-requests, always edits) */
  isOwner: boolean;
  bridge: BridgeControl;
  provider: CollabProvider;
  stop: () => void;
};

export function openChannel(opts: {
  wsBase: string; // ws://host  (no trailing slash)
  token: string;
  docId: string;
  isOwner: boolean;
  /** is this doc the active tab right now? */
  isActive: () => boolean;
  /** may the local user edit this doc? (owner: true; remote: registry canEdit) */
  canEdit: () => boolean;
}): Channel {
  const c = createCollabDoc();
  const gate = () => ({ viewing: opts.isActive(), canEdit: opts.canEdit() });
  const bridge = startBridge(c, { seed: opts.isOwner, gate });
  const provider = createProvider({
    url: `${opts.wsBase}/sync?room=${encodeURIComponent(`${opts.token}~${opts.docId}`)}`,
    doc: c.doc,
    isHost: opts.isOwner,
    onStatus: () => {},
    onSynced: () => bridge.markSynced(),
  });
  return {
    docId: opts.docId,
    isOwner: opts.isOwner,
    bridge,
    provider,
    stop: () => {
      provider.destroy();
      bridge.stop();
    },
  };
}
