import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '../store';
import type { AppNode, AppEdge } from '../types';
import './CanvasSearch.css';

/** Lower-cased searchable text for a node (label + sublabel + provider + text). */
function nodeText(n: AppNode): string {
  const d = n.data as Record<string, unknown>;
  const parts = [d.label, d.sublabel, d.provider, d.text];
  if (Array.isArray(d.tags)) parts.push((d.tags as string[]).join(' '));
  return parts.filter((x) => typeof x === 'string').join(' ').toLowerCase();
}
const edgeText = (e: AppEdge): string => (e.data?.label ?? '').toLowerCase();

type Hit = { kind: 'node' | 'edge'; id: string; label: string };

/**
 * Cmd/Ctrl+F search across the diagram: matches node labels/sublabels/text/tags and
 * edge labels, selects each hit and centres the viewport on it. ↑/↓ or Enter cycles.
 */
export function CanvasSearch() {
  const rf = useReactFlow();
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectEdge = useFlowStore((s) => s.selectEdge);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastJumped = useRef<string | null>(null);

  // Open on Cmd/Ctrl+F.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    for (const n of nodes) {
      if (nodeText(n).includes(q)) {
        const d = n.data as Record<string, unknown>;
        const label =
          (typeof d.label === 'string' && d.label) ||
          (typeof d.text === 'string' && d.text) ||
          n.type;
        out.push({ kind: 'node', id: n.id, label: String(label).slice(0, 40) });
      }
    }
    for (const e of edges) {
      if (edgeText(e).includes(q)) {
        out.push({ kind: 'edge', id: e.id, label: e.data?.label ?? 'lien' });
      }
    }
    return out;
  }, [query, nodes, edges]);

  const goTo = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    // Set the real ReactFlow `selected` flag (via the store arrays) so the hit is
    // genuinely selected — highlight, edge waypoints, balloon — and prior selection
    // is cleared. Selection isn't persisted to Y, so this won't churn collab sync.
    const fs = useFlowStore.getState();
    fs.setNodes(
      fs.nodes.map((n) => {
        const sel = hit.kind === 'node' && n.id === hit.id;
        return n.selected === sel ? n : { ...n, selected: sel };
      }),
    );
    fs.setEdges(
      fs.edges.map((e) => {
        const sel = hit.kind === 'edge' && e.id === hit.id;
        return e.selected === sel ? e : { ...e, selected: sel };
      }),
    );
    if (hit.kind === 'node') {
      selectNode(hit.id);
      rf.fitView({ nodes: [{ id: hit.id }], duration: 300, padding: 0.6, maxZoom: 1.4 });
    } else {
      selectEdge(hit.id);
      const e = edges.find((x) => x.id === hit.id);
      const src = e && nodes.find((n) => n.id === e.source);
      if (src) rf.fitView({ nodes: [{ id: src.id }], duration: 300, padding: 0.8, maxZoom: 1.2 });
    }
  };

  // Jump to the first hit only when the QUERY changes (not when the graph mutates,
  // e.g. live collab edits) — otherwise the viewport would yank back to hit 0.
  useEffect(() => {
    if (lastJumped.current === query) return;
    lastJumped.current = query;
    setActive(0);
    if (hits.length > 0) goTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hits]);

  const step = (dir: 1 | -1) => {
    if (hits.length === 0) return;
    const next = (active + dir + hits.length) % hits.length;
    setActive(next);
    goTo(next);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  if (!open) return null;

  return (
    <div className="csearch" onPointerDown={(e) => e.stopPropagation()}>
      <Icon className="csearch-lead" icon="mdi:magnify" width={16} height={16} />
      <input
        ref={inputRef}
        className="csearch-input"
        placeholder="Rechercher dans le diagramme…"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      />
      <span className="csearch-count">
        {query ? (hits.length ? `${active + 1}/${hits.length}` : '0') : ''}
      </span>
      <button
        type="button"
        className="csearch-btn"
        aria-label="Précédent"
        disabled={hits.length === 0}
        onClick={() => step(-1)}
      >
        <Icon icon="mdi:chevron-up" width={16} height={16} />
      </button>
      <button
        type="button"
        className="csearch-btn"
        aria-label="Suivant"
        disabled={hits.length === 0}
        onClick={() => step(1)}
      >
        <Icon icon="mdi:chevron-down" width={16} height={16} />
      </button>
      <button type="button" className="csearch-btn" aria-label="Fermer" onClick={close}>
        <Icon icon="mdi:close" width={16} height={16} />
      </button>
    </div>
  );
}
