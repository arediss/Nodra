import { useStore } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { usePresenceStore } from './presence';
import { useDocsStore } from '../docs-store';
import './Cursors.css';

/**
 * Live remote cursors, rendered as an overlay inside the ReactFlow pane. Peer
 * cursors are stored in FLOW coordinates and projected to screen with the current
 * viewport transform, so they track correctly under each viewer's own pan/zoom.
 * Only peers viewing the SAME shared doc as us (with a known cursor) are shown.
 */
export function Cursors() {
  const { t } = useTranslation();
  const peers = usePresenceStore((s) => s.peers);
  const activeId = useDocsStore((s) => s.activeId);
  const transform = useStore((s) => s.transform); // [x, y, zoom]
  const [tx, ty, zoom] = transform;

  return (
    <div className="cursors-layer">
      {Object.values(peers).map((p) => {
        if (!p.cursor || p.activeDocId !== activeId) return null;
        const left = p.cursor.x * zoom + tx;
        const top = p.cursor.y * zoom + ty;
        return (
          <div key={p.id} className="cursor" style={{ left, top }}>
            <svg width="18" height="18" viewBox="0 0 18 18" className="cursor-arrow">
              <path
                d="M2 2 L2 14 L5.5 10.5 L8 15.5 L10 14.5 L7.5 9.5 L12 9 Z"
                fill={p.color}
                stroke="#fff"
                strokeWidth="1"
              />
            </svg>
            <span className="cursor-label" style={{ background: p.color }}>
              {p.name || t('collab.peer')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
