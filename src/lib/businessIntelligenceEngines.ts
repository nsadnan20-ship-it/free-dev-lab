export type DecisionAction = 'BUY_NOW' | 'BUY_SOON' | 'MONITOR' | 'DO_NOT_BUY' | 'OVERSTOCK' | 'COLLECT_NOW' | 'COLLECT_SOON' | 'HOLD_PAYMENT' | 'PAY_NOW' | 'PAY_SOON';

export interface AgingBucket { label: string; minDays: number | null; maxDays: number | null; amount: number; count: number; }
export interface AgingItem { amount: number; dueDate?: string | null; asOf?: string; }
export interface TrendPoint { date: string; value: number; }
export interface TrendAnalysis { direction: 'UP' | 'DOWN' | 'FLAT' | 'INSUFFICIENT_DATA'; velocity: number | null; acceleration: number | null; volatility: number | null; seasonalityHint: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'; }
export interface InventoryDecision { action: DecisionAction; suggestedQuantity: number; coverageDays: number | null; reason: string; confidence: number; }
export interface CustomerScore { recency: number; frequency: number; monetary: number; inactivityDays: number; segment: 'CHAMPION' | 'LOYAL' | 'AT_RISK' | 'INACTIVE' | 'NEW' | 'OTHER'; score: number; }
export interface SupplierScore { score: number; deliveryRisk: number; priceRisk: number; dependencyRisk: number; priority: 'CRITICAL' | 'HIGH' | 'NORMAL'; }
export interface LiquidityProjection { horizonDays: number; openingLiquidity: number; expectedInflow: number; expectedOutflow: number; projectedLiquidity: number; gap: number; status: 'SAFE' | 'WATCH' | 'GAP'; }
export interface CashConversionCycle { dso: number | null; dio: number | null; dpo: number | null; ccc: number | null; status: 'READY' | 'INSUFFICIENT_DATA'; }
export interface WhatIfResult { baseline: number; scenario: number; delta: number; deltaPct: number | null; assumptions: string[]; }

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const safeDiv = (a: number, b: number) => b === 0 ? null : a / b;
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function requireFinite(value: unknown, field: string): number {
  if (!isFiniteNumber(value)) throw new Error(`BI_INVALID_NUMBER:${field}`);
  return value;
}

function requireNonNegative(value: unknown, field: string): number {
  const n = requireFinite(value, field);
  if (n < 0) throw new Error(`BI_NEGATIVE_VALUE:${field}`);
  return n;
}

export function buildAgingBuckets(items: AgingItem[], asOf = new Date()): AgingBucket[] {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) throw new Error('BI_INVALID_AS_OF');
  const ranges: Array<readonly [string, number | null, number | null]> = [
    ['0-30', 0, 30], ['31-60', 31, 60], ['61-90', 61, 90], ['91-180', 91, 180], ['180+', 181, null], ['UNDATED', null, null],
  ];
  const buckets = ranges.map(([label, minDays, maxDays]) => ({ label, minDays, maxDays, amount: 0, count: 0 }));
  const unnumbered = buckets[buckets.length - 1];
  for (const item of items) {
    if (!isFiniteNumber(item.amount)) continue;
    if (!item.dueDate) { unnumbered.amount += item.amount; unnumbered.count += 1; continue; }
    const dueTime = new Date(item.dueDate).getTime();
    if (!Number.isFinite(dueTime)) { unnumbered.amount += item.amount; unnumbered.count += 1; continue; }
    const days = Math.max(0, Math.floor((asOf.getTime() - dueTime) / 86400000));
    const bucket = buckets.find(b => b.minDays != null && days >= b.minDays && (b.maxDays == null || days <= b.maxDays));
    if (bucket) { bucket.amount += item.amount; bucket.count += 1; }
  }
  return buckets;
}

