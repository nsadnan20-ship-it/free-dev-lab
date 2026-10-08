import { supabase, resolveCurrentCompanyId } from './supabase';

export type UnifiedSearchKind =
  | 'SOURCE'
  | 'EVIDENCE'
  | 'RECOMMENDATION'
  | 'DECISION'
  | 'APPROVAL'
  | 'WORK'
  | 'OUTCOME'
  | 'AUDIT';

export type UnifiedSearchResult = {
  id: string;
  kind: UnifiedSearchKind;
  title: string;
  summary: string;
  status: string | null;
  path: string;
  entityId: string;
};

const SEARCH_LIMIT_PER_ENTITY = 80;
const RESULT_LIMIT = 40;

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function matches(row: Record<string, unknown>, query: string, fields: string[]): boolean {
  const haystack = fields.map(field => textOf(row[field])).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}
function result(
  kind: UnifiedSearchKind,
  row: Record<string, unknown>,
  title: string,
  summary: string,
  path: string,
): UnifiedSearchResult {
  const id = String(row.id ?? '');
  return {
    id,
    kind,
    title,
    summary,
    status: row.status == null ? null : String(row.status),
    path,
    entityId: id,
  };
}

export async function searchUnifiedKnowledge(query: string): Promise<UnifiedSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const [reports, recommendations, decisions, cases, work, outcomes, approvals, audit] = await Promise.all([
    supabase.from('report_execution_jobs').select('id,source_path,source_hash,status,evidence,completed_at')
      .eq('company_id', companyId).order('completed_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('recommendations').select('id,title,description,status,evidence,created_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('business_intelligence_decisions').select('id,decision_key,status,evidence,created_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('decision_portfolio_items').select('id,decision_key,status,evidence,updated_at')
      .eq('company_id', companyId).order('updated_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('decision_work_items').select('id,decision_id,title,department,status,priority,evidence_refs,created_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('recommendation_outcomes').select('id,decision_id,status,recommendation_key,expected_impact,actual_impact,evidence,observed_at')
      .eq('company_id', companyId).order('observed_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('decision_approvals').select('id,decision_id,status,reason,requested_at,decided_at')
      .eq('company_id', companyId).order('requested_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
    supabase.from('audit_logs').select('id,action,entity_type,entity_id,source,user_label,created_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(SEARCH_LIMIT_PER_ENTITY),
  ]);

  const responses = [reports, recommendations, decisions, cases, work, outcomes, approvals, audit];
  for (const response of responses) if (response.error) throw response.error;

  const found: UnifiedSearchResult[] = [];
  const push = (value: UnifiedSearchResult) => {
    if (value.id && found.length < RESULT_LIMIT) found.push(value);
  };

  for (const row of reports.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['source_path', 'source_hash', 'status', 'evidence'])) continue;
    push(result('SOURCE', r, String(r.source_path ?? 'Report source'), 'Canonical report execution source', '/reports/smart/' + String(r.id)));
  }
  for (const row of recommendations.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['title', 'description', 'status', 'evidence'])) continue;
    push(result('RECOMMENDATION', r, String(r.title ?? 'Recommendation'), String(r.description ?? 'Evidence-linked recommendation'), '/intelligence/recommendations'));
  }

  for (const row of decisions.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['decision_key', 'status', 'evidence'])) continue;
    const evidence = r.evidence && typeof r.evidence === 'object' ? r.evidence as Record<string, unknown> : {};
    const reportJobId = typeof evidence.reportExecutionJobId === 'string' ? evidence.reportExecutionJobId : '';
    const path = reportJobId ? '/reports/smart/' + reportJobId : '/decision-experience';
    push(result('DECISION', r, String(evidence.signalTitle ?? r.decision_key ?? 'Decision'), String(evidence.signalMessage ?? 'Source-bound decision'), path));
  }

  for (const row of cases.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['decision_key', 'status', 'evidence'])) continue;
    const evidence = r.evidence && typeof r.evidence === 'object' ? r.evidence as Record<string, unknown> : {};
    const caseData = evidence.case && typeof evidence.case === 'object' ? evidence.case as Record<string, unknown> : {};
    push(result('EVIDENCE', r, String(caseData.issue ?? r.decision_key ?? 'Business case'), String(caseData.question ?? 'Saved decision evidence'), '/advisor-cases'));
  }

  for (const row of approvals.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['decision_id', 'status', 'reason'])) continue;
    push(result('APPROVAL', r, 'Decision approval ' + String(r.decision_id).slice(0, 8), String(r.reason ?? 'Approval record'), '/decision-experience'));
  }

  for (const row of work.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['title', 'department', 'status', 'priority', 'evidence_refs'])) continue;
    push(result('WORK', r, String(r.title ?? 'Work item'), String(r.department ?? 'Operations') + ' · ' + String(r.priority ?? 'MEDIUM'), '/work-center'));
  }

  for (const row of outcomes.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['decision_id', 'status', 'recommendation_key', 'expected_impact', 'actual_impact', 'evidence'])) continue;
    push(result(
      'OUTCOME',
      r,
      'Outcome ' + String(r.recommendation_key ?? r.decision_id ?? '').slice(0, 60),
      'Expected: ' + String(r.expected_impact ?? 'unavailable') + ' · Actual: ' + String(r.actual_impact ?? 'unavailable'),
      '/replay',
    ));
  }

  for (const row of audit.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!matches(r, normalized, ['action', 'entity_type', 'entity_id', 'source', 'user_label'])) continue;
    push(result(
      'AUDIT',
      r,
      String(r.action ?? 'Audit event'),
      (String(r.entity_type ?? '') + ' · ' + String(r.user_label ?? '')).trim(),
      '/command-center',
    ));
  }

  return found.sort((a, b) => a.title.localeCompare(b.title, 'en'));
}
