// The flow side of the host SDK, living outside React so host.flow can be a
// plain object. State reads/writes go through the Zustand store (sync getState,
// no hook); fitView needs the live ReactFlow instance, captured by <FlowBridge/>
// once it mounts under ReactFlowProvider. Single source of truth — host.flow is
// a thin permission-gated wrapper over this.

import type { ReactFlowInstance, FitViewOptions } from '@xyflow/react';
import { useFlowStore } from '../store';
import type { AppNode, AppEdge, DiagramFile } from '../types';

let rf: ReactFlowInstance<AppNode, AppEdge> | null = null;

/** Called by <FlowBridge/> on mount/unmount (instance only exists in-tree). */
export function setReactFlowInstance(
  instance: ReactFlowInstance<AppNode, AppEdge> | null,
): void {
  rf = instance;
}

export const flowBridge = {
  getNodes: (): AppNode[] => [...useFlowStore.getState().nodes],
  getEdges: (): AppEdge[] => [...useFlowStore.getState().edges],
  getSelection: () => {
    const s = useFlowStore.getState();
    return { nodeId: s.selectedNodeId, edgeId: s.selectedEdgeId };
  },
  setNodes: (nodes: AppNode[]) => useFlowStore.getState().setNodes(nodes),
  setEdges: (edges: AppEdge[]) => useFlowStore.getState().setEdges(edges),
  loadDiagram: (file: DiagramFile) => useFlowStore.getState().loadDiagram(file),
  toDiagram: (): DiagramFile => useFlowStore.getState().toDiagram(),
  selectEdge: (id: string | null) => useFlowStore.getState().selectEdge(id),
  // No-op until <FlowBridge/> captures the instance — never throws, but warn so
  // a plugin calling fitView during init knows why nothing happened.
  fitView: (options?: FitViewOptions<AppNode>) => {
    if (!rf) {
      console.warn('[nodra] host.flow.fitView ignored — canvas not mounted yet');
      return;
    }
    rf.fitView(options);
  },
  subscribe: (listener: () => void) => useFlowStore.subscribe(listener),
};
