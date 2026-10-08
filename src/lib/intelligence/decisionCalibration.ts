import type { DecisionScore } from './decisionScore';

export type DecisionOutcome = { predicted: boolean; actual: boolean; score: number; band: DecisionScore['band'] };
export type Calibration = { observations: number; accuracy: number; precision: number; recall: number; falsePositiveRate: number; threshold: number; recommendation: 'KEEP' | 'RAISE' | 'LOWER' | 'INSUFFICIENT_DATA' };

export function calibrateDecisionThreshold(outcomes: DecisionOutcome[], threshold = 0.8): Calibration {
  if (outcomes.length === 0) return { observations: 0, accuracy: 0, precision: 0, recall: 0, falsePositiveRate: 0, threshold, recommendation: 'INSUFFICIENT_DATA' };
  const tp = outcomes.filter(o => o.score >= threshold && o.actual).length;
  const fp = outcomes.filter(o => o.score >= threshold && !o.actual).length;
  const fn = outcomes.filter(o => o.score < threshold && o.actual).length;
  const tn = outcomes.filter(o => o.score < threshold && !o.actual).length;
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const accuracy = ratio(tp + tn, outcomes.length);
  const falsePositiveRate = ratio(fp, fp + tn);
  const recommendation = outcomes.length < 20 ? 'INSUFFICIENT_DATA' : falsePositiveRate > 0.25 ? 'RAISE' : precision < 0.65 && recall < 0.8 ? 'RAISE' : recall < 0.55 ? 'LOWER' : 'KEEP';
  return { observations: outcomes.length, accuracy, precision, recall, falsePositiveRate, threshold, recommendation };
}
function ratio(a: number, b: number): number { return b === 0 ? 0 : a / b; }
