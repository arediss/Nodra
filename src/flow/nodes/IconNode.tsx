import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { type AppNode, type IconNodeType, isImageNodeData } from '../../types';
import { IconGlyph } from '../../icons/IconGlyph';
import { useFlowStore } from '../../store';
import './IconNode.css';

// One handle per side. In ConnectionMode.Loose a `source` handle can also
// receive connections, so a single source handle per side keeps edge
// direction correct (the node you drag FROM is always the source) while
// still letting edges land on any side.
const SIDES = [
  { pos: Position.Top, key: 't' },
  { pos: Position.Right, key: 'r' },
  { pos: Position.Bottom, key: 'b' },
  { pos: Position.Left, key: 'l' },
] as const;

export function IconNode({ id, data, selected, width, height }: NodeProps<IconNodeType>) {
  // User-uploaded picture: fills a resizable frame, aspect locked. Background is
  // off by default; toggleable per block from the selection balloon (imageFramed).
  if (isImageNodeData(data)) {
    // First time we see an unsized picture, fit it to a sensible box (preserving
    // aspect) so it isn't huge or tiny — then it's freely resizable.
    const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (width || height) return;
      const im = e.currentTarget;
      const MAX = 240;
      const r = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1;
      const w = Math.max(48, r >= 1 ? MAX : Math.round(MAX * r));
      const h = Math.max(48, r >= 1 ? Math.round(MAX / r) : MAX);
      const fs = useFlowStore.getState();
      fs.setNodes(
        fs.nodes.map((n) =>
          n.id === id
            ? ({ ...n, width: w, height: h, data: { ...n.data, isImage: true } } as AppNode)
            : n,
        ),
      );
    };
    return (
      <div
        className={
          'ic-image-card' +
          (data.imageFramed ? ' ic-image-framed' : '') +
          (selected ? ' ic-node-selected' : '')
        }
      >
        <NodeResizer
          minWidth={48}
          minHeight={48}
          isVisible={selected}
          color="var(--accent)"
          keepAspectRatio
        />
        {SIDES.map(({ pos, key }) => (
          <Handle key={key} type="source" position={pos} id={key} className="ic-node-handle" />
        ))}
        <img
          className="ic-image"
          src={data.iconRef}
          alt={data.label}
          draggable={false}
          onLoad={onImgLoad}
        />
      </div>
    );
  }

  return (
    <div className={'ic-node-card' + (selected ? ' ic-node-selected' : '')}>
      <NodeResizer
        minWidth={76}
        minHeight={76}
        isVisible={selected}
        color="var(--accent)"
      />
      {SIDES.map(({ pos, key }) => (
        <Handle
          key={key}
          type="source"
          position={pos}
          id={key}
          className="ic-node-handle"
        />
      ))}

      <div className="ic-node-glyph">
        <IconGlyph
          source={data.iconSource}
          refId={data.iconRef}
          name={data.label}
          size={44}
        />
      </div>

      <div
        className="ic-node-label"
        style={data.accent ? { color: data.accent } : undefined}
      >
        {data.label}
      </div>

      {data.sublabel ? (
        <div className="ic-node-sub">{data.sublabel}</div>
      ) : null}
    </div>
  );
}
