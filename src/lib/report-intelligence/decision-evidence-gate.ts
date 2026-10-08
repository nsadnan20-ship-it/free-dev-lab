import type {UnifiedDecision} from '../product-intelligence/decision-intelligence';
import type {Anomaly} from './anomaly-engine';
import type {EvidenceLink} from './anomaly-evidence-chain';

export interface DecisionEvidenceGateInput { decision: UnifiedDecision; anomalies?: Anomaly[]; links?: EvidenceLink[]; minimumConfidence?: number; }
export interface DecisionEvidenceGateResult { allowed: boolean; confidence: number; blockingReasons: string[]; warnings: string[]; }

export function evaluateDecisionEvidenceGate(input: DecisionEvidenceGateInput): DecisionEvidenceGateResult {
  const minimum = input.minimumConfidence ?? 0.55;
  const anomalies = input.anomalies ?? [];
  const links = input.links ?? [];
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const highRisk = anomalies.filter(a => a.severity === 'high');
  const linkedKinds = new Set(links.map(l => l.anomalyKind));

  if (input.decision.confidence < minimum) blockingReasons.push('ثقة القرار أقل من الحد الأدنى المسموح للإجراء التنفيذي');
  if (input.decision.action === 'buy_now' && input.decision.recommendedQty > 0 && input.decision.capitalRequired > 0 && !input.decision.evidence.length) {
    blockingReasons.push('قرار الشراء العاجل لا يملك أدلة كمية');
  }
  if (highRisk.length > 0 && highRisk.some(a => !linkedKinds.has(a.kind))) {
    blockingReasons.push('يوجد شذوذ عالي الخطورة غير مرتبط بسلسلة أدلة');
  }
  if (input.decision.warnings.length > 0) warnings.push(...input.decision.warnings);
  if (anomalies.some(a => a.severity === 'medium')) warnings.push('يوجد شذوذ متوسط يحتاج مراجعة قبل التنفيذ النهائي');

  return { allowed: blockingReasons.length === 0, confidence: input.decision.confidence, blockingReasons, warnings };
}
