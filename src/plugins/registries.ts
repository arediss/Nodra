import { createRegistry } from './registry';
import type { IconEntry } from '../icons/catalog';
import type {
  NodeComponent,
  ImporterDef,
  ExporterDef,
  PanelDef,
  CommandDef,
  PluginManifest,
} from './types';

// The extension points the core reads. Leaf module: no core imports, so it can
// be imported anywhere (catalog, Canvas…) without cycles.
export const blocks = createRegistry<IconEntry>();
export const nodeTypes = createRegistry<NodeComponent>();
export const importers = createRegistry<ImporterDef>();
export const exporters = createRegistry<ExporterDef>();
export const panels = createRegistry<PanelDef>();
export const commands = createRegistry<CommandDef>();

/** Lightweight manifest of every host built (core + each plugin), keyed by id.
 *  Lets a diagram resolve a plugin id to a display name/version (dependency
 *  banner) without importing the loader (which would cycle). */
export type PluginMeta = Pick<PluginManifest, 'id' | 'name' | 'version'>;
export const pluginManifests = createRegistry<PluginMeta>();
