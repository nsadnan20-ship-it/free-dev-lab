/// <reference types="vite/client" />

declare global {
  interface Window {
    desktopFolderWatch?: {
      isAvailable: boolean;
      selectDirectory(): Promise<{ path: string; name: string } | null>;
      getSelectedDirectory(): Promise<{ path: string; name: string } | null>;
      start(): Promise<{ path: string; name: string }>;
      stop(): Promise<boolean>;
      forget(): Promise<boolean>;
      readFile(relativePath: string): Promise<ArrayBuffer>;
      onFile(callback: (payload: { relativePath: string; reason: string; size: number; modifiedAt: string }) => void): () => void;
      onDeleted(callback: (payload: { path: string }) => void): () => void;
    };
  }
}

export {};