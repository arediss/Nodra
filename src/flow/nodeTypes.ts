import type { NodeTypes } from '@xyflow/react';
import * as registries from '../plugins/registries';

/**
 * The ReactFlow node-type map, read from the registry. Memoize on the registry
 * version (Canvas) so the object identity is stable unless a type is (un)added.
 */
export function getNodeTypes(): NodeTypes {
  return Object.fromEntries(registries.nodeTypes.entries()) as NodeTypes;
}
