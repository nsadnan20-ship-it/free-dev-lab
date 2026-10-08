export type FreshnessState = 'Fresh' | 'Warning' | 'Stale' | 'Critical' | 'Unknown';
export type DecisionAction = 'BUY_NOW' | 'BUY_SOON' | 'MONITOR' | 'DO_NOT_BUY';

export interface DecisionChainInput {
  demand: {
    averageDailyUnits: number;
    peakDailyUnits: number;
    trend: number;
    historicalUnits: number;
  };
  requests: {
    openUnits: number;
    customerCount: number;
  };
  stock: {
    sellableUnits: number;
    reservedUnits: number;
    damagedUnits: number;
    blockedUnits: number;
  };
  alternatives: {
    groupName: string;
    sellableUnits: number;
    coverageDays: number;
  }[];
  forecast: {
    nextPeriodUnits: number | null;
    confidence: number | null;
  };
  freshness: FreshnessState;
  cash: {
    expectedCashOutMinor: number;
    operatingReserveMinor: number;
  };
}

export interface UnifiedDecision {
  action: DecisionAction;
  effectiveDemandUnits: number;
  effectiveSellableUnits: number;
  coverageDays: number | null;
  stockoutExposureUnits: number;
  lostSalesExposureUnits: number;
  alternativeCoverageDays: number | null;
  liquidityPressureMinor: number;
  confidence: number | null;
  freshness: FreshnessState;
  reasons: string[];
}

const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0;
const clamp01 = (value: number | null) => value == null || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value));

export function buildUnifiedDecisionChain(input: DecisionChainInput): UnifiedDecision {
  const average = finiteNonNegative(input.demand.averageDailyUnits);
  const peak = finiteNonNegative(input.demand.peakDailyUnits);
  const historical = finiteNonNegative(input.demand.historicalUnits);
  const openRequests = finiteNonNegative(input.requests.openUnits);
  const sellable = finiteNonNegative(input.stock.sellableUnits);

  const forecast = input.forecast.nextPeriodUnits == null
    ? null
    : finiteNonNegative(input.forecast.nextPeriodUnits);

  const effectiveDemand = Math.max(
    average,
    openRequests,
    forecast == null ? 0 : forecast / 30,
    peak * 0.25,
  );

  const effectiveSellable = sellable + input.alternatives.reduce(
    (sum, group) => sum + finiteNonNegative(group.sellableUnits),
    0,
  );

  const coverageDays = effectiveDemand > 0 ? effectiveSellable / effectiveDemand : null;
  const stockoutExposure = Math.max(0, openRequests - effectiveSellable);
  const lostSalesExposure = Math.max(0, peak - effectiveSellable);

  const alternativeCoverage = input.alternatives.length
    ? Math.max(...input.alternatives.map((group) => finiteNonNegative(group.coverageDays)))
    : null;

  const reserve = finiteNonNegative(input.cash.operatingReserveMinor);
  const cashOut = finiteNonNegative(input.cash.expectedCashOutMinor);
  const liquidityPressure = Math.max(0, cashOut - reserve);

  const reasons: string[] = [];
  if (input.freshness === 'Stale' || input.freshness === 'Critical' || input.freshness === 'Unknown') {
    reasons.push('Data freshness is insufficient for an aggressive proactive decision.');
  }
  if (stockoutExposure > 0) reasons.push('Open customer demand exceeds effective sellable coverage.');
  if (lostSalesExposure > 0) reasons.push('Peak demand indicates exposure above current effective coverage.');
  if (alternativeCoverage != null && alternativeCoverage > 0) {
    reasons.push('Alternative-group coverage is included before declaring a stockout.');
  }
  if (liquidityPressure > 0) reasons.push('Proposed cash outflow exceeds the protected operating reserve.');

  let action: DecisionAction = 'MONITOR';
  if (input.freshness === 'Stale' || input.freshness === 'Critical' || input.freshness === 'Unknown') {
    action = 'MONITOR';
  } else if (stockoutExposure > 0 && liquidityPressure === 0) {
    action = 'BUY_NOW';
  } else if ((coverageDays != null && coverageDays < 7) || lostSalesExposure > 0) {
    action = liquidityPressure === 0 ? 'BUY_SOON' : 'MONITOR';
  } else if (coverageDays != null && coverageDays > 45) {
    action = 'DO_NOT_BUY';
  }

  const confidence = clamp01(input.forecast.confidence);

  return {
    action,
    effectiveDemandUnits: effectiveDemand,
    effectiveSellableUnits: effectiveSellable,
    coverageDays,
    stockoutExposureUnits: stockoutExposure,
    lostSalesExposureUnits: lostSalesExposure,
    alternativeCoverageDays: alternativeCoverage,
    liquidityPressureMinor: liquidityPressure,
    confidence,
    freshness: input.freshness,
    reasons,
  };
}
