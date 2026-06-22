import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { TextNodeType } from '../../types';
import { useFlowStore } from '../../store';
import { NodeHandles } from './NodeHandles';
import './TextNode.css';

export function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const { t } = useTranslation();
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      useFlowStore.getState().updateNodeData(id, { text: e.target.value });
    },
    [id],
  );

  return (
    <>
      <NodeResizer
        minWidth={80}
        minHeight={36}
        isVisible={selected}
        color="var(--accent)"
      />
      <NodeHandles />
      <div className={`pfd-text-node${selected ? ' is-selected' : ''}`}>
        <textarea
          className="pfd-text-node__input nodrag nowheel"
          value={data.text}
          onChange={onChange}
          placeholder={t('node.text.placeholder')}
          style={{ fontSize: `${data.fontSize ?? 16}px` }}
        />
      </div>
    </>
  );
}
