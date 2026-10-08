import type {KPIResult} from './kpi-registry';
import type {AdaptiveAlert} from './adaptive-alerts';
import type {ExecutiveSummary} from './executive-summary';
export interface DashboardCard{id:string;kind:'kpi'|'alert'|'forecast'|'decision';title:string;value:string;status:string;detail:string;drilldownId:string}
export interface ExecutiveDashboardModel{summary:ExecutiveSummary;cards:DashboardCard[];criticalAlerts:number}
export function buildDashboardModel(summary:ExecutiveSummary,kpis:KPIResult[],alerts:AdaptiveAlert[]):ExecutiveDashboardModel{const cards:DashboardCard[]=kpis.slice(0,8).map(k=>({id:`kpi:${k.id}`,kind:'kpi',title:k.label,value:`${k.value}${k.unit??''}`,status:k.status,detail:`الدرجة ${k.score.toFixed(1)} | التغير ${k.change==null?'—':k.change.toFixed(1)+'%'}`,drilldownId:k.id}));for(const a of alerts.slice(0,6))cards.push({id:`alert:${a.signalId}`,kind:'alert',title:a.label,value:String(a.value),status:a.severity,detail:a.reason,drilldownId:a.signalId});return{summary,cards,criticalAlerts:alerts.filter(a=>a.severity==='critical').length}}
