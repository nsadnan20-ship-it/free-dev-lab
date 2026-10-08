import type {EvidenceCard} from './evidence-cards';
import type {NarrativeSection} from './report-narrative';
export interface ReportBlock{type:'kpi'|'narrative'|'evidence'|'warning'|'decision';title:string;payload:unknown}
export interface ComposedReport{title:string;generatedAt:string;blocks:ReportBlock[];evidenceCount:number;warningCount:number}
export function composeReport(title:string,narrative:NarrativeSection,cards:EvidenceCard[],decisions:unknown[]=[],warnings:string[]=[]):ComposedReport{const blocks:ReportBlock[]=[{type:'narrative',title:narrative.title,payload:narrative},{type:'evidence',title:'الأدلة والمؤشرات',payload:cards},{type:'decision',title:'القرارات المقترحة',payload:decisions}];for(const warning of warnings)blocks.push({type:'warning',title:'تنبيه',payload:warning});return{title,generatedAt:new Date().toISOString(),blocks,evidenceCount:cards.length,warningCount:warnings.length};}
