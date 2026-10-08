import { supabase, resolveCurrentCompanyId } from './supabase';
import { getAuthenticatedUser } from './auth-session';
import { createRuntimeRecommendation, createRuntimeDecision, linkRecommendationToDecision } from './decision-automation/vertical-slice-runtime';

export type SourceDecisionProposal = {
  id: string;
  status: string;
  decisionKey: string;
  recommendationId: string | null;
};
export type SourceRecommendationContext = {
  action: string;
  why: string;
  whyNow: string;
  expectedOutcome: string;
  owner: string | null;
  impact: string;
  measurement: string;
  risk: string;
  blocker: string;
  limitation: string;
};


export async function createSourceDecisionProposal(input: {
  reportJobId: string;
  sourceHash: string;
  signalId: string;
  signalTitle: string;
  signalMessage: string;
  severity: string;
  evidence: string[];
  evidenceSnapshotId: string;
  recommendationContext?: SourceRecommendationContext | null;
}): Promise<SourceDecisionProposal> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');
  if (!input.evidenceSnapshotId.trim()) throw new Error('SOURCE_EVIDENCE_SNAPSHOT_REQUIRED');

  const { data: passport, error: passportError } = await supabase
    .from('report_evidence_passports')
    .select('id,evidence_snapshot_id,verification_status,decision_readiness,report_execution_job_id,source_hash')
    .eq('company_id', companyId)
    .eq('report_execution_job_id', input.reportJobId)
    .eq('source_hash', input.sourceHash)
    .eq('evidence_snapshot_id', input.evidenceSnapshotId)
    .eq('verification_status', 'VERIFIED')
    .eq('decision_readiness', 'READY')
    .maybeSingle();

  if (passportError) throw passportError;
  if (!passport?.id) throw new Error('SOURCE_EVIDENCE_PASSPORT_REQUIRED');

  const decisionKey = [
    'source-intelligence',
    input.reportJobId,
    input.sourceHash,
    input.signalId,
  ].join(':');

  const evidence = {
    type: 'SOURCE_INTELLIGENCE_SIGNAL',
    sourceDecisionKey: decisionKey,
    reportExecutionJobId: input.reportJobId,
    sourceHash: input.sourceHash,
    signalId: input.signalId,
    signalTitle: input.signalTitle,
    signalMessage: input.signalMessage,
    severity: input.severity,
    evidence: input.evidence,
    evidenceSnapshotId: input.evidenceSnapshotId,
    evidencePassportId: String(passport.id),
    decisionBoundary: 'PROPOSED_ONLY',
    confidence: null,
    confidenceSemantics: 'NOT_ASSESSED',
    expectedImpactStatus: 'NOT_AVAILABLE',
    recommendationContext: input.recommendationContext ?? null,
  };

  const { data, error } = await supabase.rpc('create_source_intelligence_proposal', {
    p_report_job_id: input.reportJobId,
    p_source_hash: input.sourceHash,
    p_signal_id: input.signalId,
    p_signal_title: input.signalTitle,
    p_signal_message: input.signalMessage,
    p_severity: input.severity,
    p_evidence: evidence,
    p_evidence_snapshot_id: input.evidenceSnapshotId,
  });
  if (error) throw error;
  const proposal = Array.isArray(data) ? data[0] : data;
  if (!proposal?.decision_id) throw new Error('SOURCE_PROPOSAL_DECISION_ID_MISSING');

  const recommendationId = proposal.recommendation_id == null ? null : String(proposal.recommendation_id);

  return {
    id: String(proposal.decision_id),
    status: String(proposal.decision_status ?? 'PROPOSED'),
    decisionKey,
    recommendationId,
  };
}

export type SourceDecisionState = SourceDecisionProposal & {
  recommendationTitle: string | null;
  recommendationStatus: string | null;
  recommendationEvidenceSnapshotId: string | null;
  signalId: string | null;
  signalTitle: string | null;
  signalSeverity: string | null;
  signalMessage: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  workItemId: string | null;
  workItemStatus: string | null;
  outcomeId: string | null;
  outcomeEvidenceSnapshotId: string | null;
  outcomeStatus: string | null;
  outcomeQuality: number | null;
  expectedImpact: number | null;
  actualImpact: number | null;
  observedAt: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  approvalRequestedBy: string | null;
  approvalDecidedBy: string | null;
};

