export interface QualityDimensions{completeness:number;validity:number;consistency:number;uniqueness:number;timeliness:number}
export interface QualityScore extends QualityDimensions{overall:number;grade:'A'|'B'|'C'|'D'|'F';blocking:boolean}
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
export function qualityScore(d:QualityDimensions):QualityScore{const values=Object.values(d).map(clamp);const overall=values.reduce((s,v)=>s+v,0)/values.length;const grade=overall>=90?'A':overall>=80?'B':overall>=70?'C':overall>=60?'D':'F';return{...d,overall,grade,blocking:overall<60||d.validity<50}}
