import type { BacktestMetrics } from './forecast-backtest';
import type { OutcomeQuality } from './outcome-feedback';

export interface IntelligenceGateInput {
  forecast: BacktestMetrics;
  outcomes?: OutcomeQuality;
  minimumForecastImprovementPct?: number;
  minimumCoverage?: number;
  maximumAbsoluteBias?: number;
  minimumOutcomeAccuracy?: number;
}

export interface IntelligenceGateResult { ready: boolean; blockers: string[]; }

export function evaluateIntelligenceGate(input: IntelligenceGateInput): IntelligenceGateResult {
  const blockers: string[] = [];
  const minImprovement = input.minimumForecastImprovementPct ?? 0;
  const minCoverage = input.minimumCoverage ?? 0.8;
  const maxBias = input.maximumAbsoluteBias ?? Infinity;
  if (input.forecast.count < 3) blockers.push('FORECAST_SAMPLE_TOO_SMALL');
  if (input.forecast.improvementVsBaselinePct < minImprovement) blockers.push('FORECAST_BELOW_BASELINE');
  if (Math.abs(input.forecast.bias) > maxBias) blockers.push('FORECAST_BIAS_TOO_HIGH');
  if (input.forecast.coverage !== undefined && input.forecast.coverage < minCoverage) blockers.push('FORECAST_COVERAGE_LOW');
  if (input.outcomes && input.outcomes.count >= 5 && (input.outcomes.accuracy == null || input.outcomes.accuracy < (input.minimumOutcomeAccuracy ?? 0.6))) blockers.push('OUTCOME_ACCURACY_LOW');
  return { ready: blockers.length === 0, blockers };
}
