import { useMemo, useState } from 'react';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { useFlowStore } from '../store';
import { useUiStore } from '../ui-store';
import { IconGlyph } from '../icons/IconGlyph';
import type { AppNode, IconNodeData } from '../types';
import './LayersPanel.css';

const DND = 'application/nodra-layer';

const TYPE_ICON: Record<string, string> = {
  group: 'mdi:group',
  note: 'mdi:note-outline',
  comment: 'mdi:comment-outline',
  text: 'mdi:format-text',
  erTable: 'mdi:table',
};

function labelOf(n: AppNode, fallback: string): string {
  const d = n.data as { label?: string; text?: string };
  return (d.label ?? d.text ?? '').split('\n')[0].trim() || fallback;
}

type Row = { node: AppNode; depth: number };

/** Flatten the node tree (groups carry children via parentId) into ordered rows. */
function flatten(nodes: AppNode[], parent: string | null, depth: number, out: Row[]) {
  for (const n of nodes) {
    if ((n.parentId ?? null) !== parent) continue;
    out.push({ node: n, depth });
    if (n.type === 'group') flatten(nodes, n.id, depth + 1, out);
  }
}

/** Walk parentId chain to compute a node's absolute position (sum of relative positions). */
function absOf(nodes: AppNode[], id: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let pid: string | undefined = id;
  const seen = new Set<string>();
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const n = nodes.find((m) => m.id === pid);
    if (!n) break;
    x += n.position.x;
    y += n.position.y;
    pid = n.parentId;
  }
  return { x, y };
}

/** ids of `root` and all its descendants, in document order (parent before child). */
function subtreeIds(nodes: AppNode[], root: string): Set<string> {
  const ids = new Set([root]);
  let added = true;
  while (added) {
    added = false;
    for (const n of nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        added = true;
      }
    }
  }
  return ids;
}

/**
 * Outline / "layers" panel (Figma-style): the diagram's nodes as a tree — groups
 * with their children nested. Click a row to select + reveal; drag a row onto a
 * group to move it INTO that group, or anywhere else to pull it to the top level.
 */
export function LayersPanel() {
  const { t } = useTranslation();
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useFlowStore((s) => s.nodes);
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const selectNode = useFlowStore((s) => s.selectNode);
  const setNodes = useFlowStore((s) => s.setNodes);
  const closePanel = useUiStore((s) => s.closePanel);

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const rows = useMemo(() => {
    const out: Row[] = [];
    flatten(nodes, null, 0, out);
    return out;
  }, [nodes]);

  const reveal = (id: string) => {
    selectNode(id);
    if (rf.getNode(id)) rf.fitView({ nodes: [{ id }], duration: 320, padding: 0.6, maxZoom: 1.4 });
  };

  // Move `nodeId` (with its whole subtree) into `groupId`, or to the top level (null).
  const reparent = (nodeId: string, groupId: string | null) => {
    const cur = useFlowStore.getState().nodes;
    const sub = subtreeIds(cur, nodeId);
    if (groupId && (nodeId === groupId || sub.has(groupId))) return; // self / own descendant
    if ((cur.find((n) => n.id === nodeId)?.parentId ?? null) === groupId) return; // unchanged

    const nodeAbs = absOf(cur, nodeId);
    const g = groupId ? absOf(cur, groupId) : { x: 0, y: 0 };
    const pos = { x: nodeAbs.x - g.x, y: nodeAbs.y - g.y };

    const updated = cur.map((n) => {
      if (n.id !== nodeId) return n;
      if (groupId) return { ...n, parentId: groupId, position: pos } as AppNode;
      const { parentId: _p, extent: _e, ...rest } = n;
      return { ...rest, position: pos } as AppNode;
    });

    // A parent must precede its children: lift the moved subtree out (keeping its
    // internal order) and re-insert it right after the target group (or at the end).
    const subtree = updated.filter((n) => sub.has(n.id));
    const rest = updated.filter((n) => !sub.has(n.id));
    if (groupId) {
      const gi = rest.findIndex((n) => n.id === groupId);
      rest.splice(gi + 1, 0, ...subtree);
    } else {
      rest.push(...subtree);
    }
    useFlowStore.getState().commit(); // undoable: layers-panel reparent
    setNodes(rest);
    selectNode(nodeId);
    requestAnimationFrame(() => sub.forEach((id) => updateNodeInternals(id)));
  };

  const onRowDrop = (e: React.DragEvent, targetGroupId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const id = e.dataTransfer.getData(DND);
    if (id) reparent(id, targetGroupId);
  };

  return (
    <div
      className="side-panel lay-panel"
      role="dialog"
      aria-label={t('layers.title')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND)) {
          e.preventDefault();
          setDropTarget('__root__');
        }
      }}
      onDrop={(e) => onRowDrop(e, null)}
    >
      <div className="side-head">
        <Icon icon="mdi:layers-outline" width={16} height={16} />
        <span className="side-title">{t('layers.title')}</span>
        <button
          type="button"
          className="side-close"
          onClick={() => closePanel()}
          aria-label={t('common.close')}
        >
          <Icon icon="mdi:close" width={16} height={16} />
        </button>
      </div>

      <p className="lay-summary muted">{t('layers.count', { count: nodes.length })}</p>

      <div
        className="lay-body"
        data-detach={dropTarget === '__root__' ? 'true' : undefined}
      >
        {rows.length === 0 ? (
          <p className="lay-empty">{t('layers.empty')}</p>
        ) : (
          rows.map(({ node, depth }) => {
            const name = labelOf(node, t('layers.unnamed'));
            const isGroup = node.type === 'group';
            const childCount = isGroup
              ? nodes.filter((n) => n.parentId === node.id).length
              : 0;
            return (
              <button
                key={node.id}
                type="button"
                className="lay-row"
                draggable
                data-sel={selectedId === node.id ? 'true' : undefined}
                data-drop={dropTarget === node.id ? 'true' : undefined}
                style={{ paddingLeft: 9 + depth * 15 }}
                onClick={() => reveal(node.id)}
                title={name}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND, node.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={
                  isGroup
                    ? (e) => {
                        if (e.dataTransfer.types.includes(DND)) {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTarget(node.id);
                        }
                      }
                    : undefined
                }
                onDrop={isGroup ? (e) => onRowDrop(e, node.id) : undefined}
              >
                <span className="lay-glyph">
                  {node.type === 'icon' ? (
                    <IconGlyph
                      source={(node.data as IconNodeData).iconSource}
                      refId={(node.data as IconNodeData).iconRef}
                      name={name}
                      size={16}
                    />
                  ) : (
                    <Icon
                      icon={TYPE_ICON[node.type ?? ''] ?? 'mdi:shape-outline'}
                      width={16}
                      height={16}
                    />
                  )}
                </span>
                <span className="lay-name">{name}</span>
                {childCount > 0 ? <span className="lay-count">{childCount}</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
