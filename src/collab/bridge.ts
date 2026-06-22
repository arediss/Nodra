import type { Transaction, YMapEvent } from 'yjs';
import { useFlowStore } from '../store';
import { LOCAL_ORIGIN, REMOTE_ORIGIN, type CollabDoc } from './ydoc';
import type { AppNode, AppEdge } from '../types';

/**
 * Bidirectional sync between the local Zustand flow store and the collaborative
 * Y.Doc. Only persistent fields are mirrored (never transient UI state like
 * `selected`/`dragging`) so selections stay per-user and don't cause churn.
 *
 * Echo loops are prevented two ways:
 *  - store → Y writes use LOCAL_ORIGIN; the Y observers ignore non-REMOTE origins.
 *  - Y → store applies set `applyingRemote`, so the store subscription skips.
 *
 * GATING (`gate()`): the bridge only syncs while the user is looking at the shared
 * document (`viewing`) and is allowed to edit (`canEdit`). When a peer navigates to
 * a private tab the bridge suspends — so creating/switching docs never wipes the
 * shared Y.Doc. Remote updates still accumulate in Y; `resync()` re-pulls them when
 * the peer returns to the shared tab.
 *
 * `seed`: host seeds Y from its current diagram and goes live immediately; a guest
 * stays passive (`live=false`) until the first remote state arrives (catch-up).
 */

type Gate = { viewing: boolean; canEdit: boolean };

export type BridgeControl = {
  stop: () => void;
  /** Re-pull the latest Y state into the store (on returning to the shared tab). */
  resync: () => void;
  /** Mark the doc as caught-up (a remote state frame was received) so a guest may
   *  start broadcasting — even if the shared doc was empty (no map change fired). */
  markSynced: () => void;
};

type NodeJson = Pick<AppNode, 'id' | 'type' | 'position' | 'data'> & {
  style?: AppNode['style'];
  parentId?: string;
  extent?: AppNode['extent'];
  width?: number;
  height?: number;
};

const serializeNode = (n: AppNode): NodeJson => ({
  id: n.id,
  type: n.type,
  position: n.position,
  data: n.data,
  ...(n.style ? { style: n.style } : {}),
  ...(n.parentId ? { parentId: n.parentId, extent: n.extent } : {}),
  // NodeResizer writes node.width/height (not style) — mirror them so resized
  // groups/containers stay the same size for every peer.
  ...(n.width == null ? {} : { width: n.width }),
  ...(n.height == null ? {} : { height: n.height }),
});

const serializeEdge = (e: AppEdge) => ({
  id: e.id,
  type: e.type,
  source: e.source,
  target: e.target,
  ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
  ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
  ...(e.data ? { data: e.data } : {}),
});

// Parents must precede children in the array (React Flow requirement).
const orderForFlow = (nodes: AppNode[]): AppNode[] =>
  [...nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));

export function startBridge(
  c: CollabDoc,
  opts: { seed: boolean; gate: () => Gate },
): BridgeControl {
  const { yNodes, yEdges, doc } = c;
  const { gate } = opts;
  let applyingRemote = false;
  let live = opts.seed;

  // ---- local store -> Y ------------------------------------------------------
  const pushToY = () => {
    const g = gate();
    if (!live || applyingRemote || !g.viewing || !g.canEdit) return;
    const { nodes, edges } = useFlowStore.getState();
    doc.transact(() => {
      const seenN = new Set<string>();
      for (const n of nodes) {
        seenN.add(n.id);
        const json = serializeNode(n);
        if (JSON.stringify(yNodes.get(n.id)) !== JSON.stringify(json)) {
          yNodes.set(n.id, json);
        }
      }
      for (const id of [...yNodes.keys()]) if (!seenN.has(id)) yNodes.delete(id);

      const seenE = new Set<string>();
      for (const e of edges) {
        seenE.add(e.id);
        const json = serializeEdge(e);
        if (JSON.stringify(yEdges.get(e.id)) !== JSON.stringify(json)) {
          yEdges.set(e.id, json);
        }
      }
      for (const id of [...yEdges.keys()]) if (!seenE.has(id)) yEdges.delete(id);
    }, LOCAL_ORIGIN);
  };

  const unsub = useFlowStore.subscribe(pushToY);

  // ---- Y -> local store ------------------------------------------------------
  // `fromRemote` = triggered by an actual remote update (catch-up/edit), not a
  // local resync. Only a real remote pull promotes a guest to `live`, so a
  // resync of a not-yet-synced (empty) Y.Doc can't flip the guest live and let
  // it broadcast an empty document before catch-up arrives.
  const pullToStore = (fromRemote: boolean) => {
    applyingRemote = true;
    try {
      const cur = useFlowStore.getState();
      // Preserve this user's own selection across remote updates.
      const selected = new Set(
        cur.nodes.filter((n) => n.selected).map((n) => n.id),
      );
      const nodes = orderForFlow(
        [...yNodes.values()].map((v) => {
          const n = v as AppNode;
          return selected.has(n.id) ? ({ ...n, selected: true } as AppNode) : n;
        }),
      );
      const edges = [...yEdges.values()] as AppEdge[];
      cur.setNodes(nodes);
      cur.setEdges(edges);
    } finally {
      applyingRemote = false;
      if (fromRemote) live = true; // guest goes live only after real catch-up
    }
  };

  const onRemote = (_e: YMapEvent<unknown>, tr: Transaction) => {
    // Only apply remote changes while the user is on the shared tab; otherwise
    // they accumulate in Y and are re-pulled by resync() on return.
    if (tr.origin === REMOTE_ORIGIN && gate().viewing) pullToStore(true);
  };
  yNodes.observe(onRemote);
  yEdges.observe(onRemote);

  if (opts.seed) pushToY();

  return {
    stop() {
      unsub();
      yNodes.unobserve(onRemote);
      yEdges.unobserve(onRemote);
    },
    resync() {
      if (gate().viewing) pullToStore(false);
    },
    markSynced() {
      // Catch-up reply received (even empty) — the guest is now in sync and may
      // broadcast its own edits. Reflect any caught-up content if we're viewing.
      live = true;
      if (gate().viewing) pullToStore(false);
    },
  };
}
