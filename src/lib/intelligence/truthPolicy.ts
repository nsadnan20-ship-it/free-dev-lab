export type TruthStatus = 'VERIFIED' | 'QUALIFIED' | 'INSUFFICIENT_DATA' | 'BLOCKED';
export type AnalyticalKind = 'METRIC' | 'FORECAST' | 'SCENARIO' | 'RECOMMENDATION' | 'DECISION' | 'AI_EXPLANATION';

export interface EvidenceItem {
  id: string;
  source: string;
  confidence: number;
  observedAt?: string;
  lineage?: string[];
}

export interface TruthAssessment {
  status: TruthStatus;
  confidence: number;
  reasons: string[];
  evidenceIds: string[];
  canDisplayAsFact: boolean;
  canDriveDecision: boolean;
}

const MIN_EVIDENCE_CONFIDENCE = 0.70;
const DECISION_CONFIDENCE = 0.80;

export function assessTruth(input: {
  kind: AnalyticalKind;
  evidence: EvidenceItem[];
  completeness: number;
  freshness: number;
  deterministic: boolean;
  assumptionsExplicit?: boolean;
  backtested?: boolean;
}): TruthAssessment {
  const reasons: string[] = [];
  const evidenceIds = input.evidence.map(e => e.id);
  if (!input.evidence.length) reasons.push('لا توجد أدلة قابلة للتتبع.');
  if (input.completeness < MIN_EVIDENCE_CONFIDENCE) reasons.push('اكتمال البيانات أقل من 70%.');
  if (input.freshness < MIN_EVIDENCE_CONFIDENCE) reasons.push('حداثة البيانات أقل من 70%.');
  if (input.evidence.some(e => e.confidence < MIN_EVIDENCE_CONFIDENCE)) reasons.push('يوجد مصدر منخفض الثقة.');
  if (!input.deterministic && ['METRIC', 'FORECAST', 'SCENARIO', 'RECOMMENDATION', 'DECISION'].includes(input.kind)) reasons.push('الحساب ليس حتميًا.');
  if (['SCENARIO', 'RECOMMENDATION', 'DECISION'].includes(input.kind) && !input.assumptionsExplicit) reasons.push('الافتراضات غير موضحة.');
  if (input.kind === 'FORECAST' && !input.backtested) reasons.push('التنبؤ لم يثبت باختبار رجعي.');
  const evidenceConfidence = input.evidence.length ? Math.min(...input.evidence.map(e => e.confidence)) : 0;
  const confidence = Math.max(0, Math.min(1, Math.min(evidenceConfidence, input.completeness, input.freshness)));
  const hardBlock = reasons.some(r => r.includes('لا توجد أدلة') || r.includes('الحساب ليس حتميًا'));
  const status: TruthStatus = hardBlock ? 'BLOCKED' : confidence < MIN_EVIDENCE_CONFIDENCE ? 'INSUFFICIENT_DATA' : confidence < DECISION_CONFIDENCE ? 'QUALIFIED' : 'VERIFIED';
  return {
    status,
    confidence,
    reasons,
    evidenceIds,
    canDisplayAsFact: status === 'VERIFIED',
    canDriveDecision: status === 'VERIFIED' && confidence >= DECISION_CONFIDENCE,
  };
}

export function truthfulLabel(assessment: TruthAssessment): string {
  if (assessment.status === 'VERIFIED') return 'موثّق';
  if (assessment.status === 'QUALIFIED') return 'موثّق مع تحفظات';
  if (assessment.status === 'INSUFFICIENT_DATA') return 'بيانات غير كافية';
  return 'محجوب لسلامة النتيجة';
}
