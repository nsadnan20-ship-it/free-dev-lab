import { isSupportedReportExtension } from './report-file-contract';
import { classifyFolderFile, type FolderFileRecord, type FolderMonitorPolicy, type FolderScanResult } from './folder-monitor-contract';
import { decideIncrementalImport, type ImportFingerprint } from './incremental-import-ledger';

export type BrowserDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};
export interface FolderEntry { name:string; path:string; size:number; lastModified:number; file:File; }
export interface FolderSnapshotStore { get(key:string):Promise<FolderFileRecord|undefined>; put(key:string,value:FolderFileRecord):Promise<void>; listByFolder?(folderId:string):Promise<Array<{key:string;record:FolderFileRecord}>>; }

export async function selectWatchedFolder(): Promise<BrowserDirectoryHandle> {
  if (!('showDirectoryPicker' in window)) throw new Error('FOLDER_PICKER_UNAVAILABLE');
  return (window as Window & { showDirectoryPicker: () => Promise<BrowserDirectoryHandle> }).showDirectoryPicker();
}

export async function ensureFolderPermission(handle: BrowserDirectoryHandle, mode: 'read' | 'readwrite' = 'read'): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const descriptor = { mode } as { mode: 'read' | 'readwrite' };
  const current = await handle.queryPermission(descriptor);
  if (current === 'granted') return true;
  return (await handle.requestPermission(descriptor)) === 'granted';
}

export async function sha256File(file:File):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function* walk(handle:BrowserDirectoryHandle,prefix=''):AsyncGenerator<FolderEntry>{if(!handle.entries)throw new Error('FOLDER_DIRECTORY_ITERATION_UNAVAILABLE');for await(const [name,child] of handle.entries()){const relative=prefix?`${prefix}/${name}`:name;if(child.kind==='directory')yield* walk(child as BrowserDirectoryHandle,relative);else{const file=await (child as FileSystemFileHandle).getFile();yield{name,path:relative,file,size:file.size,lastModified:file.lastModified};}}}
export async function scanWatchedDirectory(folderId:string,handle:BrowserDirectoryHandle,policy:FolderMonitorPolicy,store:FolderSnapshotStore,now=new Date().toISOString()):Promise<FolderScanResult>{const files:FolderFileRecord[]=[];let newFiles=0,changedFiles=0,unchangedFiles=0,failedFiles=0;const seenPaths=new Set<string>();for await(const entry of walk(handle)){if(!policy.acceptedExtensions.some(ext=>entry.path.toLowerCase().endsWith(ext))||!isSupportedReportExtension(entry.path))continue;seenPaths.add(entry.path);const key=`${folderId}:${entry.path}`;try{const contentHash=await sha256File(entry.file);const current={path:entry.path,fingerprint:contentHash,size:entry.size,modifiedAt:new Date(entry.lastModified).toISOString()};const previous=await store.get(key);const state=classifyFolderFile(previous,current);const fp:ImportFingerprint={sourceKey:key,contentHash,sizeBytes:entry.size,modifiedAt:current.modifiedAt};const decision=decideIncrementalImport(fp,previous?{sourceKey:key,contentHash:previous.fingerprint,sizeBytes:previous.size,modifiedAt:previous.modifiedAt}:undefined);const finalState=decision.action==='skip_unchanged'?'unchanged':state==='new'?'new':'changed';if(finalState==='new')newFiles++;else if(finalState==='changed')changedFiles++;else unchangedFiles++;files.push({path:entry.path,fingerprint:contentHash,size:entry.size,modifiedAt:current.modifiedAt,state:finalState});await store.put(key,{path:entry.path,fingerprint:contentHash,size:entry.size,modifiedAt:current.modifiedAt,state:finalState,lastProcessedAt:previous?.lastProcessedAt,lastSuccessfulCheckpoint:previous?.lastSuccessfulCheckpoint});}catch(error){failedFiles++;files.push({path:entry.path,fingerprint:'',size:entry.size,modifiedAt:new Date(entry.lastModified).toISOString(),state:'failed',error:error instanceof Error?error.message:String(error)});}}const deletedFiles:string[]=[];if(store.listByFolder){for(const {key,record} of await store.listByFolder(folderId)){if(!seenPaths.has(record.path)&&record.state!=='deleted'){deletedFiles.push(record.path);await store.put(key,{...record,state:'deleted'});}}}return{folder:folderId,scannedAt:now,files,newFiles,changedFiles,unchangedFiles,failedFiles,deletedFiles};}
export function startWatchedFolder(handle:BrowserDirectoryHandle,scan:()=>Promise<FolderScanResult>,policy:FolderMonitorPolicy,onScan:(result:FolderScanResult)=>void):()=>void{let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;const loop=async()=>{if(stopped)return;try{onScan(await scan());}catch(error){onScan({folder:'',scannedAt:new Date().toISOString(),files:[],newFiles:0,changedFiles:0,unchangedFiles:0,failedFiles:1});}finally{if(!stopped)timer=setTimeout(loop,Math.max(1000,policy.pollIntervalMs));}};void handle;void loop();return()=>{stopped=true;if(timer)clearTimeout(timer);};}
