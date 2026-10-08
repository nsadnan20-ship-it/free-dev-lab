export interface CustomerProductPoint { customerId: string; productKey: string; period: string; requestedUnits: number; fulfilledUnits: number; revenue?: number; }
export interface CustomerProductSignal { customerId: string; productKey: string; periods: number; totalRequested: number; totalFulfilled: number; lostUnits: number; activePeriods: number; lastActivePeriod?: string; previousActivePeriod?: string; continuity: 'active' | 'declining' | 'lapsed' | 'new' | 'insufficient_data'; fillRate: number; evidence: string[]; }
const n=(v:number|undefined)=>Number.isFinite(v)?Math.max(0,v as number):0;
export function analyzeCustomerProductContinuity(rows: CustomerProductPoint[]): CustomerProductSignal[] {
 const groups=new Map<string,CustomerProductPoint[]>();
 for(const r of rows){const key=`${r.customerId}::${r.productKey}`; const a=groups.get(key)??[]; a.push(r); groups.set(key,a);}
 return [...groups.entries()].map(([key,items])=>{
  const ordered=[...items].sort((a,b)=>a.period.localeCompare(b.period));
  const requested=ordered.reduce((s,r)=>s+n(r.requestedUnits),0);
  const fulfilled=ordered.reduce((s,r)=>s+Math.min(n(r.requestedUnits),n(r.fulfilledUnits)),0);
  const lost=Math.max(0,requested-fulfilled); const active=ordered.filter(r=>n(r.requestedUnits)>0).length;
  const last=ordered.findLast(r=>n(r.requestedUnits)>0)?.period; const previous=[...ordered].reverse().find((r,i)=>n(r.requestedUnits)>0 && r.period!==last)?.period;
  let continuity: CustomerProductSignal['continuity']='insufficient_data';
  if(active===0) continuity='insufficient_data'; else if(ordered.length===1) continuity='new'; else if(!last) continuity='insufficient_data'; else if(previous===undefined) continuity='new'; else { const lastIndex=ordered.findIndex(r=>r.period===last); const prevIndex=ordered.findIndex(r=>r.period===previous); continuity=lastIndex-prevIndex>1?'lapsed':n(ordered.at(-1)?.requestedUnits)<n(ordered.at(-2)?.requestedUnits)*0.7?'declining':'active'; }
  const evidence=[`${ordered.length} periods observed`,`requested=${requested}`,`fulfilled=${fulfilled}`]; if(lost>0)evidence.push(`unfulfilled=${lost}`); if(last)evidence.push(`last_active=${last}`);
  return {customerId:key.split('::')[0],productKey:key.split('::').slice(1).join('::'),periods:ordered.length,totalRequested:requested,totalFulfilled:fulfilled,lostUnits:lost,activePeriods:active,lastActivePeriod:last,previousActivePeriod:previous,continuity,fillRate:requested>0?fulfilled/requested:1,evidence};
 });
}
