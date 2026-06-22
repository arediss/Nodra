import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useFlowStore } from '../store';
import { useComponentsStore } from '../components-store';
import { useUiStore } from '../ui-store';
import './SelectionBar.css';

export function SelectionBar() {
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
    const name = draft.trim() || 'Composant';
    const id = useComponentsStore.getState().createFromSelection(name);
    if (id) {
      useUiStore.getState().showToast(`Composant « ${name} » créé`);
    }
    setNaming(false);
    setDraft('');
  };

  return (
    <div className="selbar">
      <Icon icon="mdi:select-group" width={16} height={16} className="selbar-ico" />
      <span className="selbar-count">{selCount} blocs sélectionnés</span>
      {naming ? (
        <>
          <input
            className="input selbar-input"
            autoFocus
            placeholder="Nom du composant"
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
            Créer
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setNaming(false);
              setDraft('');
            }}
          >
            Annuler
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary selbar-create"
          onClick={() => setNaming(true)}
        >
          <Icon icon="mdi:puzzle-plus-outline" width={15} height={15} />
          Créer un composant
        </button>
      )}
    </div>
  );
}
