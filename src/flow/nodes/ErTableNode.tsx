import { useState, useCallback, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
} from '@xyflow/react';
import { Icon } from '@iconify/react';
import type { ErTableNodeType, ErColumn } from '../../types';
import { useFlowStore } from '../../store';
import './ErTableNode.css';

const KEY_OPTIONS: ErColumn['key'][] = [null, 'PK', 'FK'];

export function ErTableNode({ id, data, selected }: NodeProps<ErTableNodeType>) {
  const { t } = useTranslation();
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);

  const accent = data.accent || 'var(--accent)';
  const style: CSSProperties = { ['--er-accent' as string]: accent };

  const setColumns = useCallback(
    (columns: ErColumn[]) => updateNodeData(id, { columns }),
    [id, updateNodeData],
  );

  const patchColumn = useCallback(
    (index: number, patch: Partial<ErColumn>) => {
      const next = data.columns.map((col, i) =>
        i === index ? { ...col, ...patch } : col,
      );
      setColumns(next);
    },
    [data.columns, setColumns],
  );

  const removeColumn = useCallback(
    (index: number) => setColumns(data.columns.filter((_, i) => i !== index)),
    [data.columns, setColumns],
  );

  const addColumn = useCallback(
    () => setColumns([...data.columns, { name: t('er.column.defaultName'), type: 'text', key: null }]),
    [data.columns, setColumns, t],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setEditing(false);
        return;
      }
      // Keyboard parity with the double-click-to-edit affordance: enter edit
      // mode on Enter/Space, but only when the card itself is focused (not a
      // descendant) and not already editing, so typing in inputs is unaffected.
      if (
        !editing &&
        (e.key === 'Enter' || e.key === ' ') &&
        e.target === e.currentTarget
      ) {
        e.preventDefault();
        setEditing(true);
      }
    },
    [editing],
  );

  return (
    <div
      className={`er-card${selected ? ' er-selected' : ''}${editing ? ' er-editing' : ''}`}
      style={style}
      role="button"
      tabIndex={-1}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={onKeyDown}
    >
      <NodeResizer
        minWidth={150}
        minHeight={80}
        isVisible={selected}
        color="var(--accent)"
      />

      <div className="er-header">
        {editing ? (
          <input
            className="input nodrag er-header-input"
            value={data.label}
            placeholder={t('er.tablePlaceholder')}
            autoFocus
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
          />
        ) : (
          <span className="er-header-label">{data.label}</span>
        )}
      </div>

      <div className="er-rows">
        {data.columns.map((col, i) => (
          <div className={`er-row${i % 2 === 1 ? ' er-row-alt' : ''}`} key={i}>
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-${i}-l`}
              className="er-handle er-handle-left"
            />

            {editing ? (
              <>
                <input
                  className="input nodrag er-input-name"
                  value={col.name}
                  placeholder={t('er.column.namePlaceholder')}
                  onChange={(e) => patchColumn(i, { name: e.target.value })}
                />
                <select
                  className="input nodrag er-input-key"
                  value={col.key ?? ''}
                  onChange={(e) =>
                    patchColumn(i, {
                      key: (e.target.value || null) as ErColumn['key'],
                    })
                  }
                >
                  {KEY_OPTIONS.map((k) => (
                    <option key={k ?? 'none'} value={k ?? ''}>
                      {k ?? '—'}
                    </option>
                  ))}
                </select>
                <input
                  className="input nodrag er-input-type"
                  value={col.type}
                  placeholder={t('er.column.typePlaceholder')}
                  onChange={(e) => patchColumn(i, { type: e.target.value })}
                />
                <button
                  type="button"
                  className="btn-icon btn-danger nodrag er-remove"
                  title={t('er.removeColumn')}
                  onClick={() => removeColumn(i)}
                >
                  <Icon icon="mdi:close" width={14} height={14} />
                </button>
              </>
            ) : (
              <>
                <span className="er-col-name">{col.name}</span>
                {col.key ? (
                  <span className={`er-badge er-badge-${col.key.toLowerCase()}`}>
                    {col.key}
                  </span>
                ) : null}
                <span className="er-col-type">{col.type}</span>
              </>
            )}

            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-${i}-r`}
              className="er-handle er-handle-right"
            />
          </div>
        ))}
      </div>

      {editing ? (
        <div className="er-edit-footer">
          <button type="button" className="btn-ghost nodrag er-add" onClick={addColumn}>
            {t('er.addColumn')}
          </button>
          <button
            type="button"
            className="btn-primary nodrag er-done"
            onClick={() => setEditing(false)}
          >
            {t('er.done')}
          </button>
        </div>
      ) : (
        <div className="er-hint muted">{t('er.editHint')}</div>
      )}
    </div>
  );
}
