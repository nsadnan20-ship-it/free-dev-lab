import type { DecisionScore } from './decisionScore';
import type { ExplainableDecision } from './decisionExplainability';
import type { Calibration } from './decisionCalibration';
import type { ReplenishmentPlan } from './replenishmentOptimizer';
import type { GroupSubstitutionSummary } from './groupSubstitution';
import { evaluateProductionReadiness, type ProductionReadiness } from './productionReadiness';

export type DecisionChainInput = { score: DecisionScore; explanation: ExplainableDecision; calibration: Calibration; replenishment: ReplenishmentPlan; groups: GroupSubstitutionSummary[]; readinessChecks: Parameters<typeof evaluateProductionReadiness>[0] };
export type DecisionChainResult = { outcome: 'BLOCKED' | 'REVIEW' | 'APPROVE' | 'AUTOMATE'; reasons: string[]; readiness: ProductionReadiness; fingerprint: string };

export function resolveDecisionChain(input: DecisionChainInput): DecisionChainResult {
  const readiness = evaluateProductionReadiness(input.readinessChecks);
  const reasons: string[] = [];
  if (!readiness.ready) reasons.push(...readiness.blockers);
  if (input.replenishment.risk === 'BLOCKED') reasons.push('PROTECTED_LIQUIDITY_BREACH');
  if (input.explanation.blockers.length) reasons.push(...input.explanation.blockers);
  if (input.calibration.recommendation === 'INSUFFICIENT_DATA') reasons.push('CALIBRATION_INSUFFICIENT_DATA');
  if (input.score.score < 0.8) reasons.push('DECISION_SCORE_BELOW_AUTOMATION_THRESHOLD');
  const outcome = reasons.length ? (reasons.includes('PROTECTED_LIQUIDITY_BREACH') || !readiness.ready ? 'BLOCKED' : 'REVIEW') : input.score.score >= 0.92 ? 'AUTOMATE' : 'APPROVE';
  return { outcome, reasons: [...new Set(reasons)], readiness, fingerprint: input.explanation.decisionFingerprint };
}
