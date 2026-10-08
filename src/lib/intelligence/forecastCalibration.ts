export type ForecastObservation = { actual: number; predicted: number; confidence?: number };
export type CalibrationSummary = { count: number; mae: number; bias: number; coverage: number; meanConfidence: number; calibrated: boolean };

export function calibrateForecast(observations: ForecastObservation[], tolerance = 0.2): CalibrationSummary {
  const valid = observations.filter(
    (o) => Number.isFinite(o.actual) && Number.isFinite(o.predicted),
  );
  if (!valid.length) {
    return { count: 0, mae: 0, bias: 0, coverage: 0, meanConfidence: 0, calibrated: false };
  }

  let abs = 0;
  let bias = 0;
  let covered = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const o of valid) {
    const error = o.predicted - o.actual;
    abs += Math.abs(error);
    bias += error;
    if (Math.abs(error) <= Math.max(1, Math.abs(o.actual) * tolerance)) covered += 1;

    if (Number.isFinite(o.confidence)) {
      confidenceSum += Math.max(0, Math.min(1, o.confidence as number));
      confidenceCount += 1;
    }
  }

  const count = valid.length;
  const mae = abs / count;
  const normalizedBias = bias / count;
  const coverage = covered / count;
  const meanConfidence = confidenceCount ? confidenceSum / confidenceCount : 0;

  return {
    count,
    mae,
    bias: normalizedBias,
    coverage,
    meanConfidence,
    calibrated: coverage >= 0.8 && Math.abs(normalizedBias) <= Math.max(1, mae),
  };
}
