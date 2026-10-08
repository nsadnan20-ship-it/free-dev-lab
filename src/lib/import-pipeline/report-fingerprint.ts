export interface ReportFingerprintInput {source:string;reportType:string;headers:string[];rowIdentityFields:string[];period?:string;fileName?:string;}
export interface ReportFingerprint {schemaKey:string;identityKey:string;contentKey:string;}
const norm=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const stable=(xs:string[])=>[...xs].map(norm).filter(Boolean).sort().join('|');
export function buildReportFingerprint(i:ReportFingerprintInput):ReportFingerprint{const schemaKey=`${norm(i.source)}::${norm(i.reportType)}::${stable(i.headers)}`;const identityKey=stable(i.rowIdentityFields);const contentKey=`${schemaKey}::${identityKey}::${norm(i.period??'')}`;return {schemaKey,identityKey,contentKey};}
export type RowChange='new'|'changed'|'unchanged'|'deleted'|'duplicate';
export interface RowFingerprint {key:string;valueHash:string;}
export function classifyRows(previous:Map<string,string>,current:Map<string,string>):{key:string;change:RowChange}[]{const out:{key:string;change:RowChange}[]=[];for(const [key,value] of current){const old=previous.get(key);out.push({key,change:old===undefined?'new':old===value?'unchanged':'changed'});}for(const key of previous.keys())if(!current.has(key))out.push({key,change:'deleted'});return out;}
