import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { openRegistry, type Registry, type SharedEntry } from './registry';
import { openChannel, type Channel } from './channel';
import {
  startPresence,
  usePresenceStore,
  localPeer,
  getPeerName,
  type PresenceController,
} from './presence';
import type { ProviderStatus } from './provider';
import { useDocsStore } from '../docs-store';
import { useFlowStore } from '../store';

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type ServeInfo = {
  url: string;
  guest_url: string;
  lan_ip: string;
  port: number;
  token: string;
};
export type { SharedEntry };

const wsScheme = () => (location.protocol === 'https:' ? 'wss' : 'ws');
const loadPort = () => Number(localStorage.getItem('pfd:sharePort')) || 8080;

/** The live session manager (module-level — there's at most one session per app). */
type Manager = {
  wsBase: string;
  token: string;
  role: 'host' | 'guest';
  registry: Registry;
  presence: PresenceController;
  channels: Map<string, Channel>;
  unobserve: () => void;
  unsubDocs: () => void;
};
let mgr: Manager | null = null;

export type CollabState = {
  status: 'off' | ProviderStatus;
  role: 'host' | 'guest' | null;
  info: ServeInfo | null;
  token: string | null;
  /** Mirror of the registry: every doc currently published into the session. */
  sharedDocs: SharedEntry[];
  error: string | null;
  startSession: (port: number) => Promise<void>;
  joinSession: (token: string) => void;
  shareDoc: (docId: string) => Promise<void>;
  unshareDoc: (docId: string) => void;
  setDocEdit: (docId: string, canEdit: boolean) => void;
  setDocName: (docId: string, name: string) => void;
  leave: () => Promise<void>;
};

const docsActive = () => useDocsStore.getState().activeId;

