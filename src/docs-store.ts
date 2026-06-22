import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { useFlowStore } from './store';
import type { DiagramFile } from './types';

/**
 * Local document library + per-document snapshot history.
 * Persisted in localStorage:
 *   pfd:docs        -> DocMeta[]            (the index)
 *   pfd:activeDoc   -> "<id>"              (currently open document)
 *   pfd:doc:<id>    -> DocBody             (current diagram + snapshots)
 * Migrates the legacy single-slot autosave (pfd:autosave) into a first doc.
 */

export type DocMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Snapshot = {
  id: string;
  at: number;
  label?: string;
  data: DiagramFile;
};

type DocBody = { current: DiagramFile; snapshots: Snapshot[] };

const INDEX_KEY = 'pfd:docs';
const ACTIVE_KEY = 'pfd:activeDoc';
const LEGACY_AUTOSAVE = 'pfd:autosave';
const SNAPSHOT_CAP = 40;
const bodyKey = (id: string) => `pfd:doc:${id}`;

/** A remote shared document published by another peer (virtual tab, not persisted). */
export type SharedTab = { id: string; name: string; ownerName: string };

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors */
  }
}
function isDiagramFile(v: unknown): v is DiagramFile {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.nodes) && Array.isArray(o.edges);
}
function emptyDiagram(name: string): DiagramFile {
  return { version: 1, name, nodes: [], edges: [] };
}
const flow = () => useFlowStore.getState();

export type DocsState = {
  docs: DocMeta[];
  activeId: string | null;
  snapshots: Snapshot[]; // of the active document
  /** Remote shared docs (published by other peers) shown as virtual tabs. */
  sharedTabs: SharedTab[];
  /** My local docs currently published into the session (shown green + antenna). */
  liveSharedDocIds: string[];

  init: () => void;
  addSharedTab: (tab: SharedTab) => void;
  updateSharedTab: (id: string, patch: Partial<Omit<SharedTab, 'id'>>) => void;
  removeSharedTab: (id: string) => void;
  setLiveSharedDocIds: (ids: string[]) => void;
  newDoc: () => void;
  importDiagram: (file: DiagramFile) => void;
  openDoc: (id: string) => void;
  duplicateDoc: (id: string) => void;
  renameDoc: (id: string, name: string) => void;
  deleteDoc: (id: string) => void;
  reorderDoc: (fromId: string, toId: string) => void;
  saveCurrent: () => void;
  snapshotNow: (label?: string) => void;
  restoreSnapshot: (snapId: string) => void;
};