export async function fetchSourceDecisionProposals(sourceHash: string, reportJobId: string): Promise<SourceDecisionState[]> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');
  const normalizedHash = sourceHash.trim();
  const normalizedJobId = reportJobId.trim();
  if (!normalizedHash || !normalizedJobId) throw new Error('INVALID_REPORT_CONTEXT');

  const { data, error } = await supabase
    .from('business_intelligence_decisions')
    .select('id,decision_key,status,created_at,approved_at,approved_by,recommendation_id,evidence')
    .eq('company_id', companyId)
    .like('decision_key', 'source-intelligence:' + normalizedJobId + ':' + normalizedHash + ':%')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const decisionRows = (data ?? []).filter((row) => {
    const evidence = row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {};
    return String(evidence.reportExecutionJobId ?? '') === normalizedJobId
      && String(evidence.sourceHash ?? '') === normalizedHash;
  });
  const decisionIds = decisionRows.map((row) => String(row.id));

  const recommendationIds = decisionRows
    .map((row) => row.recommendation_id)
    .filter((id): id is string => Boolean(id));

  const { data: recommendationRows, error: recommendationError } = recommendationIds.length
    ? await supabase
        .from('recommendations')
        .select('id,title,status,evidence_snapshot_id')
        .eq('company_id', companyId)
        .in('id', recommendationIds)
    : { data: [], error: null };

  if (recommendationError) throw recommendationError;

  const recommendationById = new Map<string, {
    title: string | null;
    status: string | null;
    evidenceSnapshotId: string | null;
  }>();

  for (const recommendation of recommendationRows ?? []) {
    recommendationById.set(String(recommendation.id), {
      title: recommendation.title == null ? null : String(recommendation.title),
      status: recommendation.status == null ? null : String(recommendation.status),
      evidenceSnapshotId: recommendation.evidence_snapshot_id == null ? null : String(recommendation.evidence_snapshot_id),
    });
  }
  const { data: workRows, error: workError } = decisionIds.length
    ? await supabase
        .from('decision_work_items')
        .select('id,decision_id,status')
        .eq('company_id', companyId)
        .in('decision_id', decisionIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null };

  if (workError) throw workError;

  const workByDecision = new Map<string, { id: string; status: string }>();
  for (const work of workRows ?? []) {
    const decisionId = String(work.decision_id);
    if (!workByDecision.has(decisionId)) {
      workByDecision.set(decisionId, { id: String(work.id), status: String(work.status ?? 'OPEN') });
    }
  }

  const { data: outcomes, error: outcomeError } = decisionIds.length
    ? await supabase
        .from('recommendation_outcomes')
        .select('id,decision_id,status,outcome_quality,expected_impact,actual_impact,observed_at,evidence')
        .eq('company_id', companyId)
        .in('decision_id', decisionIds)
        .order('observed_at', { ascending: false })
    : { data: [], error: null };

  if (outcomeError) throw outcomeError;
  const { data: approvals, error: approvalError } = decisionIds.length
    ? await supabase
        .from('decision_approvals')
        .select('id,decision_id,status,requested_by,decided_by')
        .eq('company_id', companyId)
        .in('decision_id', decisionIds)
        .order('requested_at', { ascending: false })
    : { data: [], error: null };

  if (approvalError) throw approvalError;

  const approvalByDecision = new Map();
  for (const approval of approvals ?? []) {
    const decisionId = String(approval.decision_id);
    if (!approvalByDecision.has(decisionId)) {
      approvalByDecision.set(decisionId, {
        id: String(approval.id),
        status: String(approval.status ?? 'PENDING'),
        requestedBy: approval.requested_by == null ? null : String(approval.requested_by),
        decidedBy: approval.decided_by == null ? null : String(approval.decided_by),
      });
    }
  }

  const outcomeByDecision = new Map<string, {
    id: string;
    status: string;
    outcomeQuality: number | null;
    evidenceSnapshotId: string | null;
    expectedImpact: number | null;
    actualImpact: number | null;
    observedAt: string | null;
  }>();

  for (const outcome of outcomes ?? []) {
    const decisionId = String(outcome.decision_id);
    if (!outcomeByDecision.has(decisionId)) {
      const outcomeEvidence = outcome.evidence && typeof outcome.evidence === 'object'
        ? outcome.evidence as Record<string, unknown>
        : {};
      outcomeByDecision.set(decisionId, {
        id: String(outcome.id),
        status: String(outcome.status ?? 'insufficient'),
        evidenceSnapshotId: outcomeEvidence.evidence_snapshot_id == null ? null : String(outcomeEvidence.evidence_snapshot_id),
        outcomeQuality: outcome.outcome_quality == null ? null : Number(outcome.outcome_quality),
        expectedImpact: outcome.expected_impact == null ? null : Number(outcome.expected_impact),
        actualImpact: outcome.actual_impact == null ? null : Number(outcome.actual_impact),
        observedAt: outcome.observed_at == null ? null : String(outcome.observed_at),
      });
    }
  }

  return decisionRows.map((row) => {
    const evidence = row.evidence && typeof row.evidence === 'object'
      ? row.evidence as Record<string, unknown>
      : {};
    const work = workByDecision.get(String(row.id));
    const outcome = outcomeByDecision.get(String(row.id));
    const recommendation = row.recommendation_id == null ? null : recommendationById.get(String(row.recommendation_id));
    return {
      id: String(row.id),
      status: String(row.status ?? 'PROPOSED'),
      recommendationTitle: recommendation?.title ?? null,
      recommendationStatus: recommendation?.status ?? null,
      recommendationEvidenceSnapshotId: recommendation?.evidenceSnapshotId ?? null,
      decisionKey: String(row.decision_key),
      recommendationId: row.recommendation_id == null ? null : String(row.recommendation_id),
      signalId: evidence.signalId == null ? null : String(evidence.signalId),
      signalTitle: evidence.signalTitle == null ? null : String(evidence.signalTitle),
      signalSeverity: evidence.severity == null ? null : String(evidence.severity),
      signalMessage: evidence.signalMessage == null ? null : String(evidence.signalMessage),
      createdAt: row.created_at == null ? null : String(row.created_at),
      approvedAt: row.approved_at == null ? null : String(row.approved_at),
      approvedBy: row.approved_by == null ? null : String(row.approved_by),
      workItemId: work?.id ?? null,
      workItemStatus: work?.status ?? null,
      outcomeId: outcome?.id ?? null,
      outcomeEvidenceSnapshotId: outcome?.evidenceSnapshotId ?? null,
      outcomeStatus: outcome?.status ?? null,
      outcomeQuality: outcome?.outcomeQuality ?? null,
      expectedImpact: outcome?.expectedImpact ?? null,
      actualImpact: outcome?.actualImpact ?? null,
      observedAt: outcome?.observedAt ?? null,
      approvalId: approvalByDecision.get(String(row.id))?.id ?? null,
      approvalStatus: approvalByDecision.get(String(row.id))?.status ?? null,
      approvalRequestedBy: approvalByDecision.get(String(row.id))?.requestedBy ?? null,
      approvalDecidedBy: approvalByDecision.get(String(row.id))?.decidedBy ?? null,
    };
  });
}

