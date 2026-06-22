import { getIcon } from '../icons/catalog';
import { useFlowStore, newId } from '../store';
import { useComponentsStore } from '../components-store';
import type { AppNode } from '../types';

/**
 * Single source of truth for "what node does inserting X create".
 *
 * Every insertion surface — the bottom dock placement tool, the right-click node
 * picker, and drag-drop — funnels through here so a note/group/icon created one
 * way is byte-identical to one created another way. A template id is one of:
 *   - a built-in id: 'note' | 'comment' | 'group' | 'table' | 'text'
 *     (note: 'table' maps to the node type 'erTable')
 *   - 'icon:<catalogId>'      -> a provider/brand icon from src/icons/catalog
 *   - 'component:<defId>'     -> a saved reusable component (a group + children)
 */

export type Vec2 = { x: number; y: number };

export type BuiltinTemplateId = 'note' | 'comment' | 'group' | 'table' | 'text';

export type BuiltinTemplate = {
  id: BuiltinTemplateId;
  label: string;
  /** mdi glyph shown in the dock / picker */
  icon: string;
  make: (position: Vec2) => AppNode;
};

/** The built-in (non-icon) node templates, with their canonical default data+style. */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'note',
    label: 'Note',
    icon: 'mdi:note-outline',
    make: (position) =>
      ({
        id: newId(),
        type: 'note',
        position,
        width: 200,
        height: 130,
        data: { text: '', color: 'yellow' },
      }) as AppNode,
  },
  {
    id: 'comment',
    label: 'Commentaire',
    icon: 'mdi:comment-outline',
    make: (position) =>
      ({
        id: newId(),
        type: 'comment',
        position,
        width: 220,
        height: 110,
        data: { text: '' },
      }) as AppNode,
  },
  {
    id: 'group',
    label: 'Groupe / cadre',
    icon: 'mdi:shape-rectangle-plus',
    make: (position) =>
      ({
        id: newId(),
        type: 'group',
        position,
        width: 320,
        height: 220,
        data: { label: 'Groupe', variant: 'plain' },
      }) as AppNode,
  },
  {
    id: 'table',
    label: 'Table (BDD)',
    icon: 'mdi:table',
    make: (position) =>
      ({
        id: newId(),
        type: 'erTable',
        position,
        data: {
          label: 'NouvelleTable',
          columns: [{ name: 'id', type: 'uuid', key: 'PK' }],
        },
      }) as AppNode,
  },
  {
    id: 'text',
    label: 'Texte',
    icon: 'mdi:format-text',
    make: (position) =>
      ({
        id: newId(),
        type: 'text',
        position,
        width: 160,
        height: 48,
        data: { text: '' },
      }) as AppNode,
  },
];

const BUILTIN_BY_ID = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t]));

/** Minimal icon descriptor needed to build an icon node (matches the drop payload). */
export type IconSpec = {
  source: 'iconify' | 'svg';
  ref: string;
  name: string;
  provider?: string;
};

/** Build (but do not insert) the canonical icon node — the one icon-node shape. */
export function createIconNode(spec: IconSpec, position: Vec2): AppNode {
  return {
    id: newId(),
    type: 'icon',
    position,
    data: {
      label: spec.name,
      iconRef: spec.ref,
      iconSource: spec.source,
      provider: spec.provider,
    },
  } as AppNode;
}

/**
 * Build a single node from a template id. Returns null for unknown ids or for
 * multi-node templates (components) — use {@link insertTemplate} for those.
 */
export function createNode(templateId: string, position: Vec2): AppNode | null {
  const builtin = BUILTIN_BY_ID.get(templateId as BuiltinTemplateId);
  if (builtin) return builtin.make(position);
  if (templateId.startsWith('icon:')) {
    const entry = getIcon(templateId.slice('icon:'.length));
    if (!entry) return null;
    return createIconNode(
      { source: entry.source, ref: entry.ref, name: entry.name, provider: entry.provider },
      position,
    );
  }
  return null;
}

/**
 * Insert a template onto the canvas and return the primary node id to select
 * (null for components, which self-insert a group + children + edges). This is the
 * single entry point shared by the dock, the picker and any other insertion path.
 */
export function insertTemplate(templateId: string, position: Vec2): string | null {
  if (templateId.startsWith('component:')) {
    useComponentsStore.getState().instantiate(templateId.slice('component:'.length), position);
    return null;
  }
  const node = createNode(templateId, position);
  if (!node) return null;
  useFlowStore.getState().addNode(node);
  return node.id;
}