export function analyzeTrend(points: TrendPoint[]): TrendAnalysis {
  const valid = points
    .filter(p => p && typeof p.date === 'string' && Number.isFinite(new Date(p.date).getTime()) && isFiniteNumber(p.value))
    .map(p => ({ date: p.date, value: p.value, time: new Date(p.date).getTime() }))
    .sort((a, b) => a.time - b.time);
  if (valid.length < 3) return { direction: 'INSUFFICIENT_DATA', velocity: null, acceleration: null, volatility: null, seasonalityHint: 'UNKNOWN' };
  const values = valid.map(p => p.value);
  const n = values.length;
  const half = Math.max(1, Math.floor(n / 2));
  const first = mean(values.slice(0, half))!;
  const last = mean(values.slice(-half))!;
  const velocity = safeDiv(last - first, Math.max(1, half));
  const prevVelocity = safeDiv(values[n - 2] - values[0], Math.max(1, n - 2));
  const acceleration = velocity != null && prevVelocity != null ? velocity - prevVelocity : null;
  const avg = mean(values)!;
  const variance = mean(values.map(v => (v - avg) ** 2))!;
  const volatility = avg === 0 ? Math.sqrt(variance) : Math.sqrt(variance) / Math.abs(avg);
  const direction = Math.abs(last - first) <= Math.max(1e-9, Math.abs(avg) * 0.02) ? 'FLAT' : last > first ? 'UP' : 'DOWN';
  return { direction, velocity, acceleration, volatility, seasonalityHint: volatility > 0.5 ? 'HIGH' : volatility > 0.2 ? 'MEDIUM' : 'LOW' };
}

export function decideReplenishment(input: { onHand: number; reserved?: number; onOrder?: number; avgDailyDemand: number; leadTimeDays: number; safetyDays?: number; maxStockDays?: number; }): InventoryDecision {
  const onHand = requireNonNegative(input.onHand, 'onHand');
  const avgDailyDemand = requireNonNegative(input.avgDailyDemand, 'avgDailyDemand');
  const leadTimeDays = requireNonNegative(input.leadTimeDays, 'leadTimeDays');
  const reserved = requireNonNegative(input.reserved ?? 0, 'reserved');
  const onOrder = requireNonNegative(input.onOrder ?? 0, 'onOrder');
  const safetyDays = requireNonNegative(input.safetyDays ?? 7, 'safetyDays');
  const maxDays = requireNonNegative(input.maxStockDays ?? Math.max(safetyDays, leadTimeDays + safetyDays) * 2.5, 'maxStockDays');
  const available = Math.max(0, onHand - reserved);
  if (avgDailyDemand === 0) return { action: available > 0 ? 'MONITOR' : 'DO_NOT_BUY', suggestedQuantity: 0, coverageDays: null, reason: 'No valid demand baseline', confidence: 0 };
  const coverageDays = available / avgDailyDemand;
  const targetDays = Math.max(safetyDays, leadTimeDays + safetyDays);
  const required = Math.max(0, avgDailyDemand * targetDays - available - onOrder);
  if (coverageDays > maxDays && onOrder > 0) return { action: 'OVERSTOCK', suggestedQuantity: 0, coverageDays, reason: 'Projected coverage exceeds maximum target and stock is already on order', confidence: 86 };
  if (coverageDays <= leadTimeDays) return { action: 'BUY_NOW', suggestedQuantity: Math.ceil(required), coverageDays, reason: 'Available stock does not cover lead time', confidence: 88 };
  if (coverageDays <= targetDays) return { action: 'BUY_SOON', suggestedQuantity: Math.ceil(required), coverageDays, reason: 'Coverage is approaching safety target', confidence: 82 };
  return { action: 'MONITOR', suggestedQuantity: 0, coverageDays, reason: 'Current coverage is above target', confidence: 84 };
}

export function scoreCustomer(input: { recencyDays: number; orders: number; revenue: number; inactivityThresholdDays?: number }): CustomerScore {
  const recencyDays = requireNonNegative(input.recencyDays, 'recencyDays');
  const orders = requireNonNegative(input.orders, 'orders');
  const revenue = requireNonNegative(input.revenue, 'revenue');
  const threshold = requireNonNegative(input.inactivityThresholdDays ?? 90, 'inactivityThresholdDays');
  if (threshold <= 0) throw new Error('BI_NON_POSITIVE_THRESHOLD:inactivityThresholdDays');
  const recency = clamp(100 - (recencyDays / threshold) * 100);
  const frequency = clamp(orders * 10);
  const monetary = revenue === 0 ? 0 : clamp(50 + Math.log10(revenue + 1) * 10);
  const score = Math.round(recency * 0.4 + frequency * 0.25 + monetary * 0.35);
  const segment = orders <= 1 && recencyDays <= 30 ? 'NEW' : recencyDays > threshold * 1.5 ? 'INACTIVE' : recencyDays > threshold ? 'AT_RISK' : score >= 80 ? 'CHAMPION' : score >= 60 ? 'LOYAL' : 'OTHER';
  return { recency, frequency, monetary, inactivityDays: recencyDays, segment, score };
}

