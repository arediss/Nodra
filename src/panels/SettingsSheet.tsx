import { useEffect } from 'react';
import { Icon } from '@iconify/react';
import { useUiStore, type Prefs } from '../ui-store';
import { useFlowStore } from '../store';
import { PluginsPanel } from './PluginsPanel';
import { DevPanel } from './DevPanel';
import { isDesktop } from '../plugins/manage';
import type { DiagramFile } from '../types';
import sampleDiagram from '../data/sample-diagram.json';
import './SettingsSheet.css';

const MCP_CMD = 'claude mcp add nodra --transport http http://localhost:8080/mcp';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'S'], label: 'Sauvegarder dans un fichier' },
  { keys: ['⌘', 'O'], label: 'Ouvrir un fichier' },
  { keys: ['⌘', 'F'], label: 'Rechercher dans le diagramme' },
  { keys: ['V'], label: 'Outil Sélection' },
  { keys: ['L'], label: 'Outil Lien' },
  { keys: ['N'], label: 'Note' },
  { keys: ['C'], label: 'Commentaire' },
  { keys: ['G'], label: 'Groupe / cadre' },
  { keys: ['T'], label: 'Table' },
  { keys: ['X'], label: 'Texte' },
  { keys: ['I'], label: 'Image' },
  { keys: ['⌫'], label: 'Supprimer la sélection' },
];

type TabId = 'general' | 'plugins' | 'dev' | 'ai' | 'about';

// The Développeur tab is desktop-only (it needs the filesystem + Tauri dialog), so
// it's filtered out of the rendered tabs on web.
const ALL_TABS: { id: TabId; label: string; icon: string; desktopOnly?: boolean }[] = [
  { id: 'general', label: 'Généraux', icon: 'mdi:tune-variant' },
  { id: 'plugins', label: 'Plugins', icon: 'mdi:puzzle-outline' },
  { id: 'dev', label: 'Développeur', icon: 'mdi:code-braces', desktopOnly: true },
  { id: 'ai', label: 'MCP / IA', icon: 'mdi:robot-happy-outline' },
  { id: 'about', label: 'À propos', icon: 'mdi:information-outline' },
];
const TABS = ALL_TABS.filter((t) => !t.desktopOnly || isDesktop);

function ToggleRow({ prefKey, label, sub }: { prefKey: keyof Prefs; label: string; sub: string }) {
  const on = useUiStore((s) => s.prefs[prefKey]);
  const setPref = useUiStore((s) => s.setPref);
  return (
    <label className="switch-row">
      <span className="switch-label">
        {label}
        <span className="switch-sub">{sub}</span>
      </span>
      <div className="switch" data-on={on ? 'true' : undefined}>
        <input type="checkbox" checked={on} onChange={(e) => setPref(prefKey, e.target.checked)} />
      </div>
    </label>
  );
}

const THEME_OPTS: { id: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { id: 'light', label: 'Clair', icon: 'mdi:white-balance-sunny' },
  { id: 'dark', label: 'Sombre', icon: 'mdi:weather-night' },
  { id: 'system', label: 'Auto', icon: 'mdi:laptop' },
];

