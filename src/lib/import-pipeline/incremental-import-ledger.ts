export interface ImportFingerprint { sourceKey:string; contentHash:string; sizeBytes:number; modifiedAt:string; rowCount?:number; }
export interface IncrementalImportDecision { action:'process_new'|'process_changed'|'skip_unchanged'|'duplicate'; reason:string; }
export function decideIncrementalImport(current:ImportFingerprint, previous?:ImportFingerprint):IncrementalImportDecision {
  if(!previous)return {action:'process_new',reason:'no previous fingerprint exists'};
  if(current.contentHash && previous.contentHash===current.contentHash)return {action:'skip_unchanged',reason:'content hash is unchanged'};
  if(current.sourceKey===previous.sourceKey)return {action:'process_changed',reason:'known source changed; content hash is unavailable or different'};
  return {action:'duplicate',reason:'different source key with matching identity context'};
}
export interface RowFingerprint { stableKey:string; rowHash:string; }
function duplicateKeys(rows:RowFingerprint[]):string[]{const counts=new Map<string,number>();for(const row of rows)counts.set(row.stableKey,(counts.get(row.stableKey)??0)+1);return [...counts.entries()].filter(([,count])=>count>1).map(([key])=>key).sort();}
export function changedRows(current:RowFingerprint[], previous:RowFingerprint[]):RowFingerprint[] { const old=new Map(previous.map(x=>[x.stableKey,x.rowHash])); return current.filter(x=>old.get(x.stableKey)!==x.rowHash); }
export function deletedRows(current:RowFingerprint[], previous:RowFingerprint[]):RowFingerprint[] { const now=new Set(current.map(x=>x.stableKey)); return previous.filter(x=>!now.has(x.stableKey)); }
export function reconcileRows(current:RowFingerprint[], previous:RowFingerprint[]) {
  const duplicateCurrentKeys=duplicateKeys(current), duplicatePreviousKeys=duplicateKeys(previous);
  if(duplicateCurrentKeys.length||duplicatePreviousKeys.length) throw new Error(`IMPORT_RECONCILIATION_DUPLICATE_KEYS:${[...new Set([...duplicateCurrentKeys,...duplicatePreviousKeys])].join(',')}`);
  const old=new Map(previous.map(x=>[x.stableKey,x.rowHash])); const now=new Map(current.map(x=>[x.stableKey,x.rowHash]));
  return { changed:current.filter(x=>old.get(x.stableKey)!==x.rowHash), deleted:previous.filter(x=>!now.has(x.stableKey)), unchanged:current.filter(x=>old.get(x.stableKey)===x.rowHash), duplicateKeys:[] as string[] };
}
