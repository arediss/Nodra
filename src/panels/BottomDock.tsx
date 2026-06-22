import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useReactFlow } from '@xyflow/react';
import { useUiStore, type ToolId } from '../ui-store';
import { useDocsStore } from '../docs-store';
import { useCollabStore } from '../collab/session';
import { localPeer } from '../collab/presence';
import { useFlowStore } from '../store';
import { createIconNode } from '../flow/nodeTemplates';
import * as registries from '../plugins/registries';
import { useRegistryVersion } from '../plugins/useRegistry';
import { DockViewMenu } from './DockViewMenu';
import { Tooltip } from './Tooltip';
import './BottomDock.css';

type ToolDef = { id: ToolId; icon: string; label: string; key: string };

const isTypingTarget = (el: Element | null): boolean =>
  !!el &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    (el as HTMLElement).isContentEditable);

/** Insert at the centre of the current viewport (used for image + dock "+"). */
function viewportCenter(rf: ReturnType<typeof useReactFlow>) {
  return rf.screenToFlowPosition({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
}

export function BottomDock() {
  const { t } = useTranslation();
  const rf = useReactFlow();
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const openPicker = useUiStore((s) => s.openPicker);
  const openPanelId = useUiStore((s) => s.openPanelId);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const canvasLocked = useUiStore((s) => s.canvasLocked);
  const fileRef = useRef<HTMLInputElement>(null);

  // Right-side panels (Connexions, Mermaid…) are contributed via the registry.
  const panelsVersion = useRegistryVersion(registries.panels);
  const panels = useMemo(() => registries.panels.all(), [panelsVersion]);

  const placementTools = useMemo<ToolDef[]>(
    () => [
      { id: 'note', icon: 'mdi:note-outline', label: t('toolbar.note'), key: 'N' },
      { id: 'comment', icon: 'mdi:comment-outline', label: t('toolbar.comment'), key: 'C' },
      { id: 'group', icon: 'mdi:shape-rectangle-plus', label: t('toolbar.group'), key: 'G' },
      { id: 'table', icon: 'mdi:table', label: t('toolbar.table'), key: 'T' },
      { id: 'text', icon: 'mdi:format-text', label: t('toolbar.text'), key: 'X' },
    ],
    [t],
  );

  // Hide the editing tools when the active doc is shared read-only by someone else.
  const sharedDocs = useCollabStore((s) => s.sharedDocs);
  const activeId = useDocsStore((s) => s.activeId);
  const entry = sharedDocs.find((e) => e.docId === activeId);
  const readOnly = !!entry && entry.ownerId !== localPeer.id && !entry.canEdit;
  const editingAllowed = !readOnly && !canvasLocked;

  const onImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const label = file.name.replace(/\.[^.]+$/, '');
      const pos = viewportCenter(rf);
      const drop = (w: number, h: number) => {
        const node = createIconNode({ source: 'svg', ref: dataUrl, name: label }, pos);
        node.width = w;
        node.height = h;
        node.data = { ...node.data, isImage: true };
        useFlowStore.getState().addNode(node);
      };
      const img = new Image();
      img.onload = () => {
        const MAX = 280;
        const r = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
        const w = r >= 1 ? MAX : Math.round(MAX * r);
        const h = r >= 1 ? Math.round(MAX / r) : MAX;
        drop(Math.max(48, w), Math.max(48, h));
      };
      img.onerror = () => drop(200, 200);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onAdd = () => {
    openPicker({
      sx: window.innerWidth / 2,
      sy: window.innerHeight - 96,
      flow: viewportCenter(rf),
    });
  };

  // Single-key tool shortcuts — suppressed while typing in a field / the picker.
  useEffect(() => {
    if (!editingAllowed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if (k === 'i') {
        e.preventDefault();
        fileRef.current?.click();
        return;
      }
      const map: Record<string, ToolId> = {
        v: 'select',
        l: 'connect',
        n: 'note',
        c: 'comment',
        g: 'group',
        t: 'table',
        x: 'text',
      };
      const next = map[k];
      if (next) {
        e.preventDefault();
        setTool(next);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [setTool, editingAllowed]);

  return (
    <div className="dock" role="toolbar" aria-label={t('toolbar.tools')}>
      <div className="dock-scroll">
        {/* ---- creation / editing tools (hidden when locked or read-only) ---- */}
        {editingAllowed && (
          <>
            <Tooltip label={t('toolbar.selectTip', { key: 'V' })} side="top">
              <button
                type="button"
                className="dock-btn"
                data-active={tool === 'select'}
                aria-label={t('toolbar.select')}
                aria-pressed={tool === 'select'}
                onClick={() => setTool('select')}
              >
                <Icon icon="mdi:cursor-default-outline" width={20} height={20} />
              </button>
            </Tooltip>
            <Tooltip label={t('toolbar.linkTip', { key: 'L' })} side="top">
              <button
                type="button"
                className="dock-btn"
                data-active={tool === 'connect'}
                aria-label={t('toolbar.link')}
                aria-pressed={tool === 'connect'}
                onClick={() => setTool(tool === 'connect' ? 'select' : 'connect')}
              >
                <Icon icon="mdi:vector-line" width={20} height={20} />
              </button>
            </Tooltip>

            <span className="dock-sep" />

            {placementTools.map((pt) => (
              <Tooltip key={pt.id} label={t('toolbar.toolTip', { label: pt.label, key: pt.key })} side="top">
                <button
                  type="button"
                  className="dock-btn"
                  data-active={tool === pt.id}
                  aria-label={pt.label}
                  aria-pressed={tool === pt.id}
                  onClick={() => setTool(pt.id)}
                >
                  <Icon icon={pt.icon} width={20} height={20} />
                </button>
              </Tooltip>
            ))}

            <Tooltip label={t('toolbar.imageTip', { key: 'I' })} side="top">
              <button
                type="button"
                className="dock-btn"
                aria-label={t('toolbar.image')}
                onClick={() => fileRef.current?.click()}
              >
                <Icon icon="mdi:image-outline" width={20} height={20} />
              </button>
            </Tooltip>

            <Tooltip label={t('toolbar.addNode')} side="top">
              <button
                type="button"
                className="dock-btn dock-btn-add"
                aria-label={t('toolbar.addNode')}
                onClick={onAdd}
              >
                <Icon icon="mdi:plus" width={22} height={22} />
              </button>
            </Tooltip>

            <span className="dock-sep" />
          </>
        )}

        {/* ---- view controls (grouped) + connexions — always available ---- */}
        <DockViewMenu />
        {panels.map((p) => (
          <Tooltip label={p.title ?? p.id} side="top" key={p.id}>
            <button
              type="button"
              className="dock-btn"
              aria-label={p.title ?? p.id}
              data-active={openPanelId === p.id ? 'true' : undefined}
              onClick={() => togglePanel(p.id)}
            >
              <Icon icon={p.icon ?? 'mdi:dock-window'} width={19} height={19} />
            </button>
          </Tooltip>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/*"
        style={{ display: 'none' }}
        onChange={onImagePick}
      />
    </div>
  );
}
