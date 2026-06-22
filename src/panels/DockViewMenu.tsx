import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import { useReactFlow, useStore } from '@xyflow/react';
import { useUiStore } from '../ui-store';
import { Tooltip } from './Tooltip';

/** Bottom-dock "Affichage" dropdown: zoom, fit, lock, minimap — grouped to keep
 *  the dock short. The popover is portaled to <body> so the dock's scroll
 *  container (overflow) can't clip it. */
export function DockViewMenu() {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const canvasLocked = useUiStore((s) => s.canvasLocked);
  const toggleCanvasLock = useUiStore((s) => s.toggleCanvasLock);
  const showMinimap = useUiStore((s) => s.prefs.showMinimap);
  const setPref = useUiStore((s) => s.setPref);
  const gridStyle = useUiStore((s) => s.gridStyle);
  const setGridStyle = useUiStore((s) => s.setGridStyle);

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ left: r.left + r.width / 2, bottom: window.innerHeight - r.top + 10 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dock-menu">
      <Tooltip label="Affichage" side="top">
        <button
          ref={btnRef}
          type="button"
          className="dock-btn"
          data-active={open}
          aria-label="Affichage"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
        >
          <Icon icon="mdi:tune-variant" width={19} height={19} />
        </button>
      </Tooltip>

      {open &&
        createPortal(
          <div
            ref={popRef}
            className="dock-pop"
            role="menu"
            style={{
              position: 'fixed',
              left: coords.left,
              bottom: coords.bottom,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="dock-pop-zoom">
              <button
                type="button"
                className="dock-pop-zbtn"
                aria-label="Dézoomer"
                onClick={() => rf.zoomOut({ duration: 160 })}
              >
                <Icon icon="mdi:minus" width={18} height={18} />
              </button>
              <button
                type="button"
                className="dock-pop-pct"
                aria-label="Zoom 100 %"
                onClick={() => rf.zoomTo(1, { duration: 160 })}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="dock-pop-zbtn"
                aria-label="Zoomer"
                onClick={() => rf.zoomIn({ duration: 160 })}
              >
                <Icon icon="mdi:plus" width={18} height={18} />
              </button>
            </div>

            <button
              type="button"
              className="dock-pop-item"
              onClick={() => {
                rf.fitView({ duration: 240, padding: 0.2 });
                setOpen(false);
              }}
            >
              <Icon icon="mdi:fit-to-screen-outline" width={17} height={17} />
              Ajuster à l'écran
            </button>

            <button
              type="button"
              className="dock-pop-item"
              data-on={canvasLocked}
              onClick={toggleCanvasLock}
            >
              <Icon
                icon={canvasLocked ? 'mdi:lock-outline' : 'mdi:lock-open-variant-outline'}
                width={17}
                height={17}
              />
              {canvasLocked ? 'Déverrouiller le canvas' : 'Verrouiller le canvas'}
              {canvasLocked && (
                <Icon className="dock-pop-check" icon="mdi:check" width={15} height={15} />
              )}
            </button>

            <button
              type="button"
              className="dock-pop-item"
              data-on={showMinimap}
              onClick={() => setPref('showMinimap', !showMinimap)}
            >
              <Icon icon="mdi:map-outline" width={17} height={17} />
              Mini-carte
              {showMinimap && (
                <Icon className="dock-pop-check" icon="mdi:check" width={15} height={15} />
              )}
            </button>

            <div className="dock-pop-grid">
              <span className="dock-pop-glabel">Quadrillage</span>
              <div className="dock-pop-gseg">
                {(
                  [
                    { id: 'dots', icon: 'mdi:dots-grid', label: 'Points' },
                    { id: 'lines', icon: 'mdi:grid', label: 'Lignes' },
                    { id: 'none', icon: 'mdi:grid-off', label: 'Aucun' },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="dock-pop-gbtn"
                    data-on={gridStyle === g.id}
                    title={g.label}
                    aria-label={`Quadrillage ${g.label}`}
                    onClick={() => setGridStyle(g.id)}
                  >
                    <Icon icon={g.icon} width={16} height={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
