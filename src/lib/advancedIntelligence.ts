export interface Observation { id: string; value: number; date?: string; }
export interface ForecastResult { horizon: number; values: number[]; method: 'MOVING_AVERAGE' | 'WEIGHTED_AVERAGE'; confidence: number; insufficient: boolean; }
export interface BacktestResult { mae: number | null; rmse: number | null; mape: number | null; samples: number; ready: boolean; }
export interface ABCXYZItem { id: string; value: number; share: number; cumulativeShare: number; abc: 'A' | 'B' | 'C'; variability: number | null; xyz: 'X' | 'Y' | 'Z'; classCode: string; }
export interface FsnItem { id: string; velocity: number; fsn: 'F' | 'S' | 'N'; }
export interface Anomaly { id: string; value: number; zScore: number; direction: 'HIGH' | 'LOW'; severity: 'WARNING' | 'CRITICAL'; }
export interface Opportunity { id: string; type: 'CROSS_SELL' | 'MARGIN' | 'DEAD_STOCK' | 'CASH_RELEASE'; score: number; estimatedValue: number; reason: string; }
export interface TrendAnalysis { direction: 'UP' | 'DOWN' | 'FLAT'; slope: number; strength: number; points: number; }
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const std = (a: number[]) => { const m = mean(a); return m == null ? null : Math.sqrt(mean(a.map(v => (v - m) ** 2))!); };
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
export function analyzeTrend(points: Observation[]): TrendAnalysis {
  const clean = points.filter(p => Number.isFinite(p.value)); const n = clean.length;
  if (n < 2) return { direction: 'FLAT', slope: 0, strength: 0, points: n };
  const xMean = (n - 1) / 2; const yMean = clean.reduce((s, p) => s + p.value, 0) / n;
  const numerator = clean.reduce((s, p, i) => s + (i - xMean) * (p.value - yMean), 0);
  const denominator = clean.reduce((s, _p, i) => s + (i - xMean) ** 2, 0) || 1;
  const slope = numerator / denominator;
  const strength = clamp(Math.abs(slope) / Math.max(Math.abs(yMean), 1e-9) * n);
  return { direction: slope > 1e-9 ? 'UP' : slope < -1e-9 ? 'DOWN' : 'FLAT', slope, strength, points: n };
}
export function forecastSeries(values: number[], horizon: number, window = 7): ForecastResult {
  const clean = values.filter(Number.isFinite).map(Number);
  if (clean.length < Math.max(3, window)) return { horizon, values: [], method: 'MOVING_AVERAGE', confidence: 0, insufficient: true };
  const recent = clean.slice(-Math.min(window, clean.length)); const weights = recent.map((_, i) => i + 1); const denominator = weights.reduce((a, b) => a + b, 0);
  const base = recent.reduce((sum, value, i) => sum + value * weights[i], 0) / denominator; const volatility = (std(recent) ?? 0) / Math.max(Math.abs(mean(recent) ?? 0), 1e-9);
  return { horizon, values: Array.from({ length: horizon }, () => Math.max(0, base)), method: 'WEIGHTED_AVERAGE', confidence: clamp(1 - volatility), insufficient: false };
}
export function backtestForecast(values: number[], window = 7): BacktestResult {
  const clean = values.filter(Number.isFinite); if (clean.length < window + 3) return { mae: null, rmse: null, mape: null, samples: 0, ready: false };
  const errors: number[] = []; const pctErrors: number[] = [];
  for (let i = window; i < clean.length; i++) { const prediction = mean(clean.slice(i - window, i))!; const error = prediction - clean[i]; errors.push(Math.abs(error)); if (clean[i] !== 0) pctErrors.push(Math.abs(error / clean[i]) * 100); }
  return { mae: mean(errors)!, rmse: Math.sqrt(mean(errors.map(e => e ** 2))!), mape: mean(pctErrors), samples: errors.length, ready: errors.length >= 3 };
}
export function classifyABCXYZ(items: Array<{ id: string; value: number; history: number[] }>): ABCXYZItem[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0); const sorted = [...items].sort((a, b) => b.value - a.value); let cumulative = 0;
  return sorted.map(item => { const value = Math.max(0, item.value); const share = total ? value / total : 0; cumulative += share; const abc: ABCXYZItem['abc'] = cumulative <= .8 ? 'A' : cumulative <= .95 ? 'B' : 'C'; const avg = mean(item.history); const variability = avg && avg !== 0 ? (std(item.history) ?? 0) / Math.abs(avg) : null; const xyz: ABCXYZItem['xyz'] = variability == null ? 'Z' : variability <= .1 ? 'X' : variability <= .25 ? 'Y' : 'Z'; return { id: item.id, value, share, cumulativeShare: cumulative, abc, variability, xyz, classCode: `${abc}${xyz}` }; });
}
export function classifyFSN(items: Array<{ id: string; unitsSold: number; days: number }>): FsnItem[] { return items.map(i => { const velocity = i.days > 0 ? i.unitsSold / i.days : 0; const fsn: FsnItem['fsn'] = velocity >= 1 ? 'F' : velocity >= .1 ? 'S' : 'N'; return { id: i.id, velocity, fsn }; }); }
export function detectAnomalies(items: Observation[], zThreshold = 3): Anomaly[] {
  const values = items.map(i => i.value).filter(Number.isFinite); const m = mean(values); const s = std(values); if (m == null || !s || s === 0) return [];
  return items.map(i => { const zScore = (i.value - m) / s; const direction: Anomaly['direction'] = i.value >= m ? 'HIGH' : 'LOW'; const severity: Anomaly['severity'] = Math.abs(zScore) >= zThreshold * 1.5 ? 'CRITICAL' : 'WARNING'; return { id: i.id, value: i.value, zScore, direction, severity }; }).filter(a => Math.abs(a.zScore) >= zThreshold);
}
export function opportunityScan(input: { crossSell: Array<{ id: string; value: number; coPurchaseRate: number }>; margin: Array<{ id: string; sales: number; marginPct: number; benchmarkPct: number }>; deadStock: Array<{ id: string; value: number; daysIdle: number }>; idleCash: Array<{ id: string; value: number; velocity: number }> }): Opportunity[] {
  const result: Opportunity[] = []; for (const x of input.crossSell) if (x.coPurchaseRate > .2) result.push({ id: x.id, type: 'CROSS_SELL', score: clamp(x.coPurchaseRate), estimatedValue: x.value * x.coPurchaseRate, reason: 'High co-purchase rate' });
  for (const x of input.margin) if (x.marginPct < x.benchmarkPct) result.push({ id: x.id, type: 'MARGIN', score: clamp((x.benchmarkPct - x.marginPct) / 100), estimatedValue: x.sales * Math.max(0, x.benchmarkPct - x.marginPct) / 100, reason: 'Margin below benchmark' });
  for (const x of input.deadStock) if (x.daysIdle >= 90) result.push({ id: x.id, type: 'DEAD_STOCK', score: clamp(x.daysIdle / 365), estimatedValue: x.value, reason: 'Stock idle for 90+ days' });
  for (const x of input.idleCash) if (x.velocity < .1) result.push({ id: x.id, type: 'CASH_RELEASE', score: clamp(1 - x.velocity), estimatedValue: x.value, reason: 'Capital tied in low-velocity inventory' }); return result.sort((a, b) => b.score - a.score);
}
export function unifiedConfidence(input: { data: number; mapping: number; calculation: number; forecast: number; recommendation: number }): number { const weights = { data: .25, mapping: .15, calculation: .2, forecast: .2, recommendation: .2 }; return Math.round((input.data * weights.data + input.mapping * weights.mapping + input.calculation * weights.calculation + input.forecast * weights.forecast + input.recommendation * weights.recommendation) * 100) / 100; }
