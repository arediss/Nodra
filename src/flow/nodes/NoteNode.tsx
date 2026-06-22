import { useCallback } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { NoteNodeType, NoteColor } from '../../types';
import { useFlowStore } from '../../store';
import { NodeHandles } from './NodeHandles';
import './NoteNode.css';

const PALETTE: Record<NoteColor, { bg: string; border: string }> = {
  yellow: { bg: '#fff7c0', border: '#f2e08a' },
  blue: { bg: '#d9e7ff', border: '#aac8f5' },
  green: { bg: '#d8f5dd', border: '#a9e3b4' },
  pink: { bg: '#ffd9e6', border: '#f3b0c8' },
  gray: { bg: '#ededf0', border: '#d3d3d8' },
};

export function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  const palette = PALETTE[data.color ?? 'yellow'];

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      useFlowStore.getState().updateNodeData(id, { text: e.target.value });
    },
    [id],
  );

  return (
    <>
      <NodeResizer
        minWidth={140}
        minHeight={90}
        isVisible={selected}
        color="var(--accent)"
      />
      <NodeHandles />
      <div
        className={'note-node' + (selected ? ' note-node-selected' : '')}
        style={{ background: palette.bg, borderColor: palette.border }}
      >
        <textarea
          className="note-node-text nodrag nowheel"
          value={data.text}
          onChange={onChange}
          placeholder="Note…"
          spellCheck={false}
        />
      </div>
    </>
  );
}
