import type{Anomaly}from'./anomaly-engine';
export interface EvidenceLink{anomalyKind:string;source:string;field?:string;reference?:string;value?:string;confidence:number;}
export interface AnomalyCase{caseId:string;severity:'low'|'medium'|'high';anomalies:Anomaly[];links:EvidenceLink[];status:'open'|'reviewed'|'dismissed';}
export function createAnomalyCase(caseId:string,anomalies:Anomaly[],links:EvidenceLink[]):AnomalyCase{const severity=anomalies.some(a=>a.severity==='high')?'high':anomalies.some(a=>a.severity==='medium')?'medium':'low';return{caseId,severity,anomalies,links,status:'open'};}
