import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import './UnknownNode.css';

/**
 * Fallback for a node whose type isn't in the registry — a peer without the
 * plugin, or a removed plugin. Renders non-destructively (the node's data is
 * preserved on save) so nothing is ever lost.
 */
export function UnknownNode({ data, type }: NodeProps) {
  const { t } = useTranslation();
  const label = (data as { label?: string })?.label ?? type;
  return (
    <div className="unknown-node" title={t('node.unknown.tooltip', { type })}>
      <Handle type="target" position={Position.Left} />
      <Icon icon="mdi:puzzle-remove-outline" width={16} height={16} />
      <span className="unknown-node-label">{label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
