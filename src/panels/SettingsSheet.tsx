import { useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useUiStore, type Prefs } from '../ui-store';
import { useFlowStore } from '../store';
import { PluginsPanel } from './PluginsPanel';
import { DevPanel } from './DevPanel';
import { isDesktop } from '../plugins/manage';
import type { DiagramFile } from '../types';
import sampleDiagram from '../data/sample-diagram.json';
import { useTranslation, Trans } from 'react-i18next';
import { setLang } from '../i18n';
import type { Lang } from '../lib/lang';
import './SettingsSheet.css';

const MCP_CMD = 'claude mcp add nodra --transport http http://localhost:8080/mcp';

// Shortcut labels are translated at render time (labelKey -> t(labelKey)).
const SHORTCUTS: { keys: string[]; labelKey: string }[] = [
  { keys: ['⌘', 'S'], labelKey: 'shortcut.saveFile' },
  { keys: ['⌘', 'O'], labelKey: 'shortcut.openFile' },
  { keys: ['⌘', 'F'], labelKey: 'shortcut.search' },
  { keys: ['V'], labelKey: 'shortcut.selectTool' },
  { keys: ['L'], labelKey: 'shortcut.linkTool' },
  { keys: ['N'], labelKey: 'shortcut.note' },
  { keys: ['C'], labelKey: 'shortcut.comment' },
  { keys: ['G'], labelKey: 'shortcut.group' },
  { keys: ['T'], labelKey: 'shortcut.table' },
  { keys: ['X'], labelKey: 'shortcut.text' },
  { keys: ['I'], labelKey: 'shortcut.image' },
  { keys: ['⌫'], labelKey: 'shortcut.deleteSelection' },
];

type TabId = 'general' | 'plugins' | 'dev' | 'ai' | 'about';

// The Développeur tab is desktop-only (it needs the filesystem + Tauri dialog), so
// it's filtered out of the rendered tabs on web. Labels are translated at render time.
const ALL_TABS: { id: TabId; labelKey: string; icon: string; desktopOnly?: boolean }[] = [
  { id: 'general', labelKey: 'settings.tabGeneral', icon: 'mdi:tune-variant' },
  { id: 'plugins', labelKey: 'settings.tabPlugins', icon: 'mdi:puzzle-outline' },
  { id: 'dev', labelKey: 'settings.tabDev', icon: 'mdi:code-braces', desktopOnly: true },
  { id: 'ai', labelKey: 'settings.tabAi', icon: 'mdi:robot-happy-outline' },
  { id: 'about', labelKey: 'settings.tabAbout', icon: 'mdi:information-outline' },
];
const TABS = ALL_TABS.filter((t) => !t.desktopOnly || isDesktop);

function ToggleRow({ prefKey, label, sub }: Readonly<{ prefKey: keyof Prefs; label: string; sub: string }>) {
  const on = useUiStore((s) => s.prefs[prefKey]);
  const setPref = useUiStore((s) => s.setPref);
  return (
    <label className="switch-row">
      <span className="switch-label">
        {label}{' '}
        <span className="switch-sub">{sub}</span>
      </span>
      <div className="switch" data-on={on ? 'true' : undefined}>
        <input type="checkbox" checked={on} onChange={(e) => setPref(prefKey, e.target.checked)} />
      </div>
    </label>
  );
}

const THEME_OPTS: { id: 'light' | 'dark' | 'system'; icon: string }[] = [
  { id: 'light', icon: 'mdi:white-balance-sunny' },
  { id: 'dark', icon: 'mdi:weather-night' },
  { id: 'system', icon: 'mdi:laptop' },
];

