import dagre from '@dagrejs/dagre';
import { useFlowStore } from '../store';
import type { AppNode } from '../types';

const NODE_WIDTH = 90;
const NODE_HEIGHT = 80;

export function autoLayout(direction: 'LR' | 'TB' = 'LR'): void {
  const { nodes, edges, setNodes } = useFlowStore.getState();
  if (nodes.length === 0) return;

  // Nodes eligible for ranking: not groups, not children of a parent.
  const laidOut = nodes.filter((n) => n.type !== 'group' && !n.parentId);
  if (laidOut.length === 0) return;

  const ids = new Set(laidOut.map((n) => n.id));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of laidOut) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const updated: AppNode[] = nodes.map((n) => {
    if (!ids.has(n.id)) return n;
    const pos = g.node(n.id);
    if (!pos) return n;
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  setNodes(updated);
}
