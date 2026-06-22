import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import './WindowControls.css';

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function WindowControls() {
  const { t } = useTranslation();
  if (!isTauri) return null;

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      /* no-op */
    }
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      /* no-op */
    }
  };

  const handleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="win-controls">
      <button
        type="button"
        className="win-dot win-close"
        aria-label={t('common.close')}
        onClick={handleClose}
      />
      <button
        type="button"
        className="win-dot win-min"
        aria-label={t('toolbar.minimize')}
        onClick={handleMinimize}
      />
      <button
        type="button"
        className="win-dot win-max"
        aria-label={t('toolbar.maximize')}
        onClick={handleMaximize}
      />
    </div>
  );
}
