import { useFlowStore } from '../store';
import { useDocsStore } from '../docs-store';
import { useUiStore } from '../ui-store';
import * as registries from '../plugins/registries';
import type { DiagramFile } from '../types';

const KEY = 'pfd:autosave';

function isDiagramFile(value: unknown): value is DiagramFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    Array.isArray(v.nodes) &&
    Array.isArray(v.edges)
  );
}

export function loadAutosave(): DiagramFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDiagramFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = useFlowStore.subscribe(() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      // Persist into the active document of the library.
      useDocsStore.getState().saveCurrent();
    }, 600);
  });

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    unsubscribe();
  };
}

/**
 * When the "Instantanés automatiques" pref is on, capture a history snapshot
 * after a lull in edits (debounced). snapshotNow() de-dupes identical states and
 * caps the history, so this won't pile up. Toggling the pref takes effect live.
 */
export function startAutoSnapshot(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = useFlowStore.subscribe(() => {
    if (!useUiStore.getState().prefs.autoSnapshot) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (useUiStore.getState().prefs.autoSnapshot) {
        useDocsStore.getState().snapshotNow('Auto');
      }
    }, 10_000);
  });

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    unsubscribe();
  };
}

function sanitizeFilename(name: string): string {
  const base = (name || '').trim() || 'diagram';
  return base.replace(/[^a-z0-9\-_]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'diagram';
}

export function saveToFile(): void {
  const data = useFlowStore.getState().toDiagram();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(data.name)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openFromFile(): void {
  const toast = (m: string) => useUiStore.getState().showToast(m);
  const input = document.createElement('input');
  input.type = 'file';
  // Accept = every extension the installed importers declare, plus core .json
  // (the core hardcodes no format knowledge — it reads the registry).
  const exts = new Set<string>(['json']);
  for (const def of registries.importers.all())
    for (const e of def.extensions ?? []) exts.add(e);
  input.accept = ['application/json', ...[...exts].map((e) => `.${e}`)].join(',');
  input.style.display = 'none';

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'Import';

      // Dispatch to the first matching importer (the registry is filled by
      // builtins/plugins — the core has no hardcoded format knowledge).
      for (const def of registries.importers.all()) {
        if (!(def.extensions?.includes(ext) || def.detect?.(text))) continue;
        let result;
        try {
          result = await def.parse(text);
        } catch {
          toast(`Échec de l'import (${def.label}).`);
          return;
        }
        if (!result || result.diagram.nodes.length === 0) {
          toast(`Rien à importer depuis « ${file.name} ».`);
          return;
        }
        if (result.replace) {
          useFlowStore.getState().loadDiagram(result.diagram);
        } else {
          useDocsStore.getState().importDiagram({ ...result.diagram, name: baseName });
        }
        if (result.note) toast(result.note);
        return;
      }

      // Native Nodra JSON (the .json save format) — core fallback.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast('Format de fichier non reconnu.');
        return;
      }
      if (!isDiagramFile(parsed)) {
        toast('Fichier invalide : pas un diagramme Nodra.');
        return;
      }
      useFlowStore.getState().loadDiagram(parsed);
    };
    reader.onerror = () => toast('Erreur lors de la lecture du fichier.');
    reader.readAsText(file);
  });

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}
