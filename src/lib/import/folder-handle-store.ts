export interface PersistedFolderHandle {
  handle: FileSystemDirectoryHandle;
  savedAt: string;
}

const DB_NAME = 'report-advisor-folder-handles';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('FOLDER_HANDLE_DB_OPEN_FAILED'));
  });
}

export async function saveFolderHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(
        { handle, savedAt: new Date().toISOString() } satisfies PersistedFolderHandle,
        key,
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('FOLDER_HANDLE_SAVE_FAILED'));
    });
  } finally {
    db.close();
  }
}

export async function loadFolderHandle(key: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as PersistedFolderHandle | undefined)?.handle);
      request.onerror = () => reject(request.error ?? new Error('FOLDER_HANDLE_LOAD_FAILED'));
    });
  } finally {
    db.close();
  }
}

export async function forgetFolderHandle(key: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('FOLDER_HANDLE_DELETE_FAILED'));
    });
  } finally {
    db.close();
  }
}
