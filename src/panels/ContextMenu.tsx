import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import './ContextMenu.css';

export type MenuItem = {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
};

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 30;
const SEP_HEIGHT = 11;
const PADDING = 10;

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => clamp(x, y, items));

  // Re-clamp from the actual rendered height once mounted.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    let left = x;
    let top = y;
    if (left + MENU_WIDTH > window.innerWidth) left = x - MENU_WIDTH;
    if (top + h > window.innerHeight) top = Math.max(0, window.innerHeight - h);
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDismiss = () => onClose();

    // capture phase: ReactFlow stops propagation of canvas mousedown.
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onClose]);

  const handleClick = (item: MenuItem) => {
    item.onClick();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="ctx-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="ctx-row">
          {item.separatorBefore && i > 0 && <div className="ctx-sep" />}
          <button
            type="button"
            role="menuitem"
            className={item.danger ? 'ctx-item ctx-item-danger' : 'ctx-item'}
            onClick={() => handleClick(item)}
          >
            {item.icon && <Icon className="ctx-item-icon" icon={item.icon} width={16} height={16} />}
            <span className="ctx-item-label">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function clamp(x: number, y: number, items: MenuItem[]): { left: number; top: number } {
  const estHeight =
    PADDING +
    items.reduce(
      (acc, it, i) => acc + ITEM_HEIGHT + (it.separatorBefore && i > 0 ? SEP_HEIGHT : 0),
      0,
    );
  let left = x;
  let top = y;
  if (left + MENU_WIDTH > window.innerWidth) left = x - MENU_WIDTH;
  if (top + estHeight > window.innerHeight) top = Math.max(0, window.innerHeight - estHeight);
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  return { left, top };
}
