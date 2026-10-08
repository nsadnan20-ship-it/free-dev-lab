export const SUPPORTED_REPORT_EXTENSIONS = ['.pdf','.xlsx','.xls','.csv','.docx','.doc','.txt'] as const;
export type SupportedReportExtension = typeof SUPPORTED_REPORT_EXTENSIONS[number];
export type ReportFileState = 'discovered'|'queued'|'processing'|'completed'|'failed'|'skipped'|'duplicate';
export interface ReportFileDescriptor { path:string; name:string; extension:SupportedReportExtension|string; sizeBytes:number; modifiedAt:string; contentHash?:string; state?:ReportFileState; source:'manual'|'watched_folder'|'network_folder'|'upload'; }
export interface ReportImportResult { descriptor:ReportFileDescriptor; jobId:string; importedRows:number; newRows:number; updatedRows:number; skippedRows:number; errors:string[]; warnings:string[]; }
export function isSupportedReportExtension(path:string):boolean { const lower=path.toLowerCase(); return SUPPORTED_REPORT_EXTENSIONS.some(ext=>lower.endsWith(ext)); }
export function extensionOf(path:string):string { const file=path.split(/[\\/]/).pop()??path; const i=file.lastIndexOf('.'); return i>=0?file.slice(i).toLowerCase():''; }
export function classifyReportFile(path:string, source:ReportFileDescriptor['source']='manual'):ReportFileDescriptor { const extension=extensionOf(path); return {path,name:path.split(/[\\/]/).pop()??path,extension,sizeBytes:0,modifiedAt:new Date(0).toISOString(),source,state:isSupportedReportExtension(path)?'discovered':'skipped'}; }
