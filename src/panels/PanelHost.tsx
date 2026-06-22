import { useUiStore } from '../ui-store';
import * as registries from '../plugins/registries';
import { useRegistryVersion } from '../plugins/useRegistry';

/**
 * Renders the right-side panel currently open (one at a time), looked up by id in
 * the panels registry. Panels are contributed by builtins/plugins via
 * host.panels.register — the core mounts whichever matches ui-store.openPanelId.
 */
export function PanelHost() {
  const openPanelId = useUiStore((s) => s.openPanelId);
  useRegistryVersion(registries.panels);
  if (!openPanelId) return null;
  const def = registries.panels.get(openPanelId);
  if (!def) return null;
  const Panel = def.component;
  return <Panel />;
}
