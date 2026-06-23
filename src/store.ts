import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { AppNode, AppEdge, AppNodeData, DiagramFile, DiagramPluginDep } from './types';
import { derivePlugins } from './plugins/derivePlugins';

export const newId = () => nanoid(8);

type HistorySnapshot = { nodes: AppNode[]; edges: AppEdge[] };
const HISTORY_CAP = 100;
/** True while undo/redo (or a remote apply wrapped in withoutHistory) is mutating
 *  the store — commit() becomes a no-op so those writes never record their own
 *  history entry. Module-level: there is exactly one store instance app-wide. */
let applyingHistory = false;
/** Tracks an in-progress drag/resize so we commit exactly ONE entry at its start. */
let wasDragging = false;

/**
 * Legacy docs stored node size in `style.width/height`, which overrides the
 * `node.width/height` that NodeResizer writes — so resizing silently snapped
 * back. Migrate numeric style sizes to top-level width/height on load so resize
 * works (and stays the single source of truth).
 */
function migrateNodeSizes(nodes: AppNode[]): AppNode[] {
  return nodes.map((n) => {
    const style = n.style as { width?: unknown; height?: unknown } | undefined;
    const sw = style?.width;
    const sh = style?.height;
    if (typeof sw !== 'number' && typeof sh !== 'number') return n;
    const { width: _w, height: _h, ...restStyle } = (n.style ?? {}) as Record<string, unknown>;
    return {
      ...n,
      ...(n.width == null && typeof sw === 'number' ? { width: sw } : {}),
      ...(n.height == null && typeof sh === 'number' ? { height: sh } : {}),
      style: Object.keys(restStyle).length ? (restStyle as AppNode['style']) : undefined,
    } as AppNode;
  });
}

/**
 * Drop a `parentId` (and its `extent`) when it doesn't reference an existing
 * node — e.g. a malformed import where a child points at an edge or a removed
 * cell. ReactFlow otherwise crashes reading `parent.measured` on undefined.
 */
function sanitizeParents(nodes: AppNode[]): AppNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.map((n) => {
    if (n.parentId && !ids.has(n.parentId)) {
      const { parentId: _p, extent: _e, ...rest } = n;
      return rest as AppNode;
    }
    return n;
  });
}

/**
 * Keep every group BELOW the non-group nodes — groups always render on the bottom
 * "layer 0", even a group nested in a group. Groups come first in the array (lower
 * z), ordered so a parent group precedes a nested child group; non-groups follow
 * in their existing order, so a non-group child still comes after its group parent
 * (ReactFlow's parent-before-child requirement holds).
 */
export function groupsToBottom(nodes: AppNode[]): AppNode[] {
  const groups = nodes.filter((n) => n.type === 'group');
  if (groups.length === 0) return nodes;
  const others = nodes.filter((n) => n.type !== 'group');
  const byId = new Map(groups.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const ordered: AppNode[] = [];
  const visit = (g: AppNode) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    const parent = g.parentId ? byId.get(g.parentId) : undefined;
    if (parent) visit(parent);
    ordered.push(g);
  };
  for (const g of groups) visit(g);
  return [...ordered, ...others];
}

export type FlowState = {
  nodes: AppNode[];
  edges: AppEdge[];
  diagramName: string;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /** Plugin deps declared by the loaded file; preserved across save so a dep on
   *  an uninstalled plugin is never dropped (see derivePlugins). */
  filePlugins: DiagramPluginDep[];
  /**
   * When true, the active doc is shared read-only by someone else: every USER
   * mutation is a no-op so nothing diverges locally (and thus nothing can be
   * flushed to peers if edit is later granted). Remote application paths
   * (setNodes/setEdges via the bridge) are intentionally NOT gated.
   */
  readOnly: boolean;

  // --- undo/redo history (structural changes only) ---
  /** Snapshots of {nodes,edges} captured BEFORE each committed structural change. */
  past: HistorySnapshot[];
  /** Snapshots to redo into (cleared on any fresh commit). */
  future: HistorySnapshot[];
  /** Capture the CURRENT {nodes,edges} as a restore point. Call BEFORE mutating,
   *  on every structural change you want undoable. No-op while read-only or while
   *  an undo/redo/remote apply is in flight. */
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ReactFlow controlled handlers
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  // mutations
  addNode: (node: AppNode) => void;
  setNodes: (nodes: AppNode[]) => void;
  setEdges: (edges: AppEdge[]) => void;
  updateNodeData: (id: string, patch: Partial<AppNodeData>) => void;
  updateEdge: (id: string, patch: Partial<AppEdge['data']>) => void;
  deleteSelection: () => void;
  setReadOnly: (readOnly: boolean) => void;

  // selection
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;

  // document
  setDiagramName: (name: string) => void;
  loadDiagram: (file: DiagramFile) => void;
  toDiagram: () => DiagramFile;
  reset: () => void;
};

