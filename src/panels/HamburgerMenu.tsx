import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useDocsStore } from '../docs-store';
import { useUiStore } from '../ui-store';
import { useFlowStore } from '../store';
import { openFromFile } from '../lib/persistence';
import { exportPng, exportSvg } from '../lib/export';
import { runExporter } from '../lib/exporters';
import * as registries from '../plugins/registries';
import { useRegistryVersion } from '../plugins/useRegistry';
import './HamburgerMenu.css';

type ExportFn = (fileName: string) => Promise<{ saved: boolean; path?: string }>;
type Section = 'open' | 'export' | 'history';

const caret = (open: boolean) =>
  open ? 'mdi:chevron-down' : 'mdi:chevron-right';

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const docs = useDocsStore((s) => s.docs);
  const activeId = useDocsStore((s) => s.activeId);
  const openDoc = useDocsStore((s) => s.openDoc);
  const newDoc = useDocsStore((s) => s.newDoc);
  const openSettings = useUiStore((s) => s.openSettings);
  const showToast = useUiStore((s) => s.showToast);
  const diagramName = useFlowStore((s) => s.diagramName);

  const close = () => {
    setOpen(false);
    setSection(null);
  };
  const toggle = (k: Section) => setSection((s) => (s === k ? null : k));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // capture phase: ReactFlow stops propagation of canvas mousedown.
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const impVersion = useRegistryVersion(registries.importers);
  // Accepted import extensions are derived from the importers registry (+ core .json),
  // so the hint stays generic — the core names no format.
  const importHint = useMemo(() => {
    const exts = new Set<string>(['json']);
    for (const def of registries.importers.all())
      for (const e of def.extensions ?? []) exts.add(e);
    return [...exts].map((e) => `.${e}`).join(' · ');
  }, [impVersion]);

  const expVersion = useRegistryVersion(registries.exporters);
  const exportItems = useMemo(
    () => [
      ...registries.exporters.all().map((def) => ({
        key: def.id,
        icon: def.icon ?? 'mdi:file-export-outline',
        label: def.label,
        hint: `.${def.ext}`,
        run: ((n: string) => runExporter(def, n)) as ExportFn,
      })),
      { key: 'png', icon: 'mdi:image-outline', label: 'Image PNG', hint: '.png', run: exportPng },
      { key: 'svg', icon: 'mdi:vector-square', label: 'Image SVG', hint: '.svg', run: exportSvg },
    ],
    [expVersion],
  );

  const doExport = async (fn: ExportFn) => {
    close();
    try {
      const r = await fn(diagramName);
      showToast(r.saved ? `Exporté${r.path ? ' : ' + r.path : ''}` : 'Export annulé');
    } catch {
      showToast("Échec de l'export");
    }
  };

  return (
    <div className="ham-root" ref={rootRef}>
      <button
        type="button"
        className="tb-btn"
        data-tip="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon icon="mdi:menu" width={18} height={18} />
      </button>

      {open && (
        <div className="ham-menu" role="menu">
          <button
            type="button"
            className="ham-item"
            role="menuitem"
            onClick={() => {
              newDoc();
              close();
            }}
          >
            <Icon className="ham-ic" icon="mdi:file-plus-outline" width={16} height={16} />
            <span className="ham-label">Nouveau</span>
          </button>

          <button
            type="button"
            className="ham-item"
            aria-expanded={section === 'open'}
            onClick={() => toggle('open')}
          >
            <Icon className="ham-ic" icon="mdi:folder-open-outline" width={16} height={16} />
            <span className="ham-label">Ouvrir</span>
            <Icon className="ham-caret" icon={caret(section === 'open')} width={15} height={15} />
          </button>
          {section === 'open' && (
            <div className="ham-sub scroll">
              {docs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="ham-subitem"
                  data-active={d.id === activeId ? 'true' : undefined}
                  onClick={() => {
                    openDoc(d.id);
                    close();
                  }}
                >
                  <Icon className="ham-ic" icon="mdi:file-outline" width={15} height={15} />
                  <span className="ham-label">{d.name}</span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="ham-item"
            title={`Formats : ${importHint}`}
            onClick={() => {
              openFromFile();
              close();
            }}
          >
            <Icon className="ham-ic" icon="mdi:tray-arrow-down" width={16} height={16} />
            <span className="ham-label">Importer…</span>
            {/* Formats live in the button title (hover): the list grows with each
                installed importer plugin and would otherwise crush the label. */}
          </button>

          <button
            type="button"
            className="ham-item"
            aria-expanded={section === 'export'}
            onClick={() => toggle('export')}
          >
            <Icon className="ham-ic" icon="mdi:tray-arrow-up" width={16} height={16} />
            <span className="ham-label">Exporter</span>
            <Icon className="ham-caret" icon={caret(section === 'export')} width={15} height={15} />
          </button>
          {section === 'export' && (
            <div className="ham-sub">
              {exportItems.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className="ham-subitem"
                  onClick={() => void doExport(it.run)}
                >
                  <Icon className="ham-ic" icon={it.icon} width={15} height={15} />
                  <span className="ham-label">{it.label}</span>
                  <span className="ham-hint">{it.hint}</span>
                </button>
              ))}
            </div>
          )}

          <div className="ham-sep" />

          <button
            type="button"
            className="ham-item"
            onClick={() => {
              openSettings();
              close();
            }}
          >
            <Icon className="ham-ic" icon="mdi:cog-outline" width={16} height={16} />
            <span className="ham-label">Réglages</span>
          </button>
        </div>
      )}
    </div>
  );
}
