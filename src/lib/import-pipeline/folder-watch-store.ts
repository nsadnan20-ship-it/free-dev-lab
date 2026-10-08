import type { FolderFileRecord } from './folder-monitor-contract';

const DB_NAME='report-advisor-folder-watch';
const STORE='files';

export interface StoredFolderFile { key:string; record:FolderFileRecord; }

export class IndexedDbFolderSnapshotStore {
  private dbPromise?: Promise<IDBDatabase>;
  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return this.dbPromise;
  }
  async get(key:string):Promise<FolderFileRecord|undefined>{
    const db=await this.open();
    return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async put(key:string,value:FolderFileRecord):Promise<void>{
    const db=await this.open();
    await new Promise<void>((resolve,reject)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).put(value,key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});
  }
  async listByFolder(folderId:string):Promise<StoredFolderFile[]> {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const result:StoredFolderFile[]=[];
      const request=db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(result);return;}const key=String(cursor.key);if(key.startsWith(`${folderId}:`))result.push({key,record:cursor.value as FolderFileRecord});cursor.continue();};
      request.onerror=()=>reject(request.error);
    });
  }
}
