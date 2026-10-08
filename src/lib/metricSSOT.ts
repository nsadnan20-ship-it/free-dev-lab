import { BUSINESS_METRICS, type MetricDefinition } from './semanticMetrics';

export interface MetricContract extends MetricDefinition {
  version: number;
  owner: 'core-data' | 'finance' | 'inventory' | 'sales' | 'forecast' | 'decision';
  decisionSafe: boolean;
  requiredEvidence: string[];
}

export const METRIC_CONTRACTS: MetricContract[] = BUSINESS_METRICS.map(metric => ({
  ...metric,
  version: 1,
  owner: metric.key.includes('inventory') || metric.key.includes('stock') ? 'inventory' : metric.key.includes('cash') || metric.key.includes('receivable') || metric.key.includes('payable') ? 'finance' : metric.key.includes('forecast') ? 'forecast' : 'core-data',
  decisionSafe: metric.status !== 'UNAVAILABLE' && metric.status !== 'INSUFFICIENT_DATA',
  requiredEvidence: metric.source,
}));

export function getMetricContract(key: string): MetricContract | undefined {
  return METRIC_CONTRACTS.find(metric => metric.key === key);
}

export function metricDependencyClosure(key: string): string[] {
  const root = getMetricContract(key);
  if (!root) return [];
  const seen = new Set<string>();
  const walk = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dependency of getMetricContract(name)?.dependencies ?? []) {
      const depMetric = getMetricContract(dependency);
      if (depMetric) walk(depMetric.key);
    }
  };
  walk(key);
  return [...seen];
}

export function validateMetricContract(key: string): { valid: boolean; errors: string[] } {
  const metric = getMetricContract(key);
  if (!metric) return { valid: false, errors: [`Unknown metric: ${key}`] };
  const errors: string[] = [];
  if (!metric.formula.trim()) errors.push('Metric formula is empty.');
  if (metric.source.length === 0) errors.push('Metric has no source lineage.');
  if (metric.version < 1) errors.push('Metric version must be >= 1.');
  if (metric.decisionSafe && (metric.status === 'UNAVAILABLE' || metric.status === 'INSUFFICIENT_DATA')) errors.push('Decision-safe metric has an unsafe status.');
  return { valid: errors.length === 0, errors };
}
