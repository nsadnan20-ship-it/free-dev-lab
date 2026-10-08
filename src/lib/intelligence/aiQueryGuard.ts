export type QueryIntent = 'metric' | 'trend' | 'forecast' | 'comparison' | 'explanation' | 'report' | 'unknown';
export type GuardStatus = 'ALLOW' | 'ALLOW_WITH_WARNING' | 'BLOCK';

export interface QueryEvidence {
  sourceId: string;
  label: string;
  value?: unknown;
  confidence?: number;
  freshnessAt?: string;
}

export interface GuardDecision {
  status: GuardStatus;
  intent: QueryIntent;
  reasons: string[];
  evidenceRequired: boolean;
}

const intents: Array<[QueryIntent, RegExp]> = [
  ['forecast', /(توقع|تنبؤ|forecast|predict)/i],
  ['comparison', /(مقارنة|قارن|compare|versus|vs)/i],
  ['trend', /(اتجاه|ترند|نمو|انخفاض|ارتفاع|trend|growth|decline)/i],
  ['report', /(تقرير|report|جدول|table|export)/i],
  ['metric', /(مبيعات|ربح|هامش|مخزون|سيولة|sales|profit|margin|inventory|cash)/i],
  ['explanation', /(لماذا|سبب|اشرح|why|explain|cause)/i],
];

export function detectQueryIntent(query: string): QueryIntent {
  for (const [intent, pattern] of intents) if (pattern.test(query)) return intent;
  return 'unknown';
}

export function guardAIQuery(input: { query: string; evidence: QueryEvidence[]; confidence?: number; hasDeterministicPlan: boolean }): GuardDecision {
  const intent = detectQueryIntent(input.query);
  const reasons: string[] = [];
  if (!input.query.trim()) return { status: 'BLOCK', intent: 'unknown', reasons: ['الاستعلام فارغ.'], evidenceRequired: true };
  if (!input.hasDeterministicPlan && ['metric', 'trend', 'forecast', 'comparison', 'report'].includes(intent)) {
    reasons.push('لا توجد خطة حتمية للحساب أو الاسترجاع.');
  }
  if (input.evidence.length === 0 && intent !== 'explanation') reasons.push('لا توجد أدلة مصدرية كافية.');
  const lowConfidence = (input.confidence ?? 1) < 0.7 || input.evidence.some(e => (e.confidence ?? 1) < 0.7);
  if (lowConfidence) reasons.push('الثقة أقل من حد القرار 70%.');
  const status: GuardStatus = reasons.some(r => r.includes('لا توجد خطة') || r.includes('لا توجد أدلة')) ? 'BLOCK' : lowConfidence ? 'ALLOW_WITH_WARNING' : 'ALLOW';
  return { status, intent, reasons, evidenceRequired: true };
}

export function buildEvidenceContext(evidence: QueryEvidence[]): string {
  return evidence.map(e => `${e.label}: ${typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}${e.confidence == null ? '' : ` [confidence=${e.confidence.toFixed(2)}]`}`).join('\n');
}