function ThemeRow() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <div className="switch-row">
      <span className="switch-label">
        Thème
        <span className="switch-sub">Clair, sombre, ou suivre le système</span>
      </span>
      <div className="seg" role="group" aria-label="Thème">
        {THEME_OPTS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="seg-btn"
            data-on={theme === o.id ? 'true' : undefined}
            onClick={() => setTheme(o.id)}
          >
            <Icon icon={o.icon} width={15} height={15} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
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
  // The store is the single source of truth for the active tab (set by
  // openSettings(tab) and the nav below), so external routing never races.
  const tab: TabId = TABS.some((t) => t.id === requestedTab)
    ? (requestedTab as TabId)
    : 'general';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="sheet-overlay" onMouseDown={close}>
      <div
        className="sheet set-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Réglages"
      >
        <aside className="set-nav">
          <div className="set-nav-title">Réglages</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="set-navitem"
              data-active={tab === t.id}
              onClick={() => setSettingsTab(t.id)}
            >
              <Icon icon={t.icon} width={16} height={16} />
              {t.label}
            </button>
          ))}
        </aside>

        <div className="set-main">
          <div className="set-main-head">
            <h2 className="set-main-title">{current.label}</h2>
            <button className="sheet-close" onClick={close} aria-label="Fermer">
              <Icon icon="mdi:close" width={16} height={16} />
            </button>
          </div>

          <div className="set-main-body">
            {tab === 'general' && (
              <>
                <Card title="Apparence">
                  <ThemeRow />
                </Card>
                <Card title="Édition">
                  <ToggleRow
                    prefKey="snapToGrid"
                    label="Aligner sur la grille"
                    sub="Aimante les nœuds sur une grille de 8 px"
                  />
                  <ToggleRow
                    prefKey="autoSnapshot"
                    label="Instantanés automatiques"
                    sub="Capture une version dans l'historique après chaque pause"
                  />
                  <ToggleRow
                    prefKey="showMinimap"
                    label="Mini-carte"
                    sub="Affiche la mini-carte en bas à droite"
                  />
                </Card>
                <Card title="Raccourcis clavier">
                  <div className="set-kbds">
                    {SHORTCUTS.map((s) => (
                      <div className="set-kbd-row" key={s.label}>
                        <span className="set-kbd-label">{s.label}</span>
                        <span className="set-kbd-keys">
                          {s.keys.map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Démarrer">
                  <button
                    type="button"
                    className="btn set-example"
                    onClick={() => {
                      loadDiagram(sampleDiagram as DiagramFile);
                      close();
                    }}
                  >
                    <Icon icon="mdi:lightbulb-on-outline" width={15} height={15} />
                    Charger un exemple
                  </button>
                  <p className="muted set-explainer">
                    Installe des plugins depuis Réglages → Plugins pour enrichir les blocs.
                  </p>
                </Card>
              </>
            )}

            {tab === 'plugins' && <PluginsPanel />}

            {tab === 'dev' && <DevPanel />}

            {tab === 'ai' && (
              <>
                <Card title="Connecter Claude Code (MCP)">
                  <p className="set-p">
                    Branche <strong>Claude Code</strong> à Nodra via MCP : décris ton archi
                    en langage naturel et il la dessine — créer des nœuds, relier, grouper —
                    <strong> sans clé API</strong>, via ton abonnement Claude.
                  </p>
                  <div className="set-code">
                    <code>{MCP_CMD}</code>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Copier"
                      aria-label="Copier la commande"
                      onClick={() => {
                        navigator.clipboard?.writeText(MCP_CMD);
                        useUiStore.getState().showToast('Commande copiée');
                      }}
                    >
                      <Icon icon="mdi:content-copy" width={15} height={15} />
                    </button>
                  </div>
                  <p className="muted set-explainer">
                    Lance cette commande dans le dossier de ton projet, puis demande à Claude
                    Code : « ajoute un Lambda relié à une DynamoDB dans un groupe VPC ».
                  </p>
                </Card>
                <Card title="Statut">
                  <p className="muted set-p">
                    Le serveur MCP de Nodra est en cours de construction. Cette page te
                    donnera la commande exacte + le port dès qu'il sera disponible — aucune clé
                    API ne sera jamais requise.
                  </p>
                </Card>
              </>
            )}

            {tab === 'about' && (
              <Card title="À propos">
                <div className="set-about-name">Nodra</div>
                <div className="set-about-version muted">version 0.1.0</div>
                <p className="muted set-about-tagline">
                  Éditeur de diagrammes cloud, self-hosted — alternative libre à Lucidchart.
                  Icônes et exports extensibles via plugins ; mode bureau (Tauri) et web
                  (<code>-serve</code>).
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
