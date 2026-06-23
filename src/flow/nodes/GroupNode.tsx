import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Icon } from '@iconify/react';
import type { GroupNodeType } from '../../types';
import { NodeHandles } from './NodeHandles';
import './GroupNode.css';

const VARIANT_GLYPH: Record<NonNullable<GroupNodeType['data']['variant']>, string> = {
  cloud: '☁',
  account: '⧉',
  plain: '▢',
};

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const variant = data.variant ?? 'plain';
  const style = data.color
    ? ({ '--grp-accent': data.color } as React.CSSProperties)
    : undefined;

  return (
    <>
      {/* Outside .grp-root: that element is pointer-events:none (so clicks reach
          child nodes), which would also disable the resize handles if nested. */}
      <NodeResizer
        color="var(--accent)"
        isVisible={selected}
        minWidth={160}
        minHeight={120}
      />
      <NodeHandles />
      <div
        className={`grp-root grp-${variant}${selected ? ' grp-selected' : ''}`}
        style={style}
      >
        {/* No header chip for a bare frame (no label, no icon) — it would just be
            an empty pill (e.g. an imported draw.io container with no title). */}
        {(data.label.trim() || data.icon) && (
          <div className="grp-header">
            <span className="grp-glyph" aria-hidden="true">
              {data.icon ? (
                <Icon icon={data.icon} width={13} height={13} />
              ) : (
                VARIANT_GLYPH[variant]
              )}
            </span>
            {data.label.trim() ? <span className="grp-label">{data.label}</span> : null}
          </div>
        )}
      </div>
    </>
  );
}
