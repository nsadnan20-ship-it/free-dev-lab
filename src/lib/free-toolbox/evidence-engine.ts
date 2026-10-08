export interface EvidenceItem{id:string;source:string;metric:string;value:number;period?:string;unit?:string;confidence?:number}
export interface EvidenceBundle{items:EvidenceItem[];summary:string;confidence:number}
export function buildEvidenceBundle(items:EvidenceItem[]):EvidenceBundle{const clean=items.filter(i=>Number.isFinite(i.value));const confidence=clean.length?clean.reduce((s,i)=>s+(i.confidence??100),0)/clean.length:0;return{items:clean,summary:clean.map(i=>`${i.metric}: ${i.value}${i.unit??''}`).join(' | '),confidence}}
export function findEvidence(items:EvidenceItem[],metric:string):EvidenceItem[]{const q=metric.trim().toLowerCase();return items.filter(i=>i.metric.toLowerCase().includes(q)).sort((a,b)=>(b.confidence??100)-(a.confidence??100))}
