import { exponentialMovingAverage, linearTrend, mean, stddev } from './statistics';

export interface ForecastPoint { period:number; value:number; lower:number; upper:number; }
export interface ForecastResult { points:ForecastPoint[]; method:'ensemble-baseline'; confidence:number; }

/** Subscription-free baseline: level + trend + EMA ensemble. */
export function forecast(values:number[], horizon=7):ForecastResult{
  if(!values.length)return{points:[],method:'ensemble-baseline',confidence:0};
  const ema=exponentialMovingAverage(values,.35); const level=ema.at(-1)??mean(values); const trend=linearTrend(values).slope;
  const residuals=values.map((v,i)=>v-(level+trend*(i-(values.length-1)))); const sigma=stddev(residuals); const confidence=Math.max(.05,Math.min(.98,1-(sigma/(Math.abs(level)+1e-9))));
  const points=Array.from({length:horizon},(_,k)=>{const value=Math.max(0,level+trend*(k+1));const margin=1.96*sigma*Math.sqrt(k+1);return{period:k+1,value,lower:Math.max(0,value-margin),upper:value+margin};});
  return{points,method:'ensemble-baseline',confidence};
}
