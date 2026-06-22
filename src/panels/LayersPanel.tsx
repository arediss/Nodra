import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { useFlowStore } from '../store';
import { useUiStore } from '../ui-store';
import { IconGlyph } from '../icons/IconGlyph';
import type { AppNode, IconNodeData } from '../types';
import './LayersPanel.css';

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

/**
 * Outline / "layers" panel (Figma-style): the diagram's nodes as a tree — groups
 * with their children nested. Click a row to select + reveal it on the canvas.
 * Registered as a core panel in registerBuiltins.
 */
export function LayersPanel() {
  const { t } = useTranslation();
  const rf = useReactFlow();
  const nodes = useFlowStore((s) => s.nodes);
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const selectNode = useFlowStore((s) => s.selectNode);
  const closePanel = useUiStore((s) => s.closePanel);

  const rows = useMemo(() => {
    const out: Row[] = [];
    flatten(nodes, null, 0, out);
    return out;
  }, [nodes]);

  const reveal = (id: string) => {
    selectNode(id);
    if (rf.getNode(id)) {
      rf.fitView({ nodes: [{ id }], duration: 320, padding: 0.6, maxZoom: 1.4 });
    }
  };

  return (
    <div className="side-panel lay-panel" role="dialog" aria-label={t('layers.title')}>
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

      <div className="lay-body">
        {rows.length === 0 ? (
          <p className="lay-empty">{t('layers.empty')}</p>
        ) : (
          rows.map(({ node, depth }) => {
            const name = labelOf(node, t('layers.unnamed'));
            const childCount =
              node.type === 'group' ? nodes.filter((n) => n.parentId === node.id).length : 0;
            return (
              <button
                key={node.id}
                type="button"
                className="lay-row"
                data-sel={selectedId === node.id ? 'true' : undefined}
                style={{ paddingLeft: 9 + depth * 15 }}
                onClick={() => reveal(node.id)}
                title={name}
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
