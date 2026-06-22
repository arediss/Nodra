import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useFlowStore } from '../store';
import { useUiStore } from '../ui-store';
import { isIconNode } from '../types';
import './NodeDetailsSheet.css';

/**
 * Details sheet for an icon node: free-form tags + key/value metadata, plus the
 * source IaC address (tfAddr) when the node came from an import. There is no
 * persistent right panel, so this opens on demand from the selection balloon.
 */
export function NodeDetailsSheet() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.detailsOpen);
  const close = useUiStore((s) => s.closeDetails);
  const showToast = useUiStore((s) => s.showToast);
  const node = useFlowStore((s) =>
    s.nodes.find((n) => n.id === s.selectedNodeId),
  );
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const readOnly = useFlowStore((s) => s.readOnly);

  const [tagDraft, setTagDraft] = useState('');
  const [kDraft, setKDraft] = useState('');
  const [vDraft, setVDraft] = useState('');

  if (!open || !node || !isIconNode(node)) return null;
  const { tags = [], metadata = {}, tfAddr } = node.data;
  const id = node.id;

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) {
      setTagDraft('');
      return;
    }
    updateNodeData(id, { tags: [...tags, t] });
    setTagDraft('');
  };
  const removeTag = (t: string) =>
    updateNodeData(id, { tags: tags.filter((x) => x !== t) });

  const addMeta = () => {
    const k = kDraft.trim();
    if (!k) return;
    if (Object.prototype.hasOwnProperty.call(metadata, k)) {
      showToast(t('node.details.keyExists', { key: k }));
      return;
    }
    updateNodeData(id, { metadata: { ...metadata, [k]: vDraft } });
    setKDraft('');
    setVDraft('');
  };
  const removeMeta = (k: string) => {
    const next = { ...metadata };
    delete next[k];
    updateNodeData(id, { metadata: next });
  };
  const setMetaValue = (k: string, v: string) =>
    updateNodeData(id, { metadata: { ...metadata, [k]: v } });

  const metaEntries = Object.entries(metadata);

  return (
    <div
      className="sheet-overlay"
      role="button"
      tabIndex={-1}
      onMouseDown={close}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
      }}
    >
      <div
        className="sheet sheet-sm"
        role="dialog"
        aria-label={t('node.details.sheetTitle')}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <Icon icon="mdi:tag-multiple-outline" width={18} height={18} />
          <h2 className="sheet-title">{node.data.label || t('node.defaultLabel')}</h2>
          <button type="button" className="sheet-close" onClick={close} aria-label={t('common.close')}>
            <Icon icon="mdi:close" width={16} height={16} />
          </button>
        </div>

        <div className="sheet-body">
          {readOnly && (
            <p className="nds-readonly">
              <Icon icon="mdi:lock-outline" width={14} height={14} /> {t('node.details.readOnly')}
            </p>
          )}
          {tfAddr && (
            <div className="nds-field">
              <span className="shr-label">{t('node.details.iacAddress')}</span>
              <code className="nds-addr">{tfAddr}</code>
            </div>
          )}

          <div className="nds-field">
            <label className="shr-label" htmlFor="nds-tag-input">{t('node.details.tags')}</label>
            <div className="nds-tags">
              {tags.map((tag) => (
                <span key={tag} className="nds-tag">
                  {tag}
                  <button type="button" aria-label={t('node.details.removeTag', { tag })} onClick={() => removeTag(tag)}>
                    <Icon icon="mdi:close" width={12} height={12} />
                  </button>
                </span>
              ))}
            </div>
            <input
              id="nds-tag-input"
              className="input"
              placeholder={t('node.details.tagPlaceholder')}
              value={tagDraft}
              disabled={readOnly}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
          </div>

          <div className="nds-field">
            <label className="shr-label" htmlFor="nds-meta-key-input">{t('node.details.metadata')}</label>
            {metaEntries.map(([k, v]) => (
              <div className="nds-meta-row" key={k}>
                <span className="nds-meta-key">{k}</span>
                <input
                  className="input"
                  value={v}
                  onChange={(e) => setMetaValue(k, e.target.value)}
                />
                <button
                  type="button"
                  className="btn-icon btn-danger"
                  aria-label={t('node.details.removeMeta', { key: k })}
                  onClick={() => removeMeta(k)}
                >
                  <Icon icon="mdi:close" width={15} height={15} />
                </button>
              </div>
            ))}
            <div className="nds-meta-add">
              <input
                id="nds-meta-key-input"
                className="input"
                placeholder={t('node.details.metaKeyPlaceholder')}
                value={kDraft}
                disabled={readOnly}
                onChange={(e) => setKDraft(e.target.value)}
              />
              <input
                className="input"
                placeholder={t('node.details.metaValuePlaceholder')}
                value={vDraft}
                disabled={readOnly}
                onChange={(e) => setVDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMeta();
                  }
                }}
              />
              <button type="button" className="btn" onClick={addMeta} disabled={readOnly}>
                {t('common.add')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
