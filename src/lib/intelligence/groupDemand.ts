export interface AlternativeMember { sku:string; factor?:number; dailyDemand:number; stock:number; netSales?:number; }
export interface AlternativeGroupInput { id:string; name:string; members:AlternativeMember[]; }
export interface AlternativeGroupDecision { id:string; name:string; memberSkus:string[]; normalizedDemand:number; normalizedStock:number; coverageDays:number|null; normalizedSales:number; stockoutRisk:'critical'|'high'|'medium'|'low'; trendPct:number; recommendedOrder:number; }

const clamp=(n:number,min:number,max:number)=>Math.min(max,min,n);
const positive=(n:number)=>Number.isFinite(n)&&n>0?n:0;

export function aggregateAlternativeGroup(group:AlternativeGroupInput,recentDemandBySku?:Record<string,number>,targetDays=30):AlternativeGroupDecision{
 const seen=new Set<string>();
 const members=group.members.filter(m=>m.sku&&!seen.has(m.sku)&&seen.add(m.sku));
 const normalizedDemand=members.reduce((s,m)=>s+positive(m.dailyDemand)*positive(m.factor??1),0);
 const normalizedStock=members.reduce((s,m)=>s+positive(m.stock)*positive(m.factor??1),0);
 const normalizedSales=members.reduce((s,m)=>s+positive(m.netSales??0),0);
 const recent=members.reduce((s,m)=>s+positive(recentDemandBySku?.[m.sku]??m.dailyDemand)*positive(m.factor??1),0);
 const trendPct=normalizedDemand>0?((recent/normalizedDemand)-1)*100:0;
 const coverageDays=normalizedDemand>0?normalizedStock/normalizedDemand:null;
 const risk=normalizedStock<=0?'critical':coverageDays!==null&&coverageDays<=7?'critical':coverageDays!==null&&coverageDays<=14?'high':coverageDays!==null&&coverageDays<=30?'medium':'low';
 const recommendedOrder=Math.max(0,Math.ceil(normalizedDemand*targetDays-normalizedStock));
 return{id:group.id,name:group.name,memberSkus:members.map(m=>m.sku),normalizedDemand,normalizedStock,coverageDays,normalizedSales,stockoutRisk:risk,trendPct:clamp(trendPct,-100,500),recommendedOrder};
}

export function aggregateAlternativeGroups(groups:AlternativeGroupInput[],recentDemandBySku?:Record<string,number>,targetDays=30){return groups.map(g=>aggregateAlternativeGroup(g,recentDemandBySku,targetDays)).sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.stockoutRisk]-({critical:0,high:1,medium:2,low:3}[b.stockoutRisk])||b.normalizedDemand-a.normalizedDemand));}
