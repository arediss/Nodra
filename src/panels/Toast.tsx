import { useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useUiStore } from '../ui-store';
import './Toast.css';

export function Toast() {
  const message = useUiStore((s) => s.toast);
  const clearToast = useUiStore((s) => s.clearToast);

  useEffect(() => {
    if (!message) return;
    const id = globalThis.setTimeout(clearToast, 3600);
    return () => globalThis.clearTimeout(id);
  }, [message, clearToast]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon icon="mdi:check-circle" className="toast-icon" width={16} height={16} />
      <span className="toast-text" title={message}>
        {message}
      </span>
    </div>
  );
}
