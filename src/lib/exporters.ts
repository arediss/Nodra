import { useFlowStore } from '../store';
import { saveBytes, textBytes, type SaveResult } from './save';
import type { ExporterDef } from '../plugins/types';

function sanitize(name: string): string {
  const c = name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  return c || 'diagram';
}

/** Serialize the current diagram with a registry exporter and save it. */
export async function runExporter(def: ExporterDef, fileName: string): Promise<SaveResult> {
  const doc = useFlowStore.getState().toDiagram();
  const out = def.serialize(doc);
  const bytes = typeof out === 'string' ? textBytes(out) : new Uint8Array(await out.arrayBuffer());
  return saveBytes(`${sanitize(fileName)}.${def.ext}`, bytes, [
    { name: def.label, extensions: [def.ext] },
  ]);
}
