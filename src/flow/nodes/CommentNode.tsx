import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Icon } from '@iconify/react';
import type { CommentNodeType } from '../../types';
import { useFlowStore } from '../../store';
import { NodeHandles } from './NodeHandles';
import './CommentNode.css';

/**
 * A discussion comment — a speech-bubble card with an author line and a small
 * tail, visually distinct from the colored sticky `NoteNode`.
 */
export function CommentNode({ id, data, selected }: NodeProps<CommentNodeType>) {
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
        minWidth={170}
        minHeight={88}
        isVisible={selected}
        color="var(--accent)"
      />
      <NodeHandles />
      <div className={'cmt-node' + (selected ? ' cmt-node-selected' : '')}>
        <div className="cmt-head">
          <span className="cmt-avatar" aria-hidden="true">
            <Icon icon="mdi:account" width={12} height={12} />
          </span>
          <span className="cmt-author">{data.author ?? t('node.comment.author')}</span>
        </div>
        <textarea
          className="cmt-text nodrag nowheel"
          value={data.text}
          onChange={onChange}
          placeholder={t('node.comment.placeholder')}
          spellCheck={false}
        />
      </div>
    </>
  );
}