function ThemeRow() {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <div className="switch-row">
      <span className="switch-label">
        {t('settings.theme')}{' '}
        <span className="switch-sub">{t('settings.themeSub')}</span>
      </span>
      <div className="seg" role="group" aria-label={t('settings.theme')}>
        {THEME_OPTS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="seg-btn"
            data-on={theme === o.id ? 'true' : undefined}
            onClick={() => setTheme(o.id)}
          >
            <Icon icon={o.icon} width={15} height={15} />
            {t(`theme.${o.id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// Language names are shown in their own language (not translated).
const LANG_OPTS: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

function LangRow() {
  const { t, i18n } = useTranslation();
  const cur: Lang = i18n.language?.startsWith('en') ? 'en' : 'fr';
  return (
    <div className="switch-row">
      <span className="switch-label">
        {t('settings.language')}{' '}
        <span className="switch-sub">{t('settings.languageSub')}</span>
      </span>
      <select
        className="set-select"
        value={cur}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t('settings.language')}
      >
        {LANG_OPTS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Card({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="set-card">
      <div className="set-card-title">{title}</div>
      <div className="set-card-body">{children}</div>
    </section>
  );
}

export function SettingsSheet() {
  const open = useUiStore((s) => s.settingsOpen);
  const requestedTab = useUiStore((s) => s.settingsTab);
  const close = useUiStore((s) => s.closeSettings);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const loadDiagram = useFlowStore((s) => s.loadDiagram);
  // `tr` aliased so it doesn't shadow the `t` (tab) param in the TABS maps below.
  const { t: tr } = useTranslation();
  // The store is the single source of truth for the active tab (set by
  // openSettings(tab) and the nav below), so external routing never races.
  const tab: TabId = TABS.some((t) => t.id === requestedTab)
    ? (requestedTab as TabId)
    : 'general';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div
      className="sheet-overlay"
      onMouseDown={close}
      role="button"
      tabIndex={-1}
      aria-label={tr('common.close')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
      }}
    >
      <div
        className="sheet set-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={tr('settings.title')}
        tabIndex={-1}
      >
        <aside className="set-nav">
          <div className="set-nav-title">{tr('settings.title')}</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="set-navitem"
              data-active={tab === t.id}
              onClick={() => setSettingsTab(t.id)}
            >
              <Icon icon={t.icon} width={16} height={16} />
              {tr(t.labelKey)}
            </button>
          ))}
        </aside>

        <div className="set-main">
          <div className="set-main-head">
            <h2 className="set-main-title">{tr(current.labelKey)}</h2>
            <button className="sheet-close" onClick={close} aria-label={tr('common.close')}>
              <Icon icon="mdi:close" width={16} height={16} />
            </button>
          </div>

          <div className="set-main-body">
            {tab === 'general' && (
              <>
                <Card title={tr('settings.appearance')}>
                  <ThemeRow />
                  <LangRow />
                </Card>
                <Card title={tr('settings.editingTitle')}>
                  <ToggleRow
                    prefKey="snapToGrid"
                    label={tr('settings.snapToGrid')}
                    sub={tr('settings.snapToGridSub')}
                  />
                  <ToggleRow
                    prefKey="autoSnapshot"
                    label={tr('settings.autoSnapshot')}
                    sub={tr('settings.autoSnapshotSub')}
                  />
                  <ToggleRow
                    prefKey="showMinimap"
                    label={tr('settings.minimap')}
                    sub={tr('settings.minimapSub')}
                  />
                </Card>
                <Card title={tr('settings.shortcutsTitle')}>
                  <div className="set-kbds">
                    {SHORTCUTS.map((s) => (
                      <div className="set-kbd-row" key={s.labelKey}>
                        <span className="set-kbd-label">{tr(s.labelKey)}</span>
                        <span className="set-kbd-keys">
                          {s.keys.map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title={tr('settings.startTitle')}>
                  <button
                    type="button"
                    className="btn set-example"
                    onClick={() => {
                      loadDiagram(sampleDiagram as DiagramFile);
                      close();
                    }}
                  >
                    <Icon icon="mdi:lightbulb-on-outline" width={15} height={15} />
                    {tr('settings.loadExample')}
                  </button>
                  <p className="muted set-explainer">
                    {tr('settings.startExplainer')}
                  </p>
                </Card>
              </>
            )}

            {tab === 'plugins' && <PluginsPanel />}

            {tab === 'dev' && <DevPanel />}

            {tab === 'ai' && (
              <>
                <Card title={tr('mcp.connectTitle')}>
                  <p className="set-p">
                    <Trans i18nKey="mcp.connectBody" components={{ s: <strong /> }} />
                  </p>
                  <div className="set-code">
                    <code>{MCP_CMD}</code>
                    <button
                      type="button"
                      className="btn-icon"
                      title={tr('common.copy')}
                      aria-label={tr('mcp.copyCommand')}
                      onClick={() => {
                        navigator.clipboard?.writeText(MCP_CMD);
                        useUiStore.getState().showToast(tr('mcp.commandCopied'));
                      }}
                    >
                      <Icon icon="mdi:content-copy" width={15} height={15} />
                    </button>
                  </div>
                  <p className="muted set-explainer">
                    {tr('mcp.connectExplainer')}
                  </p>
                </Card>
                <Card title={tr('mcp.statusTitle')}>
                  <p className="muted set-p">
                    {tr('mcp.statusBody')}
                  </p>
                </Card>
              </>
            )}

            {tab === 'about' && (
              <Card title={tr('about.title')}>
                <div className="set-about-name">Nodra</div>
                <div className="set-about-version muted">{tr('about.version', { version: '0.1.0' })}</div>
                <p className="muted set-about-tagline">
                  <Trans i18nKey="about.tagline" components={{ c: <code /> }} />
                </p>
                <div className="set-about-stack">
                  <span>Tauri</span>
                  <span>React</span>
                  <span>ReactFlow</span>
                  <span>TypeScript</span>
                  <span>Zustand</span>
                  <span>Iconify</span>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
