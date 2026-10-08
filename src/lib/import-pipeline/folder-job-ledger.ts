export type FolderJobState='queued'|'processing'|'completed'|'partial'|'failed'|'dead_letter';
export interface FolderImportJob {id:string;folderId:string;sourceKey:string;contentHash:string;state:FolderJobState;attempts:number;maxAttempts:number;discoveredAt:string;lastError?:string;}
export function createFolderJob(input:Pick<FolderImportJob,'id'|'folderId'|'sourceKey'|'contentHash'|'discoveredAt'> & Partial<Pick<FolderImportJob,'maxAttempts'>>):FolderImportJob{return {...input,state:'queued',attempts:0,maxAttempts:Math.max(1,input.maxAttempts??3)};}
export function beginJob(job:FolderImportJob):FolderImportJob{return {...job,state:'processing',attempts:job.attempts+1};}
export function completeJob(job:FolderImportJob,partial=false):FolderImportJob{return {...job,state:partial?'partial':'completed'};}
export function failJob(job:FolderImportJob,error:string):FolderImportJob{const nextAttempts=job.attempts;return {...job,attempts:nextAttempts,state:nextAttempts>=job.maxAttempts?'dead_letter':'failed',lastError:error};}
export function isSameSource(a:Pick<FolderImportJob,'sourceKey'|'contentHash'>,b:Pick<FolderImportJob,'sourceKey'|'contentHash'>){return a.sourceKey===b.sourceKey&&a.contentHash===b.contentHash;}
