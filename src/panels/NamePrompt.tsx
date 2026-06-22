import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useCollabStore } from '../collab/session';
import { setPeerName } from '../collab/presence';
import './ShareSheet.css';

// The *explicitly chosen* name (persisted) — distinct from the runtime display
// name, which gets defaulted to 'Invité'/'Hôte' on join.
const chosenName = (): string => {
  try {
    return (localStorage.getItem('pfd:peerName') ?? '').trim();
  } catch {
    return '';
  }
};

/**
 * Asks an arriving guest for their display name (used by presence + cursors).
 * Self-triggers: shows once when in a session with no chosen name; the name
 * persists in localStorage so it never asks again.
 */
export function NamePrompt() {
  const { t } = useTranslation();
  const role = useCollabStore((s) => s.role);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState(chosenName);

  const needsName = role !== null && !chosenName() && !dismissed;
  if (!needsName) return null;

  const submit = () => {
    setPeerName(name.trim() || (role === 'host' ? t('name.host') : t('name.guest')));
    setDismissed(true);
  };

  return (
    <div
      className="sheet-overlay"
      role="button"
      tabIndex={-1}
      onMouseDown={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') submit();
      }}
    >
      <div
        className="sheet sheet-sm"
        role="dialog"
        aria-label={t('name.prompt.title')}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <Icon icon="lucide:user" width={18} height={18} />
          <h2 className="sheet-title">{t('name.prompt.welcome')}</h2>
        </div>
        <div className="sheet-body">
          <label className="shr-label" htmlFor="np-name">
            {t('name.prompt.question')}
          </label>
          <input
            id="np-name"
            className="input"
            placeholder={t('name.prompt.placeholder')}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button type="button" className="btn btn-primary shr-action" onClick={submit}>
            {t('name.prompt.join')}
          </button>
        </div>
      </div>
    </div>
  );
}
