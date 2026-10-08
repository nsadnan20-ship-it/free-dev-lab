import { supabase, resolveCurrentCompanyId } from '../supabase';

export type RuntimeApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type RuntimeWorkStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';

export interface RuntimeRecommendationInput {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  evidenceSnapshotId: string;
  evidence: Record<string, unknown>;
  expectedImpact: number | null;
  metricVersions: Record<string, number>;
}

export interface RuntimeDecisionInput {
  decisionKey: string;
  decisionType: string;
  confidence: number | null;
  expectedImpact: number | null;
  evidence: Record<string, unknown>;
}

export interface RuntimeWorkItemInput {
  department: string;
  assigneeId?: string;
  assigneeLabel?: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueAt?: string;
  expectedImpact: number;
  evidenceRefs: string[];
}

export interface RuntimeRecommendationEvidence {
  evidence: Record<string, unknown> | null;
  evidenceSnapshotId: string | null;
  metricVersions: Record<string, number>;
}

export interface RuntimeDecisionContext {
  decision: {
    id: string;
    recommendationId: string | null;
    status: string;
    confidence: number | null;
    expectedImpact: number | null;
    evidence: Record<string, unknown>;
    createdAt: string;
  } | null;
  approval: {
    id: string;
    status: RuntimeApprovalStatus;
    requestedBy: string | null;
    requestedAt: string;
    decidedBy: string | null;
    decidedAt: string | null;
    reason: string | null;
  } | null;
}

async function companyIdOrThrow(): Promise<string> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_CONTEXT_REQUIRED');
  return companyId;
}

export async function createRuntimeRecommendation(input: RuntimeRecommendationInput): Promise<string> {
  await companyIdOrThrow();
  const { data, error } = await supabase.rpc('create_runtime_recommendation', {
    p_category: input.category,
    p_priority: input.priority,
    p_title: input.title,
    p_description: input.description ?? null,
    p_evidence: input.evidence,
    p_expected_impact: input.expectedImpact,
    p_evidence_snapshot_id: input.evidenceSnapshotId,
    p_metric_versions: input.metricVersions,
  });
  if (error) throw error;
  return data as string;
}

export async function loadRuntimeRecommendationEvidence(recommendationId: string): Promise<RuntimeRecommendationEvidence> {
  const companyId = await companyIdOrThrow();
  const { data, error } = await supabase
    .from('recommendations')
    .select('evidence,evidence_snapshot_id,metric_versions')
    .eq('id', recommendationId)
    .eq('company_id', companyId)
    .single();
  if (error) throw error;
  return {
    evidence: data?.evidence && typeof data.evidence === 'object' ? data.evidence as Record<string, unknown> : null,
    evidenceSnapshotId: data?.evidence_snapshot_id ? String(data.evidence_snapshot_id) : null,
    metricVersions: data?.metric_versions && typeof data.metric_versions === 'object'
      ? Object.fromEntries(Object.entries(data.metric_versions as Record<string, unknown>).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => [key, Number(value)]))
      : {},
  };
}

export async function createRuntimeDecision(input: RuntimeDecisionInput): Promise<string> {
  await companyIdOrThrow();
  if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) throw new Error('DECISION_CONFIDENCE_OUT_OF_RANGE');
  const { data, error } = await supabase.rpc('create_runtime_decision', {
    p_decision_key: input.decisionKey,
    p_decision_type: input.decisionType,
    p_confidence: input.confidence,
    p_expected_impact: input.expectedImpact,
    p_evidence: input.evidence,
  });
  if (error) throw error;
  return data as string;
}

export async function linkRecommendationToDecision(recommendationId: string, decisionId: string): Promise<void> {
  const { error } = await supabase.rpc('link_recommendation_to_decision', {
    p_recommendation_id: recommendationId,
    p_decision_id: decisionId,
  });
  if (error) throw error;
}

export async function requestRuntimeApproval(decisionId: string, reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_decision_approval', { p_decision_id: decisionId, p_reason: reason ?? null });
  if (error) throw error;
  return data as string;
}

