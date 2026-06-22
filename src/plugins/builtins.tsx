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
import { LayersPanel } from '../panels/LayersPanel';
import { i18n } from '../i18n';

let done = false;

/**
 * Register the core's own node types through the host SDK (no special core path —
 * rule #4). Synchronous: must run before the first render so the canvas has its
 * node types. The core ships EMPTY of pluggable things: icon packs, importers,
 * exporters and panels come only from installed plugins (loaded from disk by
 * loadDiskPlugins). Only the generic node types + the native JSON exporter are
 * core builtins.
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

  // Core "Layers" outline panel (Figma-style node tree). Title captured at init;
  // the panel's own header re-translates via useTranslation.
  host.panels.register({
    id: 'layers',
    side: 'right',
    component: LayersPanel,
    title: i18n.t('layers.title'),
    icon: 'mdi:layers-outline',
  });

  registerBuiltinExporters(host);
}
