import type { Host } from './types';

/**
 * JSON is the native save format, so it stays a core builtin exporter. Mermaid +
 * draw.io exporters live in their plugins; PNG/SVG are core-special (DOM snapshot).
 */
export function registerBuiltinExporters(host: Host): void {
  host.exporters.register({
    id: 'json',
    label: 'Diagramme JSON',
    ext: 'json',
    icon: 'mdi:code-json',
    serialize: (doc) => JSON.stringify(doc, null, 2),
  });
}
