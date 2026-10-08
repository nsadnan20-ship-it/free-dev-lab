import { SourceBoundReportSurface } from '@/components/SourceBoundReportSurface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReportSourceContext } from '@/components/ReportSourceContext';
import {
  AlertTriangle, ArrowUpLeft, CalendarClock, CheckCircle2, ChevronLeft, FileSearch, Lightbulb,
  ShieldCheck, Target, UserRound, Workflow, XCircle
} from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfidenceBadge, PriorityBadge, SeverityBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { fetchAlerts, fetchRecommendations } from '@/lib/queries';
import { fetchSmartReport, type SmartReportDetail } from '@/lib/report-smart';
import { selectExecutiveRecommendation, selectExecutiveSignal } from '@/lib/report-intelligence/report-smart-insights';
import { createSourceDecisionProposal, fetchDecisionWorkItems, fetchSourceDecisionProposals, type DecisionWorkItemRecord } from '@/lib/report-decisions';
import { loadPersistedOutcomes, type DecisionOutcome } from '@/lib/analytics/outcome-feedback';
import { resolveCurrentCompanyId } from '@/lib/supabase';
import { formatCurrency, relativeTime } from '@/lib/format';
import type { Alert, Recommendation } from '@/lib/types';
import {
  createRuntimeDecision,
  linkRecommendationToDecision,
  loadRuntimeDecisionContext,
  loadRuntimeRecommendationEvidence,
  requestRuntimeApproval,
  type RuntimeDecisionContext,
} from '@/lib/decision-automation/vertical-slice-runtime';

type Stage = 'command' | 'evidence' | 'decision' | 'approval' | 'work' | 'outcome';

const STAGES: { id: Stage; label: string; description: string }[] = [
  { id: 'command', label: 'الإشارة', description: 'ما الذي يحتاج انتباهًا؟' },
  { id: 'evidence', label: 'الدليل', description: 'ما الذي يثبت ذلك؟' },
  { id: 'decision', label: 'القرار', description: 'ما الإجراء المقترح؟' },
  { id: 'approval', label: 'الموافقة', description: 'من يعتمد الإجراء؟' },
  { id: 'work', label: 'التنفيذ', description: 'ماذا تم فعليًا؟' },
  { id: 'outcome', label: 'النتيجة', description: 'ما الذي حدث بعد ذلك؟' },
];


function statusLabel(status: string | null): string {
  if (!status) return 'غير متاح';
  const labels: Record<string, string> = {
    pending: 'قيد المراجعة',
    PROPOSED: 'مقترح',
    PENDING: 'قيد الاعتماد',
    APPROVED: 'معتمد',
    REJECTED: 'مرفوض',
    CANCELLED: 'ملغى',
    proposed: 'مقترح',
    approved: 'معتمد',
    in_progress: 'قيد التنفيذ',
    completed: 'مكتمل',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
  };
  return labels[status] ?? status;
}

function decisionReadiness(recommendation: Recommendation | null): { label: string; tone: string; detail: string } {
  if (!recommendation) return { label: 'لا توجد توصية', tone: 'text-ink-500 bg-ink-50', detail: 'لا يوجد عنصر حقيقي لبدء مسار القرار.' };
  if (!recommendation.owner) return { label: 'ينقص المسؤول', tone: 'text-warning-700 bg-warning-50', detail: 'التوصية موجودة، لكن لا يظهر مسؤول فعلي مرتبط بها.' };
  if (!recommendation.deadline) return { label: 'ينقص الموعد', tone: 'text-warning-700 bg-warning-50', detail: 'التوصية لها مسؤول، لكن الموعد غير مثبت بعد.' };
  if (recommendation.expected_impact == null) return { label: 'الأثر غير متاح', tone: 'text-warning-700 bg-warning-50', detail: 'لا يوجد أثر متوقع قابل للعرض على هذه التوصية.' };
  return { label: 'سياق القرار مكتمل', tone: 'text-success-700 bg-success-50', detail: 'المسؤول والموعد والأثر المتوقع متاحة في سجل التوصية.' };
}

function formatDeadline(value: string | null): string {
  if (!value) return 'غير متاح';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ar-YE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function BlockedState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[14px] border border-warning-200 bg-warning-50/70 p-4" role="status">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-100 text-warning-800"><ShieldCheck size={17}/></div>
        <div className="min-w-0">
          <div className="text-[12px] font-black text-warning-950">{title}</div>
          <p className="mt-1 text-[11px] leading-5 text-warning-900/80">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function StageHeader({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <div className="section-kicker">{label}</div>
      <h2 className="mt-1 text-xl font-black text-ink-950">{description}</h2>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  active,
  onClick,
}: {
  recommendation: Recommendation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={'w-full rounded-[14px] border p-4 text-right transition ' + (active ? 'border-primary-300 bg-primary-50/50 shadow-sm' : 'border-ink-200 bg-white hover:border-primary-200 hover:bg-primary-50/20')}
    >
      <div className="flex items-start gap-3">
        <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (active ? 'bg-primary-100 text-primary-700' : 'bg-ink-50 text-ink-500')}>
          <Lightbulb size={17}/>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-black text-ink-900">{recommendation.title}</span><PriorityBadge priority={recommendation.priority}/></span>
          {recommendation.description && <span className="mt-1 block text-[11px] leading-5 text-ink-500">{recommendation.description}</span>}
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={recommendation.confidence}/>
            {recommendation.expected_impact !== undefined && recommendation.expected_impact !== null && <span className="text-[10px] font-bold text-success-700">أثر متوقع: {formatCurrency(recommendation.expected_impact)}</span>}
          </span>
        </span>
        <ChevronLeft size={16} className="mt-1 shrink-0 text-ink-300"/>
      </div>
    </button>
  );
}

