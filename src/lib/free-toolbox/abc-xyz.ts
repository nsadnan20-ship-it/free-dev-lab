export type ABC='A'|'B'|'C';export type XYZ='X'|'Y'|'Z';
export interface ClassificationInput{sku:string;annualValue:number;demand:number[]}
export interface ClassificationResult{sku:string;abc:ABC;xyz:XYZ;classCode:string;annualValue:number;variability:number}
const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
export function classifyABCXYZ(items:ClassificationInput[]):ClassificationResult[]{const sorted=[...items].sort((a,b)=>b.annualValue-a.annualValue);const total=sorted.reduce((s,x)=>s+Math.max(0,x.annualValue),0)||1;let cumulative=0;return sorted.map(x=>{cumulative+=Math.max(0,x.annualValue);const share=cumulative/total;const abc:ABC=share<=.8?'A':share<=.95?'B':'C';const m=avg(x.demand);const variance=avg(x.demand.map(v=>(v-m)**2));const cv=m?Math.sqrt(variance)/m:Infinity;const xyz:XYZ=cv<=.5?'X':cv<=1?'Y':'Z';return{sku:x.sku,abc,xyz,classCode:`${abc}${xyz}`,annualValue:x.annualValue,variability:cv};});}
