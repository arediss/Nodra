import React from 'react';
import ReactDOM from 'react-dom/client';
import * as ReactNS from 'react';
import * as ReactDOMNS from 'react-dom';
import * as JsxRuntime from 'react/jsx-runtime';
import * as XYFlow from '@xyflow/react';
import { ReactFlowProvider } from '@xyflow/react';
import * as Iconify from '@iconify/react';
import * as I18next from 'i18next';
import * as ReactI18next from 'react-i18next';
import App from './App';
import { registerBuiltins } from './plugins/builtins';
import { loadDiskPlugins, loadDevPlugins, startDevWatch } from './plugins/loader';
import { useUiStore } from './ui-store';
import './i18n';
import './styles/tokens.css';
import './styles/app.css';
import '@xyflow/react/dist/style.css';

// Expose the shared singletons so disk/HTTP plugins (built with these marked
// external) bind to the ONE React/@xyflow instance on the page — never a copy
// (a second React would break hooks/context). Must be set before any plugin
// loads. See scripts/build-plugin.mjs.
(globalThis as typeof globalThis & { __nodra?: Record<string, unknown> }).__nodra = {
  react: ReactNS,
  reactDom: ReactDOMNS,
  jsxRuntime: JsxRuntime,
  xyflow: XYFlow,
  iconify: Iconify,
  i18next: I18next,
  'react-i18next': ReactI18next,
};

// Register the core's node types + bundled icon packs into the registries,
// synchronously, before the first render (web and desktop alike).
registerBuiltins();
// Then load installed plugins from disk (desktop via Tauri, web via /api/plugins),
// THEN dev plugins directly from the developer's chosen dev folder (desktop only;
// self-guards on web / when no folder is set). The two loads are chained so dev
// plugins always register AFTER installed ones — a dev id then predictably
// overrides an installed one (last register wins). Async: the reactive registries
// update the UI when packs land. Flag once both attempts resolve so the
// missing-plugins banner doesn't flash before then.
void loadDiskPlugins()
  .then(() => loadDevPlugins())
  .finally(() => useUiStore.getState().setPluginsLoaded(true));

// Automatic hot-reload: poll the dev folder and reload a dev plugin when its built
// code changes — so the developer never clicks "Recharger" during normal dev.
// Self-noops on web / when no dev folder is set.
startDevWatch();

// Mark the desktop (Tauri) context so we can round the frameless window, and
// suppress the native webview context menu (reload/inspect) in favour of ours.
if (typeof globalThis.window !== 'undefined' && '__TAURI_INTERNALS__' in globalThis) {
  document.documentElement.classList.add('is-tauri');
  globalThis.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Trackpad pinch fires both a wheel event (ReactFlow zoom) AND WebKit "magnify"
// gesture events (webview page zoom) — the latter scales/scrolls the whole app.
// Suppress the native page zoom; ReactFlow keeps zooming via wheel.
const stopGesture = (e: Event) => e.preventDefault();
globalThis.addEventListener('gesturestart', stopGesture);
globalThis.addEventListener('gesturechange', stopGesture);
globalThis.addEventListener('gestureend', stopGesture);
globalThis.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>,
);