export type DecisionAuditTrace = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  source: string | null;
  userLabel: string | null;
  createdAt: string;
};

export async function fetchSourceDecisionAuditTrace(
  decisionId: string,
  approvalId?: string | null,
  workItemId?: string | null,
  outcomeId?: string | null,
): Promise<DecisionAuditTrace[]> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const entityIds = [decisionId, approvalId, workItemId, outcomeId].filter((value): value is string => Boolean(value));
  if (!entityIds.length) return [];

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,action,entity_type,entity_id,source,user_label,created_at')
    .eq('company_id', companyId)
    .in('entity_id', entityIds)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    action: String(row.action ?? ''),
    entityType: String(row.entity_type ?? ''),
    entityId: String(row.entity_id ?? ''),
    source: row.source == null ? null : String(row.source),
    userLabel: row.user_label == null ? null : String(row.user_label),
    createdAt: String(row.created_at),
  }));
}

export async function requestSourceDecisionApproval(decisionId: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_decision_approval', {
    p_decision_id: decisionId,
    p_reason: reason,
  });
  if (error) throw error;
  return String(data);
}

export async function decideSourceDecisionApproval(decisionApprovalId: string, approve: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('decide_approval', {
    p_approval_id: decisionApprovalId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}


function workItemPriority(severity: string | null): string {
  if (severity === 'critical') return 'CRITICAL';
  if (severity === 'high') return 'HIGH';
  if (severity === 'low' || severity === 'info') return 'LOW';
  return 'MEDIUM';
}

export async function createApprovedDecisionWorkItemForCurrentUser(input: {
  decisionId: string;
  reportJobId: string;
  sourceHash: string;
  signalTitle: string;
  signalMessage: string | null;
  signalSeverity: string | null;
  recommendationId: string | null;
  evidenceSnapshotId: string | null;
  department: string;
  dueAt?: string | null;
}): Promise<string> {
  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error('AUTHENTICATED_USER_REQUIRED');

  const evidenceRefs = [
    {
      type: 'SOURCE_REPORT',
      reportExecutionJobId: input.reportJobId,
      sourceHash: input.sourceHash,
      decisionId: input.decisionId,
      recommendationId: input.recommendationId,
      evidenceSnapshotId: input.evidenceSnapshotId,
    },
    ...(input.signalMessage ? [{ type: 'SIGNAL', message: input.signalMessage }] : []),
  ];

  const { data, error } = await supabase.rpc('create_decision_work_item', {
    p_decision_id: input.decisionId,
    p_recommendation_id: input.recommendationId ?? null,
    p_department: input.department || 'تشغيل',
    p_assignee_id: user.id,
    p_assignee_label: user.email || user.id,
    p_title: input.signalTitle,
    p_description: 'عنصر عمل ناشئ من قرار مصدرّي موافق عليه. ارجع إلى التقرير والبصمة الأصلية قبل التنفيذ.',
    p_priority: workItemPriority(input.signalSeverity),
    p_due_at: input.dueAt ?? null,
    p_expected_impact: null,
    p_evidence_refs: evidenceRefs,
  });

  if (error) throw error;
  const workItemId = String(data);

  try {
    await supabase.rpc('notify_decision_work_item', {
      p_work_item_id: workItemId,
      p_title: 'عنصر عمل جديد من تقرير مصدرّي',
      p_description: input.signalTitle + ' — افتح التقرير والبصمة الأصلية قبل التنفيذ.',
    });
  } catch {
    // Notification failure must not roll back the persisted work item.
  }

  return workItemId;
}


export async function startSourceDecisionWorkItem(workItemId: string): Promise<void> {
  const { error } = await supabase.rpc('start_decision_work_item', {
    p_work_item_id: workItemId,
  });
  if (error) throw error;
}

export async function completeSourceDecisionWorkItem(input: {
  workItemId: string;
  actualImpact: number | null;
  evidenceSnapshotId: string;
  reportJobId: string;
  sourceHash: string;
}): Promise<void> {
  if (!input.evidenceSnapshotId.trim()) throw new Error('WORK_ITEM_EVIDENCE_SNAPSHOT_REQUIRED');

  const evidence = {
    evidence_snapshot_id: input.evidenceSnapshotId,
    reportExecutionJobId: input.reportJobId,
    sourceHash: input.sourceHash,
    completionBoundary: 'PERSISTED_OUTCOME',
  };

  const { error } = await supabase.rpc('complete_decision_work_item', {
    p_work_item_id: input.workItemId,
    p_actual_impact: input.actualImpact,
    p_evidence: evidence,
  });

  if (error) throw error;
}


export type AdvisorBusinessCase = {
  id: string;
  companyId: string;
  decisionKey: string;
  decisionId: string;
  status: string;
  followed: boolean;
  issue: string;
  question: string;
  why: string;
  impact: string;
  evidence: string[];
  whatNext: string;
  recommendation: string;
  priority: string;
  priorityReason: string[];
  owner: string;
  expectedOutcome: string;
  sourceHash: string;
  reportJobId: string;
  signalId: string;
  signalTitle: string;
  createdAt: string;
  updatedAt: string;
};

type AdvisorBusinessCaseInput = Omit<AdvisorBusinessCase, 'id' | 'companyId' | 'status' | 'followed' | 'createdAt' | 'updatedAt'> & {
  followed?: boolean;
};

function portfolioStatusForPriority(priority: string): string {
  if (priority === 'P0') return 'ready';
  if (priority === 'P1') return 'ready';
  return 'candidate';
}

function parseAdvisorCase(row: Record<string, unknown>): AdvisorBusinessCase | null {
  const evidence = row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {};
  if (evidence.type !== 'ADVISOR_BUSINESS_CASE') return null;
  const caseData = evidence.case && typeof evidence.case === 'object' ? evidence.case as Record<string, unknown> : {};
  const decisionId = String(caseData.decisionId ?? '');
  const sourceHash = String(caseData.sourceHash ?? '');
  const reportJobId = String(caseData.reportJobId ?? '');
  if (!decisionId || !sourceHash || !reportJobId) return null;
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    decisionKey: String(row.decision_key),
    decisionId,
    status: String(row.status ?? 'candidate'),
    followed: Boolean(caseData.followed),
    issue: String(caseData.issue ?? caseData.signalTitle ?? 'قضية Advisor'),
    question: String(caseData.question ?? 'سؤال الأعمال غير متاح'),
    why: String(caseData.why ?? ''),
    impact: String(caseData.impact ?? ''),
    evidence: Array.isArray(caseData.evidence) ? caseData.evidence.map(String) : [],
    whatNext: String(caseData.whatNext ?? ''),
    recommendation: String(caseData.recommendation ?? ''),
    priority: String(caseData.priority ?? 'P3'),
    priorityReason: Array.isArray(caseData.priorityReason) ? caseData.priorityReason.map(String) : [],
    owner: String(caseData.owner ?? 'غير محدد'),
    expectedOutcome: String(caseData.expectedOutcome ?? ''),
    sourceHash,
    reportJobId,
    signalId: String(caseData.signalId ?? ''),
    signalTitle: String(caseData.signalTitle ?? ''),
    createdAt: String(caseData.createdAt ?? row.updated_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function saveAdvisorBusinessCase(input: AdvisorBusinessCaseInput): Promise<AdvisorBusinessCase> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const caseEvidence = {
    type: 'ADVISOR_BUSINESS_CASE',
    case: {
      decisionId: input.decisionId,
      reportJobId: input.reportJobId,
      sourceHash: input.sourceHash,
      signalId: input.signalId,
      signalTitle: input.signalTitle,
      issue: input.issue,
      question: input.question,
      why: input.why,
      impact: input.impact,
      evidence: input.evidence,
      whatNext: input.whatNext,
      recommendation: input.recommendation,
      priority: input.priority,
      priorityReason: input.priorityReason,
      owner: input.owner,
      expectedOutcome: input.expectedOutcome,
      followed: Boolean(input.followed),
      createdAt: new Date().toISOString(),
    },
  };

  const { data, error } = await supabase
    .from('decision_portfolio_items')
    .upsert({
      company_id: companyId,
      decision_key: input.decisionKey,
      priority_score: input.priority === 'P0' ? 1 : input.priority === 'P1' ? 0.8 : input.priority === 'P2' ? 0.6 : 0.4,
      materiality_score: 0,
      confidence_score: 0,
      risk_consumption: 0,
      escalation_required: input.priority === 'P0',
      status: portfolioStatusForPriority(input.priority),
      evidence: caseEvidence,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,decision_key' })
    .select('id,company_id,decision_key,status,evidence,updated_at')
    .single();

  if (error) throw error;
  const parsed = parseAdvisorCase(data as Record<string, unknown>);
  if (!parsed) throw new Error('ADVISOR_CASE_PERSISTENCE_INVALID');
  return parsed;
}

export async function fetchAdvisorBusinessCases(): Promise<AdvisorBusinessCase[]> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const { data, error } = await supabase
    .from('decision_portfolio_items')
    .select('id,company_id,decision_key,status,evidence,updated_at')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const parsed = (data ?? [])
    .map((row) => parseAdvisorCase(row as Record<string, unknown>))
    .filter((value): value is AdvisorBusinessCase => value !== null);
  return parsed;
}

export async function setAdvisorBusinessCaseFollowed(caseId: string, followed: boolean): Promise<void> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');
  const { data, error } = await supabase
    .from('decision_portfolio_items')
    .select('evidence')
    .eq('company_id', companyId)
    .eq('id', caseId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ADVISOR_CASE_NOT_FOUND');

  const evidence = data.evidence && typeof data.evidence === 'object' ? data.evidence as Record<string, unknown> : {};
  const caseData = evidence.case && typeof evidence.case === 'object' ? { ...(evidence.case as Record<string, unknown>) } : {};
  const nextEvidence = {
    ...evidence,
    type: 'ADVISOR_BUSINESS_CASE',
    case: { ...caseData, followed },
  };

  const { error: updateError } = await supabase
    .from('decision_portfolio_items')
    .update({ evidence: nextEvidence, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', caseId);
  if (updateError) throw updateError;
}

export async function fetchAdvisorBusinessCaseByDecision(decisionKey: string): Promise<AdvisorBusinessCase | null> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');
  const { data, error } = await supabase
    .from('decision_portfolio_items')
    .select('id,company_id,decision_key,status,evidence,updated_at')
    .eq('company_id', companyId)
    .eq('decision_key', decisionKey)
    .maybeSingle();
  if (error) throw error;
  return data ? parseAdvisorCase(data as Record<string, unknown>) : null;
}

export type DecisionActivityRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  source: string | null;
  createdAt: string;
};

export async function fetchRecentDecisionActivity(limit = 20): Promise<DecisionActivityRecord[]> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,action,entity_type,entity_id,source,created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    action: String(row.action ?? ''),
    entityType: String(row.entity_type ?? ''),
    entityId: String(row.entity_id ?? ''),
    source: row.source == null ? null : String(row.source),
    createdAt: String(row.created_at),
  }));
}

