import * as Y from 'yjs';
import { REMOTE_ORIGIN } from './ydoc';

/**
 * Minimal WebSocket sync provider for our dumb broadcast relay (src-tauri/share.rs).
 * Wire format: a 1-byte tag + payload.
 *   - TAG_UPDATE        (0): a Yjs update (Y.encodeStateAsUpdate / update event).
 *   - TAG_SYNC_REQUEST  (1): "send me the current state" — only the host answers,
 *     with its full state as a TAG_UPDATE (Yjs merges idempotently).
 */

const TAG_UPDATE = 0;
const TAG_SYNC_REQUEST = 1;
const TAG_AWARENESS = 2; // ephemeral presence (cursor/name) — NOT part of the Y.Doc

export type ProviderStatus = 'connecting' | 'connected' | 'disconnected';

export type CollabProvider = {
  destroy: () => void;
  /** Broadcast an ephemeral presence payload (not persisted in the Y.Doc). */
  sendPresence: (payload: Uint8Array) => void;
};

export function createProvider(opts: {
  url: string; // ws://<host>/sync?room=<token>
  doc: Y.Doc;
  isHost: boolean;
  onStatus?: (s: ProviderStatus) => void;
  onPresence?: (payload: Uint8Array) => void;
  /** Fired once a remote state frame (catch-up reply) has been received & applied,
   *  even if it carried no changes — lets a guest go "live" on an empty shared doc. */
  onSynced?: () => void;
}): CollabProvider {
  const { url, doc, isHost, onStatus, onPresence, onSynced } = opts;
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnect: ReturnType<typeof setTimeout> | null = null;

  const sendFrame = (tag: number, payload?: Uint8Array) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const body = payload ?? new Uint8Array(0);
    const frame = new Uint8Array(1 + body.length);
    frame[0] = tag;
    frame.set(body, 1);
    ws.send(frame);
  };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return; // don't echo what we just received
    sendFrame(TAG_UPDATE, update);
  };

  const connect = () => {
    onStatus?.('connecting');
    const sock = new WebSocket(url);
    sock.binaryType = 'arraybuffer';
    ws = sock;

    sock.onopen = () => {
      onStatus?.('connected');
      // The host is authoritative and never requests state. A guest pulls the
      // host's state AND re-pushes its own — so edits made while disconnected
      // (Wi-Fi blip, host server restart) reach the room on reconnect.
      if (!isHost) {
        sendFrame(TAG_SYNC_REQUEST);
        sendFrame(TAG_UPDATE, Y.encodeStateAsUpdate(doc));
      }
    };
    sock.onmessage = (e) => {
      const bytes = new Uint8Array(e.data as ArrayBuffer);
      if (bytes.length === 0) return;
      const tag = bytes[0];
      const payload = bytes.subarray(1);
      if (tag === TAG_UPDATE) {
        Y.applyUpdate(doc, payload, REMOTE_ORIGIN);
        onSynced?.();
      } else if (tag === TAG_SYNC_REQUEST && isHost) {
        sendFrame(TAG_UPDATE, Y.encodeStateAsUpdate(doc));
      } else if (tag === TAG_AWARENESS) {
        onPresence?.(payload);
      }
    };
    sock.onclose = () => {
      onStatus?.('disconnected');
      if (!closed) reconnect = setTimeout(connect, 1000);
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        /* ignore */
      }
    };
  };

  doc.on('update', onUpdate);
  connect();

  return {
    destroy() {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      doc.off('update', onUpdate);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
    sendPresence(payload: Uint8Array) {
      sendFrame(TAG_AWARENESS, payload);
    },
  };
}