function DecisionExperienceGeneralPage() {
  const [params, setParams] = useSearchParams();
  const requestedStage = params.get('stage') as Stage | null;
  const sourceDecisionId = params.get('sourceDecisionId');
  const sourceHashParam = params.get('sourceHash');
  const reportJobIdParam = params.get('reportJobId');
  const [stage, setStage] = useState<Stage>(STAGES.some((item) => item.id === requestedStage) ? requestedStage! : 'command');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('recommendationId'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionContext, setDecisionContext] = useState<RuntimeDecisionContext>({ decision: null, approval: null });
  const [recommendationContext, setRecommendationContext] = useState<Record<string, string> | null>(null);
  const [decisionContextLoading, setDecisionContextLoading] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionWorkItems, setDecisionWorkItems] = useState<DecisionWorkItemRecord[]>([]);
  const [outcomes, setOutcomes] = useState<DecisionOutcome[]>([]);
  const [sourceReport, setSourceReport] = useState<SmartReportDetail | null>(null);
  const [sourceProposalBusy, setSourceProposalBusy] = useState(false);
  const [sourceProposalError, setSourceProposalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!reportJobIdParam || !sourceHashParam || !/^sha256:[0-9a-fA-F]{64}$/.test(sourceHashParam)) {
        throw new Error('INVALID_REPORT_CONTEXT');
      }
      const companyId = await resolveCurrentCompanyId();
      if (!companyId) throw new Error('TENANT_REQUIRED');
      const [nextRecommendations, nextAlerts, nextWorkItems, nextOutcomes, sourceProposals, nextSourceReport] = await Promise.all([
        fetchRecommendations(),
        fetchAlerts(),
        fetchDecisionWorkItems(200),
        loadPersistedOutcomes(companyId),
        sourceHashParam && reportJobIdParam ? fetchSourceDecisionProposals(sourceHashParam, reportJobIdParam) : Promise.resolve([]),
        fetchSmartReport(reportJobIdParam, sourceHashParam, { signal: AbortSignal.timeout(25000) }),
      ]);
      const sourceProposal = sourceDecisionId
        ? sourceProposals.find((proposal) => proposal.id === sourceDecisionId)
        : null;
      const linkedRecommendationId = sourceProposal?.recommendationId ?? null;
      setSourceReport(nextSourceReport);
      setRecommendations(nextRecommendations);
      setAlerts(nextAlerts);
      setDecisionWorkItems(nextWorkItems);
      setOutcomes(nextOutcomes);
      setSelectedId((current) => {
        if (current && nextRecommendations.some((item) => item.id === current)) return current;
        if (linkedRecommendationId && nextRecommendations.some((item) => item.id === linkedRecommendationId)) return linkedRecommendationId;
        if (!sourceDecisionId && reportJobIdParam && sourceHashParam) return null;
        return nextRecommendations[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل سياق القرار');
    } finally {
      setLoading(false);
    }
  }, [reportJobIdParam, sourceHashParam, sourceDecisionId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (requestedStage && STAGES.some((item) => item.id === requestedStage)) setStage(requestedStage); }, [requestedStage]);

  const selected = recommendations.find((item) => item.id === selectedId) ?? null;
  const currentStageIndex = Math.max(0, STAGES.findIndex((item) => item.id === stage));
  const activeAlerts = useMemo(() => alerts.filter((item) => !item.is_read), [alerts]);
  const selectedStatus = selected?.status ?? null;
  const sourceSignal = useMemo(() => sourceReport ? selectExecutiveSignal(sourceReport.intelligence) : null, [sourceReport]);
  const sourceRecommendation = useMemo(
    () => sourceReport && sourceSignal ? selectExecutiveRecommendation(sourceReport.intelligence, sourceSignal) : null,
    [sourceReport, sourceSignal],
  );
  useEffect(() => {
    let active = true;
    setDecisionError(null);
    setRecommendationContext(null);
    if (!selectedId) {
      setDecisionContext({ decision: null, approval: null });
      setDecisionContextLoading(false);
      return () => { active = false; };
    }
    setDecisionContextLoading(true);
    void Promise.all([
      loadRuntimeDecisionContext(selectedId),
      loadRuntimeRecommendationEvidence(selectedId),
    ])
      .then(([context, recommendationEvidence]) => {
        if (!active) return;
        setDecisionContext(context);
        const evidenceContext = recommendationEvidence.evidence?.recommendationContext;
        setRecommendationContext(
          evidenceContext && typeof evidenceContext === 'object'
            ? Object.fromEntries(Object.entries(evidenceContext).map(([key, value]) => [key, String(value ?? '')]))
            : null,
        );
      })
      .catch((cause) => {
        if (active) {
          setDecisionContext({ decision: null, approval: null });
          setRecommendationContext(null);
          setDecisionError(cause instanceof Error ? cause.message : 'تعذر قراءة مسار القرار المحفوظ');
        }
      })
      .finally(() => { if (active) setDecisionContextLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const persistSelectedDecision = async () => {
    if (!selected) return;
    const expectedImpact = Number(selected.expected_impact);
    const rawConfidence = String(selected.confidence ?? '').trim();
    const numericConfidence = rawConfidence.includes('%')
      ? Number(rawConfidence.replace('%', '')) / 100
      : Number(rawConfidence);
    const confidence = numericConfidence > 1 && numericConfidence <= 100
      ? numericConfidence / 100
      : numericConfidence;

    setDecisionBusy(true);
    setDecisionError(null);
    try {
      if (decisionContext.decision) {
        if (decisionContext.decision.recommendationId !== selected.id) {
          await linkRecommendationToDecision(selected.id, decisionContext.decision.id);
        }
        if (decisionContext.approval?.status || decisionContext.decision.status !== 'PROPOSED') {
          navigateStage('approval');
          return;
        }
        const approvalId = await requestRuntimeApproval(
          decisionContext.decision.id,
          selected.description ?? 'طلب اعتماد القرار من تجربة القرار',
        );
        const refreshed = await loadRuntimeDecisionContext(selected.id);
        setDecisionContext(refreshed.approval ? refreshed : { ...refreshed, approval: { id: approvalId, status: 'PENDING', requestedBy: null, requestedAt: new Date().toISOString(), decidedBy: null, decidedAt: null, reason: selected.description ?? null } });
        navigateStage('approval');
        return;
      }

      if (!Number.isFinite(expectedImpact)) {
        setDecisionError('لا يمكن إنشاء قرار جديد بلا أثر متوقع رقمي مثبت.');
        return;
      }
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        setDecisionError('لا يمكن إنشاء قرار جديد بثقة غير قابلة للتحقق ضمن 0..1.');
        return;
      }

      const recommendationEvidence = await loadRuntimeRecommendationEvidence(selected.id);
      if (!recommendationEvidence.evidenceSnapshotId || !recommendationEvidence.evidence) {
        throw new Error('DECISION_EVIDENCE_SNAPSHOT_REQUIRED');
      }

      const decisionId = await createRuntimeDecision({
        decisionKey: 'recommendation:' + selected.id,
        decisionType: 'recommendation:' + selected.category,
        confidence,
        expectedImpact,
        evidence: {
          recommendationId: selected.id,
          title: selected.title,
          description: selected.description ?? null,
          category: selected.category,
          priority: selected.priority,
          owner: selected.owner ?? null,
          deadline: selected.deadline ?? null,
          sourceEvidence: recommendationEvidence.evidence,
          evidenceSnapshotId: recommendationEvidence.evidenceSnapshotId,
          metricVersions: recommendationEvidence.metricVersions,
          reportJobId: reportJobIdParam,
          sourceHash: sourceHashParam,
        },
      });
      await linkRecommendationToDecision(selected.id, decisionId);
      await requestRuntimeApproval(
        decisionId,
        selected.description ?? 'طلب اعتماد القرار من تجربة القرار',
      );
      const refreshed = await loadRuntimeDecisionContext(selected.id);
      setDecisionContext(refreshed);
      navigateStage('approval');
    } catch (cause) {
      setDecisionError(cause instanceof Error ? cause.message : 'تعذر حفظ القرار وطلب الموافقة');
    } finally {
      setDecisionBusy(false);
    }
  };

  const navigateStage = (next: Stage, id = selectedId) => {
    setStage(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set('stage', next);
    if (id) nextParams.set('recommendationId', id);
    else nextParams.delete('recommendationId');
    setParams(nextParams, { replace: true });
  };

  const selectRecommendation = (id: string, next: Stage = 'evidence') => {
    setSelectedId(id);
    navigateStage(next, id);
  };
  const createSourceProposal = async () => {
    if (!sourceReport || !sourceSignal) {
      setSourceProposalError('لا توجد إشارة مصدرية قابلة للتحويل إلى قرار.');
      return;
    }
    const evidenceSnapshotId = typeof sourceReport.renderedOutput?.evidenceSnapshotId === 'string'
      ? sourceReport.renderedOutput.evidenceSnapshotId.trim()
      : '';
    if (sourceReport.reportVerificationState !== 'VERIFIED' || !evidenceSnapshotId || sourceReport.evidenceStatus === 'PENDING_EVIDENCE') {
      setSourceProposalError('لا يمكن إنشاء مسودة قرار قبل اكتمال لقطة الدليل وتوثيقها.');
      return;
    }
    setSourceProposalBusy(true);
    setSourceProposalError(null);
    try {
      const proposal = await createSourceDecisionProposal({
        reportJobId: sourceReport.jobId,
        sourceHash: sourceReport.sourceHash,
        signalId: sourceSignal.id,
        signalTitle: sourceSignal.title,
        signalMessage: sourceSignal.message,
        severity: sourceSignal.severity,
        evidence: sourceSignal.evidence,
        evidenceSnapshotId,
        recommendationContext: sourceRecommendation ? {
          action: sourceRecommendation.action,
          why: sourceRecommendation.why,
          whyNow: sourceRecommendation.whyNow,
          expectedOutcome: sourceRecommendation.expectedOutcome,
          owner: sourceRecommendation.ownerHint || null,
          impact: sourceRecommendation.impact,
          measurement: sourceRecommendation.measurement,
          risk: sourceRecommendation.risk,
          blocker: sourceRecommendation.blocker,
          limitation: sourceRecommendation.limitation,
        } : null,
      });
      if (!proposal.recommendationId) throw new Error('SOURCE_PROPOSAL_RECOMMENDATION_ID_MISSING');
      const nextParams = new URLSearchParams(params);
      nextParams.set('stage', 'decision');
      nextParams.set('sourceDecisionId', proposal.id);
      nextParams.set('recommendationId', proposal.recommendationId);
      setParams(nextParams, { replace: true });
      setSelectedId(proposal.recommendationId);
    } catch (cause) {
      setSourceProposalError(cause instanceof Error ? cause.message : 'تعذر إنشاء مسودة القرار المصدرية');
    } finally {
      setSourceProposalBusy(false);
    }
  };

  const relatedWorkItems = useMemo(() => {
    const decisionId = decisionContext.decision?.id;
    return decisionId ? decisionWorkItems.filter((item) => item.decisionId === decisionId) : [];
  }, [decisionContext.decision?.id, decisionWorkItems]);

  const relatedOutcome = useMemo(() => {
    const decisionId = decisionContext.decision?.id;
    return outcomes.find((outcome) => (decisionId && outcome.actionId === decisionId) || outcome.decisionFingerprint === selectedId) ?? null;
  }, [decisionContext.decision?.id, outcomes, selectedId]);

  const readiness = decisionReadiness(selected);

  if (loading) return <LoadingState message="جارٍ تحميل سياق القرار..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div dir="rtl" className="ag-decision-experience-surface ag-decision-workspace space-y-5 animate-fade-in pb-10">
      <ReportSourceContext />
      <section className="ag-command-hero rounded-[20px] border border-ink-200 bg-ink-950 p-5 text-white shadow-elevated lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black text-primary-300"><Workflow size={15}/> تجربة القرار</div>
            <h1 className="mt-2 text-[25px] font-black tracking-tight lg:text-[31px]">من الإشارة إلى النتيجة — دون فقدان الدليل</h1>
            <p className="mt-2 text-[12px] leading-6 text-ink-300">المسار يحفظ السياق ويُظهر بوضوح ما هو موجود، وما يحتاج إثباتًا، وما لم يُنفذ بعد.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-ink-200">المرحلة {String(currentStageIndex + 1).padStart(2, '0')} / {String(STAGES.length).padStart(2, '0')}</span>
            <Link to="/command-center" className="inline-flex items-center gap-2 rounded-[9px] border border-white/15 bg-white/10 px-3.5 py-2.5 text-[11px] font-bold text-white hover:bg-white/15">العودة لمركز القيادة <ArrowUpLeft size={13}/></Link>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-6 gap-1" aria-label="مراحل القرار" role="progressbar" aria-valuemin={1} aria-valuemax={STAGES.length} aria-valuenow={currentStageIndex + 1} aria-valuetext={`${STAGES[currentStageIndex]?.label}: ${STAGES[currentStageIndex]?.description}`}>
          {STAGES.map((item, index) => <button key={item.id} type="button" onClick={() => navigateStage(item.id)} aria-current={stage === item.id ? 'step' : undefined} className={'h-1.5 rounded-full transition-colors ' + (index <= currentStageIndex ? 'bg-primary-400' : 'bg-white/15')} title={item.label} aria-label={`${index + 1}. ${item.label}: ${item.description}`}/>)}
        </div>
      </section>

      <section className="ag-decision-strip" aria-label="ملخص القرار" data-decision-contract-markers="DECISION PERSISTED|WHY NOW|MEASUREMENT|RISK|BLOCKER|LIMITATION">
        <div className="ag-decision-cell"><span className="ag-decision-label">التوصية المحددة</span><span className="ag-decision-value">{selected?.title ?? 'لم تُحدد بعد'}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">الثقة</span><span className="ag-decision-value">{selected?.confidence ?? 'غير متاح'}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">الحالة</span><span className="ag-decision-value">{statusLabel(selectedStatus)}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">المسؤول</span><span className="ag-decision-value">{selected?.owner ?? 'غير متاح'}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">الموعد</span><span className="ag-decision-value">{formatDeadline(selected?.deadline ?? null)}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">المرحلة</span><span className="ag-decision-value">{STAGES[currentStageIndex]?.label}</span></div>
      </section>

      <nav aria-label="مراحل القرار" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((item, index) => (
          <button key={item.id} type="button" onClick={() => navigateStage(item.id)} className={'stage-pill ' + (stage === item.id ? 'stage-pill-active' : 'hover:border-ink-300 hover:bg-ink-50')} aria-current={stage === item.id ? 'step' : undefined}>
            <span className="block text-xs font-bold">{index + 1}. {item.label}</span>
            <span className="mt-1 block text-[10px] text-ink-500">{item.description}</span>
          </button>
        ))}
      </nav>

      {stage === 'command' && (
        <>
          <section className="rounded-[16px] border border-ink-200 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="section-kicker">جاهزية القرار</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${readiness.tone}`}>{readiness.label}</span>
                <span className="text-[10px] text-ink-400">{readiness.detail}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-bold text-ink-600">
              <span className="inline-flex items-center gap-1 rounded-xl bg-ink-50 px-2.5 py-2"><UserRound size={13}/> {selected?.owner ?? 'مسؤول غير مثبت'}</span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-ink-50 px-2.5 py-2"><CalendarClock size={13}/> {formatDeadline(selected?.deadline ?? null)}</span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-ink-50 px-2.5 py-2">الأثر: {selected?.expected_impact == null ? 'غير متاح' : formatCurrency(selected.expected_impact)}</span>
            </div>
          </div>
        </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <Card>
            <CardHeader title="الإشارات التي تستدعي قرارًا" subtitle="اختر الإشارة التي تريد تحويلها إلى مسار قرار." />
            <CardBody>
              <div className="space-y-3">
                {activeAlerts.map((alert) => (
                  <article key={alert.id} className="rounded-[14px] border border-ink-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-50 text-danger-700"><AlertTriangle size={17}/></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={alert.severity}/><span className="text-[10px] text-ink-400">{relativeTime(alert.created_at)}</span></div>
                        <div className="mt-2 text-[13px] font-black text-ink-900">{alert.title}</div>
                        {alert.description && <p className="mt-1 text-[11px] leading-5 text-ink-500">{alert.description}</p>}
                        <Link to="/trust" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary-700">فحص المصدر أولًا <ArrowUpLeft size={13}/></Link>
                      </div>
                    </div>
                  </article>
                ))}
                {!activeAlerts.length && <EmptyState title="لا توجد إشارات نشطة" message="لا توجد تنبيهات غير مقروءة في المصدر الحالي." action={<Link to="/trust" className="btn-secondary text-[11px]">فحص الثقة</Link>}/>} 
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="مرشحات القرار" subtitle="التوصية هي مرشح، وليست نتيجة تنفيذية محفوظة." />
            <CardBody>
              <div className="space-y-3">
                {!reportJobIdParam && recommendations.map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} active={selectedId === recommendation.id} onClick={() => selectRecommendation(recommendation.id)} />)}
                {reportJobIdParam && sourceSignal && <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-[10px] leading-5 text-primary-950">هذه الصفحة مرتبطة بالتقرير الحالي. انتقل إلى <button type="button" onClick={() => navigateStage('evidence')} className="font-black underline">الدليل</button> لإنشاء أو فتح التوصية المصدرية لهذا التقرير.</div>}
                {!recommendations.length && <EmptyState title="لا توجد توصيات" message="لا يتم إنشاء توصية بديلة عند غياب بيانات المصدر." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>}/>} 
              </div>
            </CardBody>
          </Card>
          </section>
        </>
      )}

      {stage === 'evidence' && (
        <section className="grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
          <Card>
            <CardHeader title="اختيار التوصية" subtitle="حدد عنصرًا حقيقيًا من المصدر." />
            <CardBody>
              <div className="space-y-2">
                {reportJobIdParam && sourceSignal && (
                  <div className="rounded-[14px] border border-primary-200 bg-primary-50/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[9px] font-black text-primary-700">إشارة التقرير الحالي</div>
                        <div className="mt-1 text-sm font-black text-ink-950">{sourceSignal.title}</div>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-primary-800">{sourceSignal.severity}</span>
                    </div>
                    <div className="mt-2 text-[10px] leading-5 text-ink-700">{sourceSignal.message}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-white p-3"><div className="text-[9px] text-ink-400">الدليل</div><div className="mt-1 text-[10px] font-bold text-ink-800">{sourceSignal.evidence.filter((item) => item.startsWith('sample=')).slice(0, 2).map((item) => item.replace(/^sample=/, '')).join(' · ') || 'دليل المصدر محفوظ داخل التقرير.'}</div></div>
                      <div className="rounded-xl bg-white p-3"><div className="text-[9px] text-ink-400">التوصية</div><div className="mt-1 text-[10px] font-bold text-ink-800">{sourceRecommendation?.title ?? 'لم تُنشأ مسودة قرار بعد'}</div></div>
                    </div>
                    {!selected && (
                      <div className="mt-3">
                        {sourceProposalError && <div role="alert" className="mb-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[9px] font-bold text-danger-800">{sourceProposalError}</div>}
                        <button type="button" onClick={() => void createSourceProposal()} disabled={sourceProposalBusy} className="btn-primary w-full justify-center text-[10px] disabled:opacity-50">
                          {sourceProposalBusy ? 'جارٍ إنشاء مسودة القرار...' : sourceReport?.reportVerificationState === 'VERIFIED' ? 'إنشاء مسودة قرار مرتبطة بهذا التقرير' : 'أكمل توثيق الدليل أولًا'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {(!reportJobIdParam || selected) && recommendations.map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} active={selectedId === recommendation.id} onClick={() => selectRecommendation(recommendation.id, 'evidence')} />)}
                {!reportJobIdParam && !recommendations.length && <EmptyState title="لا توجد توصيات" message="لا يمكن فحص دليل لعنصر غير موجود." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>}/>} 
                {reportJobIdParam && !sourceSignal && <EmptyState title="لا توجد إشارة مصدرية" message="التقرير الحالي لم ينتج إشارة قابلة للتحويل إلى قرار؛ لا نعرض توصيات من تقارير أخرى." />}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="مساحة الدليل" subtitle="المصدر، السياق، والثقة قبل القرار." action={selected ? <ConfidenceBadge confidence={selected.confidence} /> : undefined} />
            <CardBody>
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-[14px] border border-ink-200 bg-ink-50/70 p-4">
                    <div className="surface-label">موضوع القرار</div>
                    <h2 className="mt-1 text-lg font-black text-ink-950">{selected.title}</h2>
                    {selected.description && <p className="mt-2 text-[12px] leading-6 text-ink-600">{selected.description}</p>}
                    {recommendationContext && (
                      <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
                        <div className="text-[9px] font-black tracking-[.08em] text-primary-700">سياق التوصية</div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {[
                            ['لماذا الآن', recommendationContext.whyNow],
                            ['MEASUREMENT', recommendationContext.measurement],
                            ['RISK', recommendationContext.risk],
                            ['BLOCKER', recommendationContext.blocker],
                            ['LIMITATION', recommendationContext.limitation],
                          ].filter(([, value]) => value).map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-white/70 bg-white p-2.5">
                              <div className="text-[9px] font-black text-ink-400">{label}</div>
                              <div className="mt-1 text-[10px] leading-5 text-ink-700">{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[12px] border border-ink-100 bg-white p-3"><div className="text-[10px] text-ink-400">الحالة</div><div className="mt-1 text-[12px] font-black text-ink-900">{selectedStatus ?? 'غير متاح'}</div></div>
                    <div className="rounded-[12px] border border-ink-100 bg-white p-3"><div className="text-[10px] text-ink-400">الثقة</div><div className="mt-1"><ConfidenceBadge confidence={selected.confidence}/></div></div>
                    <div className="rounded-[12px] border border-ink-100 bg-white p-3"><div className="text-[10px] text-ink-400">الأثر المتوقع</div><div className="mt-1 text-[12px] font-black text-ink-900">{selected.expected_impact == null ? 'غير متاح' : formatCurrency(selected.expected_impact)}</div></div>
                  </div>
                  <BlockedState title="الدليل التشغيلي غير مثبت هنا" detail="لا تُعرض بيانات مصدرية مصطنعة ولا يتم تحويل وصف التوصية إلى دليل. الانتقال إلى القرار يحافظ على حالة المراجعة بدل الادعاء بوجود إثبات غير متاح." />
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={() => navigateStage('decision')} className="btn-primary text-[11px]">متابعة إلى القرار <ArrowUpLeft size={13}/></button><Link to="/metrics" className="btn-secondary text-[11px]">فحص تعريف المؤشر <FileSearch size={13}/></Link></div>
                </div>
              ) : <EmptyState title="اختر توصية" message="اختر عنصرًا موجودًا لفحص سياق الدليل." action={<Link to="/command-center" className="btn-secondary text-[11px]">العودة إلى الإشارات</Link>}/>} 
            </CardBody>
          </Card>
        </section>
      )}

      {stage === 'decision' && (
        <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <Card>
            <CardHeader title="صياغة القرار" subtitle="حوّل الإشارة إلى إجراء مقترح دون تسجيل نتيجة لم تحدث." />
            <CardBody>
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-[14px] border border-primary-100 bg-primary-50/40 p-4">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black text-primary-700">التوصية المختارة</span><PriorityBadge priority={selected.priority}/><ConfidenceBadge confidence={selected.confidence}/></div>
                    <h2 className="mt-2 text-lg font-black text-ink-950">{selected.title}</h2>
                    {selected.description && <p className="mt-1 text-[11px] leading-5 text-ink-600">{selected.description}</p>}
                    {recommendationContext && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="سياق التوصية">
                        {[
                          ['لماذا الآن', recommendationContext.whyNow],
                          ['النتيجة المتوقعة', recommendationContext.expectedOutcome],
                          ['OWNER', recommendationContext.owner],
                          ['MEASUREMENT', recommendationContext.measurement],
                          ['RISK', recommendationContext.risk],
                          ['BLOCKER', recommendationContext.blocker],
                          ['LIMITATION', recommendationContext.limitation],
                        ].filter(([, value]) => value).map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-ink-100 bg-white p-3">
                            <div className="text-[9px] font-black tracking-[.08em] text-ink-400">{label}</div>
                            <div className="mt-1 text-[10px] leading-5 text-ink-700">{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">ما نعرفه</div><div className="mt-2 text-[12px] font-bold text-ink-900">{statusLabel(selected.status)}</div></div>
                    <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">المسؤول</div><div className="mt-2 text-[12px] font-bold text-ink-900">{selected.owner ?? 'غير مثبت'}</div></div>
                    <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">الموعد</div><div className="mt-2 text-[12px] font-bold text-ink-900">{formatDeadline(selected.deadline)}</div></div>
                    <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">ما لا نعرفه بعد</div><div className="mt-2 text-[12px] font-bold text-ink-900">نتيجة تشغيلية مثبتة بعد التنفيذ.</div></div>
                  </div>
                </div>
              ) : <EmptyState title="لا يوجد مرشح قرار" message="اختر توصية من خطوة الدليل أولًا." />}
            </CardBody>
          </Card>
          <div className="space-y-4">
            {decisionError && <div role="alert" className="rounded-[12px] border border-danger-200 bg-danger-50 p-3 text-[11px] font-bold text-danger-800">{decisionError}</div>}
            <div className="rounded-[14px] border border-primary-200 bg-primary-50/60 p-4">
              {decisionContextLoading ? (
                <div className="text-[11px] text-primary-900">جارٍ قراءة مسار القرار المحفوظ...</div>
              ) : decisionContext.decision ? (
                <>
                  <div className="text-[10px] font-black text-primary-800" data-decision-contract="DECISION PERSISTED">القرار محفوظ</div>
                  <div className="mt-2 text-[12px] font-black text-ink-950">القرار: <span className="font-black">محفوظ وقابل للتتبع</span></div>
                  <div className="mt-1 text-[10px] text-ink-500">الحالة: {statusLabel(decisionContext.decision.status)} · الثقة: {decisionContext.decision.confidence ?? 'غير متاحة'}</div>
                  {decisionContext.approval && <div className="mt-1 text-[10px] text-ink-500">الموافقة: {statusLabel(decisionContext.approval.status)}</div>}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-[12px] font-black text-ink-900"><CheckCircle2 size={15} className="text-success-700"/> التوصية موجودة في المصدر</div>
                  <p className="mt-1 text-[10px] leading-5 text-ink-500">سيتم إنشاء قرار حقيقي مرتبط بالتوصية، وربطه بدليلها، ثم إنشاء طلب موافقة persisted عبر RPC المحمي.</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => void persistSelectedDecision()}
              disabled={!selected || decisionBusy || decisionContextLoading}
              className="btn-primary w-full justify-center text-[11px]"
            >
              {decisionBusy ? 'جارٍ الحفظ وطلب الموافقة...' : decisionContext.decision ? 'استكمال مسار الموافقة' : 'حفظ القرار وطلب الموافقة'}
              <ArrowUpLeft size={13}/>
            </button>
            <div className="grid gap-3">
              <div className="rounded-[12px] border border-ink-200 bg-white p-4"><div className="flex items-center gap-2 text-[12px] font-black"><ShieldCheck size={15} className="text-warning-700"/> الموافقة</div><p className="mt-1 text-[10px] text-ink-400">لا يتم اعتماد القرار تلقائيًا؛ ينتظر قرار صاحب الصلاحية.</p></div>
              <div className="rounded-[12px] border border-ink-200 bg-white p-4"><div className="flex items-center gap-2 text-[12px] font-black"><XCircle size={15} className="text-ink-400"/> النتيجة</div><p className="mt-1 text-[10px] text-ink-400">ليست مثبتة بعد ولن تُعرض كنجاح.</p></div>
            </div>
          </div>
        </section>
      )}

      {stage === 'approval' && (
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="الموافقة والمسؤولية" subtitle="من يعتمد؟ وعلى أي دليل؟" />
            <CardBody>
              {decisionContextLoading && <div className="text-[11px] text-ink-500">جارٍ قراءة القرار والموافقة...</div>}
              {!decisionContextLoading && decisionContext.decision && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">القرار</div><div className="mt-2 text-[11px] font-black text-ink-900">محفوظ وقابل للتتبع</div></div>
                  <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">حالة القرار</div><div className="mt-2 text-[12px] font-black text-ink-900">{statusLabel(decisionContext.decision.status)}</div></div>
                  <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">طلب الموافقة</div><div className="mt-2 text-[11px] font-black text-ink-900">{decisionContext.approval ? 'محفوظ' : 'غير موجود'}</div></div>
                  <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">حالة الموافقة</div><div className="mt-2 text-[12px] font-black text-ink-900">{decisionContext.approval ? statusLabel(decisionContext.approval.status) : 'غير موجود'}</div></div>
                  <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">طالب الموافقة</div><div className="mt-2 text-[11px] font-black text-ink-900">{decisionContext.approval ? 'مسجل في السجل' : 'غير متاح'}</div></div>
                  <div className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">وقت الطلب</div><div className="mt-2 text-[12px] font-black text-ink-900">{decisionContext.approval?.requestedAt ? new Date(decisionContext.approval.requestedAt).toLocaleString('ar-YE') : 'غير متاح'}</div></div>
                </div>
              )}
              {!decisionContextLoading && !decisionContext.decision && (
                <BlockedState title="لم يُثبت قرار محفوظ بعد" detail="أنشئ القرار من المرحلة السابقة؛ هذه المرحلة لا تتجاوز مسار الصلاحية ولا تخترع حالة موافقة." />
              )}
            </CardBody>
          </Card>
          <div className="space-y-4">
            {decisionError && <div role="alert" className="rounded-[12px] border border-danger-200 bg-danger-50 p-3 text-[11px] font-bold text-danger-800">{decisionError}</div>}
            <div className="rounded-[14px] border border-warning-200 bg-warning-50/70 p-4">
              <div className="flex items-start gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-warning-700"/><div><div className="text-[12px] font-black text-warning-950">{decisionContext.approval?.status === 'PENDING' ? 'بانتظار صاحب الصلاحية' : 'لا يوجد اعتماد تلقائي'}</div><p className="mt-1 text-[11px] leading-5 text-warning-900/80">{decisionContext.approval?.status === 'PENDING' ? 'تم حفظ القرار وطلب الموافقة. الاعتماد نفسه يتطلب فعلًا موثقًا من صاحب الصلاحية.' : 'لا يتم تحويل المقترح إلى اعتماد أو تنفيذ دون موافقة موثقة.'}</p></div></div>
            </div>
            <button type="button" onClick={() => navigateStage('decision')} className="btn-secondary w-full justify-center text-[11px]">العودة إلى القرار <ArrowUpLeft size={13}/></button>
          </div>
        </section>
      )}

      {stage === 'work' && (
        <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <Card variant="action">
            <CardHeader kicker="التنفيذ والقراءة الفعلية" title="التنفيذ والمتابعة" subtitle="حالة العمل تُقرأ من decision_work_items، لا من حالة الواجهة المحلية." />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['المسؤول الحالي', selected?.owner ?? 'غير مثبت'],
                  ['الموعد', formatDeadline(selected?.deadline ?? null)],
                  ['حالة التوصية', statusLabel(selectedStatus)],
                  ['الأثر المتوقع', selected?.expected_impact == null ? 'غير متاح' : formatCurrency(selected.expected_impact)],
                  ['العمل المحفوظ', relatedWorkItems.length ? relatedWorkItems.length + ' عنصر' : 'غير متاح'],
                  ['الإجراء التالي', relatedWorkItems.some((item) => item.status === 'OPEN') ? 'ابدأ من مركز العمل' : relatedWorkItems.some((item) => item.status === 'IN_PROGRESS') ? 'أدخل الأثر الفعلي وأغلق العمل' : relatedWorkItems.some((item) => item.status === 'COMPLETED') ? 'افتح النتيجة والتعلّم' : 'لا يوجد عمل مثبت بعد'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-ink-100 bg-white p-4"><div className="text-[10px] text-ink-400">{label}</div><div className="mt-2 text-[12px] font-black text-ink-900">{value}</div></div>
                ))}
              </div>
              {relatedWorkItems.length ? (
                <div className="mt-4 space-y-2">
                  {relatedWorkItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><div className="text-[11px] font-black text-ink-900">{item.title}</div><div className="mt-1 font-mono text-[8px] text-ink-400">{item.id}</div></div>
                        <span className="rounded-full bg-primary-50 px-2 py-1 text-[9px] font-black text-primary-800">{item.status}</span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3 text-[9px] text-ink-500">
                        <span>المسؤول: {item.assigneeLabel ?? 'غير متاح'}</span>
                        <span>المتوقع: {item.expectedImpact == null ? 'غير متاح' : formatCurrency(item.expectedImpact)}</span>
                        <span>الفعلي: {item.actualImpact == null ? 'غير متاح' : formatCurrency(item.actualImpact)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link to="/work-center" className="btn-secondary text-[9px]">فتح مركز العمل <ArrowUpLeft size={12}/></Link>
                        {item.sourceReportJobId && item.sourceHash && <Link to={'/reports/smart/' + item.sourceReportJobId + '?sourceHash=' + encodeURIComponent(item.sourceHash) + '#decision-evidence-inspector'} className="btn-ghost text-[9px]">العودة للمصدر <FileSearch size={12}/></Link>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <BlockedState title="لم يُثبت سجل عمل لهذا القرار" detail="لا يتم إنشاء Work Item من هذه الشاشة. أنشئه من مسار القرار المعتمد ثم سيظهر هنا عبر readback." />
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {stage === 'outcome' && (
        <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <Card variant="activity">
            <CardHeader kicker="النتيجة والتعلّم" title="النتيجة والتعلّم" subtitle="القراءة تأتي من recommendation_outcomes ولا تتحول القيم المفقودة إلى نجاح." />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['المتوقع', relatedOutcome?.expectedValue == null ? (selected?.expected_impact == null ? 'غير متاح' : formatCurrency(selected.expected_impact)) : formatCurrency(relatedOutcome.expectedValue)],
                  ['الفعلي', relatedOutcome?.actualValue == null ? 'غير متاح' : formatCurrency(relatedOutcome.actualValue)],
                  ['الفارق', relatedOutcome?.expectedValue != null && relatedOutcome.actualValue != null ? formatCurrency(relatedOutcome.actualValue - relatedOutcome.expectedValue) : 'لا يمكن حسابه'],
                  ['جودة النتيجة', relatedOutcome?.label === 'correct' ? 'إيجابية' : relatedOutcome?.label === 'partial' ? 'جزئية' : relatedOutcome?.label === 'incorrect' ? 'سلبية' : 'غير متاحة'],
                  ['ملاحظات التنفيذ', relatedOutcome?.notes ?? 'غير متاحة'],
                  ['الدليل', relatedOutcome?.evidenceSnapshotId ? 'مثبت' : 'غير متاح'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-ink-100 bg-white p-4">
                    <div className="text-[10px] text-ink-400">{label}</div>
                    <div className="mt-2 text-[12px] font-black text-ink-900">{value}</div>
                  </div>
                ))}
              </div>
              {relatedOutcome?.actionId && <div className="mt-4 rounded-xl border border-success-100 bg-success-50/60 p-3 text-[10px] text-success-900">هذه النتيجة مرتبطة بالقرار المحفوظ: <span className="font-mono">{relatedOutcome.actionId}</span>.</div>}
              {!relatedOutcome && <BlockedState title="لا توجد نتيجة محفوظة بعد" detail="الحالة الحالية: NOT AVAILABLE. لن يتم إنشاء تعلّم أو فارق مالي من واجهة العرض." />}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/work-center" className="btn-secondary text-[10px]">العودة لمركز العمل <ArrowUpLeft size={12}/></Link>
                {relatedWorkItems[0]?.sourceReportJobId && relatedWorkItems[0]?.sourceHash && <Link to={'/reports/smart/' + relatedWorkItems[0].sourceReportJobId + '?sourceHash=' + encodeURIComponent(relatedWorkItems[0].sourceHash) + '#decision-evidence-inspector'} className="btn-ghost text-[10px]">العودة إلى المصدر <FileSearch size={12}/></Link>}
              </div>
            </CardBody>
          </Card>
          <Card variant="evidence">
            <CardHeader title="مسار التعلّم" subtitle="التعلّم هنا تفسير للنتيجة المحفوظة، وليس تنبؤًا غير موثق." />
            <CardBody>
              {relatedOutcome ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3 text-[10px] leading-5 text-primary-950">النتيجة موثقة، لذا يمكن مقارنة المتوقع بالفعلي وربطها بالقرار. لا يتم اشتقاق benchmark بلا cohort حقيقي.</div>
                  <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
                    <div className="text-[9px] font-black text-ink-500">بصمة تتبع فنية</div>
                    <div className="mt-1 break-all font-mono text-[9px] text-ink-700">{relatedOutcome.decisionFingerprint}</div>
                  </div>
                  <div className="text-[9px] text-ink-500">وقت الرصد: {new Date(relatedOutcome.observedAt).toLocaleString('ar-YE')}</div>
                </div>
              ) : (
                <div className="text-[11px] leading-5 text-ink-500">ينتظر هذا الجزء نتيجة persisted. غيابها لا يعني نجاحًا أو فشلًا.</div>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {selected && stage !== 'command' && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-ink-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="surface-label">السياق الحالي</div><div className="mt-1 truncate text-sm font-black text-ink-900">{selected.title}</div></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => navigateStage(STAGES[Math.max(0, currentStageIndex - 1)].id)} className="btn-secondary text-[11px]" disabled={currentStageIndex === 0}>السابق <ChevronLeft size={13}/></button><button type="button" onClick={() => navigateStage(STAGES[Math.min(STAGES.length - 1, currentStageIndex + 1)].id)} className="btn-primary text-[11px]" disabled={currentStageIndex === STAGES.length - 1}>التالي <ArrowUpLeft size={13}/></button></div>
        </div>
      )}
    </div>
  );
}

export function DecisionExperiencePage() {
  const [params] = useSearchParams();
  const reportJobId = params.get('reportJobId')?.trim() ?? '';
  const sourceHash = params.get('sourceHash')?.trim() ?? '';
  if (reportJobId) {
    return <SourceBoundReportSurface mode="decision" jobId={reportJobId} expectedSourceHash={sourceHash} />;
  }
  return <DecisionExperienceGeneralPage />;
}