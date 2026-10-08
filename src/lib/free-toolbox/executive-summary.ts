import type {KPIResult} from './kpi-registry';
import type {AdaptiveAlert} from './adaptive-alerts';
import type {PrioritizedAction} from './action-priority';
export interface ExecutiveSummary{headline:string;healthScore:number;criticalCount:number;topRisks:string[];topActions:string[];generatedAt:string}
export function buildExecutiveSummary(kpis:KPIResult[],alerts:AdaptiveAlert[],actions:PrioritizedAction[]):ExecutiveSummary{const healthScore=kpis.length?kpis.reduce((s,k)=>s+k.score,0)/kpis.length:0;const critical=alerts.filter(a=>a.severity==='critical'||a.severity==='warning');const topRisks=critical.slice(0,5).map(a=>`${a.label}: ${a.reason}`);const topActions=actions.slice(0,5).map(a=>a.title);const headline=healthScore>=90?'الوضع العام مستقر':healthScore>=75?'الوضع يحتاج متابعة':'توجد مؤشرات تتطلب تدخلاً';return{headline,healthScore,criticalCount:critical.length,topRisks,topActions,generatedAt:new Date().toISOString()}}