export async function loadRuntimeDecisionContext(recommendationId: string): Promise<RuntimeDecisionContext> {
  const companyId = await companyIdOrThrow();
  const { data: linkedDecisions, error: linkedDecisionError } = await supabase
    .from('business_intelligence_decisions')
    .select('id,recommendation_id,status,confidence,expected_impact,evidence,created_at')
    .eq('company_id', companyId)
    .eq('recommendation_id', recommendationId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (linkedDecisionError) throw linkedDecisionError;

  let decisions = linkedDecisions ?? [];
  if (!decisions.length) {
    const { data: keyedDecisions, error: keyedDecisionError } = await supabase
      .from('business_intelligence_decisions')
      .select('id,recommendation_id,status,confidence,expected_impact,evidence,created_at')
      .eq('company_id', companyId)
      .eq('decision_key', 'recommendation:' + recommendationId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (keyedDecisionError) throw keyedDecisionError;
    decisions = keyedDecisions ?? [];
  }

  const decision = decisions?.[0]
    ? {
        id: String(decisions[0].id),
        recommendationId: decisions[0].recommendation_id ? String(decisions[0].recommendation_id) : null,
        status: String(decisions[0].status),
        confidence: decisions[0].confidence == null ? null : Number(decisions[0].confidence),
        expectedImpact: decisions[0].expected_impact == null ? null : Number(decisions[0].expected_impact),
        evidence: decisions[0].evidence && typeof decisions[0].evidence === 'object'
          ? decisions[0].evidence as Record<string, unknown>
          : {},
        createdAt: String(decisions[0].created_at),
      }
    : null;
  if (!decision) return { decision: null, approval: null };

  const { data: approvals, error: approvalError } = await supabase
    .from('decision_approvals')
    .select('id,status,requested_by,requested_at,decided_by,decided_at,reason')
    .eq('company_id', companyId)
    .eq('decision_id', decision.id)
    .order('requested_at', { ascending: false })
    .limit(1);
  if (approvalError) throw approvalError;
  const approval = approvals?.[0]
    ? {
        id: String(approvals[0].id),
        status: String(approvals[0].status) as RuntimeApprovalStatus,
        requestedBy: approvals[0].requested_by ? String(approvals[0].requested_by) : null,
        requestedAt: String(approvals[0].requested_at),
        decidedBy: approvals[0].decided_by ? String(approvals[0].decided_by) : null,
        decidedAt: approvals[0].decided_at ? String(approvals[0].decided_at) : null,
        reason: approvals[0].reason ? String(approvals[0].reason) : null,
      }
    : null;

  return { decision, approval };
}

export async function decideRuntimeApproval(approvalId: string, approve: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('decide_approval', { p_approval_id: approvalId, p_approve: approve, p_reason: reason ?? null });
  if (error) throw error;
}

export async function createRuntimeWorkItem(decisionId: string, recommendationId: string | null, input: RuntimeWorkItemInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_decision_work_item', {
    p_decision_id: decisionId,
    p_recommendation_id: recommendationId,
    p_department: input.department,
    p_assignee_id: input.assigneeId ?? null,
    p_assignee_label: input.assigneeLabel ?? null,
    p_title: input.title,
    p_description: input.description ?? null,
    p_priority: input.priority,
    p_due_at: input.dueAt ?? null,
    p_expected_impact: input.expectedImpact,
    p_evidence_refs: input.evidenceRefs,
  });
  if (error) throw error;
  return data as string;
}

export async function startRuntimeWorkItem(workItemId: string): Promise<void> {
  const { error } = await supabase.rpc('start_decision_work_item', { p_work_item_id: workItemId });
  if (error) throw error;
}

export async function notifyWorkItem(workItemId: string, title: string, description: string): Promise<string> {
  await companyIdOrThrow();
  const { data, error } = await supabase.rpc('notify_decision_work_item', {
    p_work_item_id: workItemId,
    p_title: title,
    p_description: description,
  });
  if (error) throw error;
  return data as string;
}

export async function completeRuntimeWorkItem(workItemId: string, actualImpact: number, evidence: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.rpc('complete_decision_work_item', {
    p_work_item_id: workItemId,
    p_actual_impact: actualImpact,
    p_evidence: evidence,
  });
  if (error) throw error;
}

export async function loadRuntimeOutcome(workItemId: string): Promise<{ expectedImpact: number | null; actualImpact: number | null; status: string } | null> {
  const companyId = await companyIdOrThrow();
  const { data, error } = await supabase.from('decision_work_items')
    .select('expected_impact,actual_impact,status')
    .eq('id', workItemId).eq('company_id', companyId).single();
  if (error) throw error;
  return data ? { expectedImpact: data.expected_impact, actualImpact: data.actual_impact, status: data.status } : null;
}
