export type ExportFormat='json'|'csv'|'markdown'|'html';
export interface ExportManifest{reportId:string;title:string;generatedAt:string;format:ExportFormat;sections:string[];evidenceCount:number;warningCount:number;version:string}
export function createExportManifest(input:Omit<ExportManifest,'version'>,version='1.0.0'):ExportManifest{return{...input,version};}
export function toMarkdownManifest(m:ExportManifest):string{return[`# ${m.title}`,`- Report ID: ${m.reportId}`,`- Generated: ${m.generatedAt}`,`- Format: ${m.format}`,`- Sections: ${m.sections.join(', ')}`,`- Evidence: ${m.evidenceCount}`,`- Warnings: ${m.warningCount}`,`- Version: ${m.version}`].join('\n');}