export function scoreSupplier(input: { avgDeliveryDelayDays: number; priceVariationPct: number; dependencyPct: number }): SupplierScore {
  const avgDeliveryDelayDays = requireNonNegative(input.avgDeliveryDelayDays, 'avgDeliveryDelayDays');
  const priceVariationPct = requireFinite(input.priceVariationPct, 'priceVariationPct');
  const dependencyPct = requireNonNegative(input.dependencyPct, 'dependencyPct');
  const deliveryRisk = clamp(avgDeliveryDelayDays * 12);
  const priceRisk = clamp(Math.abs(priceVariationPct) * 2);
  const dependencyRisk = clamp(dependencyPct);
  const risk = deliveryRisk * 0.35 + priceRisk * 0.25 + dependencyRisk * 0.4;
  return { score: Math.round(100 - risk), deliveryRisk, priceRisk, dependencyRisk, priority: risk >= 70 ? 'CRITICAL' : risk >= 45 ? 'HIGH' : 'NORMAL' };
}

export function projectLiquidity(input: { openingLiquidity: number; horizons: number[]; dailyInflow: number; dailyOutflow: number; committedOutflow?: number }): LiquidityProjection[] {
  const openingLiquidity = requireFinite(input.openingLiquidity, 'openingLiquidity');
  const dailyInflow = requireNonNegative(input.dailyInflow, 'dailyInflow');
  const dailyOutflow = requireNonNegative(input.dailyOutflow, 'dailyOutflow');
  const committed = requireNonNegative(input.committedOutflow ?? 0, 'committedOutflow');
  return [...input.horizons].map(h => requireNonNegative(h, 'horizonDays')).sort((a, b) => a - b).map(horizonDays => {
    const expectedInflow = dailyInflow * horizonDays;
    const expectedOutflow = dailyOutflow * horizonDays + committed;
    const projectedLiquidity = openingLiquidity + expectedInflow - expectedOutflow;
    const gap = Math.max(0, -projectedLiquidity);
    const watchThreshold = Math.max(0, Math.abs(openingLiquidity) * 0.2);
    return { horizonDays, openingLiquidity, expectedInflow, expectedOutflow, projectedLiquidity, gap, status: gap > 0 ? 'GAP' : projectedLiquidity < watchThreshold ? 'WATCH' : 'SAFE' };
  });
}

export function cashConversionCycle(input: { receivables: number; revenue: number; inventory: number; costOfSales: number; payables: number; purchases: number; periodDays?: number }): CashConversionCycle {
  const receivables = requireNonNegative(input.receivables, 'receivables');
  const revenue = requireNonNegative(input.revenue, 'revenue');
  const inventory = requireNonNegative(input.inventory, 'inventory');
  const costOfSales = requireNonNegative(input.costOfSales, 'costOfSales');
  const payables = requireNonNegative(input.payables, 'payables');
  const purchases = requireNonNegative(input.purchases, 'purchases');
  const days = requireNonNegative(input.periodDays ?? 365, 'periodDays');
  if (days <= 0) throw new Error('BI_NON_POSITIVE_PERIOD:periodDays');
  const dso = revenue > 0 ? receivables / revenue * days : null;
  const dio = costOfSales > 0 ? inventory / costOfSales * days : null;
  const dpo = purchases > 0 ? payables / purchases * days : null;
  if (dso == null || dio == null || dpo == null) return { dso, dio, dpo, ccc: null, status: 'INSUFFICIENT_DATA' };
  return { dso, dio, dpo, ccc: dso + dio - dpo, status: 'READY' };
}

export function whatIf(input: { baseline: number; changes: Array<{ label: string; pct: number }> }): WhatIfResult {
  const baseline = requireFinite(input.baseline, 'baseline');
  let scenario = baseline;
  for (const change of input.changes) {
    if (!change || !isFiniteNumber(change.pct) || typeof change.label !== 'string' || !change.label.trim()) throw new Error('BI_INVALID_WHAT_IF_CHANGE');
    scenario *= 1 + change.pct / 100;
    if (!Number.isFinite(scenario)) throw new Error('BI_WHAT_IF_OVERFLOW');
  }
  return { baseline, scenario, delta: scenario - baseline, deltaPct: baseline === 0 ? null : (scenario - baseline) / Math.abs(baseline) * 100, assumptions: input.changes.map(c => `${c.label.trim()}: ${c.pct}%`) };
}
