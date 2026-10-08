export type FolderRuntime = 'web' | 'pwa' | 'desktop' | 'android' | 'ios';

export type FolderWatchMode =
  | 'manual'
  | 'active-session-poll'
  | 'persistent-native-watch';

export interface FolderCapability {
  runtime: FolderRuntime;
  canSelectDirectory: boolean;
  canPersistPermission: boolean;
  canWatchWhileAppActive: boolean;
  canWatchInBackground: boolean;
  mode: FolderWatchMode;
  notes: string;
}

/**
 * Browser/PWA stays provider-free: it uses the File System Access API when
 * available and falls back to an explicit file/folder import flow. It must
 * never claim that a browser can monitor an arbitrary local path in the
 * background after the app has been closed.
 */
export function detectFolderCapability(runtime: FolderRuntime): FolderCapability {
  switch (runtime) {
    case 'desktop':
      return {
        runtime,
        canSelectDirectory: true,
        canPersistPermission: true,
        canWatchWhileAppActive: true,
        canWatchInBackground: true,
        mode: 'persistent-native-watch',
        notes: 'Native desktop shell/agent owns the filesystem watcher; no cloud-drive dependency is required.',
      };
    case 'android':
      return {
        runtime,
        canSelectDirectory: true,
        canPersistPermission: true,
        canWatchWhileAppActive: true,
        canWatchInBackground: true,
        mode: 'persistent-native-watch',
        notes: 'Android storage access is provided by the installed app/native bridge and its granted directory permission.',
      };
    case 'ios':
      return {
        runtime,
        canSelectDirectory: true,
        canPersistPermission: true,
        canWatchWhileAppActive: true,
        canWatchInBackground: false,
        mode: 'active-session-poll',
        notes: 'iOS sandbox rules require a capability-aware foreground/session model; the product must not promise arbitrary local-folder background watching.',
      };
    case 'pwa':
      return {
        runtime,
        canSelectDirectory: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
        canPersistPermission: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
        canWatchWhileAppActive: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
        canWatchInBackground: false,
        mode: 'active-session-poll',
        notes: 'PWA uses the browser directory-handle capability when available; background monitoring is not assumed.',
      };
    case 'web':
    default:
      return {
        runtime,
        canSelectDirectory: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
        canPersistPermission: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
        canWatchWhileAppActive: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
        canWatchInBackground: false,
        mode: 'active-session-poll',
        notes: 'Web capability is progressive enhancement; unsupported browsers use manual upload/import without false background-watch claims.',
      };
  }
}

export function isPersistentFolderWatch(capability: FolderCapability): boolean {
  return capability.mode === 'persistent-native-watch' && capability.canWatchInBackground;
}
