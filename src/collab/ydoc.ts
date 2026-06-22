import * as Y from 'yjs';

/**
 * The shared collaborative document. Nodes and edges live in per-entity Y.Maps
 * (id -> JSON of the AppNode/AppEdge) so concurrent edits to *different* entities
 * never conflict; same-entity edits resolve last-write-wins per entity.
 */
export type CollabDoc = {
  doc: Y.Doc;
  yNodes: Y.Map<unknown>;
  yEdges: Y.Map<unknown>;
  yMeta: Y.Map<unknown>;
};

export function createCollabDoc(): CollabDoc {
  const doc = new Y.Doc();
  return {
    doc,
    yNodes: doc.getMap('nodes'),
    yEdges: doc.getMap('edges'),
    yMeta: doc.getMap('meta'),
  };
}

/**
 * Transaction-origin markers shared by the provider and the store bridge, so we
 * can tell remote-applied updates apart from local ones and avoid echo loops:
 * - REMOTE_ORIGIN: an update applied from the network (provider) — the bridge
 *   pushes it into the store but must NOT write it back to Y.
 * - LOCAL_ORIGIN: a change written by the bridge from the local store — the
 *   provider broadcasts it; the bridge ignores its own observe callback for it.
 */
export const REMOTE_ORIGIN = Symbol('collab/remote');
export const LOCAL_ORIGIN = Symbol('collab/local');
