import type {RiskAlert} from './risk-early-warning';
export interface WarningCard{id:string;title:string;severity:RiskAlert['level'];score:number;domain:RiskAlert['domain'];message:string;signals:string[];actions:string[];drilldown:{type:'evidence'|'domain';key:string};}
export function toWarningCards(alerts:RiskAlert[]):WarningCard[]{return alerts.sort((a,b)=>b.score-a.score).map(a=>({id:a.id,title:a.label,severity:a.level,score:a.score,domain:a.domain,message:a.message,signals:a.signals,actions:a.actions,drilldown:{type:'domain',key:a.domain}}));}
