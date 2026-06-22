import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  ConnectionMode,
  MarkerType,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type Edge,
} from '@xyflow/react';
import { useFlowStore, newId } from '../store';
import { useUiStore } from '../ui-store';
import { useDocsStore } from '../docs-store';
import { useCollabStore } from '../collab/session';
import { reportCursor, localPeer } from '../collab/presence';
import { Cursors } from '../collab/Cursors';
import { isGroupNode, type AppNode } from '../types';
import { createIconNode, insertTemplate } from './nodeTemplates';
import { getNodeTypes } from './nodeTypes';
import * as registries from '../plugins/registries';
import { useRegistryVersion } from '../plugins/useRegistry';
import { edgeTypes } from './edgeTypes';
import { ContextMenu, type MenuItem } from '../panels/ContextMenu';
import './Canvas.css';

const defaultEdgeOptions = {
  type: 'labeled',
  markerEnd: { type: MarkerType.ArrowClosed },
};

const snapGrid: [number, number] = [8, 8];

export function Canvas() {
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // Node types come from the registry; stable identity unless a type is (un)added.
  const nodeTypesVersion = useRegistryVersion(registries.nodeTypes);
  const nodeTypes = useMemo(() => getNodeTypes(), [nodeTypesVersion]);
  const prefs = useUiStore((s) => s.prefs);
  const gridStyle = useUiStore((s) => s.gridStyle);
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const openPicker = useUiStore((s) => s.openPicker);
  const canvasLocked = useUiStore((s) => s.canvasLocked);

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const addNode = useFlowStore((s) => s.addNode);
  const setNodes = useFlowStore((s) => s.setNodes);
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectEdge = useFlowStore((s) => s.selectEdge);
  const deleteSelection = useFlowStore((s) => s.deleteSelection);

  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const closeCtx = useCallback(() => setCtx(null), []);

  // Connect tool: click a source node, then a target, to draw a link "on the fly".
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  useEffect(() => {
    if (tool !== 'connect') setPendingSource(null);
  }, [tool]);

  // While a connection is being dragged, reveal every block's handles so you can
  // see where the cable can land (#6).
  const [drawingEdge, setDrawingEdge] = useState(false);
  const onConnectStart = useCallback(() => setDrawingEdge(true), []);
  const onConnectEnd = useCallback(() => setDrawingEdge(false), []);

  // The active doc is read-only when it's a doc someone else shared with editing off.
  const collabRole = useCollabStore((s) => s.role);
  const sharedDocs = useCollabStore((s) => s.sharedDocs);
  const activeId = useDocsStore((s) => s.activeId);
  const activeEntry = sharedDocs.find((e) => e.docId === activeId);
  const activeIsShared = !!activeEntry;
  const editable = !(
    activeEntry && activeEntry.ownerId !== localPeer.id && !activeEntry.canEdit
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const src = useFlowStore.getState().nodes.find((n) => n.id === id);
      if (!src || src.type === 'group') return;
      const clone = {
        ...src,
        id: newId(),
        position: { x: src.position.x + 24, y: src.position.y + 24 },
        selected: false,
      } as AppNode;
      addNode(clone);
      selectNode(clone.id);
    },
    [addNode, selectNode],
  );

  // Detach a node from its group (explicit, works even for older clamped nodes).
  const detachFromGroup = useCallback(
    (id: string) => {
      const cur = useFlowStore.getState().nodes;
      const me = cur.find((n) => n.id === id);
      if (!me || !me.parentId) return;
      const parent = rf.getNode(me.parentId);
      const pAbs =
        (parent as unknown as { positionAbsolute?: { x: number; y: number } })
          ?.positionAbsolute ?? parent?.position ?? { x: 0, y: 0 };
      const next = cur.map((n) => {
        if (n.id !== id) return n;
        const { parentId: _p, extent: _e, ...rest } = n;
        return {
          ...rest,
          position: { x: pAbs.x + n.position.x, y: pAbs.y + n.position.y },
        } as AppNode;
      });
      setNodes(next);
    },
    [rf, setNodes],
  );

  const onPaneContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      e.preventDefault();
      if (!editable) return;
      const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      openPicker({ sx: e.clientX, sy: e.clientY, flow });
    },
    [rf, openPicker, editable],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      if (!editable) return;
      selectNode(node.id);
      const items: MenuItem[] = [
        {
          label: 'Dupliquer',
          icon: 'mdi:content-copy',
          onClick: () => duplicateNode(node.id),
        },
      ];
      if (node.parentId) {
        items.push({
          label: 'Retirer du groupe',
          icon: 'mdi:arrow-up-box',
          onClick: () => detachFromGroup(node.id),
        });
      }
      items.push({
        label: 'Supprimer',
        icon: 'mdi:trash-can-outline',
        danger: true,
        separatorBefore: true,
        onClick: () => deleteSelection(),
      });
      setCtx({ x: e.clientX, y: e.clientY, items });
    },
    [selectNode, duplicateNode, detachFromGroup, deleteSelection, editable],
  );

  const inSession = collabRole !== null;
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Only broadcast the cursor while on a shared doc (cursors render there).
      if (!inSession || !activeIsShared) return;
      reportCursor(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [inSession, activeIsShared, rf],
  );
  const onPointerLeave = useCallback(() => {
    if (inSession) reportCursor(null);
  }, [inSession]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();

      const raw = e.dataTransfer.getData('application/pfd-icon');
      if (!raw) return;
      let parsed: {
        source: 'iconify' | 'svg';
        ref: string;
        name: string;
        provider?: string;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(createIconNode(parsed, position));
    },
    [rf, addNode],
  );

  const onNodeClick = useCallback(
    (_: unknown, n: Node) => {
      if (tool === 'connect' && editable) {
        if (!pendingSource) {
          setPendingSource(n.id);
          selectNode(n.id);
        } else if (pendingSource !== n.id) {
          useFlowStore
            .getState()
            .onConnect({ source: pendingSource, target: n.id, sourceHandle: null, targetHandle: null });
          setPendingSource(null);
          setTool('select');
          selectNode(null);
        }
        return;
      }
      selectNode(n.id);
    },
    [tool, editable, pendingSource, selectNode, setTool],
  );

  const onEdgeClick = useCallback(
    (_: unknown, e: Edge) => selectEdge(e.id),
    [selectEdge],
  );

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (tool === 'connect') {
        // Clicking empty canvas cancels the in-progress link (keeps the tool on).
        setPendingSource(null);
        selectNode(null);
        return;
      }
      if (tool === 'select' || tool === 'image' || !editable) {
        selectNode(null);
        return;
      }
      // Placement mode: drop the chosen tool's node where you clicked.
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = insertTemplate(tool, position);
      if (id) selectNode(id);
      setTool('select');
    },
    [tool, rf, selectNode, setTool, editable],
  );

  // Group drag bookkeeping: cache the contained children + last position so we
  // can shift their edges' (absolute) waypoints live as the group moves (#3).
  const groupDragRef = useRef<{
    id: string;
    lastX: number;
    lastY: number;
    childIds: Set<string>;
  } | null>(null);

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    if (node.type === 'group') {
      const childIds = new Set(
        useFlowStore.getState().nodes.filter((n) => n.parentId === node.id).map((n) => n.id),
      );
      groupDragRef.current = { id: node.id, lastX: node.position.x, lastY: node.position.y, childIds };
    }
  }, []);

  const onNodeDrag = useCallback((_: unknown, node: Node) => {
    const g = groupDragRef.current;
    if (!g || node.type !== 'group' || g.id !== node.id || g.childIds.size === 0) return;
    const dx = node.position.x - g.lastX;
    const dy = node.position.y - g.lastY;
    if (dx === 0 && dy === 0) return;
    g.lastX = node.position.x;
    g.lastY = node.position.y;
    const all = useFlowStore.getState();
    let touched = false;
    const next = all.edges.map((e) => {
      const wps = e.data?.waypoints;
      if (!wps?.length || !g.childIds.has(e.source) || !g.childIds.has(e.target)) return e;
      touched = true;
      return {
        ...e,
        data: { ...e.data, waypoints: wps.map((w) => ({ x: w.x + dx, y: w.y + dy })) },
      };
    });
    if (touched) all.setEdges(next);
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, dragged: Node) => {
      if (dragged.type === 'group') {
        groupDragRef.current = null; // waypoints already shifted live in onNodeDrag
        return;
      }

      // Best-effort reparenting: never throw, never break the build.
      const live = rf.getNode(dragged.id);
      if (!live) return;

      const current = useFlowStore.getState().nodes;
      const me = current.find((n) => n.id === dragged.id);
      if (!me || isGroupNode(me)) return;

      // Absolute rect of any node (positionAbsolute + measured size).
      const rectOf = (n: Node) => {
        const p =
          (n as unknown as { positionAbsolute?: { x: number; y: number } }).positionAbsolute ??
          n.position;
        const w = (n.measured?.width ?? n.width ?? 0) as number;
        const h = (n.measured?.height ?? n.height ?? 0) as number;
        return { x: p.x, y: p.y, w, h };
      };

      const r = rectOf(live);
      const abs = { x: r.x, y: r.y };
      // The block belongs to whichever group its CENTRE sits in — so dragging the
      // block's centre past a group's edge moves it out (or into another group),
      // no clicks needed (#4).
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      let targetGroup: Node | undefined;
      for (const n of rf.getNodes()) {
        if (n.type !== 'group' || n.id === me.id) continue;
        const g = rectOf(n);
        if (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h) {
          targetGroup = n;
          break;
        }
      }

      let nextNodes: AppNode[] | null = null;

      if (targetGroup) {
        if (me.parentId === targetGroup.id) return; // still inside its own group
        const g = rectOf(targetGroup);
        nextNodes = current.map((n) =>
          n.id === me.id
            ? ({
                ...n,
                parentId: targetGroup!.id,
                position: { x: abs.x - g.x, y: abs.y - g.y },
              } as AppNode)
            : n,
        );
      } else if (me.parentId) {
        // Centre is outside every group -> detach to absolute coords.
        nextNodes = current.map((n) => {
          if (n.id !== me.id) return n;
          const { parentId: _p, extent: _e, ...rest } = n;
          return { ...rest, position: { x: abs.x, y: abs.y } } as AppNode;
        });
      }

      if (nextNodes) {
        setNodes(nextNodes);
        // Refresh ReactFlow's cached absolute position after a parentId change,
        // otherwise the NEXT intersection test uses stale bounds and a re-drop
        // into a group is no longer detected (#2 — "se fix plus au groupe").
        const tid = me.id;
        requestAnimationFrame(() => updateNodeInternals(tid));
      }
    },
    [rf, setNodes, updateNodeInternals],
  );

  return (
    <div
      className="cv-root"
      data-placing={tool !== 'select' && tool !== 'image' ? 'true' : undefined}
      data-connecting={tool === 'connect' || drawingEdge ? 'true' : undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
        fitView
        nodesDraggable={editable && !canvasLocked}
        nodesConnectable={editable && !canvasLocked}
        elementsSelectable={editable}
        deleteKeyCode={editable && !canvasLocked ? ['Backspace', 'Delete'] : []}
        proOptions={{ hideAttribution: false }}
        panOnDrag
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Shift']}
        snapToGrid={prefs.snapToGrid}
        snapGrid={snapGrid}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
      >
        {gridStyle !== 'none' && (
          <Background
            variant={gridStyle === 'lines' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={gridStyle === 'lines' ? 24 : 18}
            size={1}
            color="var(--canvas-dot)"
          />
        )}
        {prefs.showMinimap && <MiniMap pannable zoomable />}
        {inSession && activeIsShared && <Cursors />}
      </ReactFlow>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={closeCtx} />
      )}
    </div>
  );
}
