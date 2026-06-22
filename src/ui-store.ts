import { create } from 'zustand';
import { type ThemeMode, loadTheme, saveTheme, applyTheme } from './lib/theme';

const PREFS_KEY = 'pfd:prefs';
const GRID_KEY = 'pfd:grid';

export type GridStyle = 'dots' | 'lines' | 'none';
function loadGrid(): GridStyle {
  try {
    const g = localStorage.getItem(GRID_KEY);
    if (g === 'dots' || g === 'lines' || g === 'none') return g;
  } catch {
    /* ignore */
  }
  return 'dots';
}
const RECENTS_KEY = 'pfd:recents';
const RECENTS_CAP = 6;
// Developer's chosen dev-plugins folder (desktop dev loop). Must stay in sync with
// the same key read directly in plugins/loader.ts.
const DEV_DIR_KEY = 'pfd:devPluginsDir';
// Dev-plugin ids the developer disabled (a plugin is ENABLED unless listed here).
// Read directly by the loader's hot-reload watcher too, so keep the key in sync.
const DEV_DISABLED_KEY = 'pfd:devPluginsDisabled';

function loadDevPluginsDir(): string | null {
  try {
    const v = localStorage.getItem(DEV_DIR_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function loadDevDisabled(): string[] {
  try {
    const raw = localStorage.getItem(DEV_DISABLED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export type Prefs = {
  snapToGrid: boolean;
  showMinimap: boolean;
  dotGrid: boolean;
  autoSnapshot: boolean;
};

const defaultPrefs: Prefs = {
  snapToGrid: true,
  showMinimap: true,
  dotGrid: true,
  autoSnapshot: false,
};

/** Active creation tool (Miro-style placement). 'select' = normal. */
export type ToolId =
  | 'select'
  | 'note'
  | 'comment'
  | 'group'
  | 'table'
  | 'text'
  | 'image'
  | 'connect';

/**
 * Open-state for the node-search picker. `sx/sy` is the screen anchor (where the
 * popover renders); `flow` is the canvas position where the chosen node lands.
 */
export type PickerAnchor = {
  sx: number;
  sy: number;
  flow: { x: number; y: number };
};

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Recently-inserted node template ids (built-ins, 'icon:<id>', 'component:<id>'). */
function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENTS_CAP)
      : [];
  } catch {
    return [];
  }
}

export type UiState = {
  tool: ToolId;
  recents: string[];
  picker: PickerAnchor | null;
  settingsOpen: boolean;
  /** Which Settings tab to show; set by openSettings(tab) so callers (e.g. the
   *  missing-plugins banner) can land the user directly on the Plugins section. */
  settingsTab: string | null;
  shareOpen: boolean;
  detailsOpen: boolean;
  namePromptOpen: boolean;
  /** Which right-side panel is open (panel registry id), or null. One at a time. */
  openPanelId: string | null;
  canvasLocked: boolean;
  toast: string | null;
  /** Plugins were installed/removed this session; load happens at startup only,
   *  so the user must reload to activate the change (see PluginsReloadBanner). */
  pluginsDirty: boolean;
  /** false until the first disk-plugin load attempt resolves — gates the
   *  missing-plugins banner so it never flashes before plugins finish loading. */
  pluginsLoaded: boolean;
  /** Developer's chosen dev-plugins folder (desktop dev loop), or null. Persisted. */
  devPluginsDir: string | null;
  /** Dev-plugin ids the developer disabled. A plugin is ENABLED unless listed. Persisted. */
  devDisabled: string[];
  theme: ThemeMode;
  gridStyle: GridStyle;
  prefs: Prefs;
  setTool: (tool: ToolId) => void;
  pushRecent: (templateId: string) => void;
  openPicker: (anchor: PickerAnchor) => void;
  closePicker: () => void;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;
  openShare: () => void;
  closeShare: () => void;
  openDetails: () => void;
  closeDetails: () => void;
  openNamePrompt: () => void;
  closeNamePrompt: () => void;
  togglePanel: (id: string) => void;
  openPanel: (id: string) => void;
  closePanel: () => void;
  toggleCanvasLock: () => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  setPluginsDirty: (dirty: boolean) => void;
  setPluginsLoaded: (loaded: boolean) => void;
  setDevPluginsDir: (path: string | null) => void;
  /** Flip a dev plugin's enabled state (membership in devDisabled) and persist. */
  toggleDevPlugin: (id: string) => void;
  setSettingsTab: (tab: string) => void;
  setPref: (key: keyof Prefs, value: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setGridStyle: (g: GridStyle) => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  tool: 'select',
  recents: loadRecents(),
  picker: null,
  settingsOpen: false,
  settingsTab: null,
  shareOpen: false,
  detailsOpen: false,
  namePromptOpen: false,
  openPanelId: null,
  canvasLocked: false,
  toast: null,
  pluginsDirty: false,
  pluginsLoaded: false,
  devPluginsDir: loadDevPluginsDir(),
  devDisabled: loadDevDisabled(),
  theme: loadTheme(),
  gridStyle: loadGrid(),
  prefs: loadJSON<Prefs>(PREFS_KEY, defaultPrefs),
  setTool: (tool) => set({ tool }),
  pushRecent: (templateId) => {
    const next = [
      templateId,
      ...get().recents.filter((id) => id !== templateId),
    ].slice(0, RECENTS_CAP);
    set({ recents: next });
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  },
  openPicker: (anchor) => set({ picker: anchor }),
  closePicker: () => set({ picker: null }),
  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? null }),
  closeSettings: () => set({ settingsOpen: false, settingsTab: null }),
  openShare: () => set({ shareOpen: true }),
  closeShare: () => set({ shareOpen: false }),
  openDetails: () => set({ detailsOpen: true }),
  closeDetails: () => set({ detailsOpen: false }),
  openNamePrompt: () => set({ namePromptOpen: true }),
  closeNamePrompt: () => set({ namePromptOpen: false }),
  // One right-side panel at a time.
  togglePanel: (id) => set((s) => ({ openPanelId: s.openPanelId === id ? null : id })),
  openPanel: (id) => set({ openPanelId: id }),
  closePanel: () => set({ openPanelId: null }),
  toggleCanvasLock: () => set((s) => ({ canvasLocked: !s.canvasLocked })),
  showToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),
  setPluginsDirty: (pluginsDirty) => set({ pluginsDirty }),
  setPluginsLoaded: (pluginsLoaded) => set({ pluginsLoaded }),
  setDevPluginsDir: (devPluginsDir) => {
    set({ devPluginsDir });
    try {
      if (devPluginsDir) localStorage.setItem(DEV_DIR_KEY, devPluginsDir);
      else localStorage.removeItem(DEV_DIR_KEY);
    } catch {
      /* ignore quota */
    }
  },
  toggleDevPlugin: (id) => {
    const cur = get().devDisabled;
    const devDisabled = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ devDisabled });
    try {
      localStorage.setItem(DEV_DISABLED_KEY, JSON.stringify(devDisabled));
    } catch {
      /* ignore quota */
    }
  },
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setPref: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore quota */
    }
  },
  setTheme: (theme) => {
    set({ theme });
    saveTheme(theme);
    applyTheme(theme);
  },
  setGridStyle: (gridStyle) => {
    set({ gridStyle });
    try {
      localStorage.setItem(GRID_KEY, gridStyle);
    } catch {
      /* ignore */
    }
  },
}));

// Apply the saved theme as early as possible (module load, before first paint).
applyTheme(loadTheme());
