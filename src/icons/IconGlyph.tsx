import { useState } from 'react';
import { Icon } from '@iconify/react';
import type { IconSource } from './catalog';

/**
 * Renders an icon from either an Iconify id or an svg url / data-url.
 * Used by both the palette and the IconNode so they always look identical.
 * Falls back to a placeholder glyph if the svg fails to load (e.g. a plugin's
 * asset is no longer served).
 */
export function IconGlyph({
  source,
  refId,
  name,
  size = 40,
}: Readonly<{
  source: IconSource;
  refId: string;
  name?: string;
  size?: number;
}>) {
  const [broken, setBroken] = useState(false);

  if (source === 'iconify') {
    return <Icon icon={refId} width={size} height={size} aria-label={name} />;
  }
  if (broken) {
    return (
      <Icon
        icon="mdi:image-broken-variant"
        width={size}
        height={size}
        aria-label={name}
        style={{ color: 'var(--text-quaternary)' }}
      />
    );
  }
  return (
    <img
      src={refId}
      width={size}
      height={size}
      alt={name ?? ''}
      draggable={false}
      onError={() => setBroken(true)}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
