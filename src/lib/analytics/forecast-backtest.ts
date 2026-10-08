export interface ForecastPoint { actual: number; predicted: number; lower?: number; upper?: number; }
export interface BacktestMetrics { count: number; mae: number; rmse: number; bias: number; coverage?: number; baselineMae: number; improvementVsBaselinePct: number; }

export function backtestForecast(points: ForecastPoint[], baseline?: number[]): BacktestMetrics {
  if (!points.length) return { count: 0, mae: 0, rmse: 0, bias: 0, baselineMae: 0, improvementVsBaselinePct: 0 };
  const abs = points.map(p => Math.abs(p.actual - p.predicted));
  const sq = points.map(p => (p.actual - p.predicted) ** 2);
  const bias = points.reduce((s, p) => s + p.predicted - p.actual, 0) / points.length;
  const baselineValues = baseline?.length === points.length ? baseline : points.map(p => p.actual);
  const baselineMae = baselineValues.reduce((s, b, i) => s + Math.abs(points[i].actual - b), 0) / points.length;
  const coveragePoints = points.filter(p => p.lower !== undefined && p.upper !== undefined);
  const coverage = coveragePoints.length ? coveragePoints.filter(p => p.actual >= (p.lower as number) && p.actual <= (p.upper as number)).length / coveragePoints.length : undefined;
  const mae = abs.reduce((s, v) => s + v, 0) / points.length;
  return { count: points.length, mae, rmse: Math.sqrt(sq.reduce((s, v) => s + v, 0) / points.length), bias, coverage, baselineMae, improvementVsBaselinePct: baselineMae ? ((baselineMae - mae) / baselineMae) * 100 : 0 };
}

export function assertForecastQuality(metrics: BacktestMetrics, minimumImprovementPct = 0): void {
  if (metrics.count < 3) throw new Error('Forecast quality requires at least three backtest points');
  if (!Number.isFinite(metrics.mae) || !Number.isFinite(metrics.rmse)) throw new Error('Forecast metrics are invalid');
  if (metrics.improvementVsBaselinePct < minimumImprovementPct) throw new Error('Forecast does not beat deterministic baseline');
}
