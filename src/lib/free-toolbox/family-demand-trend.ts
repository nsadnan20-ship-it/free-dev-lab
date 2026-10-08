export interface FamilyDemandPoint { period: string; requestedUnits: number; fulfilledUnits: number; stockUnits: number; lostUnits: number; }
export interface FamilyDemandTrend { periods: number; totalRequested: number; totalFulfilled: number; totalLost: number; avgRequested: number; latestRequested: number; previousRequested: number; accelerationPct: number; stockoutPeriods: number; peakRequested: number; troughRequested: number; direction: 'accelerating' | 'declining' | 'stable' | 'insufficient_data'; confidence: number; evidence: string[]; }

const n = (v: number | undefined) => Number.isFinite(v) ? Math.max(0, v as number) : 0;

export function analyzeFamilyDemandTrend(points: FamilyDemandPoint[]): FamilyDemandTrend {
  const ordered = [...points].sort((a, b) => a.period.localeCompare(b.period));
  if (!ordered.length) return { periods: 0, totalRequested: 0, totalFulfilled: 0, totalLost: 0, avgRequested: 0, latestRequested: 0, previousRequested: 0, accelerationPct: 0, stockoutPeriods: 0, peakRequested: 0, troughRequested: 0, direction: 'insufficient_data', confidence: 0, evidence: [] };
  const requested = ordered.map(p => n(p.requestedUnits));
  const totalRequested = requested.reduce((a, b) => a + b, 0);
  const totalFulfilled = ordered.reduce((a, p) => a + Math.min(n(p.requestedUnits), n(p.fulfilledUnits)), 0);
  const totalLost = ordered.reduce((a, p) => a + n(p.lostUnits), 0);
  const latestRequested = requested.at(-1) ?? 0;
  const previousRequested = requested.at(-2) ?? 0;
  const accelerationPct = previousRequested > 0 ? ((latestRequested - previousRequested) / previousRequested) * 100 : 0;
  const stockoutPeriods = ordered.filter(p => n(p.stockUnits) <= 0 && n(p.requestedUnits) > 0).length;
  const peakRequested = Math.max(...requested);
  const troughRequested = Math.min(...requested);
  let direction: FamilyDemandTrend['direction'] = 'stable';
  if (ordered.length < 2) direction = 'insufficient_data';
  else if (accelerationPct >= 15) direction = 'accelerating';
  else if (accelerationPct <= -15) direction = 'declining';
  const evidence = [`${ordered.length} periods analyzed`];
  if (stockoutPeriods) evidence.push(`${stockoutPeriods} stockout periods detected`);
  if (totalLost > 0) evidence.push(`${totalLost} units of observed unfulfilled demand`);
  if (ordered.length >= 2) evidence.push(`latest vs previous demand change: ${accelerationPct.toFixed(1)}%`);
  const confidence = Math.min(0.95, 0.35 + Math.min(0.4, ordered.length * 0.05) + (totalRequested > 0 ? 0.2 : 0));
  return { periods: ordered.length, totalRequested, totalFulfilled, totalLost, avgRequested: totalRequested / ordered.length, latestRequested, previousRequested, accelerationPct, stockoutPeriods, peakRequested, troughRequested, direction, confidence, evidence };
}