export const useCollabStore = create<CollabState>((set, get) => {
  // ---- reconciliation: registry <-> open channels + virtual tabs ------------
  const reconcile = () => {
    if (!mgr) return;
    const entries = mgr.registry.list();
    const me = localPeer.id;
    const wanted = new Set(entries.map((e) => e.docId));
    const ds = useDocsStore.getState();

    for (const e of entries) {
      if (e.ownerId === me) continue; // my own docs: channel created in shareDoc
      if (!mgr.channels.has(e.docId)) {
        const ch = openChannel({
          wsBase: mgr.wsBase,
          token: mgr.token,
          docId: e.docId,
          isOwner: false,
          isActive: () => docsActive() === e.docId,
          canEdit: () => mgr?.registry.get(e.docId)?.canEdit ?? false,
        });
        mgr.channels.set(e.docId, ch);
        ds.addSharedTab({ id: e.docId, name: e.name, ownerName: e.ownerName });
        ds.openDoc(e.docId); // auto-open the freshly-shared doc
      } else {
        ds.updateSharedTab(e.docId, { name: e.name, ownerName: e.ownerName });
      }
    }

    // remote docs no longer shared -> close channel + drop the virtual tab
    for (const [docId, ch] of [...mgr.channels]) {
      if (!ch.isOwner && !wanted.has(docId)) {
        ch.stop();
        mgr.channels.delete(docId);
        ds.removeSharedTab(docId);
      }
    }

    set({ sharedDocs: entries });
    ds.setLiveSharedDocIds(entries.filter((e) => e.ownerId === me).map((e) => e.docId));
    syncReadOnly();
  };

  // Keep the flow store's read-only flag in sync with the active doc's permission
  // so user mutations are blocked at the source (never diverge / never get flushed).
  const syncReadOnly = () => {
    const activeId = docsActive();
    const entry = mgr && activeId ? mgr.registry.get(activeId) : undefined;
    useFlowStore
      .getState()
      .setReadOnly(!!entry && entry.ownerId !== localPeer.id && !entry.canEdit);
  };

  const pushActiveContext = () => {
    if (!mgr) return;
    const activeId = docsActive();
    const ch = activeId ? mgr.channels.get(activeId) : null;
    const canEdit = ch
      ? ch.isOwner || (mgr.registry.get(activeId!)?.canEdit ?? false)
      : true;
    mgr.presence.setContext({ activeDocId: ch ? activeId : null, editing: canEdit });
    syncReadOnly();
  };

  const subscribeActive = () => {
    let prev = docsActive();
    return useDocsStore.subscribe((s) => {
      if (s.activeId === prev) return;
      prev = s.activeId;
      // Restore the store from this doc's Y FIRST. Otherwise pushActiveContext's
      // setReadOnly mutates the store while it still holds the *previous* doc's
      // content, and the bridge's pushToY would flush that stale (often empty)
      // state into the shared Y.Doc — wiping the document for every peer.
      const ch = s.activeId ? mgr?.channels.get(s.activeId) : null;
      if (ch) ch.bridge.resync();
      pushActiveContext();
    });
  };

  const buildManager = (o: {
    wsBase: string;
    token: string;
    role: 'host' | 'guest';
    info: ServeInfo | null;
  }) => {
    const registry = openRegistry({
      wsBase: o.wsBase,
      token: o.token,
      isHost: o.role === 'host',
      onStatus: (s) => set({ status: s }),
    });
    const presence = startPresence(registry.provider, {
      name: getPeerName() || (o.role === 'host' ? 'Hôte' : 'Invité'),
      activeDocId: null,
      editing: true,
    });
    mgr = {
      wsBase: o.wsBase,
      token: o.token,
      role: o.role,
      registry,
      presence,
      channels: new Map(),
      unobserve: () => {},
      unsubDocs: () => {},
    };
    mgr.unobserve = registry.observe(reconcile);
    mgr.unsubDocs = subscribeActive();
    set({
      status: 'connecting',
      role: o.role,
      info: o.info,
      token: o.token,
      sharedDocs: [],
      error: null,
    });
    reconcile();
    pushActiveContext();
  };

  return {
    status: 'off',
    role: null,
    info: null,
    token: null,
    sharedDocs: [],
    error: null,

    startSession: async (port) => {
      if (mgr) return;
      if (!isTauri) {
        set({ error: 'Le partage doit être lancé depuis l’app de bureau.' });
        return;
      }
      const { invoke } = await import('@tauri-apps/api/core');
      const token = nanoid(16);
      let info: ServeInfo;
      try {
        info = await invoke<ServeInfo>('share_start', { port, token });
      } catch (e) {
        set({ error: String(e), status: 'off' });
        return;
      }
      buildManager({ wsBase: `ws://localhost:${info.port}`, token, role: 'host', info });
    },

    joinSession: (token) => {
      if (mgr) return;
      buildManager({
        wsBase: `${wsScheme()}://${location.host}`,
        token,
        role: 'guest',
        info: null,
      });
    },

    shareDoc: async (docId) => {
      if (!mgr) {
        await get().startSession(loadPort());
        if (!mgr) return;
      }
      const ds = useDocsStore.getState();
      if (ds.activeId !== docId) ds.openDoc(docId); // seed from the right content
      if (mgr.channels.has(docId)) return;
      const ch = openChannel({
        wsBase: mgr.wsBase,
        token: mgr.token,
        docId,
        isOwner: true,
        isActive: () => docsActive() === docId,
        canEdit: () => true,
      });
      mgr.channels.set(docId, ch);
      const meta = ds.docs.find((d) => d.id === docId);
      mgr.registry.publish({
        docId,
        name: meta?.name ?? 'Document',
        ownerId: localPeer.id,
        ownerName: localPeer.name || (mgr.role === 'host' ? 'Hôte' : 'Invité'),
        canEdit: true,
      });
      reconcile();
      pushActiveContext();
    },

    unshareDoc: (docId) => {
      if (!mgr) return;
      mgr.registry.unpublish(docId);
      const ch = mgr.channels.get(docId);
      if (ch) {
        ch.stop();
        mgr.channels.delete(docId);
      }
      reconcile();
      pushActiveContext();
      // If the host has unshared everything, end the session (stop the server)
      // so the share indicator doesn't keep claiming "sharing" with nothing live.
      if (get().role === 'host' && get().sharedDocs.length === 0) {
        void get().leave();
      }
    },

    setDocEdit: (docId, canEdit) => {
      mgr?.registry.setCanEdit(docId, canEdit);
      reconcile();
    },

    setDocName: (docId, name) => {
      mgr?.registry.setName(docId, name);
    },

    leave: async () => {
      const wasHost = get().role === 'host';
      if (mgr) {
        mgr.unobserve();
        mgr.unsubDocs();
        for (const ch of mgr.channels.values()) ch.stop();
        mgr.presence.stop();
        mgr.registry.stop();
        mgr = null;
      }
      usePresenceStore.getState().clear();
      useFlowStore.getState().setReadOnly(false);
      const ds = useDocsStore.getState();
      for (const t of [...ds.sharedTabs]) ds.removeSharedTab(t.id);
      ds.setLiveSharedDocIds([]);
      if (wasHost && isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('share_stop');
        } catch {
          /* ignore */
        }
      }
      set({ status: 'off', role: null, info: null, token: null, sharedDocs: [], error: null });
    },
  };
});

/** Auto-join when the web app is opened via a share URL (`#room=<token>`). */
export function maybeAutoJoin(): void {
  if (isTauri) return;
  const m = /[#&]room=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) useCollabStore.getState().joinSession(m[1]);
}
