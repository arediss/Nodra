import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Icon } from '@iconify/react';
import { searchIcons, getIcon, getProviders, type IconEntry, type IconSource } from '../icons/catalog';
import { IconGlyph } from '../icons/IconGlyph';
import * as registries from '../plugins/registries';
import { useRegistryVersion } from '../plugins/useRegistry';
import { BUILTIN_TEMPLATES, insertTemplate } from '../flow/nodeTemplates';
import { useUiStore, type PickerAnchor } from '../ui-store';
import { useFlowStore } from '../store';
import { useComponentsStore } from '../components-store';
import type { ComponentDef } from '../types';
import './NodePicker.css';

// Section header for a provider — derived from whatever the installed icon packs
// declare (the core names no provider). Capitalize as a friendly fallback.
const labelFor = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

const PROVIDER_CAP = 12;
const PANEL_W = 360;

type PickItem = {
  /** template id consumed by insertTemplate */
  id: string;
  name: string;
  kind: 'builtin' | 'icon' | 'component';
  glyph?: string; // mdi id for builtin / component
  source?: IconSource; // icon kind
  ref?: string; // icon kind
};

type Section = {
  /** stable React key — distinct from the display title (providers can share a label) */
  key: string;
  title: string;
  items: PickItem[];
  provider?: string;
  total?: number;
  expandable?: boolean;
};

const builtinItem = (t: (typeof BUILTIN_TEMPLATES)[number]): PickItem => ({
  id: t.id,
  name: t.label,
  kind: 'builtin',
  glyph: t.icon,
});
const iconItem = (e: IconEntry): PickItem => ({
  id: `icon:${e.id}`,
  name: e.name,
  kind: 'icon',
  source: e.source,
  ref: e.ref,
});
const componentItem = (d: ComponentDef): PickItem => ({
  id: `component:${d.id}`,
  name: d.name,
  kind: 'component',
  glyph: 'mdi:puzzle-outline',
});

function resolve(id: string, defs: ComponentDef[]): PickItem | null {
  const b = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (b) return builtinItem(b);
  if (id.startsWith('icon:')) {
    const e = getIcon(id.slice('icon:'.length));
    return e ? iconItem(e) : null;
  }
  if (id.startsWith('component:')) {
    const d = defs.find((x) => x.id === id.slice('component:'.length));
    return d ? componentItem(d) : null;
  }
  return null;
}

function searchSections(query: string, defs: ComponentDef[], t: TFunction): Section[] {
  const ql = query.toLowerCase();
  const items: PickItem[] = [];
  for (const tpl of BUILTIN_TEMPLATES) {
    if (tpl.label.toLowerCase().includes(ql) || tpl.id.includes(ql)) items.push(builtinItem(tpl));
  }
  for (const d of defs) {
    if (d.name.toLowerCase().includes(ql)) items.push(componentItem(d));
  }
  for (const e of searchIcons(query)) items.push(iconItem(e));
  return [{ key: 'results', title: t('picker.section.results'), items }];
}

function providerSections(expanded: string | null): Section[] {
  const byProvider = new Map<string, IconEntry[]>();
  for (const e of searchIcons('', 'all')) {
    const arr = byProvider.get(e.provider);
    if (arr) arr.push(e);
    else byProvider.set(e.provider, [e]);
  }
  const sections: Section[] = [];
  for (const prov of getProviders()) {
    if (prov === 'all') continue;
    const entries = byProvider.get(prov);
    if (!entries || entries.length === 0) continue;
    const isExp = expanded === prov;
    const shown = isExp ? entries : entries.slice(0, PROVIDER_CAP);
    sections.push({
      key: prov,
      title: labelFor(prov),
      items: shown.map(iconItem),
      provider: prov,
      total: entries.length,
      expandable: entries.length > PROVIDER_CAP && !isExp,
    });
  }
  return sections;
}

function buildSections(
  query: string,
  recents: string[],
  defs: ComponentDef[],
  expanded: string | null,
  t: TFunction,
): Section[] {
  const q = query.trim();

  if (q) return searchSections(q, defs, t);

  const sections: Section[] = [];

  const rec = recents
    .map((id) => resolve(id, defs))
    .filter((x): x is PickItem => x !== null);
  if (rec.length) sections.push({ key: 'recents', title: t('picker.section.recents'), items: rec });

  sections.push({ key: 'builtins', title: t('picker.section.elements'), items: BUILTIN_TEMPLATES.map(builtinItem) });

  // Saved components right after the built-ins so they're easy to find (not
  // buried under every icon provider).
  if (defs.length)
    sections.push({ key: 'components', title: t('picker.section.components'), items: defs.map(componentItem) });

  sections.push(...providerSections(expanded));

  return sections;
}

