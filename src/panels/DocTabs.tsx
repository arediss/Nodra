import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useDocsStore } from '../docs-store';
import { useCollabStore } from '../collab/session';
import { exportPng, exportSvg } from '../lib/export';
import { runExporter } from '../lib/exporters';
import * as registries from '../plugins/registries';
import { ContextMenu, type MenuItem } from './ContextMenu';
import './DocTabs.css';

type Tab = { id: string; name: string; kind: 'local' | 'remote'; ownerName?: string };

/**
 * Document tab strip. Local docs + remote shared docs (virtual) live side by side.
 * A shared doc (mine or someone else's) is marked green + antenna. Right-click any
 * tab for actions (share/unshare, edit toggle, export, rename, duplicate, delete).
 */
export function DocTabs() {
  const { t } = useTranslation();
  const docs = useDocsStore((s) => s.docs);
  const activeId = useDocsStore((s) => s.activeId);
  const openDoc = useDocsStore((s) => s.openDoc);
  const newDoc = useDocsStore((s) => s.newDoc);
  const renameDoc = useDocsStore((s) => s.renameDoc);
  const deleteDoc = useDocsStore((s) => s.deleteDoc);
  const duplicateDoc = useDocsStore((s) => s.duplicateDoc);
  const reorderDoc = useDocsStore((s) => s.reorderDoc);
  const sharedTabs = useDocsStore((s) => s.sharedTabs);
  const liveSharedDocIds = useDocsStore((s) => s.liveSharedDocIds);

  const unshareDoc = useCollabStore((s) => s.unshareDoc);
  const setDocName = useCollabStore((s) => s.setDocName);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const tabs: Tab[] = [
    ...docs.map((d) => ({ id: d.id, name: d.name, kind: 'local' as const })),
    ...sharedTabs.map((t) => ({
      id: t.id,
      name: t.name,
      kind: 'remote' as const,
      ownerName: t.ownerName,
    })),
  ];

  const isShared = (id: string) =>
    liveSharedDocIds.includes(id) || sharedTabs.some((t) => t.id === id);
  const isMine = (id: string) => liveSharedDocIds.includes(id);

  const beginRename = (id: string, name: string) => {
    setDraft(name);
    setEditingId(id);
  };
  const commit = (id: string) => {
    const v = draft.trim();
    if (v) {
      renameDoc(id, v);
      // Propagate the new name to peers if this doc is shared by me.
      if (liveSharedDocIds.includes(id)) setDocName(id, v);
    }
    setEditingId(null);
  };

  // Export a specific doc: open it, wait a frame for the canvas to render, then export.
  const exportDoc = (id: string, name: string, fn: (n: string) => Promise<unknown>) => {
    if (activeId !== id) openDoc(id);
    requestAnimationFrame(() => requestAnimationFrame(() => void fn(name)));
  };

  const openMenu = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    const id = tab.id;
    const items: MenuItem[] = [];

    // Sharing lives in ONE place — the top-right share button. The tab menu keeps
    // only document actions (export / rename / duplicate / delete).
    for (const def of registries.exporters.all()) {
      items.push({
        label: t('doc.exportAs', { format: def.label }),
        icon: def.icon ?? 'mdi:file-export-outline',
        onClick: () => exportDoc(id, tab.name, (n) => runExporter(def, n)),
      });
    }
    items.push(
      { label: t('doc.exportAs', { format: 'PNG' }), icon: 'mdi:image-outline', onClick: () => exportDoc(id, tab.name, exportPng) },
      { label: t('doc.exportAs', { format: 'SVG' }), icon: 'mdi:vector-square', onClick: () => exportDoc(id, tab.name, exportSvg) },
    );

    if (tab.kind === 'local') {
      items.push(
        { label: t('common.rename'), icon: 'mdi:pencil-outline', separatorBefore: true, onClick: () => beginRename(id, tab.name) },
        { label: t('common.duplicate'), icon: 'mdi:content-copy', onClick: () => duplicateDoc(id) },
        {
          label: t('common.delete'),
          icon: 'mdi:trash-can-outline',
          danger: true,
          separatorBefore: true,
          onClick: () => {
            if (isMine(id)) unshareDoc(id);
            deleteDoc(id);
          },
        },
      );
    }

    setCtx({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="doctabs" data-tauri-drag-region>
      <div className="doctabs-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const editing = tab.id === editingId;
          const shared = isShared(tab.id);
          const local = tab.kind === 'local';
          return (
            <div
              key={tab.id}
              className="doctab"
              data-active={active ? 'true' : undefined}
              data-shared={shared ? 'true' : undefined}
              data-over={overId === tab.id && dragId !== tab.id ? 'true' : undefined}
              draggable={local && !editing}
              onDragStart={() => local && setDragId(tab.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(e) => {
                if (local && dragId && dragId !== tab.id) {
                  e.preventDefault();
                  setOverId(tab.id);
                }
              }}
              onDragLeave={() => setOverId((id) => (id === tab.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault();
                if (local && dragId && dragId !== tab.id) reorderDoc(dragId, tab.id);
                setDragId(null);
                setOverId(null);
              }}
              onClick={() => {
                if (!editing) openDoc(tab.id);
              }}
              onKeyDown={(e) => {
                if (!editing && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  openDoc(tab.id);
                }
              }}
              onDoubleClick={() => local && beginRename(tab.id, tab.name)}
              onContextMenu={(e) => openMenu(e, tab)}
              title={tab.ownerName ? `${tab.name} · ${tab.ownerName}` : tab.name}
              role="button"
              tabIndex={editing ? -1 : 0}
            >
              {editing ? (
                <input
                  ref={inputRef}
                  className="doctab-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => commit(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commit(tab.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <>
                  {shared && (
                    <Icon className="doctab-antenna" icon="lucide:antenna" width={13} height={13} />
                  )}
                  <span className="doctab-name">{tab.name}</span>
                  {local && (
                    <button
                      type="button"
                      className="doctab-close"
                      aria-label={t('doc.closeTab', { name: tab.name })}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMine(tab.id)) unshareDoc(tab.id);
                        deleteDoc(tab.id);
                      }}
                    >
                      <Icon icon="mdi:close" width={13} height={13} />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="doctab-new"
          aria-label={t('doc.newDocument')}
          title={t('doc.newDocument')}
          onClick={() => newDoc()}
        >
          <Icon icon="mdi:plus" width={16} height={16} />
        </button>
      </div>

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onClose={() => setCtx(null)} />}
    </div>
  );
}
