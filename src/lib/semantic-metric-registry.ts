import { BUSINESS_METRICS, type MetricDefinition } from './semanticMetrics.ts';

export type MetricCertificationStatus = 'DRAFT' | 'REVIEWED' | 'CERTIFIED' | 'DEPRECATED';
export type MetricTimeSemantic = 'transaction' | 'posting' | 'delivery' | 'snapshot' | 'generated';

export interface SemanticMetricRegistryEntry extends MetricDefinition {
  metricId: string;
  version: number;
  owner: string;
  certificationStatus: MetricCertificationStatus;
  timeSemantic: MetricTimeSemantic;
  freshness: string;
  consumers: string[];
  tests: string[];
  evidence: string[];
}

/** Canonical governance metadata layered over BUSINESS_METRICS without duplicating formulas. */
export const SEMANTIC_METRIC_REGISTRY: SemanticMetricRegistryEntry[] = BUSINESS_METRICS.map(metric => ({
  ...metric,
  metricId: `metric.${metric.key}`,
  version: 1,
  owner: metric.key.includes('inventory') || metric.key.includes('stock') ? 'inventory' : metric.key.includes('cash') || metric.key.includes('receivable') || metric.key.includes('payable') ? 'finance' : metric.key.includes('forecast') ? 'forecast' : 'core-data',
  certificationStatus: metric.status === 'UNAVAILABLE' || metric.status === 'INSUFFICIENT_DATA' ? 'DRAFT' : 'REVIEWED',
  timeSemantic: metric.key.includes('inventory') || metric.key.includes('stock') ? 'snapshot' : 'transaction',
  freshness: 'source-derived',
  consumers: ['dashboard', 'reports', 'chatbi', 'forecast', 'recommendations', 'decision-engine'],
  tests: [`metric-contract:${metric.key}`],
  evidence: metric.source,
}));

export function getSemanticMetric(metricId: string): SemanticMetricRegistryEntry | undefined {
  return SEMANTIC_METRIC_REGISTRY.find(metric => metric.metricId === metricId || metric.key === metricId);
}

export function validateSemanticMetricRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const metric of SEMANTIC_METRIC_REGISTRY) {
    if (ids.has(metric.metricId)) errors.push(`Duplicate metricId: ${metric.metricId}`);
    ids.add(metric.metricId);
    if (!metric.key || !metric.formula.trim()) errors.push(`Missing identity/formula: ${metric.metricId}`);
    if (metric.source.length === 0 || metric.evidence.length === 0) errors.push(`Missing lineage/evidence: ${metric.metricId}`);
    if (metric.version < 1) errors.push(`Invalid version: ${metric.metricId}`);
    if (metric.consumers.length === 0) errors.push(`Missing consumers: ${metric.metricId}`);
    if (metric.tests.length === 0) errors.push(`Missing tests: ${metric.metricId}`);
  }
  return errors;
}
