export interface ForecastPoint { date: string; forecast: number; lower: number; upper: number; }

/** Weighted moving-average baseline. Deterministic and explainable; ML models can be plugged in later. */
export function weightedDemandForecast(history: number[], horizonDays: number, weights = [0.5, 0.3, 0.2]): ForecastPoint[] {
  const clean = history.filter(Number.isFinite).map(x => Math.max(0, x));
  if (!clean.length || horizonDays <= 0) return [];
  const w = weights.slice(0, Math.min(weights.length, clean.length));
  const norm = w.reduce((a,b)=>a+b,0) || 1;
  const recent = clean.slice(-w.length).reverse();
  const baseline = recent.reduce((s,x,i)=>s+x*(w[i] ?? 0),0) / norm;
  const mean = clean.reduce((s,x)=>s+x,0)/clean.length;
  const variance = clean.reduce((s,x)=>s+(x-mean)**2,0)/clean.length;
  const sigma = Math.sqrt(variance);
  return Array.from({length:horizonDays},(_,i)=>{
    const date = new Date(); date.setDate(date.getDate()+i+1);
    const scale = Math.sqrt(i+1);
    const margin = 1.65*sigma*scale;
    return {date:date.toISOString().slice(0,10), forecast:Math.max(0,baseline), lower:Math.max(0,baseline-margin), upper:Math.max(0,baseline+margin)};
  });
}
