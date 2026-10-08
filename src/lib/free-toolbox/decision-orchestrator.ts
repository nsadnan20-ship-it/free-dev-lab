export type DecisionDomain='inventory'|'cash'|'sales'|'customer'|'supplier'|'data';
export type DecisionSeverity='info'|'warning'|'critical';
export interface DecisionSignal{domain:DecisionDomain;title:string;reason:string;impact:number;urgency:number;confidence:number;severity:DecisionSeverity;evidenceIds?:string[];action?:string;}
export interface DecisionFeed{generatedAt:string;items:DecisionSignal[];criticalCount:number;warningCount:number;topAction:string|null;}
const score=(x:DecisionSignal)=>Math.round(x.impact*.4+x.urgency*.35+x.confidence*.25);
export function buildDecisionFeed(signals:DecisionSignal[],minimumConfidence=.55):DecisionFeed{const items=signals.filter(x=>x.confidence>=minimumConfidence).map(x=>({...x,impact:Math.max(0,Math.min(100,x.impact)),urgency:Math.max(0,Math.min(100,x.urgency)),confidence:Math.max(0,Math.min(100,x.confidence))})).sort((a,b)=>score(b)-score(a));return{generatedAt:new Date().toISOString(),items,criticalCount:items.filter(x=>x.severity==='critical').length,warningCount:items.filter(x=>x.severity==='warning').length,topAction:items[0]?.action??null};}
