// Cross-environment file save. In the Tauri desktop app a native "Save as"
// dialog is shown and the bytes are written via a Rust command (browser-style
// <a download> does not work in the webview). In a plain browser it falls back
// to a blob download.

const isTauri = (): boolean =>
  typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

export type SaveFilter = { name: string; extensions: string[] };
export type SaveResult = { saved: boolean; path?: string };

export async function saveBytes(
  suggestedName: string,
  bytes: Uint8Array,
  filters: SaveFilter[],
): Promise<SaveResult> {
  if (isTauri()) {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core'),
    ]);
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return { saved: false };
    await invoke('write_file', { path, contents: Array.from(bytes) });
    return { saved: true, path };
  }

  // Web fallback: blob download to the browser's downloads folder.
  const blob = new Blob([bytes as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { saved: true };
}

export const textBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

export async function dataUrlBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}
