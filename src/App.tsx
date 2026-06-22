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
import { AppUpdateBanner } from './panels/AppUpdateBanner';
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
import { useFlowStore } from './store';
import { startAutosave, startAutoSnapshot, saveToFile, openFromFile } from './lib/persistence';
import { maybeAutoJoin } from './collab/session';
import { watchSystemTheme } from './lib/theme';
import { useAppUpdate } from './lib/app-update';

export default function App() {
  useEffect(() => {
    useDocsStore.getState().init();
    maybeAutoJoin();
    // Check for an app update on launch (desktop only; self-noops on web).
    void useAppUpdate.getState().check();
    const stopAutosave = startAutosave();
    const stopAutoSnapshot = startAutoSnapshot();
    const stopTheme = watchSystemTheme(() => useUiStore.getState().theme);

    // Global shortcuts: ⌘S save to file, ⌘O open a file.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      // Shortcuts that must yield to native editing when a field is focused.
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable);
      if (k === 's') {
        e.preventDefault();
        saveToFile();
      } else if (k === 'o') {
        e.preventDefault();
        openFromFile();
      } else if (k === 'a') {
        if (typing) return; // let the field's native select-all run
        e.preventDefault();
        const fs = useFlowStore.getState();
        // Multi-selection lives on ReactFlow's per-node `.selected` flag (drives
        // the multi-select bar, component capture and native multi-delete).
        fs.setNodes(fs.nodes.map((n) => (n.selected ? n : { ...n, selected: true })));
        fs.selectNode(null); // hide the single-item balloon; the multi bar takes over
      } else if (k === 'z' || k === 'y') {
        if (typing) return; // let the browser's native text undo/redo run
        e.preventDefault();
        if (k === 'z' && !e.shiftKey) useFlowStore.getState().undo();
        else useFlowStore.getState().redo(); // ⌘⇧Z (mac) or ⌘Y / Ctrl+Y (win)
      } else if (k === 'r' && import.meta.env.DEV) {
        // Dev convenience: ⌘R reloads the webview (Tauri doesn't wire it natively).
        e.preventDefault();
        globalThis.location.reload();
      }
    };
    globalThis.addEventListener('keydown', onKey);

    return () => {
      stopAutosave();
      stopAutoSnapshot();
      stopTheme();
      globalThis.removeEventListener('keydown', onKey);
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
      <AppUpdateBanner />
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
