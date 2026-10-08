import type { Decision } from './intelligence/decisionEngine';
import { evaluateMetric, metricCanDriveDecision, type MetricEvaluation } from './metricEngine';
import { explainDecision, type Evidence, type DecisionEvidence } from './free-toolbox/evidence-ledger';

export interface EvidenceBackedDecision extends Decision { decisionEvidence: DecisionEvidence; blocked: boolean; blockedReason?: string; }

export function buildEvidenceBackedDecision(decision: Decision, evidence: Evidence[]): EvidenceBackedDecision {
  const primary = decision.evidence[0];
  const metric: MetricEvaluation | null = primary ? evaluateMetric({ key: primary.metric, value: primary.value, confidence: decision.confidence }) : null;
  const decisionEvidence = explainDecision(decision.id, decision.action, evidence);
  const metricAllowed = metric ? metricCanDriveDecision(metric) : false;
  const evidenceAllowed = decisionEvidence.status === 'verified' || decisionEvidence.status === 'partial';
  const blocked = !metricAllowed || !evidenceAllowed;
  return {
    ...decision,
    decisionEvidence,
    blocked,
    blockedReason: blocked
      ? !metricAllowed
        ? 'المؤشر المرتبط بالتوصية لا يملك جودة/ثقة كافية لاتخاذ قرار.'
        : 'لا توجد أدلة كافية لتتبع سبب التوصية إلى مصدرها.'
      : undefined,
  };
}

export function filterActionableDecisions(decisions: EvidenceBackedDecision[]): EvidenceBackedDecision[] {
  return decisions.filter(decision => !decision.blocked);
}
