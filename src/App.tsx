import { useEffect } from 'react';
import { Toolbar } from './panels/Toolbar';
import { Canvas } from './flow/Canvas';
import { BottomDock } from './panels/BottomDock';
import { NodePicker } from './panels/NodePicker';
import { CanvasSearch } from './panels/CanvasSearch';
import { PanelHost } from './panels/PanelHost';
import { FlowBridge } from './plugins/FlowBridgeMount';
import { PeerAvatars } from './collab/PeerAvatars';
import { SettingsSheet } from './panels/SettingsSheet';
import { UpdateBanner } from './panels/UpdateBanner';
import { PluginsReloadBanner } from './panels/PluginsReloadBanner';
import { MissingPluginsBanner } from './panels/MissingPluginsBanner';
import { SelectionBar } from './panels/SelectionBar';
import { SelectionBalloon } from './panels/SelectionBalloon';
import { Toast } from './panels/Toast';
import { ShareSheet } from './panels/ShareSheet';
import { NodeDetailsSheet } from './panels/NodeDetailsSheet';
import { NamePrompt } from './panels/NamePrompt';
import { useDocsStore } from './docs-store';
import { useUiStore } from './ui-store';
import { startAutosave, startAutoSnapshot, saveToFile, openFromFile } from './lib/persistence';
import { maybeAutoJoin } from './collab/session';
import { watchSystemTheme } from './lib/theme';

export default function App() {
  useEffect(() => {
    useDocsStore.getState().init();
    maybeAutoJoin();
    const stopAutosave = startAutosave();
    const stopAutoSnapshot = startAutoSnapshot();
    const stopTheme = watchSystemTheme(() => useUiStore.getState().theme);

    // Global shortcuts: ⌘S save to file, ⌘O open a file.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        saveToFile();
      } else if (k === 'o') {
        e.preventDefault();
        openFromFile();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      stopAutosave();
      stopAutoSnapshot();
      stopTheme();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <main className="canvas-wrap">
          <Canvas />
          <FlowBridge />
          <BottomDock />
          <CanvasSearch />
          <PanelHost />
          <PeerAvatars />
        </main>
      </div>
      <UpdateBanner />
      <PluginsReloadBanner />
      <MissingPluginsBanner />
      <SelectionBar />
      <SelectionBalloon />
      <Toast />
      <NodePicker />
      <ShareSheet />
      <NodeDetailsSheet />
      <NamePrompt />
      <SettingsSheet />
    </div>
  );
}
