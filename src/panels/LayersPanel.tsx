import { useMemo, useState } from 'react';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { useFlowStore, groupsToBottom } from '../store';
import { useUiStore } from '../ui-store';
import { IconGlyph } from '../icons/IconGlyph';
import type { AppNode, IconNodeData } from '../types';
import './LayersPanel.css';

const DND = 'application/nodra-layer';
type DropMode = 'before' | 'after' | 'into';

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

/** ids of `root` and all its descendants. */
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

/** Lift the dragged subtree, optionally reparent it (keeping its on-canvas
 *  position), splice it back at `idx`, then re-pin groups to the bottom layer. */
function applyMove(
  cur: AppNode[],
  dragId: string,
  newParent: string | null,
  insertAt: (rest: AppNode[]) => number,
): AppNode[] {
  const dragNode = cur.find((n) => n.id === dragId);
  if (!dragNode) return cur;
  const sub = subtreeIds(cur, dragId);
  let updated = cur;
  if ((dragNode.parentId ?? null) !== newParent) {
    const nodeAbs = absOf(cur, dragId);
    const g = newParent ? absOf(cur, newParent) : { x: 0, y: 0 };
    const pos = { x: nodeAbs.x - g.x, y: nodeAbs.y - g.y };
    updated = cur.map((n) => {
      if (n.id !== dragId) return n;
      if (newParent) return { ...n, parentId: newParent, position: pos } as AppNode;
      const { parentId: _p, extent: _e, ...rest } = n;
      return { ...rest, position: pos } as AppNode;
    });
  }
  const subtree = updated.filter((n) => sub.has(n.id));
  const rest = updated.filter((n) => !sub.has(n.id));
  rest.splice(insertAt(rest), 0, ...subtree);
  return groupsToBottom(rest);
}

/**
 * Outline / "layers" panel (Figma-style). Click a row to select + reveal. Drag a
 * row onto the MIDDLE of a group to move it INTO it, onto the top/bottom EDGE of a
 * row to reorder it before/after (precise layer order), or onto empty space to
 * pull it to the top level. Groups always stay on the bottom layer.
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

  const [drop, setDrop] = useState<{ id: string; mode: DropMode } | null>(null);
  const [rootDrop, setRootDrop] = useState(false);

  const rows = useMemo(() => {
    const out: Row[] = [];
    flatten(nodes, null, 0, out);
    return out;
  }, [nodes]);

  const reveal = (id: string) => {
    selectNode(id);
    if (rf.getNode(id)) rf.fitView({ nodes: [{ id }], duration: 320, padding: 0.6, maxZoom: 1.4 });
  };

  const commitNodes = (next: AppNode[], dragId: string) => {
    useFlowStore.getState().commit();
    setNodes(next);
    selectNode(dragId);
    requestAnimationFrame(() =>
      subtreeIds(next, dragId).forEach((id) => updateNodeInternals(id)),
    );
  };

  const dropOnRow = (dragId: string, targetId: string, mode: DropMode) => {
    const cur = useFlowStore.getState().nodes;
    if (dragId === targetId) return;
    const target = cur.find((n) => n.id === targetId);
    if (!target) return;
    const sub = subtreeIds(cur, dragId);
    if (sub.has(targetId)) return; // onto / into own subtree
    const newParent = mode === 'into' ? targetId : target.parentId ?? null;
    if (newParent && sub.has(newParent)) return; // cycle
    const next = applyMove(cur, dragId, newParent, (rest) => {
      const ti = rest.findIndex((n) => n.id === targetId);
      return mode === 'before' ? ti : ti + 1;
    });
    commitNodes(next, dragId);
  };

  const dropToTop = (dragId: string) => {
    const cur = useFlowStore.getState().nodes;
    if (!cur.find((n) => n.id === dragId)?.parentId) return; // already top-level
    commitNodes(applyMove(cur, dragId, null, (rest) => rest.length), dragId);
  };

  const modeFor = (e: React.DragEvent, isGroup: boolean): DropMode => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (isGroup) return rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'into';
    return rel < 0.5 ? 'before' : 'after';
  };

  return (
    <div
      className="side-panel lay-panel"
      role="dialog"
      aria-label={t('layers.title')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND)) {
          e.preventDefault();
          setRootDrop(true);
          setDrop(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData(DND);
        setRootDrop(false);
        setDrop(null);
        if (id) dropToTop(id);
      }}
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

      <div className="lay-body" data-detach={rootDrop && !drop ? 'true' : undefined}>
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
                data-drop={drop?.id === node.id ? drop.mode : undefined}
                style={{ paddingLeft: 9 + depth * 15 }}
                onClick={() => reveal(node.id)}
                title={name}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND, node.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DND)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setRootDrop(false);
                  setDrop({ id: node.id, mode: modeFor(e, isGroup) });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = e.dataTransfer.getData(DND);
                  const mode = modeFor(e, isGroup);
                  setDrop(null);
                  if (id) dropOnRow(id, node.id, mode);
                }}
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
