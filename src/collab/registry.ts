import * as Y from 'yjs';
import { createProvider, type CollabProvider, type ProviderStatus } from './provider';
import { ingestPresence } from './presence';

/**
 * The session "index" channel (room `${token}`): a small Y.Doc whose `yShared` map
 * lists every document currently published into the session, plus the presence
 * stream (TAG_AWARENESS) carrying cursors and who-is-on-which-doc.
 */
export type SharedEntry = {
  docId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  canEdit: boolean;
};

export type Registry = {
  doc: Y.Doc;
  yShared: Y.Map<SharedEntry>;
  provider: CollabProvider;
  list: () => SharedEntry[];
  get: (docId: string) => SharedEntry | undefined;
  publish: (e: SharedEntry) => void;
  setName: (docId: string, name: string) => void;
  setCanEdit: (docId: string, canEdit: boolean) => void;
  unpublish: (docId: string) => void;
  observe: (cb: () => void) => () => void;
  stop: () => void;
};

export function openRegistry(opts: {
  wsBase: string;
  token: string;
  isHost: boolean;
  onStatus?: (s: ProviderStatus) => void;
}): Registry {
  const doc = new Y.Doc();
  const yShared = doc.getMap<SharedEntry>('shared');
  const provider = createProvider({
    url: `${opts.wsBase}/sync?room=${encodeURIComponent(opts.token)}`,
    doc,
    isHost: opts.isHost,
    onStatus: opts.onStatus,
    onPresence: ingestPresence,
  });
  const patch = (docId: string, p: Partial<SharedEntry>) => {
    const e = yShared.get(docId);
    if (e) yShared.set(docId, { ...e, ...p });
  };
  return {
    doc,
    yShared,
    provider,
    list: () => [...yShared.values()],
    get: (docId) => yShared.get(docId),
    publish: (e) => yShared.set(e.docId, e),
    setName: (docId, name) => patch(docId, { name }),
    setCanEdit: (docId, canEdit) => patch(docId, { canEdit }),
    unpublish: (docId) => yShared.delete(docId),
    observe: (cb) => {
      yShared.observe(cb);
      return () => yShared.unobserve(cb);
    },
    stop: () => provider.destroy(),
  };
}
