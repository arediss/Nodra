import type { ComponentType } from 'react';
import type { NodeTypes, FitViewOptions } from '@xyflow/react';
import type { IconEntry } from '../icons/catalog';
import type { AppNode, AppEdge, DiagramFile } from '../types';

/** Host API version. A plugin with a different MAJOR is refused (see host). */
export const API_VERSION = '1.0.0';

export type Permission =
  | 'blocks'
  | 'node-types'
  | 'importers'
  | 'exporters'
  | 'panels'
  | 'commands'
  | 'flow-read'
  | 'flow-write';

export const ALL_PERMISSIONS: Permission[] = [
  'blocks',
  'node-types',
  'importers',
  'exporters',
  'panels',
  'commands',
  'flow-read',
  'flow-write',
];

export type PluginManifest = {
  id: string; // reverse-domain, e.g. com.nodra.aws-icons
  name: string;
  version: string; // semver
  api_version: string; // semver, MAJOR checked against API_VERSION
  permissions: Permission[];
  main: string; // entry ES module exporting register(host)
  description?: string;
  author?: string;
  category?: string;
  keywords?: string[];
};

export type NodeComponent = NodeTypes[string];

export type ImportResult = {
  diagram: DiagramFile;
  /** Toast shown on success (e.g. "Import Terraform : 12 ressources"). */
  note?: string;
  /** true = replace the current document; otherwise import into a new one. */
  replace?: boolean;
};

export type ImporterDef = {
  id: string;
  label: string;
  /** File extensions (without the dot) this importer claims, e.g. ['tfstate']. */
  extensions?: string[];
  /** Content sniff when the extension is ambiguous (.json, .xml…). */
  detect?(text: string): boolean;
  /** May be async (e.g. draw.io inflates a compressed payload). */
  parse(text: string): ImportResult | Promise<ImportResult>;
};

export type ExporterDef = {
  id: string;
  label: string;
  ext: string;
  /** mdi glyph for the export menu (falls back to a generic icon). */
  icon?: string;
  serialize(doc: DiagramFile): string | Blob;
};

export type PanelDef = {
  id: string;
  side: 'right';
  component: ComponentType;
  /** Dock toggle button. */
  title?: string;
  icon?: string;
};

export type CommandDef = {
  id: string;
  label: string;
  icon?: string;
  run(): void;
};

/**
 * Read/write access to the live diagram, for panels and features. Backed by the
 * core flow store + the mounted ReactFlow instance. Reads need 'flow-read',
 * writes need 'flow-write'; a missing permission makes the call a no-op (reads
 * return empty) and warns.
 */
export type HostFlow = {
  getNodes(): AppNode[];
  getEdges(): AppEdge[];
  getSelection(): { nodeId: string | null; edgeId: string | null };
  setNodes(nodes: AppNode[]): void;
  setEdges(edges: AppEdge[]): void;
  loadDiagram(file: DiagramFile): void;
  toDiagram(): DiagramFile;
  selectEdge(id: string | null): void;
  fitView(options?: FitViewOptions<AppNode>): void;
  /** Fires on any flow change; returns an unsubscribe fn (auto-disposed). */
  subscribe(listener: () => void): () => void;
};

/** Chrome a plugin may drive: right-side panels and toasts. Not gated. */
export type HostUi = {
  openPanel(id: string): void;
  closePanel(): void;
  showToast(message: string): void;
};

/** Small helpers a self-contained plugin would otherwise re-implement. */
export type HostUtils = {
  /** Stable short unique id — the same generator the core uses for nodes. */
  newId(): string;
};

/** What a plugin receives in `register(host)`. Each method is capability-gated. */
export type Host = {
  api_version: string;
  manifest: PluginManifest;
  blocks: {
    register(pack: IconEntry[]): void;
    /** Read access to the icon catalog (for importers resolving icons by name). */
    search(query: string, provider?: string): IconEntry[];
    all(): IconEntry[];
  };
  nodeTypes: { register(type: string, component: NodeComponent): void };
  importers: { register(def: ImporterDef): void };
  exporters: { register(def: ExporterDef): void };
  panels: { register(def: PanelDef): void };
  commands: { register(def: CommandDef): void };
  flow: HostFlow;
  ui: HostUi;
  utils: HostUtils;
  /**
   * Resolve a plugin-relative asset path to a fetchable URL.
   *
   * Installed plugins are served from disk under `/api/plugins/<id>/<rel>`, so
   * this returns that path synchronously (a `string`).
   *
   * A plugin loaded from the developer's dev folder (desktop) is read in place
   * with no copy into `<app-data>/plugins`, so it has no HTTP endpoint — its
   * bytes are read over Tauri IPC and turned into an object URL, which is async.
   * In that case this returns a `Promise<string>`. Always `await` the result to
   * support both kinds of plugin:
   *   `const url = await host.assetUrl('icons/foo.svg');`
   */
  assetUrl(rel: string): string | Promise<string>;
  log(...args: unknown[]): void;
  /** Remove every contribution this host registered (plugin uninstall). */
  dispose(): void;
};

export type PluginModule = { register(host: Host): void };
