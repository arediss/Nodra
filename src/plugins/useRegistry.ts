import { useSyncExternalStore } from 'react';
import type { Registry } from './registry';

/** Re-render a component when a registry (un)registers something. */
export function useRegistryVersion(reg: Registry<unknown>): number {
  return useSyncExternalStore(reg.subscribe, reg.version, reg.version);
}
