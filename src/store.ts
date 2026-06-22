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
    set({
      edges: addEdge(
        { ...connection, type: 'labeled', data: { label: '' } },
        get().edges,
      ) as AppEdge[],
    });
  },

  addNode: (node) => {
    if (get().readOnly) return;
    set({ nodes: [...get().nodes, node] });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

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
      nodes: migrateNodeSizes(file.nodes ?? []),
      edges: file.edges ?? [],
      diagramName: file.name ?? 'Sans titre',
      filePlugins: file.plugins ?? [],
      selectedNodeId: null,
      selectedEdgeId: null,
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
    }),
}));
