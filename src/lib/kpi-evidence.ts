import { supabase, resolveCurrentCompanyId } from './supabase';

export type KpiEvidenceSnapshot = {
  id: string;
  company_id: string;
  kpi_key: string;
  value: number;
  observed_at: string;
  quality: string;
  source_evidence: Record<string, unknown>;
};

const KPI_EVIDENCE_KEY_BY_METRIC_ID = new Map<string, string>([
  ['metric.net_sales', 'dashboard.total_sales'],
  ['metric.gross_profit', 'dashboard.gross_profit'],
  ['metric.receivables', 'dashboard.receivables'],
  ['metric.payables', 'dashboard.payables'],
  ['metric.inventory_value', 'dashboard.inventory_value'],
]);

const SUPPORTED_EVIDENCE_KEYS = new Set(KPI_EVIDENCE_KEY_BY_METRIC_ID.values());

export function resolveKpiEvidenceKey(metricId: string): string | null {
  if (KPI_EVIDENCE_KEY_BY_METRIC_ID.has(metricId)) return KPI_EVIDENCE_KEY_BY_METRIC_ID.get(metricId) ?? null;
  return SUPPORTED_EVIDENCE_KEYS.has(metricId) ? metricId : null;
}

export async function captureKpiEvidenceSnapshot(metricId: string, asOf = new Date().toISOString().slice(0, 10), months = 6): Promise<KpiEvidenceSnapshot> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const evidenceKey = resolveKpiEvidenceKey(metricId);
  if (!evidenceKey) throw new Error('KPI_EVIDENCE_KEY_NOT_ALLOWED');

  const { data, error } = await supabase.rpc('capture_kpi_evidence_snapshot', {
    p_kpi_key: evidenceKey,
    p_as_of: asOf,
    p_months: months,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('KPI_EVIDENCE_CAPTURE_EMPTY');

  const snapshot = data as Record<string, unknown>;
  if (String(snapshot.company_id ?? '') !== companyId) throw new Error('KPI_EVIDENCE_TENANT_MISMATCH');
  if (String(snapshot.kpi_key ?? '') !== evidenceKey) throw new Error('KPI_EVIDENCE_IDENTITY_MISMATCH');
  if (snapshot.value == null || Number.isNaN(Number(snapshot.value))) throw new Error('KPI_EVIDENCE_VALUE_INVALID');
  if (!snapshot.id || !snapshot.observed_at || !snapshot.quality) throw new Error('KPI_EVIDENCE_PROVENANCE_INCOMPLETE');

  const sourceEvidence = snapshot.source_evidence;
  if (!sourceEvidence || typeof sourceEvidence !== 'object') throw new Error('KPI_EVIDENCE_SOURCE_MISSING');

  return {
    id: String(snapshot.id),
    company_id: companyId,
    kpi_key: evidenceKey,
    value: Number(snapshot.value),
    observed_at: String(snapshot.observed_at),
    quality: String(snapshot.quality),
    source_evidence: sourceEvidence as Record<string, unknown>,
  };
}
