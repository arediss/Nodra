import { useLayoutEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useStore } from '@xyflow/react';
import { useFlowStore, newId } from '../store';
import { useUiStore } from '../ui-store';
import {
  isIconNode,
  isGroupNode,
  isErTableNode,
  isNoteNode,
  isCommentNode,
  isImageNodeData,
  type AppNode,
  type NoteColor,
  type EdgeKind,
} from '../types';
import { GroupIconPicker } from './GroupIconPicker';
import './SelectionBalloon.css';

const DEFAULT_ACCENT = '#0a84ff';

const NOTE_COLORS: { id: NoteColor; hex: string }[] = [
  { id: 'yellow', hex: '#fff7c0' },
  { id: 'blue', hex: '#d9e7ff' },
  { id: 'green', hex: '#d8f5dd' },
  { id: 'pink', hex: '#ffd9e6' },
  { id: 'gray', hex: '#ededf0' },
];

type Pos = { x: number; y: number };

export function SelectionBalloon() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectedEdgeId = useFlowStore((s) => s.selectedEdgeId);
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const selCount = useFlowStore(
    (s) => s.nodes.filter((n) => n.selected && n.type !== 'group').length,
  );

  // Re-position whenever the canvas pans/zooms.
  const tx = useStore((s) => s.transform);
  // When the canvas is locked (padlock), don't offer edit actions.
  const locked = useStore((s) => !s.nodesDraggable);
  // Follow the selected node while it is being dragged.
  const selPos = useFlowStore((s) => {
    const n = s.nodes.find((x) => x.id === s.selectedNodeId);
    return n ? `${n.position.x},${n.position.y}` : '';
  });

  const [pos, setPos] = useState<Pos | null>(null);

  const active = (selectedNodeId || selectedEdgeId) && selCount < 2 && !locked;

  useLayoutEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    const el = selectedNodeId
      ? document.querySelector(
          `.react-flow__node[data-id="${selectedNodeId}"]`,
        )
      : document.querySelector(
          `.react-flow__edge[data-id="${selectedEdgeId}"]`,
        );
    if (!el) {
      setPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  }, [active, selectedNodeId, selectedEdgeId, tx, selPos]);

  if (!active || !pos) return null;

  const node = nodes.find((n) => n.id === selectedNodeId);
  const edge = edges.find((e) => e.id === selectedEdgeId);

  const duplicate = (n: AppNode) => {
    const clone = {
      ...n,
      id: newId(),
      position: { x: n.position.x + 24, y: n.position.y + 24 },
      selected: false,
    } as AppNode;
    useFlowStore.getState().addNode(clone);
    useFlowStore.getState().selectNode(clone.id);
  };

  const remove = () => useFlowStore.getState().deleteSelection();

  const Divider = () => <span className="selb-divider" aria-hidden="true" />;

  const DuplicateBtn = ({ n }: { n: AppNode }) => (
    <button
      type="button"
      className="btn-icon"
      title="Dupliquer"
      aria-label="Dupliquer"
      onClick={() => duplicate(n)}
    >
      <Icon icon="mdi:content-copy" width={16} height={16} />
    </button>
  );

  const DeleteBtn = () => (
    <button
      type="button"
      className="btn-icon btn-danger"
      title="Supprimer"
      aria-label="Supprimer"
      onClick={remove}
    >
      <Icon icon="mdi:trash-can-outline" width={16} height={16} />
    </button>
  );

  let body: React.ReactNode = null;

  if (node && isIconNode(node) && isImageNodeData(node.data)) {
    // Image block: just a background-frame toggle + details + dup/delete.
    const framed = !!node.data.imageFramed;
    const imgTags = node.data.tags?.length ?? 0;
    body = (
      <>
        <button
          type="button"
          className="btn-icon"
          data-active={framed}
          title={framed ? 'Retirer le fond' : 'Ajouter un fond'}
          aria-label="Fond du bloc image"
          onClick={() =>
            useFlowStore.getState().updateNodeData(node.id, { imageFramed: !framed })
          }
        >
          <Icon icon={framed ? 'mdi:image-frame' : 'mdi:image-off-outline'} width={16} height={16} />
        </button>
        <Divider />
        <button
          type="button"
          className="btn-icon"
          data-active={imgTags > 0}
          title="Détails (tags, métadonnées)"
          aria-label="Détails"
          onClick={() => useUiStore.getState().openDetails()}
        >
          <Icon icon="mdi:tag-multiple-outline" width={16} height={16} />
        </button>
        <DuplicateBtn n={node} />
        <DeleteBtn />
      </>
    );
  } else if (node && isIconNode(node)) {
    const accent = node.data.accent;
    const tagCount = node.data.tags?.length ?? 0;
    body = (
      <>
        <label className="selb-swatch" title="Couleur d'accent">
          <input
            type="color"
            value={accent ?? DEFAULT_ACCENT}
            onChange={(e) =>
              useFlowStore.getState().updateNodeData(node.id, {
                accent: e.target.value,
              })
            }
          />
        </label>
        {accent && (
          <button
            type="button"
            className="btn-icon selb-reset"
            title="Réinitialiser la couleur"
            aria-label="Réinitialiser la couleur"
            onClick={() =>
              useFlowStore.getState().updateNodeData(node.id, {
                accent: undefined,
              })
            }
          >
            <Icon icon="mdi:close" width={16} height={16} />
          </button>
        )}
        <Divider />
        <button
          type="button"
          className="btn-icon"
          data-active={tagCount > 0}
          title="Détails (tags, métadonnées)"
          aria-label="Détails"
          onClick={() => useUiStore.getState().openDetails()}
        >
          <Icon icon="mdi:tag-multiple-outline" width={16} height={16} />
        </button>
        <DuplicateBtn n={node} />
        <DeleteBtn />
      </>
    );
  } else if (node && isGroupNode(node)) {
    const { color, icon } = node.data;
    body = (
      <>
        <input
          className="input selb-name"
          placeholder="Nom du groupe"
          value={node.data.label}
          onChange={(e) =>
            useFlowStore.getState().updateNodeData(node.id, {
              label: e.target.value,
            })
          }
        />
        <Divider />
        <GroupIconPicker
          value={icon}
          onPick={(ic) =>
            useFlowStore.getState().updateNodeData(node.id, { icon: ic })
          }
        />
        <label className="selb-swatch" title="Couleur">
          <input
            type="color"
            value={color ?? DEFAULT_ACCENT}
            onChange={(e) =>
              useFlowStore.getState().updateNodeData(node.id, {
                color: e.target.value,
              })
            }
          />
        </label>
        <Divider />
        <DeleteBtn />
      </>
    );
  } else if (node && isErTableNode(node)) {
    const accent = node.data.accent;
    body = (
      <>
        <label className="selb-swatch" title="Couleur d'accent">
          <input
            type="color"
            value={accent ?? DEFAULT_ACCENT}
            onChange={(e) =>
              useFlowStore.getState().updateNodeData(node.id, {
                accent: e.target.value,
              })
            }
          />
        </label>
        <span className="muted selb-hint">
          double-clic pour éditer les colonnes
        </span>
        <Divider />
        <DuplicateBtn n={node} />
        <DeleteBtn />
      </>
    );
  } else if (node && isNoteNode(node)) {
    const color = node.data.color;
    body = (
      <>
        <div className="selb-dots">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="selb-dot"
              data-active={color === c.id}
              title={c.id}
              aria-label={c.id}
              style={{ background: c.hex }}
              onClick={() =>
                useFlowStore.getState().updateNodeData(node.id, {
                  color: c.id,
                })
              }
            />
          ))}
        </div>
        <Divider />
        <DuplicateBtn n={node} />
        <DeleteBtn />
      </>
    );
  } else if (node && isCommentNode(node)) {
    body = (
      <>
        <DuplicateBtn n={node} />
        <DeleteBtn />
      </>
    );
  } else if (edge) {
    const dashed = edge.data?.dashed ?? false;
    body = (
      <>
        <input
          className="input selb-edge-label"
          placeholder="Libellé"
          value={edge.data?.label ?? ''}
          onChange={(e) =>
            useFlowStore.getState().updateEdge(edge.id, {
              label: e.target.value,
            })
          }
        />
        <Divider />
        <div className="seg selb-seg">
          {(['smooth', 'bezier', 'straight'] as const).map((pt) => (
            <button
              key={pt}
              type="button"
              data-active={(edge.data?.pathType ?? 'smooth') === pt}
              title={
                pt === 'smooth' ? 'Angles' : pt === 'bezier' ? 'Courbe' : 'Droit'
              }
              onClick={() =>
                useFlowStore.getState().updateEdge(edge.id, { pathType: pt })
              }
            >
              <Icon
                icon={
                  pt === 'smooth'
                    ? 'mdi:vector-polyline'
                    : pt === 'bezier'
                      ? 'mdi:vector-curve'
                      : 'mdi:vector-line'
                }
                width={15}
                height={15}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-icon"
          data-active={dashed}
          title="Pointillé"
          aria-label="Pointillé"
          onClick={() =>
            useFlowStore.getState().updateEdge(edge.id, { dashed: !dashed })
          }
        >
          <Icon icon="mdi:dots-horizontal" width={18} height={18} />
        </button>
        <Divider />
        <select
          className="selb-kind"
          title="Type de relation"
          value={edge.data?.edgeKind ?? ''}
          onChange={(e) =>
            useFlowStore.getState().updateEdge(edge.id, {
              edgeKind: (e.target.value || undefined) as EdgeKind | undefined,
            })
          }
        >
          <option value="">Type…</option>
          <option value="sync">Synchrone</option>
          <option value="async">Asynchrone</option>
          <option value="event">Événement</option>
          <option value="error">Erreur</option>
          <option value="data">Données</option>
        </select>
        <Divider />
        <DeleteBtn />
      </>
    );
  }

  if (!body) return null;

  return (
    <div
      className="selb"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {body}
    </div>
  );
}