export async function fetchPendingDecisionApprovals(limit = 50): Promise<number> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const { data, error } = await supabase
    .from('decision_approvals')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'PENDING')
    .order('requested_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return (data ?? []).length;
}

export type DecisionWorkItemRecord = {
  id: string;
  decisionId: string;
  status: string;
  department: string;
  assigneeId: string | null;
  assigneeLabel: string | null;
  title: string;
  priority: string;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  expectedImpact: number | null;
  actualImpact: number | null;
  evidenceRefs: unknown[];
  evidenceSnapshotId: string | null;
  sourceReportJobId: string | null;
  sourceHash: string | null;
};

export async function fetchDecisionWorkItems(limit = 200): Promise<DecisionWorkItemRecord[]> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const { data, error } = await supabase
    .from('decision_work_items')
    .select('id,decision_id,status,department,assignee_id,assignee_label,title,priority,due_at,started_at,completed_at,expected_impact,actual_impact,evidence_refs')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    decisionId: String(row.decision_id),
    status: String(row.status ?? 'OPEN'),
    department: String(row.department ?? ''),
    assigneeId: row.assignee_id == null ? null : String(row.assignee_id),
    assigneeLabel: row.assignee_label == null ? null : String(row.assignee_label),
    title: String(row.title ?? ''),
    priority: String(row.priority ?? 'MEDIUM'),
    dueAt: row.due_at == null ? null : String(row.due_at),
    startedAt: row.started_at == null ? null : String(row.started_at),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    expectedImpact: row.expected_impact == null ? null : Number(row.expected_impact),
    actualImpact: row.actual_impact == null ? null : Number(row.actual_impact),
    evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs : [],
    evidenceSnapshotId: Array.isArray(row.evidence_refs)
      ? (() => {
          const source = row.evidence_refs.find((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object' && (ref as Record<string, unknown>).type === 'SOURCE_REPORT');
          return typeof source?.evidenceSnapshotId === 'string' ? source.evidenceSnapshotId : null;
        })()
      : null,
    sourceReportJobId: Array.isArray(row.evidence_refs)
      ? (() => {
          const source = row.evidence_refs.find((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object' && (ref as Record<string, unknown>).type === 'SOURCE_REPORT');
          return typeof source?.reportExecutionJobId === 'string' ? source.reportExecutionJobId : null;
        })()
      : null,
    sourceHash: Array.isArray(row.evidence_refs)
      ? (() => {
          const source = row.evidence_refs.find((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object' && (ref as Record<string, unknown>).type === 'SOURCE_REPORT');
          return typeof source?.sourceHash === 'string' ? source.sourceHash : null;
        })()
      : null,
  }));
}
