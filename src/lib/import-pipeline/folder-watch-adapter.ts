import type { WatchedFolderConfig, WatchEvent } from './folder-watch-contract';
import type { FolderRuntime } from './platform-folder-capability';

export interface FolderWatchAdapter {
  readonly runtime: FolderRuntime;
  readonly persistent: boolean;
  selectFolder(): Promise<{ path: string; displayName: string }>;
  start(config: WatchedFolderConfig, emit: (event: WatchEvent) => void): Promise<() => Promise<void> | void>;
  canRunInBackground(): boolean;
}

/**
 * Native adapters must only translate OS filesystem events into the canonical
 * WatchEvent contract. They must not implement parsing, business mapping,
 * persistence, reconciliation, or reporting. Those remain shared services.
 */
export function assertAdapterBoundary(adapter: FolderWatchAdapter): void {
  if (!adapter.runtime) throw new Error('Folder watcher adapter must declare its runtime.');
  if (adapter.persistent !== adapter.canRunInBackground()) {
    throw new Error('Persistent/background capability must agree with adapter declaration.');
  }
}
