import type {EvidenceLedger} from './evidence-ledger';
export interface ReportFact{key:string;value:unknown;unit?:string;confidence:number;source:'input'|'derived'|'forecast';evidence?:string[]}
export function fact(key:string,value:unknown,confidence=1,source:ReportFact['source']='derived',unit?:string,evidence?:string[]):ReportFact{return{key,value,confidence,source,unit,evidence};}
export function assertReportFacts(facts:ReportFact[]){return facts.filter(f=>f.confidence<.7);}
export function attachEvidence(facts:ReportFact[],ledger:EvidenceLedger){return facts.map(f=>({...f,evidence:f.evidence??ledger.items.filter(e=>e.field===f.key).map(e=>`${e.sourceId}${e.page?`#page-${e.page}`:''}`)}));}