export const useDocsStore = create<DocsState>((set, get) => ({
  docs: [],
  activeId: null,
  snapshots: [],
  sharedTabs: [],
  liveSharedDocIds: [],

  addSharedTab: (tab) =>
    set((s) =>
      s.sharedTabs.some((t) => t.id === tab.id)
        ? s
        : { sharedTabs: [...s.sharedTabs, tab] },
    ),
  updateSharedTab: (id, patch) =>
    set((s) => ({
      sharedTabs: s.sharedTabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  removeSharedTab: (id) => {
    const sharedTabs = get().sharedTabs.filter((t) => t.id !== id);
    const wasActive = get().activeId === id;
    set({ sharedTabs });
    if (wasActive) {
      // Switch off the closing remote tab to a local doc (or another shared tab).
      set({ activeId: null });
      const next = get().docs[0]?.id ?? get().sharedTabs[0]?.id;
      if (next) get().openDoc(next);
    }
  },
  setLiveSharedDocIds: (ids) => set({ liveSharedDocIds: ids }),

  init: () => {
    let index = readJSON<DocMeta[]>(INDEX_KEY) ?? [];
    if (index.length === 0) {
      const legacy = readJSON<DiagramFile>(LEGACY_AUTOSAVE);
      const now = Date.now();
      const id = nanoid(8);
      const current = isDiagramFile(legacy) ? legacy : emptyDiagram('Sans titre');
      const meta: DocMeta = {
        id,
        name: current.name || 'Sans titre',
        createdAt: now,
        updatedAt: now,
      };
      index = [meta];
      writeJSON(bodyKey(id), { current, snapshots: [] } satisfies DocBody);
      writeJSON(INDEX_KEY, index);
      writeJSON(ACTIVE_KEY, id);
      try {
        localStorage.removeItem(LEGACY_AUTOSAVE);
      } catch {
        /* ignore */
      }
    }
    let activeId = readJSON<string>(ACTIVE_KEY);
    if (!activeId || !index.some((d) => d.id === activeId)) activeId = index[0].id;
    const body = readJSON<DocBody>(bodyKey(activeId));
    if (body && isDiagramFile(body.current)) flow().loadDiagram(body.current);
    writeJSON(ACTIVE_KEY, activeId);
    set({ docs: index, activeId, snapshots: body?.snapshots ?? [] });
  },

  newDoc: () => {
    if (get().activeId) get().saveCurrent();
    const now = Date.now();
    const id = nanoid(8);
    const data = emptyDiagram('Sans titre');
    writeJSON(bodyKey(id), { current: data, snapshots: [] } satisfies DocBody);
    const nextDocs = [
      { id, name: 'Sans titre', createdAt: now, updatedAt: now },
      ...get().docs,
    ];
    writeJSON(INDEX_KEY, nextDocs);
    writeJSON(ACTIVE_KEY, id);
    // activeId before loadDiagram so the bridge sees this private doc as active and
    // never pushes the empty diagram into the shared Y.Doc.
    set({ docs: nextDocs, activeId: id, snapshots: [] });
    flow().loadDiagram(data);
  },

  // Create a brand-new document from an imported diagram (never clobbers the
  // current one). Used by file imports that should land in their own tab.
  importDiagram: (file) => {
    if (get().activeId) get().saveCurrent();
    const now = Date.now();
    const id = nanoid(8);
    const data: DiagramFile = {
      version: 1,
      name: file.name || 'Import',
      nodes: file.nodes ?? [],
      edges: file.edges ?? [],
      // Preserve viewport + the plugin deps the file declares, so an imported
      // diagram keeps offering its missing plugins (carry-over, never dropped).
      ...(file.viewport ? { viewport: file.viewport } : {}),
      ...(file.plugins ? { plugins: file.plugins } : {}),
    };
    writeJSON(bodyKey(id), { current: data, snapshots: [] } satisfies DocBody);
    const nextDocs = [
      { id, name: data.name, createdAt: now, updatedAt: now },
      ...get().docs,
    ];
    writeJSON(INDEX_KEY, nextDocs);
    writeJSON(ACTIVE_KEY, id);
    set({ docs: nextDocs, activeId: id, snapshots: [] });
    flow().loadDiagram(data);
  },

  openDoc: (id) => {
    if (get().activeId === id) return;
    if (get().activeId) get().saveCurrent();
    const isVirtual = get().sharedTabs.some((t) => t.id === id);
    const isMyShared = get().liveSharedDocIds.includes(id);
    // Entering a shared doc (a remote virtual tab OR one of my own published docs):
    // the collaborative Y.Doc is the source of truth — do NOT reload localStorage
    // (stale content would clobber collaborators' edits). The session's active-doc
    // watcher calls the channel's bridge.resync() to fill the store from Y.
    if (isVirtual || isMyShared) {
      if (!isVirtual) writeJSON(ACTIVE_KEY, id); // my real shared doc persists active
      const body = isVirtual ? null : readJSON<DocBody>(bodyKey(id));
      set({ activeId: id, snapshots: body?.snapshots ?? [] });
      return;
    }
    const body = readJSON<DocBody>(bodyKey(id));
    const current =
      body && isDiagramFile(body.current) ? body.current : emptyDiagram('Sans titre');
    writeJSON(ACTIVE_KEY, id);
    // activeId before loadDiagram: the bridge push-gate must see the new (private)
    // doc as active so switching tabs never pushes it into a shared Y.Doc.
    set({ activeId: id, snapshots: body?.snapshots ?? [] });
    flow().loadDiagram(current);
  },

  duplicateDoc: (id) => {
    const src = readJSON<DocBody>(bodyKey(id));
    const meta = get().docs.find((d) => d.id === id);
    if (!src || !meta) return;
    const now = Date.now();
    const nid = nanoid(8);
    const name = `${meta.name} (copie)`;
    writeJSON(bodyKey(nid), {
      current: { ...src.current, name },
      snapshots: [],
    } satisfies DocBody);
    const nextDocs = [
      { id: nid, name, createdAt: now, updatedAt: now },
      ...get().docs,
    ];
    writeJSON(INDEX_KEY, nextDocs);
    set({ docs: nextDocs });
  },

  renameDoc: (id, name) => {
    const nm = name.trim() || 'Sans titre';
    const nextDocs = get().docs.map((d) =>
      d.id === id ? { ...d, name: nm, updatedAt: Date.now() } : d,
    );
    writeJSON(INDEX_KEY, nextDocs);
    const body = readJSON<DocBody>(bodyKey(id));
    if (body) {
      body.current = { ...body.current, name: nm };
      writeJSON(bodyKey(id), body);
    }
    if (get().activeId === id) flow().setDiagramName(nm);
    set({ docs: nextDocs });
  },

  deleteDoc: (id) => {
    try {
      localStorage.removeItem(bodyKey(id));
    } catch {
      /* ignore */
    }
    let nextDocs = get().docs.filter((d) => d.id !== id);
    if (nextDocs.length === 0) {
      const now = Date.now();
      const nid = nanoid(8);
      writeJSON(bodyKey(nid), {
        current: emptyDiagram('Sans titre'),
        snapshots: [],
      } satisfies DocBody);
      nextDocs = [{ id: nid, name: 'Sans titre', createdAt: now, updatedAt: now }];
    }
    writeJSON(INDEX_KEY, nextDocs);
    let activeId = get().activeId;
    let snapshots = get().snapshots;
    if (activeId === id) {
      activeId = nextDocs[0].id;
      const body = readJSON<DocBody>(bodyKey(activeId));
      const current =
        body && isDiagramFile(body.current)
          ? body.current
          : emptyDiagram('Sans titre');
      flow().loadDiagram(current);
      writeJSON(ACTIVE_KEY, activeId);
      snapshots = body?.snapshots ?? [];
    }
    set({ docs: nextDocs, activeId, snapshots });
  },

  // Move `fromId` so it sits where `toId` currently is. Manual order, persisted.
  reorderDoc: (fromId, toId) => {
    if (fromId === toId) return;
    const docs = [...get().docs];
    const from = docs.findIndex((d) => d.id === fromId);
    const to = docs.findIndex((d) => d.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = docs.splice(from, 1);
    // Insert *before* the target tab (matching the left-edge drop indicator).
    // Removing an earlier element shifts later indices down by one, so a
    // forward drag (from < to) must target `to - 1`.
    const insertAt = from < to ? to - 1 : to;
    docs.splice(insertAt, 0, moved);
    writeJSON(INDEX_KEY, docs);
    set({ docs });
  },

  saveCurrent: () => {
    const { activeId, docs } = get();
    // Remote shared tabs are virtual — never persisted locally (content is in the Y.Doc).
    if (!activeId || get().sharedTabs.some((t) => t.id === activeId)) return;
    const diagram = flow().toDiagram();
    const body = readJSON<DocBody>(bodyKey(activeId)) ?? {
      current: diagram,
      snapshots: [],
    };
    body.current = diagram;
    writeJSON(bodyKey(activeId), body);
    const now = Date.now();
    const nextDocs = docs.map((d) =>
      d.id === activeId
        ? { ...d, name: diagram.name || d.name, updatedAt: now }
        : d,
    );
    writeJSON(INDEX_KEY, nextDocs);
    set({ docs: nextDocs });
  },

  snapshotNow: (label) => {
    const { activeId } = get();
    if (!activeId) return;
    const data = flow().toDiagram();
    const body = readJSON<DocBody>(bodyKey(activeId)) ?? {
      current: data,
      snapshots: [],
    };
    const last = body.snapshots[body.snapshots.length - 1];
    if (last && JSON.stringify(last.data) === JSON.stringify(data)) return;
    const snap: Snapshot = { id: nanoid(8), at: Date.now(), label, data };
    body.snapshots = [...body.snapshots, snap].slice(-SNAPSHOT_CAP);
    writeJSON(bodyKey(activeId), body);
    set({ snapshots: body.snapshots });
  },

  restoreSnapshot: (snapId) => {
    const snap = get().snapshots.find((s) => s.id === snapId);
    if (!snap) return;
    // Just load the snapshot — do NOT auto-create a new one, otherwise every
    // restore piles up duplicate "before restore" entries.
    flow().loadDiagram(snap.data);
    get().saveCurrent();
  },
}));
