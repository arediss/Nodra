import { useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import type { AppEdge, EdgeKind, Waypoint } from '../../types';
import { useFlowStore } from '../../store';

type Pt = { x: number; y: number };

/** Per-kind stroke colour + dash pattern (sync = neutral default). */
const KIND_STYLE: Record<EdgeKind, { color: string; dash?: string }> = {
  sync: { color: '#b8b8c0' },
  async: { color: '#b8b8c0', dash: '6 5' },
  event: { color: '#af52de', dash: '2 4' },
  error: { color: '#ff3b30' },
  data: { color: '#30b0c7' },
};

type PathParams = Parameters<typeof getSmoothStepPath>[0];

/** Compute the edge path + label position for the source/target geometry. */
function computeStraightlessPath(
  pathType: string,
  params: PathParams,
): [string, number, number] {
  if (pathType === 'bezier') {
    const [p, lx, ly] = getBezierPath(params);
    return [p, lx, ly];
  }
  if (pathType === 'straight') {
    const [p, lx, ly] = getStraightPath({
      sourceX: params.sourceX,
      sourceY: params.sourceY,
      targetX: params.targetX,
      targetY: params.targetY,
    });
    return [p, lx, ly];
  }
  const [p, lx, ly] = getSmoothStepPath({ ...params, borderRadius: 8 });
  return [p, lx, ly];
}

/** Squared distance from point p to segment a->b. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  const ex = p.x - px;
  const ey = p.y - py;
  return ex * ex + ey * ey;
}

export function LabeledEdge(props: EdgeProps<AppEdge>) {
  const rf = useReactFlow();
  const draggingRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);

  const wps: Waypoint[] = props.data?.waypoints ?? [];

  const params = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  };

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (wps.length === 0) {
    const pathType = props.data?.pathType ?? 'smooth';
    [edgePath, labelX, labelY] = computeStraightlessPath(pathType, params);
  } else {
    const points: Pt[] = [
      { x: props.sourceX, y: props.sourceY },
      ...wps,
      { x: props.targetX, y: props.targetY },
    ];
    edgePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`)
      .join(' ');
    // Label at the midpoint of the middle segment.
    const mid = Math.floor((points.length - 1) / 2);
    const a = points[mid];
    const b = points[mid + 1];
    labelX = (a.x + b.x) / 2;
    labelY = (a.y + b.y) / 2;
  }

  // Edit happens via the floating balloon — double-click just selects the edge.
  const selectEdge = () => useFlowStore.getState().selectEdge(props.id);

  // Insert a new waypoint on the closest polyline segment.
  const addWaypointAt = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fp = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const points: Pt[] = [
      { x: props.sourceX, y: props.sourceY },
      ...wps,
      { x: props.targetX, y: props.targetY },
    ];
    let bestSeg = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const d = distToSegment(fp, points[i], points[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = i;
      }
    }
    // Segment i sits between waypoint indices (i-1) and i in `wps`,
    // so the new waypoint is inserted at index i (clamped).
    const insertAt = Math.max(0, Math.min(bestSeg, wps.length));
    const next: Waypoint[] = [
      ...wps.slice(0, insertAt),
      { x: fp.x, y: fp.y },
      ...wps.slice(insertAt),
    ];
    useFlowStore.getState().updateEdge(props.id, { waypoints: next });
  };

  const onHandlePointerDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = i;
  };

  const onHandlePointerMove = (i: number) => (e: React.PointerEvent) => {
    if (draggingRef.current !== i) return;
    e.stopPropagation();
    const fp = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const next = wps.map((w, idx) =>
      idx === i ? { x: fp.x, y: fp.y } : w,
    );
    useFlowStore.getState().updateEdge(props.id, { waypoints: next });
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (draggingRef.current !== null) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture may already be lost — ignore.
      }
    }
    draggingRef.current = null;
  };

  const removeWaypoint = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = wps.filter((_, idx) => idx !== i);
    useFlowStore.getState().updateEdge(props.id, { waypoints: next });
  };

  const kind = props.data?.edgeKind;
  const ks = kind ? KIND_STYLE[kind] : null;
  const baseColor = ks?.color ?? '#b8b8c0';
  let dashArray: string | undefined;
  if (ks) {
    dashArray = ks.dash;
  } else if (props.data?.dashed) {
    dashArray = '6 5';
  }

  let strokeColor: string;
  if (props.selected) {
    strokeColor = 'var(--accent)';
  } else if (hovered) {
    strokeColor = '#6b7280';
  } else {
    strokeColor = baseColor;
  }
  const strokeWidth = props.selected || hovered ? 2.4 : 1.6;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        markerEnd={props.markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: dashArray,
          transition: 'stroke 0.12s ease, stroke-width 0.12s ease',
        }}
      />
      {/* Wide invisible interaction path — hover highlights the whole edge,
          double-click adds a waypoint. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={addWaypointAt}
      />

      {props.data?.label ? (
        <EdgeLabelRenderer>
          <div
            onDoubleClick={selectEdge}
            title="Double-cliquer pour modifier"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              background: 'var(--surface)',
              border: '0.5px solid var(--hairline-strong)',
              borderRadius: 6,
              padding: '2px 7px',
              fontSize: 11,
              lineHeight: 1.4,
              color: 'var(--text)',
              boxShadow: 'var(--shadow-card)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {props.data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}

      {props.selected ? (
        <EdgeLabelRenderer>
          {wps.map((wp, i) => (
            <div
              key={i}
              onPointerDown={onHandlePointerDown(i)}
              onPointerMove={onHandlePointerMove(i)}
              onPointerUp={onHandlePointerUp}
              onLostPointerCapture={onHandlePointerUp}
              onDoubleClick={removeWaypoint(i)}
              title="Glisser pour déplacer, double-cliquer pour supprimer"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
                width: 10,
                height: 10,
                background: 'var(--surface)',
                border: '2px solid var(--accent)',
                borderRadius: '50%',
                pointerEvents: 'all',
                cursor: 'grab',
                zIndex: 10,
              }}
            />
          ))}
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
