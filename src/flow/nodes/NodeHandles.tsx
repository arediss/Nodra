import { Handle, Position } from '@xyflow/react';

// One source handle per side. In ConnectionMode.Loose a source handle also
// receives connections, so every block can be both end of a link. Hidden via
// CSS until the node is hovered/selected or the connect tool is active.
const SIDES = [
  { pos: Position.Top, key: 't' },
  { pos: Position.Right, key: 'r' },
  { pos: Position.Bottom, key: 'b' },
  { pos: Position.Left, key: 'l' },
] as const;

/** Connection handles for the non-icon blocks (note, comment, text, group). */
export function NodeHandles() {
  return (
    <>
      {SIDES.map(({ pos, key }) => (
        <Handle key={key} type="source" position={pos} id={key} className="pfd-handle" />
      ))}
    </>
  );
}
