export interface EvidenceCard{ id:string; title:string; metric:string; value:number|string; unit?:string; status:'positive'|'negative'|'neutral'|'warning'; sourceIds:string[]; formula?:string; confidence?:number; drilldown?:string }
export function buildEvidenceCard(input:Omit<EvidenceCard,'id'>,id=`evidence-${Date.now()}`):EvidenceCard{return{id,...input,confidence:input.confidence===undefined?100:Math.max(0,Math.min(100,input.confidence))};}
export function sortEvidenceCards(cards:EvidenceCard[]):EvidenceCard[]{return [...cards].sort((a,b)=>((b.confidence??0)-(a.confidence??0)));}
