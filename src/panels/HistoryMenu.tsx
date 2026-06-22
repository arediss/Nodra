import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useDocsStore } from '../docs-store';
import './HistoryMenu.css';

/** Top-bar "Historique" dropdown: capture a snapshot + restore an earlier one.
 *  (Moved out of the hamburger menu.) Opens downward. */
export function HistoryMenu() {
  const snapshots = useDocsStore((s) => s.snapshots);
  const snapshotNow = useDocsStore((s) => s.snapshotNow);
  const restoreSnapshot = useDocsStore((s) => s.restoreSnapshot);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fmt = (at: number) =>
    new Date(at).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="hist-menu" ref={rootRef}>
      <button
        type="button"
        className="hist-btn"
        data-active={open ? 'true' : undefined}
        aria-label="Historique"
        aria-expanded={open}
        title="Historique"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon="mdi:history" width={16} height={16} />
      </button>

      {open && (
        <div className="hist-pop" role="menu">
          <button
            type="button"
            className="hist-capture"
            onClick={() => snapshotNow()}
          >
            <Icon icon="mdi:content-save-plus-outline" width={15} height={15} />
            Enregistrer cette version
          </button>

          <div className="hist-list scroll">
            {snapshots.length === 0 ? (
              <div className="hist-empty muted">Aucun instantané pour l'instant.</div>
            ) : (
              [...snapshots].reverse().map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="hist-item"
                  onClick={() => {
                    restoreSnapshot(s.id);
                    setOpen(false);
                  }}
                >
                  <Icon icon="mdi:restore" width={15} height={15} />
                  <span className="hist-when">{fmt(s.at)}</span>
                  {s.label && <span className="hist-label muted">{s.label}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
