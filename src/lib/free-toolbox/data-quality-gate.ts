export interface QualityMetrics{completeness:number;validity:number;uniqueness:number;consistency:number;freshness:number}
export interface QualityGate{score:number;passed:boolean;blocking:string[]}
export function evaluateQuality(m:QualityMetrics,threshold=80):QualityGate{const entries=Object.entries(m) as [keyof QualityMetrics,number][];const blocking=entries.filter(([,v])=>v<threshold).map(([k])=>k);const score=entries.reduce((s,[,v])=>s+Math.max(0,Math.min(100,v)),0)/entries.length;return{score,passed:blocking.length===0,blocking}}
