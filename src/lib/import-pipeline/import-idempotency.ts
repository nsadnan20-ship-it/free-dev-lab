export interface ImportIdentity {source:string;fileFingerprint:string;reportPeriod:string;rowIdentity:string;operation:string;}
const norm=(s:string)=>s.normalize('NFKC').trim().toLowerCase();
export function buildImportIdempotencyKey(i:ImportIdentity):string{return [i.source,i.fileFingerprint,i.reportPeriod,i.rowIdentity,i.operation].map(norm).join('::');}
export function isAlreadyProcessed(key:string,processed:Set<string>):boolean{return processed.has(key);}
