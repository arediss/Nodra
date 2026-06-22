import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { useFlowStore } from './store';
import type { AppNode, AppEdge, ComponentDef, GroupNodeType } from './types';

/**
 * Reusable components (symbols). A component is a saved sub-graph captured from
 * the current selection. Dropping it instantiates a group whose children get
 * ids `${instanceId}:${slotId}` — so external edges keep working across updates.
 * Persisted in localStorage under pfd:components.
 */

const KEY = 'pfd:components';
const HEADER = 46; // vertical room for the group header
const PAD = 18;
const NODE_ALLOW = 88; // rough node footprint so the container isn't too tight

function readDefs(): ComponentDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ComponentDef[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeDefs(defs: ComponentDef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(defs));
  } catch {
    /* ignore quota */
  }
}

/** Absolute canvas position of a node, walking up any parent chain. */
function absPos(
  n: AppNode,
  byId: Map<string, AppNode>,
): { x: number; y: number } {
  let x = n.position.x;
  let y = n.position.y;
  let p = n.parentId;
  const seen = new Set<string>();
  while (p && !seen.has(p)) {
    seen.add(p);
    const par = byId.get(p);
    if (!par) break;
    x += par.position.x;
    y += par.position.y;
    p = par.parentId;
  }
  return { x, y };
}

/** Build a component definition from a set of selected nodes (flattened). */
function captureDef(
  base: Pick<ComponentDef, 'id' | 'name' | 'version' | 'createdAt'>,
): ComponentDef | null {
  const { nodes, edges } = useFlowStore.getState();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const picked = nodes.filter((n) => n.selected && n.type !== 'group');
  if (picked.length === 0) return null;

  const abs = picked.map((n) => absPos(n, byId));
  const minX = Math.min(...abs.map((a) => a.x));
  const minY = Math.min(...abs.map((a) => a.y));
  const maxX = Math.max(...abs.map((a) => a.x));
  const maxY = Math.max(...abs.map((a) => a.y));

  const ids = new Set(picked.map((n) => n.id));
  const defNodes = picked.map((n, i) => {
    const { parentId: _p, extent: _e, selected: _s, ...rest } = n;
    return {
      ...rest,
      position: { x: abs[i].x - minX + PAD, y: abs[i].y - minY + HEADER },
    } as AppNode;
  });
  const defEdges = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e, selected: false }) as AppEdge);

  return {
    ...base,
    updatedAt: base.createdAt,
    width: maxX - minX + PAD * 2 + NODE_ALLOW,
    height: maxY - minY + HEADER + PAD + NODE_ALLOW,
    nodes: defNodes,
    edges: defEdges,
  };
}

/** Materialise a component as a group + children + internal edges. */
function buildInstance(def: ComponentDef, instanceId: string) {
  const children = def.nodes.map(
    (n) =>
      ({
        ...n,
        id: `${instanceId}:${n.id}`,
        parentId: instanceId,
        extent: 'parent',
        selected: false,
      }) as AppNode,
  );
  const edges = def.edges.map(
    (e) =>
      ({
        ...e,
        id: `${instanceId}:e:${e.id}`,
        source: `${instanceId}:${e.source}`,
        target: `${instanceId}:${e.target}`,
        selected: false,
      }) as AppEdge,
  );
  return { children, edges };
}

export type ComponentsState = {
  defs: ComponentDef[];
  init: () => void;
  createFromSelection: (name: string) => string | null;
  updateFromSelection: (id: string) => boolean;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  instantiate: (componentId: string, position: { x: number; y: number }) => void;
  outdatedCount: () => number;
  updateAllInstances: () => void;
};

export const useComponentsStore = create<ComponentsState>((set, get) => ({
  defs: readDefs(),

  init: () => set({ defs: readDefs() }),

  createFromSelection: (name) => {
    const id = nanoid(8);
    const now = Date.now();
    const def = captureDef({
      id,
      name: name.trim() || 'Composant',
      version: 1,
      createdAt: now,
    });
    if (!def) return null;
    const defs = [def, ...get().defs];
    writeDefs(defs);
    set({ defs });
    return id;
  },

  updateFromSelection: (id) => {
    const existing = get().defs.find((d) => d.id === id);
    if (!existing) return false;
    const captured = captureDef({
      id,
      name: existing.name,
      version: existing.version + 1,
      createdAt: existing.createdAt,
    });
    if (!captured) return false;
    const defs = get().defs.map((d) => (d.id === id ? captured : d));
    writeDefs(defs);
    set({ defs });
    return true;
  },

  rename: (id, name) => {
    const nm = name.trim() || 'Composant';
    const defs = get().defs.map((d) =>
      d.id === id ? { ...d, name: nm, updatedAt: Date.now() } : d,
    );
    writeDefs(defs);
    set({ defs });
  },

  remove: (id) => {
    const defs = get().defs.filter((d) => d.id !== id);
    writeDefs(defs);
    set({ defs });
  },

  instantiate: (componentId, position) => {
    const def = get().defs.find((d) => d.id === componentId);
    if (!def) return;
    const instanceId = nanoid(8);
    const group: GroupNodeType = {
      id: instanceId,
      type: 'group',
      position,
      width: def.width,
      height: def.height,
      data: {
        label: def.name,
        variant: 'plain',
        componentId: def.id,
        componentVersion: def.version,
      },
    };
    const { children, edges } = buildInstance(def, instanceId);
    const flow = useFlowStore.getState();
    flow.setNodes([...flow.nodes, group, ...children]);
    flow.setEdges([...flow.edges, ...edges]);
  },

  outdatedCount: () => {
    const byId = new Map(get().defs.map((d) => [d.id, d]));
    return useFlowStore.getState().nodes.filter(
      (n) =>
        n.type === 'group' &&
        !!n.data.componentId &&
        (byId.get(n.data.componentId)?.version ?? 0) >
          (n.data.componentVersion ?? 0),
    ).length;
  },

  updateAllInstances: () => {
    const byId = new Map(get().defs.map((d) => [d.id, d]));
    const flow = useFlowStore.getState();
    let nodes = [...flow.nodes];
    let edges = [...flow.edges];

    const outdated = nodes.filter(
      (n): n is GroupNodeType =>
        n.type === 'group' &&
        !!n.data.componentId &&
        (byId.get(n.data.componentId)?.version ?? 0) >
          (n.data.componentVersion ?? 0),
    );

    for (const grp of outdated) {
      const def = byId.get(grp.data.componentId!);
      if (!def) continue;
      const instanceId = grp.id;
      // drop the instance's current children + internal edges
      nodes = nodes.filter((n) => n.parentId !== instanceId);
      edges = edges.filter((e) => !e.id.startsWith(`${instanceId}:e:`));
      // rebuild with the same id scheme (external edges keep pointing at slots)
      const { children, edges: intEdges } = buildInstance(def, instanceId);
      nodes = nodes.map((n) =>
        n.id === instanceId
          ? ({
              ...n,
              data: { ...n.data, componentVersion: def.version, label: def.name },
              style: { ...(n.style ?? {}), width: def.width, height: def.height },
            } as AppNode)
          : n,
      );
      nodes = [...nodes, ...children];
      edges = [...edges, ...intEdges];
    }

    flow.setNodes(nodes);
    flow.setEdges(edges);
  },
}));
