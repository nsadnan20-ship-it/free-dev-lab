import { supabase, resolveCurrentCompanyId } from './supabase';
import { fetchSmartReport, type SmartReportDetail } from './report-smart';
import { fetchSourceDecisionProposals, type SourceDecisionState } from './report-decisions';

export type ReplayEvent = {
  key: string;
  kind: 'source' | 'stage' | 'decision' | 'work' | 'outcome';
  title: string;
  status: string;
  at: string | null;
  detail: string;
};

export type BusinessReplay = {
  report: SmartReportDetail;
  decisions: SourceDecisionState[];
  events: ReplayEvent[];
};

function eventTime(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export async function fetchBusinessReplay(jobId: string, sourceHash: string): Promise<BusinessReplay> {
  const companyId = await resolveCurrentCompanyId();
  if (!companyId) throw new Error('TENANT_REQUIRED');

  const report = await fetchSmartReport(jobId, sourceHash);
  if (!report) throw new Error('REPORT_SOURCE_NOT_FOUND');
  if (report.sourceHash !== sourceHash) throw new Error('REPORT_SOURCE_HASH_MISMATCH');

  const decisions = await fetchSourceDecisionProposals(sourceHash, jobId);
  const events: ReplayEvent[] = [];

  events.push({
    key: 'source',
    kind: 'source',
    title: report.sourcePath,
    status: report.evidenceStatus ?? report.trustState ?? 'SOURCE',
    at: report.completedAt,
    detail: 'المصدر نفسه مرتبط بالبصمة ' + report.sourceHash,
  });

  for (const stage of report.stages) {
    events.push({
      key: 'stage-' + stage.ordinal,
      kind: 'stage',
      title: stage.stage,
      status: stage.status,
      at: stage.completedAt ?? stage.startedAt,
      detail: 'مرحلة durable رقم ' + stage.ordinal,
    });
  }

  const decisionIds = decisions.map((decision) => decision.id);
  if (decisionIds.length) {
    const { data: decisionRows, error: decisionError } = await supabase
      .from('business_intelligence_decisions')
      .select('id,created_at,approved_at,executed_at,status,rejection_reason')
      .eq('company_id', companyId)
      .in('id', decisionIds);
    if (decisionError) throw decisionError;

    const decisionMeta = new Map<string, Record<string, unknown>>();
    for (const row of decisionRows ?? []) decisionMeta.set(String(row.id), row as Record<string, unknown>);

    for (const decision of decisions) {
      const meta = decisionMeta.get(decision.id);
      events.push({
        key: 'decision-' + decision.id,
        kind: 'decision',
        title: decision.signalTitle ?? decision.decisionKey,
        status: String(meta?.status ?? decision.status),
        at: meta?.approved_at == null ? (meta?.created_at == null ? decision.createdAt : String(meta.created_at)) : String(meta.approved_at),
        detail: decision.signalMessage ?? 'قرار مصدرّي مرتبط بهذا التقرير.',
      });
      if (decision.workItemId) {
        events.push({
          key: 'work-' + decision.workItemId,
          kind: 'work',
          title: 'عنصر العمل',
          status: decision.workItemStatus ?? 'OPEN',
          at: decision.observedAt,
          detail: decision.workItemId,
        });
      }
      if (decision.outcomeStatus) {
        events.push({
          key: 'outcome-' + decision.id,
          kind: 'outcome',
          title: 'النتيجة',
          status: decision.outcomeStatus,
          at: decision.observedAt,
          detail: decision.actualImpact == null
            ? 'الأثر الفعلي غير مسجل'
            : 'الأثر الفعلي: ' + String(decision.actualImpact),
        });
      }
    }
  }

  events.sort((a, b) => eventTime(a.at) - eventTime(b.at) || a.key.localeCompare(b.key));

  return { report, decisions, events };
}
