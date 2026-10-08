import { supabase, resolveCurrentCompanyId } from '../supabase';
import { recordOutcome } from './outcome-feedback-core';
export type { OutcomeLabel, DecisionOutcome, OutcomeQuality } from './outcome-feedback-core';
export { recordOutcome, summarizeOutcomes } from './outcome-feedback-core';
import type { DecisionOutcome, OutcomeLabel } from './outcome-feedback-core';

function validateOutcome(outcome: DecisionOutcome): void { recordOutcome([], outcome); }

export async function persistOutcome(outcome: DecisionOutcome): Promise<void> {
  validateOutcome(outcome);
  const companyId = await resolveCurrentCompanyId();
  if (!companyId || companyId !== outcome.tenantId) throw new Error('OUTCOME_TENANT_CONTEXT_MISMATCH');
  const status = outcome.label === 'correct' ? 'positive' : outcome.label === 'incorrect' ? 'negative' : outcome.label === 'partial' ? 'neutral' : 'insufficient';
  const { error } = await supabase.rpc('record_recommendation_outcome', {
    p_recommendation_key: outcome.decisionFingerprint,
    p_observed_at: outcome.observedAt,
    p_expected_impact: outcome.expectedValue ?? null,
    p_actual_impact: outcome.actualValue ?? null,
    p_outcome_quality: outcome.label === 'correct' ? 1 : outcome.label === 'partial' ? 0.5 : outcome.label === 'incorrect' ? 0 : null,
    p_status: status,
    p_decision_id: outcome.actionId ?? null,
    p_evidence: { evidence_snapshot_id: outcome.evidenceSnapshotId, notes: outcome.notes ?? null, impact_value: outcome.impactValue ?? null },
  });
  if (error) throw error;
}

export async function loadPersistedOutcomes(tenantId: string): Promise<DecisionOutcome[]> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId || companyId !== tenantId) throw new Error('OUTCOME_TENANT_CONTEXT_MISMATCH');
  const { data, error } = await supabase.from('recommendation_outcomes').select('company_id, recommendation_key, decision_id, observed_at, expected_impact, actual_impact, outcome_quality, status, evidence').eq('company_id', companyId).order('observed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(row => {
    const evidence = row.evidence as { evidence_snapshot_id?: string; notes?: string | null; impact_value?: number | null } | null;
    const label: OutcomeLabel = row.status === 'positive' ? 'correct' : row.status === 'negative' ? 'incorrect' : row.status === 'neutral' ? 'partial' : 'unknown';
    return { tenantId: row.company_id, decisionFingerprint: row.recommendation_key, evidenceSnapshotId: evidence?.evidence_snapshot_id ?? '', actionId: row.decision_id ?? undefined, observedAt: row.observed_at, label, actualValue: row.actual_impact ?? undefined, expectedValue: row.expected_impact ?? undefined, impactValue: evidence?.impact_value ?? undefined, notes: evidence?.notes ?? undefined };
  }).filter(row => Boolean(row.evidenceSnapshotId));
}
