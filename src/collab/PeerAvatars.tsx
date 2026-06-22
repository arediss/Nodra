import { usePresenceStore, localPeer } from './presence';
import { useCollabStore } from './session';
import './PeerAvatars.css';

const initials = (name: string): string =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

/** Figma-style stack of connected collaborators, floating over the canvas. */
export function PeerAvatars() {
  const inSession = useCollabStore((s) => s.role !== null);
  const peers = usePresenceStore((s) => s.peers);
  const selfName = usePresenceStore((s) => s.selfName);

  if (!inSession) return null;
  const list = [{ id: localPeer.id, name: selfName || 'Moi', color: localPeer.color, me: true },
    ...Object.values(peers).map((p) => ({ id: p.id, name: p.name || 'Pair', color: p.color, me: false }))];

  return (
    <div className="peer-avatars" aria-label="Collaborateurs connectés">
      {list.map((p) => (
        <div
          key={p.id}
          className="peer-av"
          style={{ background: p.color }}
          title={p.me ? `${p.name} (toi)` : p.name}
          data-me={p.me ? 'true' : undefined}
        >
          {initials(p.name)}
        </div>
      ))}
    </div>
  );
}
