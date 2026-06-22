import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { CollabProvider } from './provider';

/**
 * Ephemeral presence (live cursors + who's where). Sent over the awareness channel
 * of the relay (TAG_AWARENESS), never stored in the persisted Y.Doc. Each peer
 * heartbeats its state; stale peers (no update for STALE_MS) are pruned.
 */

export type PeerPresence = {
  id: string;
  name: string;
  color: string;
  /** cursor in FLOW coordinates (so it maps under every peer's pan/zoom) */
  cursor: { x: number; y: number } | null;
  /** id of the shared doc this peer is currently viewing, or null (private/none) */
  activeDocId: string | null;
  editing: boolean;
};

type StoredPeer = PeerPresence & { lastSeen: number };

const STALE_MS = 5000;
const HEARTBEAT_MS = 3000;
const CURSOR_THROTTLE_MS = 40;

const PALETTE = [
  '#007aff', '#34c759', '#ff9f0a', '#ff2d55',
  '#af52de', '#30b0c7', '#ff3b30', '#5856d6',
];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + (id.codePointAt(i) ?? 0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

const NAME_KEY = 'pfd:peerName';

/** Stable identity for this tab/session. Name persists across sessions. */
export const localPeer = (() => {
  const id = nanoid(6);
  let name = '';
  try {
    name = localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    /* ignore */
  }
  return { id, name, color: colorFor(id) };
})();

/** Read the persisted display name (empty string if never set). */
export const getPeerName = (): string => localPeer.name;

/** Set & persist the display name, and broadcast it to peers if a session is live. */
export function setPeerName(name: string): void {
  const n = name.trim();
  localPeer.name = n;
  usePresenceStore.getState().setSelfName(n);
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
  activeController?.setContext({
    activeDocId: lastContext.activeDocId,
    editing: lastContext.editing,
    name: n || undefined,
  });
}

type PresenceState = {
  peers: Record<string, StoredPeer>;
  selfName: string;
  ingest: (p: PeerPresence) => void;
  setSelfName: (name: string) => void;
  prune: () => void;
  clear: () => void;
};

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  peers: {},
  selfName: localPeer.name,
  setSelfName: (selfName) => set({ selfName }),
  ingest: (p) => {
    if (p.id === localPeer.id) return; // never track ourselves
    set({ peers: { ...get().peers, [p.id]: { ...p, lastSeen: Date.now() } } });
  },
  prune: () => {
    const now = Date.now();
    const next: Record<string, StoredPeer> = {};
    let changed = false;
    for (const [id, peer] of Object.entries(get().peers)) {
      if (now - peer.lastSeen < STALE_MS) next[id] = peer;
      else changed = true;
    }
    if (changed) set({ peers: next });
  },
  clear: () => set({ peers: {} }),
}));

const enc = new TextEncoder();
const dec = new TextDecoder();

export type PresenceContext = { activeDocId: string | null; editing: boolean; name?: string };

export type PresenceController = {
  setCursor: (flow: { x: number; y: number } | null) => void;
  setContext: (ctx: PresenceContext) => void;
  stop: () => void;
};

// Module-level active controller so the Canvas can report the cursor without
// threading the handle through props.
let activeController: PresenceController | null = null;
// Last broadcast context, so setPeerName can re-broadcast without losing it.
let lastContext: { activeDocId: string | null; editing: boolean } = {
  activeDocId: null,
  editing: true,
};

export function reportCursor(flow: { x: number; y: number } | null): void {
  activeController?.setCursor(flow);
}
export function reportContext(ctx: PresenceContext): void {
  activeController?.setContext(ctx);
}

export function startPresence(
  provider: CollabProvider,
  initial: { name: string; activeDocId: string | null; editing: boolean },
): PresenceController {
  let state: PeerPresence = {
    id: localPeer.id,
    name: initial.name,
    color: localPeer.color,
    cursor: null,
    activeDocId: initial.activeDocId,
    editing: initial.editing,
  };
  localPeer.name = initial.name;

  let lastCursorSent = 0;
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;

  const broadcast = () => provider.sendPresence(enc.encode(JSON.stringify(state)));

  const heartbeat = setInterval(broadcast, HEARTBEAT_MS);
  const pruner = setInterval(() => usePresenceStore.getState().prune(), 1000);
  broadcast();

  const ctrl: PresenceController = {
    setCursor: (flow) => {
      state = { ...state, cursor: flow };
      const now = Date.now();
      const since = now - lastCursorSent;
      if (since >= CURSOR_THROTTLE_MS) {
        lastCursorSent = now;
        broadcast();
      } else if (!cursorTimer) {
        cursorTimer = setTimeout(() => {
          cursorTimer = null;
          lastCursorSent = Date.now();
          broadcast();
        }, CURSOR_THROTTLE_MS - since);
      }
    },
    setContext: ({ activeDocId, editing, name }) => {
      lastContext = { activeDocId, editing };
      // Drop the cursor when leaving a shared doc so peers don't show a stale
      // cursor at the old position until the next pointer move.
      state = {
        ...state,
        activeDocId,
        editing,
        cursor: activeDocId ? state.cursor : null,
        ...(name ? { name } : {}),
      };
      if (name) localPeer.name = name;
      broadcast();
    },
    stop: () => {
      clearInterval(heartbeat);
      clearInterval(pruner);
      if (cursorTimer) clearTimeout(cursorTimer);
      activeController = null;
    },
  };
  activeController = ctrl;
  return ctrl;
}

/** Decode an incoming awareness payload into the presence store. */
export function ingestPresence(payload: Uint8Array): void {
  try {
    const p = JSON.parse(dec.decode(payload)) as PeerPresence;
    if (p && typeof p.id === 'string') usePresenceStore.getState().ingest(p);
  } catch {
    /* ignore malformed presence */
  }
}