function PickerInner({ picker }: { picker: PickerAnchor }) {
  const { t } = useTranslation();
  const closePicker = useUiStore((s) => s.closePicker);
  const pushRecent = useUiStore((s) => s.pushRecent);
  const recents = useUiStore((s) => s.recents);
  const selectNode = useFlowStore((s) => s.selectNode);
  const defs = useComponentsStore((s) => s.defs);

  // Re-run buildSections when downloadable block packs (un)register.
  const blocksVersion = useRegistryVersion(registries.blocks);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pos, setPos] = useState({ left: picker.sx, top: picker.sy });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sections = useMemo(
    () => buildSections(query, recents, defs, expanded, t),
    [query, recents, defs, expanded, blocksVersion, t],
  );
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const s of sections) {
      out.push(acc);
      acc += s.items.length;
    }
    return out;
  }, [sections]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setActive(0), [query, expanded]);

  // Dismiss on outside click (capture phase: ReactFlow stops canvas mousedown).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closePicker();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [closePicker]);

  // Clamp into the viewport; open upward when anchored near the bottom (dock "+").
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const w = el.offsetWidth || PANEL_W;
    const h = el.offsetHeight;
    let left = picker.sx;
    let top = picker.sy;
    if (top + h > window.innerHeight - 8) top = Math.max(8, picker.sy - h);
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    setPos({ left, top });
  }, [picker.sx, picker.sy, sections]);

  // Keep the keyboard-active tile in view.
  useEffect(() => {
    const el = menuRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const insert = (item: PickItem) => {
    const id = insertTemplate(item.id, picker.flow);
    if (id) selectNode(id);
    pushRecent(item.id);
    closePicker();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePicker();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = flat[active];
      if (it) insert(it);
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className="npk"
      style={{ left: pos.left, top: pos.top }}
      role="dialog"
      aria-label={t('picker.title')}
      onKeyDown={onKeyDown}
    >
      <div className="npk-search">
        <Icon className="npk-search-lead" icon="mdi:magnify" width={16} height={16} />
        <input
          ref={inputRef}
          className="npk-search-input"
          type="text"
          placeholder={t('picker.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="npk-search-clear"
            aria-label={t('picker.clear')}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <Icon icon="mdi:close-circle" width={15} height={15} />
          </button>
        )}
      </div>

      <div className="npk-body scroll">
        {flat.length === 0 ? (
          <div className="npk-empty muted">{t('picker.noResults')}</div>
        ) : (
          sections.map((sec, si) => (
            <div className="npk-sec" key={sec.key}>
              <div className="npk-sec-head">
                <span className="npk-sec-title">{sec.title}</span>
                {sec.expandable && sec.provider && (
                  <button
                    type="button"
                    className="npk-showall"
                    onClick={() => setExpanded(sec.provider!)}
                  >
                    {t('picker.showAll', { count: sec.total })}
                  </button>
                )}
              </div>
              <div className="npk-grid">
                {sec.items.map((it, j) => {
                  const idx = offsets[si] + j;
                  return (
                    <button
                      type="button"
                      key={it.id}
                      className="npk-tile"
                      data-active={idx === active ? 'true' : undefined}
                      title={it.name}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => insert(it)}
                    >
                      <span className="npk-glyph">
                        {it.kind === 'icon' && it.ref && it.source ? (
                          <IconGlyph source={it.source} refId={it.ref} name={it.name} size={26} />
                        ) : (
                          <Icon icon={it.glyph ?? 'mdi:shape-outline'} width={24} height={24} />
                        )}
                      </span>
                      <span className="npk-name">{it.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="npk-hint">
        <span>{t('picker.hint.navigate')}</span>
        <span>{t('picker.hint.insert')}</span>
        <span>{t('picker.hint.dismiss')}</span>
      </div>
    </div>,
    document.body,
  );
}

export function NodePicker() {
  const picker = useUiStore((s) => s.picker);
  if (!picker) return null;
  return (
    <PickerInner
      key={`${picker.sx}:${picker.sy}:${picker.flow.x}:${picker.flow.y}`}
      picker={picker}
    />
  );
}
