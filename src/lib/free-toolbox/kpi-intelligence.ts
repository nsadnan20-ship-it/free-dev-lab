export interface KpiPoint{date:string;value:number}
export interface KpiAnalysis{current:number|null;previous:number|null;changePct:number|null;trend:'up'|'down'|'flat'|'unknown';volatility:number;direction:'improving'|'deteriorating'|'neutral'|'unknown'}
export function analyzeKpi(points:KpiPoint[],higherIsBetter=true):KpiAnalysis{
  const p=points.filter(x=>Number.isFinite(x.value)&&typeof x.date==='string'&&Number.isFinite(Date.parse(x.date)));
  if(!p.length)return{current:null,previous:null,changePct:null,trend:'unknown',volatility:0,direction:'unknown'};
  const ordered=[...p].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const current=ordered[ordered.length-1].value;
  const previous=ordered.length>1?ordered[ordered.length-2].value:null;
  const changePct=previous===null||previous===0?null:(current-previous)/Math.abs(previous)*100;
  const mean=ordered.reduce((s,x)=>s+x.value,0)/ordered.length;
  const volatility=Math.sqrt(ordered.reduce((s,x)=>s+(x.value-mean)**2,0)/ordered.length);
  const trend=changePct===null?'unknown':Math.abs(changePct)<1?'flat':changePct>0?'up':'down';
  const direction=changePct===null?'unknown':trend==='flat'?'neutral':higherIsBetter?(trend==='up'?'improving':'deteriorating'):(trend==='down'?'improving':'deteriorating');
  return{current,previous,changePct,trend,volatility,direction};
}