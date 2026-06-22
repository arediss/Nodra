import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

type Side = 'right' | 'left' | 'bottom' | 'top';

/**
 * Tooltip rendered through a portal to document.body so it is never clipped by
 * a panel's overflow (the rails live inside overflow:hidden sidebars).
 */
export function Tooltip({
  label,
  side = 'right',
  children,
}: {
  label: string;
  side?: Side;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (side === 'right') setPos({ x: r.right + 9, y: r.top + r.height / 2 });
      else if (side === 'left') setPos({ x: r.left - 9, y: r.top + r.height / 2 });
      else if (side === 'top') setPos({ x: r.left + r.width / 2, y: r.top - 8 });
      else setPos({ x: r.left + r.width / 2, y: r.bottom + 7 });
    }, 350);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  };

  return (
    <span
      ref={anchorRef}
      className="tt-anchor"
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className={`tt-pop tt-${side}`}
            style={{ left: pos.x, top: pos.y }}
            role="tooltip"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
