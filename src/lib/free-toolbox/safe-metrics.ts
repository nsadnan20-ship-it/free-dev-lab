export function finiteNonNegative(value: unknown, fallback?: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  if (fallback !== undefined && Number.isFinite(fallback) && fallback >= 0) return fallback;
  throw new Error('INSUFFICIENT_METRIC_DATA');
}

export function finitePercent(value: unknown, fallback?: number): number {
  const n = finiteNonNegative(value, fallback);
  if (n > 100) throw new Error('INVALID_METRIC_RANGE');
  return n;
}

export function safeRatio(numerator: unknown, denominator: unknown, fallback?: number): number {
  const n = finiteNonNegative(numerator);
  const d = finiteNonNegative(denominator);
  if (d === 0) {
    if (fallback !== undefined) return finiteNonNegative(fallback);
    throw new Error('INSUFFICIENT_METRIC_DATA:denominator');
  }
  return n / d;
}

export function safeDays(stock: unknown, dailyDemand: unknown): number {
  const stockValue = finiteNonNegative(stock);
  const demand = finiteNonNegative(dailyDemand);
  if (demand === 0) throw new Error('INSUFFICIENT_METRIC_DATA:dailyDemand');
  return stockValue / demand;
}
