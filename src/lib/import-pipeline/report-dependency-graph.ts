export type ReportDomain='inventory'|'sales'|'purchases'|'customers'|'suppliers'|'finance'|'transfers'|'adjustments';
export type IntelligenceNode='stock'|'demand'|'family'|'customerDemand'|'supplier'|'liquidity'|'purchaseDecision';
const IMPACTS:Record<ReportDomain,IntelligenceNode[]>= {inventory:['stock','family','purchaseDecision'],sales:['demand','family','customerDemand','liquidity','purchaseDecision'],purchases:['supplier','stock','liquidity','purchaseDecision'],customers:['customerDemand','demand'],suppliers:['supplier','purchaseDecision'],finance:['liquidity','purchaseDecision'],transfers:['stock','family'],adjustments:['stock','liquidity']};
export interface ImpactPlan{domain:ReportDomain;affected:IntelligenceNode[];reason:string;}
export function buildImpactPlan(domain:ReportDomain):ImpactPlan{return {domain,affected:[...IMPACTS[domain]],reason:`تغيير تقرير ${domain} قد يؤثر على المؤشرات المرتبطة به`};}
export function mergeImpactPlans(domains:ReportDomain[]):IntelligenceNode[]{return [...new Set(domains.flatMap(d=>IMPACTS[d]))];}
