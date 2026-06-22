import type { IconEntry } from './catalog';

/**
 * A small, generic block set shipped WITH the core so the app is usable out of the
 * box — without installing any plugin. These are neutral, provider-agnostic
 * concepts (server, database, queue…). Provider-specific packs (AWS / GCP / Azure /
 * brand logos) stay downloadable plugins. Registered by registerBuiltins().
 *
 * All `mdi:*` icons, the same Iconify family the rest of the UI uses.
 */
function e(id: string, name: string, category: string, ref: string): IconEntry {
  return {
    id: `core:${id}`,
    name,
    provider: 'general',
    category,
    source: 'iconify',
    ref,
    keywords: [id, name.toLowerCase(), category.toLowerCase()],
  };
}

export const CORE_BLOCKS: IconEntry[] = [
  // Compute
  e('server', 'Server', 'Compute', 'mdi:server'),
  e('vm', 'Virtual machine', 'Compute', 'mdi:monitor'),
  e('container', 'Container', 'Compute', 'mdi:cube-outline'),
  e('function', 'Function', 'Compute', 'mdi:function-variant'),
  e('service', 'Service', 'Compute', 'mdi:cog-outline'),
  e('app', 'Application', 'Compute', 'mdi:application-outline'),
  e('worker', 'Worker', 'Compute', 'mdi:robot-industrial-outline'),

  // Storage
  e('database', 'Database', 'Storage', 'mdi:database'),
  e('storage', 'Storage', 'Storage', 'mdi:harddisk'),
  e('bucket', 'Object store', 'Storage', 'mdi:bucket-outline'),
  e('cache', 'Cache', 'Storage', 'mdi:memory'),
  e('file', 'File', 'Storage', 'mdi:file-outline'),
  e('folder', 'Folder', 'Storage', 'mdi:folder-outline'),

  // Network
  e('cloud', 'Cloud', 'Network', 'mdi:cloud-outline'),
  e('gateway', 'API gateway', 'Network', 'mdi:api'),
  e('loadbalancer', 'Load balancer', 'Network', 'mdi:scale-balance'),
  e('network', 'Network', 'Network', 'mdi:lan'),
  e('cdn', 'CDN', 'Network', 'mdi:web-box'),
  e('firewall', 'Firewall', 'Network', 'mdi:shield-outline'),
  e('dns', 'DNS', 'Network', 'mdi:dns'),
  e('router', 'Router', 'Network', 'mdi:router-network'),

  // Data & messaging
  e('queue', 'Queue', 'Data', 'mdi:tray-full'),
  e('topic', 'Event / Topic', 'Data', 'mdi:lightning-bolt'),
  e('stream', 'Stream', 'Data', 'mdi:transit-connection-variant'),
  e('analytics', 'Analytics', 'Data', 'mdi:chart-bar'),
  e('search', 'Search', 'Data', 'mdi:magnify'),

  // Generic
  e('user', 'User', 'Generic', 'mdi:account'),
  e('users', 'Users', 'Generic', 'mdi:account-group'),
  e('web', 'Web', 'Generic', 'mdi:web'),
  e('mobile', 'Mobile', 'Generic', 'mdi:cellphone'),
  e('email', 'Email', 'Generic', 'mdi:email-outline'),
  e('key', 'Secret / Key', 'Generic', 'mdi:key-outline'),
  e('lock', 'Security', 'Generic', 'mdi:lock-outline'),
  e('monitor', 'Monitoring', 'Generic', 'mdi:chart-line'),
  e('schedule', 'Schedule', 'Generic', 'mdi:clock-outline'),
];