export const useFlowStore = create<FlowState>()((set, get) => ({
  nodes: [],
  edges: [],
  diagramName: 'Sans titre',
  selectedNodeId: null,
  selectedEdgeId: null,
  filePlugins: [],
  readOnly: false,
  past: [],
  future: [],

  onNodesChange: (changes) => {
    if (get().readOnly) {
      // Allow only non-mutating changes (selection/dimensions) when read-only.
      const safe = changes.filter(
        (c) => c.type === 'select' || c.type === 'dimensions',
      );
      if (safe.length === 0) return;
      set({ nodes: applyNodeChanges(safe, get().nodes) as AppNode[] });
      return;
    }
    // Commit ONE history entry per drag/resize gesture: snapshot the state that
    // existed just before the gesture, on the first moving frame. Subsequent
    // frames + the final settle then mutate freely.
    const moving = changes.some(
      (c) =>
        (c.type === 'position' && c.dragging === true) ||
        (c.type === 'dimensions' && (c as { resizing?: boolean }).resizing === true),
    );
    if (moving && !wasDragging) {
      wasDragging = true;
      get().commit();
    } else if (
      !moving &&
      changes.some((c) => c.type === 'position' || c.type === 'dimensions')
    ) {
      wasDragging = false;
    }
    // Key-deletes are committed once in Canvas's onBeforeDelete (covers the
    // node + its edges in a single history entry), so no commit here.
    set({ nodes: applyNodeChanges(changes, get().nodes) as AppNode[] });
  },

  onEdgesChange: (changes) => {
    if (get().readOnly) {
      const safe = changes.filter((c) => c.type === 'select');
      if (safe.length === 0) return;
      set({ edges: applyEdgeChanges(safe, get().edges) as AppEdge[] });
      return;
    }
    set({ edges: applyEdgeChanges(changes, get().edges) as AppEdge[] });
  },

  onConnect: (connection) => {
    if (get().readOnly) return;
    const next = addEdge(
      { ...connection, type: 'labeled', data: { label: '' } },
      get().edges,
    ) as AppEdge[];
    // addEdge returns the SAME array on a duplicate connection — don't record a
    // no-op history entry (it would also wipe the redo stack).
    if (next === get().edges) return;
    get().commit();
    set({ edges: next });
  },

  addNode: (node) => {
    if (get().readOnly) return;
    get().commit();
    set({ nodes: groupsToBottom([...get().nodes, node]) });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  // --- undo/redo engine ---
  commit: () => {
    if (applyingHistory || get().readOnly) return;
    const { nodes, edges, past } = get();
    set({
      past: [...past, { nodes, edges }].slice(-HISTORY_CAP),
      future: [], // a fresh edit invalidates the redo stack
    });
  },

  undo: () => {
    if (get().readOnly) return;
    const { past, future, nodes, edges } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    applyingHistory = true;
    try {
      set({
        past: past.slice(0, -1),
        future: [...future, { nodes, edges }].slice(-HISTORY_CAP),
        nodes: prev.nodes,
        edges: prev.edges,
        // Clear selection so the SelectionBar/Balloon don't point at a block the
        // undo may have removed (stale ids are otherwise harmless).
        selectedNodeId: null,
        selectedEdgeId: null,
      });
    } finally {
      applyingHistory = false;
    }
  },

  redo: () => {
    if (get().readOnly) return;
    const { past, future, nodes, edges } = get();
    const next = future[future.length - 1];
    if (!next) return;
    applyingHistory = true;
    try {
      set({
        past: [...past, { nodes, edges }].slice(-HISTORY_CAP),
        future: future.slice(0, -1),
        nodes: next.nodes,
        edges: next.edges,
        selectedNodeId: null,
        selectedEdgeId: null,
      });
    } finally {
      applyingHistory = false;
    }
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  updateNodeData: (id, patch) => {
    if (get().readOnly) return;
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as AppNode) : n,
      ),
    });
  },

  updateEdge: (id, patch) => {
    if (get().readOnly) return;
    set({
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, ...patch } } : e,
      ),
    });
  },

  // No-op when unchanged so it never triggers a spurious store-subscription
  // (e.g. the collab bridge's pushToY) on a tab switch.
  setReadOnly: (readOnly) => {
    if (get().readOnly !== readOnly) set({ readOnly });
  },

  deleteSelection: () => {
    if (get().readOnly) return;
    const { selectedNodeId, selectedEdgeId, nodes, edges } = get();
    if (!selectedNodeId && !selectedEdgeId) return; // nothing to delete
    get().commit();
    // Removing a group also removes its children — collect every removed id
    // first so we can prune any edge that touches them (no dangling edges).
    const removed = new Set(
      nodes
        .filter((n) => n.id === selectedNodeId || n.parentId === selectedNodeId)
        .map((n) => n.id),
    );
    set({
      nodes: nodes.filter((n) => !removed.has(n.id)),
      edges: edges.filter(
        (e) =>
          e.id !== selectedEdgeId &&
          !removed.has(e.source) &&
          !removed.has(e.target),
      ),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  setDiagramName: (name) => set({ diagramName: name }),

  loadDiagram: (file) =>
    set({
      nodes: groupsToBottom(sanitizeParents(migrateNodeSizes(file.nodes ?? []))),
      edges: file.edges ?? [],
      diagramName: file.name ?? 'Sans titre',
      filePlugins: file.plugins ?? [],
      selectedNodeId: null,
      selectedEdgeId: null,
      // A document switch / new file is not a single undoable edit.
      past: [],
      future: [],
    }),

  toDiagram: () => {
    const plugins = derivePlugins(get().nodes, get().filePlugins);
    return {
      version: 1,
      name: get().diagramName,
      nodes: get().nodes,
      edges: get().edges,
      ...(plugins.length ? { plugins } : {}),
    };
  },

  reset: () =>
    set({
      nodes: [],
      edges: [],
      diagramName: 'Sans titre',
      filePlugins: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      past: [],
      future: [],
    }),
}));
