import { ArrowLeft, ArrowUpRight, BarChart3, BriefcaseBusiness, CheckCircle2, FileSearch, Lightbulb, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from '@/lib/router-compat';
import type { SmartReportDetail } from '@/lib/report-smart';
import { formatNumber } from '@/lib/format';
import { createSourceDecisionProposal, saveAdvisorBusinessCase } from '@/lib/report-decisions';

function label(value: unknown) {
  const text = String(value ?? '').trim();
  const map: Record<string, string> = {
    VERIFIED: 'موثق',
    TRUSTED: 'موثوق',
    REVIEW: 'مراجعة',
    GAP_DETECTED: 'فجوة دليل',
    PENDING_EVIDENCE: 'بانتظار الدليل',
    NO_DECISION_COMMITTED: 'لا قرار معتمد',
    NO_ACTION_COMMITTED: 'لا إجراء منفذ',
    NO_ACTION_REQUIRED: 'لا إجراء مطلوب',
    NOT_AVAILABLE: 'غير متاح',
    INSUFFICIENT_SAMPLE: 'عينة غير كافية',
    AVAILABLE_FROM_CANONICAL_ANALYSIS: 'متاح من التحليل الكانوني',
    PROPOSED: 'مقترح',
    REVIEW_REQUIRED: 'المراجعة مطلوبة',
    SIGNALS_PRESENT: 'إشارات مثبتة',
    NO_EXCEPTIONAL_SIGNALS: 'لا توجد إشارات استثنائية',
    PARTIAL_ANALYSIS: 'تحليل جزئي',
  };
  return map[text] ?? (text ? (text.includes('_') ? 'حالة تحتاج مراجعة' : text) : 'غير متاح');
}

export function ReportDecisionCockpit({ report }: { report: SmartReportDetail }) {
  const hash = encodeURIComponent(report.sourceHash);
  const job = encodeURIComponent(report.jobId);
  const evidenceReady = report.reportVerificationState === 'VERIFIED'
    && report.evidenceStatus !== 'PENDING_EVIDENCE'
    && report.archetypeState === 'SUPPORTED';
  const gap = Number(report.canonicalCommitGap ?? 0);
  const specialtyRoutes: Record<string, string> = {
    sales: '/reports/sales',
    purchases: '/reports/purchases',
    inventory: '/reports/inventory',
    receivables: '/reports/receivables',
    profitability: '/reports/profitability',
    payments: '/analytics/liquidity',
  };
  const specialtyHref = specialtyRoutes[String(report.specialty ?? '')] ?? '/intelligence';
  const identity = '&reportJobId=' + job + '&sourceHash=' + hash;
  const signals = report.intelligence.signals;
  const recommendations = report.intelligence.recommendations;
  const topSignal = signals[0] ?? null;
  const topRecommendation = recommendations[0] ?? null;
  const forecast = report.intelligence.forecast;
  const evidenceSnapshotId = typeof report.renderedOutput?.evidenceSnapshotId === 'string'
    ? report.renderedOutput.evidenceSnapshotId.trim()
    : '';
  const nextHref = evidenceReady
    ? '/decision-experience?stage=evidence&reportJobId=' + job + '&sourceHash=' + hash
    : '/trust?reportJobId=' + job + '&sourceHash=' + hash;
  const [caseState, setCaseState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedProposalId, setSavedProposalId] = useState<string | null>(null);

  const saveDecisionCase = async () => {
    if (!topSignal || !evidenceSnapshotId || !evidenceReady) return;
    setCaseState('saving');
    try {
      const proposal = await createSourceDecisionProposal({
        reportJobId: report.jobId,
        sourceHash: report.sourceHash,
        signalId: topSignal.id,
        signalTitle: topSignal.title,
        signalMessage: topSignal.message,
        severity: topSignal.severity,
        evidence: topSignal.evidence,
        recommendationContext: topRecommendation ? {
          action: topRecommendation.action,
          why: topRecommendation.why,
          whyNow: topRecommendation.whyNow,
          expectedOutcome: topRecommendation.expectedOutcome,
          owner: topRecommendation.ownerHint || null,
          impact: topRecommendation.impact,
          measurement: topRecommendation.measurement,
          risk: topRecommendation.risk,
          blocker: topRecommendation.blocker,
          limitation: topRecommendation.limitation,
        } : null,
        evidenceSnapshotId,
      });
      await saveAdvisorBusinessCase({
        decisionId: proposal.id,
        decisionKey: proposal.decisionKey,
        reportJobId: report.jobId,
        sourceHash: report.sourceHash,
        signalId: topSignal.id,
        signalTitle: topSignal.title,
        issue: topSignal.title,
        question: report.intelligence.businessQuestion,
        why: topSignal.message,
        impact: topSignal.impact,
        evidence: topSignal.evidence,
        whatNext: topRecommendation?.action ?? 'يحتاج القرار إلى مراجعة الأدلة قبل الإجراء.',
        recommendation: topRecommendation?.title ?? 'توصية غير متاحة.',
        priority: topSignal.priority,
        priorityReason: topSignal.priorityReason,
        owner: topRecommendation?.ownerHint ?? topSignal.ownerHint,
        expectedOutcome: topRecommendation?.expectedOutcome ?? 'نتيجة متوقعة غير متاحة.',
        followed: true,
      });
      setSavedProposalId(proposal.id);
      setCaseState('saved');
    } catch {
      setCaseState('error');
    }
  };

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-ink-200 bg-[linear-gradient(135deg,#111827_0%,#172554_56%,#312e81_100%)] p-5 text-white shadow-[0_26px_70px_-40px_rgba(15,23,42,.9)] lg:p-7" aria-label="غرفة قيادة التقرير">
      <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full border border-amber-200/20 shadow-[0_0_0_24px_rgba(231,181,43,.025),0_0_0_48px_rgba(231,181,43,.018)]" />
      <div className="pointer-events-none absolute -right-28 -bottom-36 h-80 w-80 rounded-full border border-indigo-200/15" />
      <div className="relative z-10 grid gap-6 xl:grid-cols-[1.2fr_.8fr] xl:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-white/5 px-3 py-1.5 text-[9px] font-black tracking-[.16em] text-amber-100">
            <Sparkles size={13} /> AGHBARI DECISION COCKPIT
          </div>
          <h2 className="mt-3 max-w-3xl text-2xl font-black tracking-tight lg:text-4xl">{report.sourcePath}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-200/80">
            هذا ليس Viewer. هذه هي الهوية التشغيلية للتقرير: المصدر، الحقيقة، الدليل، الإشارة، والقرار على نفس Report Job.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-slate-200/75">
            <span>Job: <b className="font-mono text-white/90">{report.jobId.slice(0, 12)}…</b></span>
            <span>•</span>
            <span>Hash: <b className="font-mono text-white/90">{report.sourceHash.slice(0, 14)}…</b></span>
            <span>•</span>
            <span>{formatNumber(report.rowCount ?? 0)} صف كانونـي</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to={nextHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-[#12322f] shadow-lg shadow-black/10 hover:bg-amber-200">
              {evidenceReady ? 'افتح مسار القرار' : 'افتح طبقة الدليل'}
              <ArrowLeft size={14}/>
            </Link>
            <Link to={'/reports/executive?reportJobId=' + job + '&sourceHash=' + hash} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black text-white hover:bg-white/10">
              التقرير التنفيذي
            </Link>
            <Link to={'/replay?reportJobId=' + job + '&sourceHash=' + hash} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black text-white hover:bg-white/10">
              Replay
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[.12em] text-slate-200/70"><ShieldCheck size={13}/> الحقيقة</div>
            <div className="mt-2 text-lg font-black">{label(report.trustState)}</div>
            <div className="mt-1 text-[10px] text-slate-200/60">Verification: {label(report.reportVerificationState)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[.12em] text-slate-200/70"><FileSearch size={13}/> الدليل</div>
            <div className="mt-2 text-lg font-black">{label(report.evidenceStatus)}</div>
            <div className="mt-1 text-[10px] text-slate-200/60">{gap > 0 ? 'فجوة تغطية: ' + formatNumber(gap) : 'لا توجد فجوة تغطية مسجلة'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[.12em] text-slate-200/70"><Target size={13}/> القرار</div>
            <div className="mt-2 text-lg font-black">{label(report.renderedOutput.decisionStatus)}</div>
            <div className="mt-1 text-[10px] text-slate-200/60">Action: {label(report.renderedOutput.actionStatus)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[.12em] text-slate-200/70"><CheckCircle2 size={13}/> النتيجة</div>
            <div className="mt-2 text-lg font-black">{label(report.renderedOutput.outcomeStatus)}</div>
            <div className="mt-1 text-[10px] text-slate-200/60">Learning: {label(report.renderedOutput.learningStatus)}</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid gap-2 rounded-2xl border border-white/10 bg-black/10 p-2 sm:grid-cols-5">
        {([
          ['TRUTH', report.trustState],
          ['EVIDENCE', report.evidenceStatus],
          ['SIGNAL', report.renderedOutput.signalStatus],
          ['DECISION', report.renderedOutput.decisionStatus],
          ['OUTCOME', report.renderedOutput.outcomeStatus],
        ] as Array<[string, unknown]>).map(([stage, value], index) => (
          <div key={String(stage)} className="flex items-center gap-2 rounded-xl px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-black">{index + 1}</span>
            <div className="min-w-0">
              <div className="text-[8px] font-black tracking-[.12em] text-slate-300/55">{stage}</div>
              <div className="truncate text-[10px] font-bold text-white/90">{label(value)}</div>
            </div>
            {index < 4 && <span className="mr-auto hidden text-slate-300/35 sm:block">←</span>}
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-5 grid gap-3 lg:grid-cols-[1.1fr_.9fr]" aria-label="ملخص قرار التقرير">
        <div className="rounded-2xl border border-amber-200/15 bg-amber-100/[.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[.14em] text-amber-100/75">
              <Lightbulb size={14}/> WHAT NEXT / DECISION BRIEF
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black text-slate-200/60">موصى به</span>
          </div>
          <div className="mt-3 text-sm font-black text-white">
            {topRecommendation?.title ?? 'لا توجد توصية قابلة للتنفيذ مثبتة من المصدر الحالي.'}
          </div>
          <div className="mt-2 text-[10px] leading-6 text-slate-200/70">
            {topRecommendation?.action ?? 'يبقى الإجراء محجوبًا حتى تظهر إشارة تستند إلى دليل كافٍ.'}
          </div>
          {topRecommendation && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                <div className="text-[8px] font-black tracking-[.12em] text-slate-300/50">WHY</div>
                <div className="mt-1 text-[10px] leading-5 text-white/80">{topRecommendation.why}</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                <div className="text-[8px] font-black tracking-[.12em] text-slate-300/50">EXPECTED النتيجة</div>
                <div className="mt-1 text-[10px] leading-5 text-white/80">{topRecommendation.expectedOutcome}</div>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={nextHref} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-300 px-3.5 py-2 text-[10px] font-black text-[#12322f] hover:bg-amber-200">
              {evidenceReady ? 'تحويل التوصية إلى قرار' : 'افتح الدليل قبل القرار'}
              <ArrowLeft size={13}/>
            </Link>
            {topSignal && <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-[10px] font-bold text-slate-200/75">الإشارة: {topSignal.title}</span>}
            <button
              type="button"
              onClick={() => void saveDecisionCase()}
              disabled={!evidenceReady || !topSignal || !report.sourceAnalysis?.id || caseState === 'saving' || caseState === 'saved'}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-200/20 bg-indigo-100/[.08] px-3.5 py-2 text-[10px] font-black text-indigo-50 disabled:opacity-45"
              data-testid="save-decision-case"
            >
              {caseState === 'saving' ? 'جارٍ حفظ القضية...' : caseState === 'saved' ? 'القضية محفوظة وتُتابع' : 'حفظ كقضية أعمال'}
            </button>
            {caseState === 'saved' && savedProposalId && (
              <Link
                to={'/decision-experience?stage=decision&sourceDecisionId=' + encodeURIComponent(savedProposalId) + '&reportJobId=' + job + '&sourceHash=' + hash}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-[10px] font-black text-slate-950"
                data-testid="open-saved-source-decision"
              >
                متابعة هذا القرار <ArrowLeft size={13}/>
              </Link>
            )}
            {caseState === 'saved' && <Link to="/advisor-cases" className="inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-[10px] font-bold text-white">فتح القضايا</Link>}
            {caseState === 'error' && <span className="inline-flex min-h-10 items-center rounded-xl border border-red-200/15 bg-red-100/[.06] px-3.5 py-2 text-[10px] font-bold text-red-100">تعذر حفظ القضية — لا تغيير على المصدر</span>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="text-[9px] font-black tracking-[.14em] text-indigo-100/65">حالات الحقيقة</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[.04] p-3"><div className="text-[8px] text-indigo-100/45">مرصود</div><div className="mt-1 text-sm font-black text-white">{formatNumber(report.rowCount ?? 0)} صف</div></div>
            <div className="rounded-xl bg-white/[.04] p-3"><div className="text-[8px] text-indigo-100/45">مشتق</div><div className="mt-1 text-sm font-black text-white">{signals.length} إشارات</div></div>
            <div className="rounded-xl bg-white/[.04] p-3"><div className="text-[8px] text-indigo-100/45">موصى به</div><div className="mt-1 text-sm font-black text-white">{recommendations.length} توصيات</div></div>
            <div className="rounded-xl bg-white/[.04] p-3"><div className="text-[8px] text-indigo-100/45">متوقع</div><div className="mt-1 text-sm font-black text-white">{forecast.status === 'AVAILABLE' ? formatNumber(forecast.nextValue ?? 0) : 'غير متاح'}</div></div>
            <div className="col-span-2 rounded-xl border border-white/8 bg-white/[.03] p-3"><div className="text-[8px] text-indigo-100/45">غير معلوم / الحدود</div><div className="mt-1 text-[10px] leading-5 text-white/70">{forecast.status === 'INSUFFICIENT_SAMPLE' ? forecast.note : (topSignal?.impact || 'الأثر المالي النهائي غير مثبت من المصدر الحالي.')}</div></div>
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-5 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black tracking-[.14em] text-indigo-100/65">
            <Lightbulb size={14}/> SIGNALS
          </div>
          {signals.length ? (
            <div className="mt-3 space-y-2">
              {signals.map((signal) => (
                <div key={signal.id} className="rounded-xl border border-white/8 bg-white/[.045] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-white">{signal.title}</div>
                      <div className="mt-1 text-[10px] leading-5 text-slate-200/65">{signal.message}</div>
                    </div>
                    <span className="shrink-0 rounded-full border border-amber-100/15 bg-amber-100/5 px-2 py-1 text-[8px] font-black text-amber-100">{signal.severity}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[.045] p-3 text-[10px] text-slate-200/65">لا توجد إشارة إضافية مثبتة من المصدر.</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black tracking-[.14em] text-indigo-100/65">
            <TrendingUp size={14}/> FORECAST
          </div>
          <div className="mt-3 rounded-xl border border-white/8 bg-white/[.045] p-3">
            <div className="text-sm font-black text-white">{label(forecast.status)}</div>
            <div className="mt-1 text-[10px] leading-5 text-slate-200/65">{forecast.note}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/[.04] p-2"><div className="text-[8px] text-indigo-100/45">الفترات</div><div className="mt-1 text-sm font-black text-white">{formatNumber(forecast.observedPeriods)}</div></div>
              <div className="rounded-lg bg-white/[.04] p-2"><div className="text-[8px] text-indigo-100/45">القيمة التالية</div><div className="mt-1 text-sm font-black text-white">{forecast.nextValue == null ? '—' : formatNumber(forecast.nextValue)}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Link to={specialtyHref + '?' + identity.slice(1)} className="group rounded-2xl border border-white/10 bg-white/[.06] p-3 hover:bg-white/[.1]">
          <div className="flex items-center justify-between gap-3"><BarChart3 size={16} className="text-amber-200"/><ArrowUpRight size={14} className="text-white/35 group-hover:text-white"/></div>
          <div className="mt-2 text-xs font-black text-white">التحليل التخصصي</div>
          <div className="mt-1 text-[10px] text-slate-200/60">{label(report.specialty || 'intelligence')}</div>
        </Link>
        <Link to={'/work-center?' + identity.slice(1)} className="group rounded-2xl border border-white/10 bg-white/[.06] p-3 hover:bg-white/[.1]">
          <div className="flex items-center justify-between gap-3"><BriefcaseBusiness size={16} className="text-amber-200"/><ArrowUpRight size={14} className="text-white/35 group-hover:text-white"/></div>
          <div className="mt-2 text-xs font-black text-white">Work Center</div>
          <div className="mt-1 text-[10px] text-slate-200/60">{recommendations.length ? 'توصيات قابلة للتحويل إلى عمل' : 'متابعة أعمال التقرير'}</div>
        </Link>
        <Link to={'/benchmark?' + identity.slice(1)} className="group rounded-2xl border border-white/10 bg-white/[.06] p-3 hover:bg-white/[.1]">
          <div className="flex items-center justify-between gap-3"><Target size={16} className="text-amber-200"/><ArrowUpRight size={14} className="text-white/35 group-hover:text-white"/></div>
          <div className="mt-2 text-xs font-black text-white">Benchmark</div>
          <div className="mt-1 text-[10px] text-slate-200/60">{forecast.status === 'INSUFFICIENT_SAMPLE' ? 'العينة غير كافية — لا مقارنة مصطنعة' : 'فتح أهلية المقارنة'}</div>
        </Link>
        <Link to={'/reports/smart/' + job + '?sourceHash=' + hash} className="group rounded-2xl border border-white/10 bg-white/[.06] p-3 hover:bg-white/[.1]">
          <div className="flex items-center justify-between gap-3"><FileSearch size={16} className="text-amber-200"/><ArrowUpRight size={14} className="text-white/35 group-hover:text-white"/></div>
          <div className="mt-2 text-xs font-black text-white">Report 360</div>
          <div className="mt-1 text-[10px] text-slate-200/60">{formatNumber(report.canonicalCommitCount)} سجل مثبت</div>
        </Link>
      </div>
    </section>
  );
}