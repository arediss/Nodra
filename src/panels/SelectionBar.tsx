import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useFlowStore } from '../store';
import { useComponentsStore } from '../components-store';
import { useUiStore } from '../ui-store';
import './SelectionBar.css';

export function SelectionBar() {
  const { t } = useTranslation();
  const selCount = useFlowStore(
    (s) => s.nodes.filter((n) => n.selected && n.type !== 'group').length,
  );
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');

  // Reset the inline naming state when the selection is cleared / too small.
  useEffect(() => {
    if (selCount < 2) {
      setNaming(false);
      setDraft('');
    }
  }, [selCount]);

  if (selCount < 2) return null;

  const create = () => {
    const name = draft.trim() || t('selection.component.defaultName');
    const id = useComponentsStore.getState().createFromSelection(name);
    if (id) {
      useUiStore.getState().showToast(t('selection.component.created', { name }));
    }
    setNaming(false);
    setDraft('');
  };

  return (
    <div className="selbar">
      <Icon icon="mdi:select-group" width={16} height={16} className="selbar-ico" />
      <span className="selbar-count">{t('selection.blocksSelected', { count: selCount })}</span>
      {naming ? (
        <>
          <input
            className="input selbar-input"
            autoFocus
            placeholder={t('selection.component.namePlaceholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
              if (e.key === 'Escape') {
                setNaming(false);
                setDraft('');
              }
            }}
          />
          <button type="button" className="btn btn-primary selbar-go" onClick={create}>
            {t('selection.component.create')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setNaming(false);
              setDraft('');
            }}
          >
            {t('common.cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary selbar-create"
          onClick={() => setNaming(true)}
        >
          <Icon icon="mdi:puzzle-plus-outline" width={15} height={15} />
          {t('selection.component.createButton')}
        </button>
      )}
    </div>
  );
}
