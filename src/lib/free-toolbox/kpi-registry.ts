export type KPIStatus='healthy'|'watch'|'warning'|'critical';
export interface KPIInput{id:string;label:string;value:number;previous?:number;target?:number;unit?:string;higherIsBetter?:boolean}
export interface KPIResult extends KPIInput{change:number|null;targetGap:number|null;status:KPIStatus;score:number}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function evaluateKPI(k:KPIInput):KPIResult{const change=k.previous==null||k.previous===0?null:(k.value-k.previous)/Math.abs(k.previous)*100;const gap=k.target==null?null:k.value-k.target;const ratio=k.target==null?100:clamp(k.higherIsBetter===false?k.target/(Math.abs(k.value)+1e-9)*100:k.value/(Math.abs(k.target)+1e-9)*100,0,150);const score=clamp(ratio,0,100);const status:KPIStatus=score>=95?'healthy':score>=80?'watch':score>=60?'warning':'critical';return{...k,change,targetGap:gap,status,score}}
export function evaluateKPIs(items:KPIInput[]):KPIResult[]{return items.map(evaluateKPI).sort((a,b)=>a.score-b.score)}
