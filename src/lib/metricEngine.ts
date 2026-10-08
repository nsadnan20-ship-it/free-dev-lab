import { BUSINESS_METRICS, type MetricDefinition, type MetricStatus } from './semanticMetrics';
import type { ReportFact } from './free-toolbox/report-facts';

export interface MetricEvaluation {
  key: string;
  definition: MetricDefinition;
  value: number | null;
  status: MetricStatus;
  confidence: number;
  updatedAt?: string | null;
  sourceRows?: number;
  warnings: string[];
  fact: ReportFact;
}

export interface MetricInput {
  key: string;
  value: number | null | undefined;
  confidence?: number;
  status?: MetricStatus;
  updatedAt?: string | null;
  sourceRows?: number;
  warnings?: string[];
}

export function evaluateMetric(input: MetricInput): MetricEvaluation {
  const definition = BUSINESS_METRICS.find(metric => metric.key === input.key);
  if (!definition) throw new Error(`Unknown metric: ${input.key}`);

  const warnings = [...(input.warnings ?? [])];
  const numeric = input.value != null && Number.isFinite(Number(input.value)) ? Number(input.value) : null;
  let status = input.status ?? definition.status;
  let confidence = Math.max(0, Math.min(1, input.confidence ?? (numeric == null ? 0 : 1)));

  if (numeric == null) {
    status = 'UNAVAILABLE';
    confidence = 0;
    warnings.push('القيمة غير متاحة أو غير رقمية.');
  } else if (input.sourceRows !== undefined && input.sourceRows <= 0) {
    status = 'INSUFFICIENT_DATA';
    confidence = 0;
    warnings.push('لا توجد صفوف مصدر كافية لإثبات المؤشر.');
  } else if (confidence < 0.7 && status !== 'FORECAST' && status !== 'ESTIMATED') {
    warnings.push('الثقة أقل من حد العرض الموثوق.');
  }

  const fact: ReportFact = {
    key: input.key,
    value: numeric,
    unit: definition.unit,
    confidence,
    source: status === 'FORECAST' ? 'forecast' : status === 'ESTIMATED' ? 'derived' : 'derived',
  };

  return { key: input.key, definition, value: numeric, status, confidence, updatedAt: input.updatedAt, sourceRows: input.sourceRows, warnings, fact };
}

export function evaluateMetricBatch(inputs: MetricInput[]): MetricEvaluation[] {
  return inputs.map(evaluateMetric);
}

export function metricCanDriveDecision(metric: MetricEvaluation): boolean {
  return metric.value !== null && metric.confidence >= 0.7 && metric.status !== 'UNAVAILABLE' && metric.status !== 'INSUFFICIENT_DATA';
}

export function metricDisplayValue(metric: MetricEvaluation): string {
  if (metric.value === null) return 'غير متوفر';
  return new Intl.NumberFormat('ar', { maximumFractionDigits: 2 }).format(metric.value);
}
