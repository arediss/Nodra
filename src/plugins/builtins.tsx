import { buildHost } from './host';
import { registerBuiltinExporters } from './builtinExporters';
import { API_VERSION, ALL_PERMISSIONS } from './types';
import { IconNode } from '../flow/nodes/IconNode';
import { GroupNode } from '../flow/nodes/GroupNode';
import { ErTableNode } from '../flow/nodes/ErTableNode';
import { NoteNode } from '../flow/nodes/NoteNode';
import { CommentNode } from '../flow/nodes/CommentNode';
import { TextNode } from '../flow/nodes/TextNode';
import { UnknownNode } from '../flow/nodes/UnknownNode';
import { CORE_BLOCKS } from '../icons/coreBlocks';

let done = false;

/**
 * Register the core's own contributions through the host SDK (no special core path
 * — rule #4). Synchronous: must run before the first render so the canvas has its
 * node types. The core stays minimal — provider-specific icon packs, importers and
 * panels come only from installed plugins (loaded from disk by loadDiskPlugins) —
 * but ships the generic node types, the native JSON exporter, AND a small generic
 * block set (CORE_BLOCKS) so the app is usable with no plugin installed.
 */
export function registerBuiltins(): void {
  if (done) return;
  done = true;

  const host = buildHost({
    id: 'com.nodra.core',
    name: 'Nodra Core',
    version: '0.0.0',
    api_version: API_VERSION,
    permissions: ALL_PERMISSIONS,
    main: '',
  });

  host.nodeTypes.register('icon', IconNode);
  host.nodeTypes.register('group', GroupNode);
  host.nodeTypes.register('erTable', ErTableNode);
  host.nodeTypes.register('note', NoteNode);
  host.nodeTypes.register('comment', CommentNode);
  host.nodeTypes.register('text', TextNode);
  // 'default' is ReactFlow's fallback key: any unknown/plugin type a peer or a
  // removed plugin leaves behind renders as UnknownNode — data is never altered.
  host.nodeTypes.register('default', UnknownNode);

  // A generic starter block set so the palette isn't empty without plugins.
  host.blocks.register(CORE_BLOCKS);

  registerBuiltinExporters(host);
}
