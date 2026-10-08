import { classifyValueState, type CanonicalValue } from './universalDataContract';

export interface QualityDimension { key: 'completeness' | 'consistency' | 'uniqueness' | 'validity' | 'freshness'; score: number; issues: string[]; }
export interface DataQualityReport { score: number; dimensions: QualityDimension[]; blocking: boolean; reasons: string[]; }

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function assessCompleteness(values: unknown[]): QualityDimension {
  if (!values.length) return { key: 'completeness', score: 0, issues: ['لا توجد قيم لتقييم الاكتمال.'] };
  const missing = values.filter(v => classifyValueState(v) === 'MISSING').length;
  const unknown = values.filter(v => classifyValueState(v) === 'UNKNOWN').length;
  const score = clamp(100 - ((missing + unknown * 0.5) / values.length) * 100);
  return { key: 'completeness', score, issues: missing ? [`${missing} قيمة مفقودة.`] : [] };
}

export function assessUniqueness(keys: string[]): QualityDimension {
  if (!keys.length) return { key: 'uniqueness', score: 0, issues: ['لا توجد مفاتيح للتحقق من التكرار.'] };
  const seen = new Set<string>(); let duplicates = 0;
  for (const key of keys.map(v => v.trim()).filter(Boolean)) { if (seen.has(key)) duplicates++; else seen.add(key); }
  return { key: 'uniqueness', score: clamp(100 - (duplicates / keys.length) * 100), issues: duplicates ? [`${duplicates} مفتاحًا مكررًا.`] : [] };
}

export function assessValidity(values: CanonicalValue<unknown>[]): QualityDimension {
  if (!values.length) return { key: 'validity', score: 0, issues: ['لا توجد قيم موثقة للتحقق.'] };
  const invalid = values.filter(v => v.state === 'UNKNOWN' || v.confidence < 0.5).length;
  return { key: 'validity', score: clamp(100 - (invalid / values.length) * 100), issues: invalid ? [`${invalid} قيمة تحتاج مراجعة أو ثقة أعلى.`] : [] };
}

export function buildDataQualityReport(dimensions: QualityDimension[]): DataQualityReport {
  const score = dimensions.length ? dimensions.reduce((sum, d) => sum + clamp(d.score), 0) / dimensions.length : 0;
  const reasons = dimensions.flatMap(d => d.issues);
  return { score: Math.round(score * 100) / 100, dimensions, blocking: score < 70, reasons: [...new Set(reasons)] };
}
