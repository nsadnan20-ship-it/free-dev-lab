import type { SupabaseClient } from '@supabase/supabase-js';

export const CONTROL_PLANE_IDENTIFIER = 'control-plane';

export interface ControlPlaneHealthInput {
  overallScore: number;
  evidenceScore: number;
  dataQualityScore: number;
  forecastScore: number;
  decisionScore: number;
  trustScore: number;
  criticalBlockerCount?: number;
  evidence?: Record<string, unknown>;
}

export interface EvidenceEdgeInput {
  sourceType: string;
  sourceKey: string;
  targetType: string;
  targetKey: string;
  relation: 'supports' | 'derived_from' | 'contradicts' | 'causes' | 'measures' | 'recommends' | 'blocks';
  weight?: number;
  evidence?: Record<string, unknown>;
}

export class PhaseKLSupabaseRuntime {
  constructor(private readonly client: SupabaseClient) {}

  async recordHealth(input: ControlPlaneHealthInput): Promise<string> {
    const { data, error } = await this.client.rpc('record_control_plane_health', {
      p_overall_score: input.overallScore,
      p_evidence_score: input.evidenceScore,
      p_data_quality_score: input.dataQualityScore,
      p_forecast_score: input.forecastScore,
      p_decision_score: input.decisionScore,
      p_trust_score: input.trustScore,
      p_critical_blocker_count: input.criticalBlockerCount ?? 0,
      p_evidence: input.evidence ?? {},
    });
    if (error) throw error;
    return data as string;
  }

  async recordEvidenceEdge(input: EvidenceEdgeInput): Promise<string> {
    const { data, error } = await this.client.rpc('record_executive_evidence_edge', {
      p_source_type: input.sourceType,
      p_source_key: input.sourceKey,
      p_target_type: input.targetType,
      p_target_key: input.targetKey,
      p_relation: input.relation,
      p_weight: input.weight ?? 1,
      p_evidence: input.evidence ?? {},
    });
    if (error) throw error;
    return data as string;
  }

  async autonomyGate(domainKey: string): Promise<{ domain: string; eligible: boolean; health: number; trust_healthy: boolean; critical_drift: boolean }> {
    const { data, error } = await this.client.rpc('autonomy_runtime_gate', { p_domain_key: domainKey });
    if (error) throw error;
    return data as { domain: string; eligible: boolean; health: number; trust_healthy: boolean; critical_drift: boolean };
  }
}
