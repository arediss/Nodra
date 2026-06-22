import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { setReactFlowInstance } from './flowBridge';
import type { AppNode, AppEdge } from '../types';

/**
 * Captures the ReactFlow instance for host.flow.fitView (which lives outside
 * React and can't call the hook). Renders nothing; mounted once under
 * ReactFlowProvider.
 */
export function FlowBridge() {
  const rf = useReactFlow<AppNode, AppEdge>();
  useEffect(() => {
    setReactFlowInstance(rf);
    return () => setReactFlowInstance(null);
  }, [rf]);
  return null;
}
