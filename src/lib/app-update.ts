import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';

/**
 * App auto-update state machine (desktop/Tauri only). Self-noops on web/`-serve`.
 * The flow: check() → 'available' → install() downloads + swaps the app → relaunch.
 * Updates are verified against the embedded minisign public key by the Tauri
 * updater itself; an unsigned / wrong-key artifact is rejected before install.
 */
type Status = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

type AppUpdateState = {
  status: Status;
  version?: string;
  notes?: string;
  progress: number; // 0..1 while downloading
  error?: string;
  dismissed: boolean;
  check: () => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
};

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// The pending Update handle is not serializable/reactive — keep it out of the store.
let pending: Update | null = null;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useAppUpdate = create<AppUpdateState>()((set, get) => ({
  status: 'idle',
  progress: 0,
  dismissed: false,

  check: async () => {
    if (!isTauri) return;
    const st = get().status;
    if (st === 'checking' || st === 'downloading') return;
    set({ status: 'checking', error: undefined });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        pending = update;
        set({ status: 'available', version: update.version, notes: update.body, dismissed: false });
      } else {
        set({ status: 'idle' });
      }
    } catch (e) {
      // A failed check (no manifest published yet, offline, endpoint 404) must NOT
      // nag the user — stay idle and silent. Only a failed install surfaces an error.
      console.warn('[nodra] update check skipped:', msg(e));
      set({ status: 'idle' });
    }
  },

  install: async () => {
    if (!pending) return;
    set({ status: 'downloading', progress: 0 });
    try {
      let total = 0;
      let got = 0;
      await pending.downloadAndInstall((ev) => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
        else if (ev.event === 'Progress') {
          got += ev.data.chunkLength;
          if (total > 0) set({ progress: got / total });
        } else if (ev.event === 'Finished') set({ progress: 1 });
      });
      set({ status: 'ready' });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ status: 'error', error: msg(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
