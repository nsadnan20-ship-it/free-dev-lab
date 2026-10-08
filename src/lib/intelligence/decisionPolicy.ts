import type { DecisionScore } from './decisionScore';
import type { ExplainableDecision } from './decisionExplainability';
import type { Calibration } from './decisionCalibration';

export type DecisionPolicyInput = {
  score: DecisionScore;
  explanation: ExplainableDecision;
  calibration?: Calibration;
  highImpact: boolean;
};

export type DecisionPolicy = {
  outcome: 'BLOCK' | 'REVIEW' | 'APPROVE' | 'AUTOMATE';
  reasons: string[];
};

export function evaluateDecisionPolicy(input: DecisionPolicyInput): DecisionPolicy {
  const reasons: string[] = [];
  if (input.score.blockers.length) reasons.push(...input.score.blockers);
  if (input.explanation.confidence < 0.7) reasons.push('LOW_DECISION_CONFIDENCE');
  if (!input.explanation.decisionFingerprint) reasons.push('MISSING_DECISION_FINGERPRINT');
  if (input.highImpact && input.score.band !== 'HIGH_PRIORITY') reasons.push('HIGH_IMPACT_REQUIRES_HIGH_PRIORITY');
  if (input.calibration?.recommendation === 'INSUFFICIENT_DATA') reasons.push('CALIBRATION_INSUFFICIENT_DATA');
  if (input.calibration?.recommendation === 'RAISE') reasons.push('CALIBRATION_RECOMMENDS_HIGHER_THRESHOLD');

  if (reasons.length) return { outcome: 'BLOCK', reasons: [...new Set(reasons)] };
  if (input.highImpact) return { outcome: 'REVIEW', reasons: ['HIGH_IMPACT_APPROVAL_REQUIRED'] };
  if (input.score.band === 'HIGH_PRIORITY') return { outcome: 'AUTOMATE', reasons: ['POLICY_AUTO_EXECUTION_ALLOWED'] };
  if (input.score.band === 'READY') return { outcome: 'APPROVE', reasons: ['DECISION_READY_FOR_APPROVAL'] };
  return { outcome: 'REVIEW', reasons: ['DECISION_REQUIRES_REVIEW'] };
}
