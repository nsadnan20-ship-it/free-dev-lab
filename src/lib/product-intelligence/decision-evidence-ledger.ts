export type AlertStatus='new'|'acknowledged'|'snoozed'|'resolved'|'reopened';
export interface EvidenceItem{metric:string;value:number|string;source:string;observedAt?:string;}
export interface DecisionEvidenceRecord{decisionId:string;productId:string;generation:number;action:string;confidence:number;createdAt:string;evidence:EvidenceItem[];warnings:string[];inputFingerprint:string;}
export interface AlertRecord{dedupeKey:string;productId:string;type:string;status:AlertStatus;firstSeenAt:string;lastSeenAt:string;occurrences:number;decisionId?:string;}
export function createDecisionEvidence(input:Omit<DecisionEvidenceRecord,'createdAt'>,createdAt=new Date().toISOString()):DecisionEvidenceRecord{return {...input,createdAt};}
export function upsertAlert(previous:AlertRecord|undefined,input:{dedupeKey:string;productId:string;type:string;decisionId?:string},now=new Date().toISOString()):AlertRecord{if(!previous)return {...input,status:'new',firstSeenAt:now,lastSeenAt:now,occurrences:1};const status=previous.status==='resolved'?'reopened':previous.status;return {...previous,...input,status,lastSeenAt:now,occurrences:previous.occurrences+1};}
export function resolveAlert(alert:AlertRecord,now=new Date().toISOString()):AlertRecord{return {...alert,status:'resolved',lastSeenAt:now};}
export function acknowledgeAlert(alert:AlertRecord,now=new Date().toISOString()):AlertRecord{return {...alert,status:'acknowledged',lastSeenAt:now};}
export function snoozeAlert(alert:AlertRecord,now=new Date().toISOString()):AlertRecord{return {...alert,status:'snoozed',lastSeenAt:now};}
