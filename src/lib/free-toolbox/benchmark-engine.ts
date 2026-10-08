export type BenchmarkBand='excellent'|'good'|'watch'|'critical';
export interface BenchmarkInput{key:string;label:string;value:number;target?:number;peerMedian?:number;higherIsBetter?:boolean;}
export interface BenchmarkResult extends BenchmarkInput{targetGap:number|null;peerGap:number|null;band:BenchmarkBand;score:number;}
const scoreGap=(v:number,ref:number,higher:boolean)=>{const d=higher?v-ref:ref-v;return Math.max(0,Math.min(100,50+d/Math.max(1,Math.abs(ref))*50));};
export function benchmarkKpis(items:BenchmarkInput[]):BenchmarkResult[]{return items.map(x=>{const higher=x.higherIsBetter!==false;const ref=x.target??x.peerMedian;const targetGap=x.target==null?null:x.value-x.target;const peerGap=x.peerMedian==null?null:x.value-x.peerMedian;const score=ref==null?50:Math.round(scoreGap(x.value,ref,higher));const band=score>=85?'excellent':score>=70?'good':score>=50?'watch':'critical';return{...x,targetGap,peerGap,band,score};});}
