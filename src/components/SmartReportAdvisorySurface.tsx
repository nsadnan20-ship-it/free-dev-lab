import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BrainCircuit, CheckCircle2, Search, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from '@/lib/router-compat';
import { createSourceDecisionProposal, fetchSourceDecisionProposals, type SourceDecisionState } from '@/lib/report-decisions';
import type { SmartReportDetail } from '@/lib/report-smart';
import { buildAdvisoryPacket } from '@/lib/report-intelligence/report-advisory-orchestrator';
import { detectReportArchetype } from '@/lib/report-intelligence/archetype-registry';
import { BusinessQuestionRail } from '@/components/intelligence/BusinessQuestionRail';
import { ClaimEvidenceCard } from '@/components/intelligence/ClaimEvidenceCard';
import type { CanonicalField } from '@/lib/report-intelligence/canonical-schema';

function canonicalFields(report: SmartReportDetail): CanonicalField[] {
  const dataset = report.sourceAnalysis?.datasets?.[0];
  const declared = dataset && typeof dataset === 'object' && Array.isArray((dataset as Record<string, unknown>).columns)
    ? (dataset as Record<string, unknown>).columns as unknown[]
    : [];
  const fields = new Set<string>();

  for (const column of declared) {
    if (column && typeof column === 'object') {
      const item = column as Record<string, unknown>;
      const mapped = String(item.mappedField ?? '').trim();
      const name = String(item.name ?? '').trim();
      if (mapped) fields.add(mapped);
      else if (name) {
        const key = name.toLowerCase().replace(/[\s_-]+/g, '');
        const aliases: Array<[string,string[]]> = [
          ['date',['date','التاريخ','التاريخ 2026-']],
          ['invoice_number',['invoice_number','رقم الفاتورة','رقم الفاتوره']],
          ['invoice_type',['invoice_type','نوع الفاتورة','نوع الفاتوره']],
          ['customer_name',['customer_name','اسم العميل','العميل']],
          ['supplier_name',['supplier_name','اسم المورد','المورد']],
          ['product_name',['product_name','اسم الصنف','اسم المنتج','الصنف']],
          ['total',['total','الإجمالي','الاجمالي','اجمالي الفاتورة','اجمالي الفاتوره']],
          ['net_amount',['net_amount','مبلغ الصافي بالمحلي','الصافي بالمحلي']],
          ['balance',['balance','الرصيد','الرصيد المستحق']],
          ['credit',['credit','دائن']],
          ['debit',['debit','مدين']],
          ['quantity',['quantity','qty','الكمية']],
        ];
        const match = aliases.find(([, names]) => names.some(candidate => candidate.toLowerCase().replace(/[\s_-]+/g, '') === key));
        if (match) fields.add(match[0]);
      }
    } else if (String(column ?? '').trim()) {
      const raw = String(column).trim();
      const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
      if (key === 'date' || key === 'التاريخ') fields.add('date');
      else if (key === 'customer_name' || key === 'اسم العميل') fields.add('customer_name');
      else if (key === 'total' || key === 'الإجمالي' || key === 'الاجمالي' || key === 'اجمالي الفاتوره') fields.add('total');
      else if (key === 'invoice_number' || key === 'رقم الفاتوره') fields.add('invoice_number');
      else if (key === 'invoice_type' || key === 'نوع الفاتوره') fields.add('invoice_type');
    }
  }

  for (const row of report.canonicalRows.slice(0, 500)) {
    for (const key of Object.keys(row.data ?? {})) {
      const normalized = key.toLowerCase().replace(/[\s_-]+/g, '');
      if (normalized === 'date' || normalized === 'التاريخ' || normalized === 'التاريخ2026') fields.add('date');
      if (normalized === 'customer_name' || normalized === 'customer') fields.add('customer_name');
      if (normalized === 'total' || normalized === 'total_amount') fields.add('total');
      if (normalized === 'invoice_number') fields.add('invoice_number');
      if (normalized === 'invoice_type') fields.add('invoice_type');
      if (report.specialty === 'inventory' && ['current_stock','currentstock','\u0627\u0644\u0631\u0635\u064a\u062f','\u0627\u0644\u0631\u0635\u064a\u062f\u0627\u0644\u062d\u0627\u0644\u064a','\u0627\u0644\u0645\u062e\u0632\u0648\u0646\u0627\u0644\u062d\u0627\u0644\u064a'].includes(normalized)) fields.add('currentStock');
      else if (normalized === 'balance' || normalized === '\u0627\u0644\u0631\u0635\u064a\u062f') fields.add('balance');
      if (normalized === 'credit' || normalized === 'دائن') fields.add('credit');
      if (normalized === 'debit' || normalized === 'مدين') fields.add('debit');
      if (normalized === 'quantity' || normalized === 'qty' || normalized === 'الكمية') fields.add('quantity');
    }
  }
  return [...fields] as CanonicalField[];
}

export function SmartReportAdvisorySurface({ report }: { report: SmartReportDetail }) {
  const primarySignal = report.intelligence.signals[0] ?? null;
  const evidencePassportId = typeof report.renderedOutput.evidencePassportId === 'string'
    ? report.renderedOutput.evidencePassportId
    : null;
  const evidenceSnapshotId = typeof report.renderedOutput.evidenceSnapshotId === 'string'
    ? report.renderedOutput.evidenceSnapshotId
    : null;

  const requestedArchetypeId = typeof report.renderedOutput.archetypeId === 'string' ? report.renderedOutput.archetypeId : null;
  const requestedProfile = requestedArchetypeId ? detectReportArchetype({
    sourcePath: report.sourcePath,
    specialty: report.specialty,
    availableFields: canonicalFields(report),
  }) : null;
  const archetypeResolution = requestedArchetypeId
    ? (requestedProfile?.profile?.id === requestedArchetypeId
      ? requestedProfile
      : requestedProfile?.state === 'SUPPORTED'
        ? { ...requestedProfile, reason: 'STORED_ID_CONFLICTS_WITH_FINGERPRINT' as const }
        : { profile: null, state: 'REVIEW_REQUIRED' as const, reason: 'STORED_ARCHETYPE_REQUIRES_REVIEW' })
    : detectReportArchetype({
        sourcePath: report.sourcePath,
        specialty: report.specialty,
        availableFields: canonicalFields(report),
      });
  const packet = buildAdvisoryPacket({
    intelligence: report.intelligence,
    provenance: {
      tenantId: report.tenantId,
      sourceHash: report.sourceHash,
      reportExecutionJobId: report.jobId,
      evidenceSnapshotId,
      evidencePassportId,
      sourceVersionId: typeof report.renderedOutput.sourceVersionId === 'string' ? report.renderedOutput.sourceVersionId : null,
    },
    availableFields: canonicalFields(report),
    sampleSize: report.rowCount ?? 0,
    archetypeId: archetypeResolution.profile?.id ?? null,
    profileVersion: typeof report.renderedOutput.profileVersion === 'number'
      ? report.renderedOutput.profileVersion
      : archetypeResolution.profile?.version ?? null,
  });

  const decisionClaims = packet.claims.filter((claim) => claim.status === 'RECOMMENDED' || claim.status === 'DERIVED');
  const { advisorBrief, findings, risks, opportunities } = report.intelligence;
  const navigate = useNavigate();
  const [decisionProposal, setDecisionProposal] = useState<SourceDecisionState | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const decision = decisionProposal ?? { id: '', recommendationId: null as string | null };
  const decisionReadback = {
    recommendationId: decision.recommendationId,
    decisionId: decision.id,
  };

  const refreshDecisionProposal = useCallback(async () => {
    try {
      const proposals = await fetchSourceDecisionProposals(report.sourceHash, report.jobId);
      setDecisionProposal(proposals[0] ?? null);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'تعذر قراءة قرار المصدر');
    }
  }, [report.sourceHash, report.jobId]);

  useEffect(() => { void refreshDecisionProposal(); }, [refreshDecisionProposal]);

  const createDecisionProposal = async () => {
    const basis = advisorBrief.topRisk ?? advisorBrief.topFinding ?? advisorBrief.topOpportunity;
    if (!basis) return;
    const recommendation = report.intelligence.recommendations.find((item) => item.id === 'rec:' + basis.id)
      ?? report.intelligence.recommendations[0]
      ?? null;
    if (packet.proofState !== 'VERIFIED') {
      setDecisionError('لا يمكن إنشاء قرار من دليل غير مثبت.');
      return;
    }
    if (!evidenceSnapshotId) {
      setDecisionError('لا توجد لقطة الدليل مؤكدة لهذا التقرير؛ تم منع إنشاء المقترح.');
      return;
    }
    try {
      setDecisionBusy(true);
      setDecisionError(null);
      await createSourceDecisionProposal({
        reportJobId: report.jobId,
        sourceHash: report.sourceHash,
        signalId: basis.id,
        signalTitle: basis.title,
        signalMessage: basis.statement,
        severity: basis.priority,
        evidence: basis.evidence,
        evidenceSnapshotId: evidenceSnapshotId ?? '',
        recommendationContext: recommendation ? {
          action: recommendation.action,
          why: recommendation.why,
          whyNow: recommendation.whyNow,
          expectedOutcome: recommendation.expectedOutcome,
          owner: recommendation.ownerHint || null,
          impact: recommendation.impact,
          measurement: recommendation.measurement,
          risk: recommendation.risk,
          blocker: recommendation.blocker,
          limitation: recommendation.limitation,
        } : null,
      });
      await refreshDecisionProposal();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'تعذر حفظ القرار المقترح');
    } finally {
      setDecisionBusy(false);
    }
  };

  return (
    <section dir="rtl" className="ag-smart-advisor-surface space-y-4" data-intelligence-contract-markers="ADVISOR BRIEF|TOP FINDINGS|TOP RISKS|TOP OPPORTUNITIES">
      <div className="overflow-hidden rounded-[22px] border border-primary-400/30 bg-ink-950 p-5 text-white shadow-card lg:p-7">
        <div className="pointer-events-none absolute" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[.18em] text-primary-300"><BrainCircuit size={15}/> قراءة المستشار</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white lg:text-3xl">من التقرير إلى الفهم والقرار</h2>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-ink-200">مسار واحد يربط الإشارة بالدليل والسؤال والتوصية والقرار، ويُظهر حدود ما يمكن إثباته بدل إخفائها.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black text-ink-100"><ShieldCheck size={13}/> {packet.proofState === 'VERIFIED' ? 'الدليل مرتبط' : 'المراجعة مطلوبة'}</span>
            <span className="inline-flex items-center rounded-full border border-primary-300/30 bg-primary-400/10 px-3 py-1.5 text-[9px] font-black text-primary-200">
              {packet.actionState === 'ACTIONABLE' ? 'قابل للتحويل إلى عمل' : packet.actionState === 'REVIEW_REQUIRED' ? 'المراجعة مطلوبة' : 'جاهزية الإجراء غير مكتملة'}
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black text-ink-100">القضايا المثبتة: {findings.length + risks.length + opportunities.length > 0 ? 'نعم' : 'لا'}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black text-ink-100">الدليل: {packet.proofState === 'VERIFIED' ? 'موثق' : 'مراجعة مطلوبة'}</span>
        </div>
      </div>

      <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black tracking-[.16em] text-primary-700">أهم قضية الآن</div>
            <h3 className="mt-1 text-xl font-black text-ink-950">القضية التي تستحق انتباه الإدارة الآن</h3>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-ink-500">يظهر هنا الاستنتاج الأقوى فقط. بقية الإشارات والتحليلات تبقى متاحة عند الحاجة دون إغراق الشاشة الرئيسية.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] font-black text-slate-600">{report.intelligence.signals.length ? 'إشارة مثبتة' : 'لا توجد إشارة مثبتة'}</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-[9px] font-black text-slate-500">الإشارة الأقوى</div>
            <div className="mt-2 text-base font-black text-slate-950">{primarySignal?.title ?? 'لا توجد قضية مثبتة من المصدر الحالي'}</div>
            <p className="mt-2 text-xs leading-6 text-slate-600">{primarySignal?.message ?? 'لن يتم توليد قضية بديلة عندما لا يثبت المصدر نتيجة واضحة.'}</p>
            {primarySignal ? <div className="mt-3 text-[10px] leading-5 text-slate-500"><span className="font-black text-slate-700">الدليل:</span> {primarySignal.evidence.join(' · ')}</div> : null}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="text-[9px] font-black text-amber-700">الخطوة التالية</div>
            <div className="mt-2 text-sm font-black text-amber-950">{report.intelligence.recommendations[0]?.title ?? 'تحقق من المصدر أولًا'}</div>
            <p className="mt-2 text-[10px] leading-5 text-amber-900">{report.intelligence.recommendations[0]?.action ?? advisorBrief.recommendedAction ?? 'لا إجراء تنفيذي قبل اكتمال التحقق.'}</p>
          </div>
        </div>
      </div>

      <details className="rounded-[18px] border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-black tracking-[.14em] text-slate-500">التحليل المتقدم</div>
              <div className="mt-1 text-base font-black text-slate-950">استكشاف بقية التحليل</div>
              <div className="mt-1 text-[10px] text-slate-500">الإشارات الثانوية، الأسئلة، التوقع، والإرشاد تظهر هنا فقط عند الطلب.</div>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] font-black text-slate-600">{Math.max(0, report.intelligence.signals.length - 1)} ثانوي</span>
          </div>
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-5">      <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,#071318,#0b2024)] p-5 text-white shadow-card lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[9px] font-black tracking-[.16em] text-primary-300">مشهد الذكاء</div>
            <h3 className="mt-1 text-xl font-black tracking-tight">كل ما اكتشفه التقرير</h3>
            <p className="mt-1 max-w-3xl text-[11px] leading-5 text-ink-200">الإشارات، التوصيات، التوقع، الإرشاد، والنتائج تعرض كاملة من نفس حزمة التقرير. لا يوجد حد عرض مصطنع.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black text-ink-100">{packet.proofState === 'VERIFIED' ? 'دليل مرتبط' : 'مراجعة مطلوبة'} · {report.rowCount ?? 0} سجل</span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ['إشارات', report.intelligence.signals.length],
            ['توصيات', report.intelligence.recommendations.length],
            ['نتائج', findings.length],
            ['مخاطر', risks.length],
            ['فرص', opportunities.length],
            ['أسئلة', packet.questions.length],
          ].map(([label, count]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-primary-300/30 hover:bg-primary-400/10"><div className="text-[9px] font-black text-ink-300">{label}</div><div className="mt-1 text-2xl font-black text-white">{count}</div></div>)}
        </div>
      </div>

      <div className="rounded-[20px] border border-primary-200 bg-[linear-gradient(135deg,#f7fbfa,#ffffff)] p-5 shadow-card lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.16em] text-primary-700">ملخص المستشار</div>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-ink-950">ماذا يريد الأغبري أن يقول للإدارة؟</h3>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-ink-600">{advisorBrief.headline}</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3 text-right">
            <div className="text-[9px] font-black text-ink-400">الحالة</div>
            <div className="mt-1 text-sm font-black text-ink-900">{advisorBrief.health === 'HEALTHY' ? 'سليم من الإشارات الحالية' : advisorBrief.health === 'ATTENTION' ? 'يحتاج انتباهًا' : 'المراجعة مطلوبة'}</div>
            <div className="mt-1 text-[10px] text-ink-500">{advisorBrief.ownerHint}</div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {([
            { label: 'أهم نتيجة', title: advisorBrief.topFinding?.title ?? 'غير متاح', detail: advisorBrief.topFinding?.statement ?? 'لا توجد نتيجة أعمال كافية.', key: 'FINDING' },
            { label: 'أهم خطر', title: advisorBrief.topRisk?.title ?? 'لا يوجد خطر مرتفع مثبت', detail: advisorBrief.topRisk?.statement ?? 'لا يوجد خطر مجال أعمال مثبت من البيانات الحالية.', key: 'RISK' },
            { label: 'أهم فرصة', title: advisorBrief.topOpportunity?.title ?? 'لا توجد فرصة مثبتة', detail: advisorBrief.topOpportunity?.statement ?? 'لا توجد فرصة قابلة للإثبات حاليًا.', key: 'OPPORTUNITY' },
            { label: 'الإجراء المقترح', title: advisorBrief.recommendedAction ?? 'لا يوجد إجراء مؤهل بعد', detail: advisorBrief.expectedOutcome ?? advisorBrief.proofRequirement, key: 'ACTION' },
          ]).map(({ label, title, detail, key }) => (
            <div key={key} className="rounded-2xl border border-ink-100 bg-white p-4">
              <div className="text-[9px] font-black tracking-[.08em] text-ink-400">{label}</div>
              <div className="mt-2 text-sm font-black text-ink-950">{title}</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-600">{detail}</div>
            </div>
          ))}
        </div>
        {decisionError && <div role="alert" className="mt-3 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-[10px] leading-5 text-warning-900">تعذر تحديث مسار القرار: {decisionError}</div>}
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-xl border border-ink-100 bg-white px-4 py-3 text-[10px] leading-5 text-ink-600">
            <span className="font-black text-ink-800">القياس بعد الإجراء:</span> {advisorBrief.measurement ?? 'لا يوجد KPI مؤهل للقياس بعد.'}
            <span className="mx-2 text-ink-300">•</span>
            <span className="font-black text-ink-800">حد الدليل:</span> {advisorBrief.proofRequirement}
          </div>
          {decisionProposal ? (
            <button
              type="button"
              onClick={() => navigate('/decision-experience?sourceDecisionId=' + encodeURIComponent(decisionProposal.id) + '&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash))}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-5 py-3 text-xs font-black text-white shadow-sm transition hover:bg-primary-800"
            >
              القرار المقترح محفوظ — متابعة <ArrowLeft size={14}/>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void createDecisionProposal()}
              disabled={decisionBusy || packet.proofState !== 'VERIFIED' || !advisorBrief.topRisk && !advisorBrief.topFinding && !advisorBrief.topOpportunity}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-5 py-3 text-xs font-black text-white shadow-sm transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {decisionBusy ? 'جارٍ حفظ القرار…' : 'حوّلها إلى قرار فعلي'} <ArrowLeft size={14}/>
            </button>
          )}
        </div>
      </div>

      {decisionProposal && (
        <div className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-black tracking-[.14em] text-primary-700">قراءة النتيجة</div>
              <h3 className="mt-1 text-lg font-black text-ink-950">ماذا حدث بعد القرار؟</h3>
              <p className="mt-1 text-xs leading-6 text-ink-500">قراءة للحالة المحفوظة من مسار القرار/العمل، دون استنتاج نتيجة لم تُسجل.</p>
            </div>
            <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-[10px] font-black text-ink-700">
              {decisionProposal.outcomeStatus === 'observed' ? 'نتيجة مرصودة' : decisionProposal.outcomeStatus === 'insufficient' ? 'القياس غير كافٍ' : decisionProposal.outcomeStatus ? decisionProposal.outcomeStatus : 'لا نتيجة مسجلة'}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <div className="text-[9px] font-black text-ink-400">القرار</div>
              <div className="mt-1 text-xs font-black text-ink-900">{decisionProposal.status}</div>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <div className="text-[9px] font-black text-ink-400">العمل</div>
              <div className="mt-1 text-xs font-black text-ink-900">{decisionProposal.workItemStatus ?? 'لم يُنشأ'}</div>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <div className="text-[9px] font-black text-ink-400">الأثر المتوقع</div>
              <div className="mt-1 text-xs font-black text-ink-900">{decisionProposal.expectedImpact == null ? 'غير مسجل' : String(decisionProposal.expectedImpact)}</div>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              <div className="text-[9px] font-black text-ink-400">الأثر المرصود</div>
              <div className="mt-1 text-xs font-black text-ink-900">{decisionProposal.actualImpact == null ? 'غير مقاس' : String(decisionProposal.actualImpact)}</div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-ink-100 bg-white px-4 py-3 text-[10px] leading-5 text-ink-600">
            {decisionProposal.observedAt
              ? 'آخر قراءة محفوظة: ' + new Date(decisionProposal.observedAt).toLocaleString('ar-YE')
              : decisionProposal.actualImpact == null
                ? 'لم تُسجل نتيجة فعلية بعد؛ لا يجوز اعتبار الأثر المتوقع نتيجة محققة.'
                : 'تم تسجيل أثر فعلي، ويجب الرجوع إلى لقطة الدليل المرتبطة قبل اعتماد القياس.'}
          </div>
        </div>
      )}

      <div className="rounded-[16px] border border-primary-200 bg-primary-50/60 px-4 py-3"><div className="text-[9px] font-black tracking-[.14em] text-primary-700">أهم النتائج</div><div className="mt-1 text-sm font-black text-ink-950">أهم النتائج التي تستحق انتباه الإدارة</div></div>

      <div className="grid gap-3 lg:grid-cols-3">
        {([
          { label: 'أهم النتائج', items: findings, subtitle: 'نتائج محسوبة مباشرة من الصفوف الكانونية' },
          { label: 'أهم المخاطر', items: risks, subtitle: 'مخاطر لا تظهر إلا عندما يدعمها المصدر' },
          { label: 'أهم الفرص', items: opportunities, subtitle: 'فرص مبنية على مؤشرات قابلة للحساب' },
        ] as const).map(({ label, items, subtitle }) => (
          <div key={label} className="rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
            <div className="text-[9px] font-black tracking-[.12em] text-primary-700">{label}</div>
            <div className="mt-1 text-[10px] text-ink-500">{subtitle}</div>
            <div className="mt-3 space-y-2">
              {items.length ? items.map((item) => (
                <div key={item.id} className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
                  <div className="text-xs font-black text-ink-900">{item.title}</div>
                  <div className="mt-1 text-[10px] leading-5 text-ink-600">{item.statement}</div>
                  <div className="mt-2 text-[9px] text-ink-400">الدليل: {item.evidence.join(' · ')}</div>
                  {item.dimensionValue && (
                    <Link
                      to={'/reports/smart/' + encodeURIComponent(report.jobId) + '?focus=' + encodeURIComponent(String(item.dimensionValue)) + '&sourceHash=' + encodeURIComponent(report.sourceHash)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-[9px] font-black text-primary-800 hover:bg-primary-50"
                    >
                      فحص سجلات {item.dimensionLabel ?? 'البند'} <Search size={12}/>
                    </Link>
                  )}
                </div>
              )) : <div className="rounded-xl border border-dashed border-ink-200 p-3 text-[10px] text-ink-500">لا توجد نتيجة مثبتة من المصدر الحالي.</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black tracking-[.14em] text-primary-700">الإشارات</div><h3 className="mt-1 text-lg font-black text-ink-950">كل الإشارات والتنبيهات</h3></div><span className="rounded-full bg-ink-950 px-3 py-1 text-[9px] font-black text-white">{report.intelligence.signals.length}</span></div>
          <div className="mt-3 space-y-2">
            {report.intelligence.signals.length ? report.intelligence.signals.map((signal) => <article key={signal.id} className="rounded-xl border border-ink-100 bg-ink-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-ink-950">{signal.title}</span><span className="rounded-full border border-ink-200 bg-white px-2 py-1 text-[9px] font-black text-ink-600">{signal.priority} · {signal.severity}</span></div>
              <p className="mt-1 text-[10px] leading-5 text-ink-600">{signal.message}</p>
              <div className="mt-2 text-[9px] text-ink-400">لماذا؟ {signal.soWhat || 'تحتاج مراجعة مرتبطة بالدليل.'} · الأثر: {signal.impact || 'غير مثبت ماليًا.'}</div>
              <div className="mt-2 text-[9px] text-ink-400">الدليل: {signal.evidence.join(' · ')}</div>
            </article>) : <div className="rounded-xl border border-dashed border-ink-200 p-4 text-[10px] text-ink-500">لا توجد إشارات مثبتة من المصدر الحالي.</div>}
          </div>
        </div>
        <div className="rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black tracking-[.14em] text-primary-700">التوصيات</div><h3 className="mt-1 text-lg font-black text-ink-950">كل التوصيات المؤهلة</h3></div><span className="rounded-full bg-primary-700 px-3 py-1 text-[9px] font-black text-white">{report.intelligence.recommendations.length}</span></div>
          <div className="mt-3 space-y-2">
            {report.intelligence.recommendations.length ? report.intelligence.recommendations.map((recommendation) => <article key={recommendation.id} className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-ink-950">{recommendation.title}</span><span className="rounded-full border border-primary-200 bg-white px-2 py-1 text-[9px] font-black text-primary-800">{recommendation.priority}</span></div>
              <p className="mt-1 text-[10px] leading-5 text-ink-600">{recommendation.action}</p>
              <div className="mt-2 grid gap-1.5 text-[9px] leading-5 text-ink-500 sm:grid-cols-2">
                <div><span className="font-black text-ink-700">لماذا:</span> {recommendation.why}</div>
                <div><span className="font-black text-ink-700">لماذا الآن:</span> {recommendation.whyNow}</div>
                <div><span className="font-black text-ink-700">المسؤول:</span> {recommendation.ownerHint || 'غير محدد'}</div>
                <div><span className="font-black text-ink-700">الأثر:</span> {recommendation.impact}</div>
                <div><span className="font-black text-ink-700">المخاطر:</span> {recommendation.risk}</div>
                <div><span className="font-black text-ink-700">العائق:</span> {recommendation.blocker}</div>
                <div><span className="font-black text-ink-700">القياس:</span> {recommendation.measurement}</div>
                <div><span className="font-black text-ink-700">الحدود:</span> {recommendation.limitation}</div>
              </div>
              <div className="mt-2 text-[9px] text-ink-400">المخرج المتوقع: {recommendation.expectedOutcome}</div>
            </article>) : <div className="rounded-xl border border-dashed border-ink-200 p-4 text-[10px] text-ink-500">لا توجد توصيات مؤهلة من الإشارات الحالية.</div>}
          </div>
        </div>
      </div>

      </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">التنبؤ</div>
          <h3 className="mt-1 text-lg font-black text-ink-950">الإشارة التنبئية</h3>
          <p className="mt-2 text-xs leading-6 text-ink-600">{report.intelligence.forecast.note}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">الحالة</div><div className="mt-1 text-xs font-black">{report.intelligence.forecast.status}</div></div>
            <div className="rounded-xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">الفترات</div><div className="mt-1 text-xs font-black">{report.intelligence.forecast.observedPeriods}</div></div>
            <div className="rounded-xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">القيمة القادمة</div><div className="mt-1 text-xs font-black">{report.intelligence.forecast.nextValue == null ? 'غير متاح' : report.intelligence.forecast.nextValue.toLocaleString('ar-YE', { maximumFractionDigits: 2 })}</div></div>
            <div className="rounded-xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">الاتجاه</div><div className="mt-1 text-xs font-black">{report.intelligence.forecast.direction ?? 'غير متاح'}</div></div>
          </div>
        </div>
        <div className="rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">الإرشاد</div>
          <h3 className="mt-1 text-lg font-black text-ink-950">الإرشاد التالي</h3>
          <p className="mt-2 text-sm font-black text-ink-900">{report.intelligence.guidance.focus}</p>
          <div className="mt-2 text-[11px] leading-6 text-ink-600">الفحص: {report.intelligence.guidance.inspect.join(' · ') || 'لا توجد عناصر فحص محددة.'}</div>
          <div className="mt-2 text-[10px] text-ink-500">المالك: {report.intelligence.guidance.ownerHint || 'غير محدد'} · الحد: {report.intelligence.guidance.boundary}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between"><div className="text-sm font-black text-ink-950">الاستنتاجات الموثقة</div><Link to={'/trust?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700">فتح الثقة <ArrowLeft size={13}/></Link></div>
          {decisionClaims.length ? decisionClaims.map((claim) => <ClaimEvidenceCard key={claim.claimId} claim={claim}/>) : <div className="rounded-xl border border-ink-200 bg-white p-5 text-xs text-ink-500">لا توجد Claim جوهرية مثبتة بعد.</div>}
        </div>
        <BusinessQuestionRail questions={packet.questions}/>
      </div>

      <div className="rounded-2xl border border-primary-200 bg-[linear-gradient(135deg,#ffffff,#f5faf8)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-primary-700">مسار القرار</div>
            <div className="mt-1 text-sm font-black text-ink-950">لا تتوقف عند التوصية — تابعها حتى العمل والنتيجة</div>
            <p className="mt-1 text-[11px] leading-5 text-ink-600">الانتقال إلى مساحة القرار يبقى مربوطًا بهذا التقرير ومصدره؛ لا يتم إنشاء قرار أو أثر تنفيذي تلقائيًا من هذه الشاشة.</p>
          </div>
          <Link
            to={'/decision-experience?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-primary-800"
          >
            فتح مساحة القرار <ArrowLeft size={14}/>
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="رحلة القرار">
          {[
            ['1', 'الدليل', packet.proofState === 'VERIFIED', packet.proofState === 'VERIFIED' ? 'متحقق' : 'لم يُثبت بعد'],
            ['2', 'الفهم', packet.claims.length > 0, packet.claims.length > 0 ? 'متحقق' : 'لم يُثبت بعد'],
            ['3', 'التوصية', Boolean(packet.nextRecommendation), packet.nextRecommendation ? 'مؤهلة' : 'لم تُثبت'],
            ['4', 'القرار',
              Boolean(decisionProposal && ['APPROVED', 'COMMITTED', 'DECIDED'].includes(String(decisionProposal.status).toUpperCase())),
              decisionProposal ? String(decisionProposal.status) : 'لم يُنشأ'
            ],
            ['5', 'الاعتماد',
              Boolean(decisionProposal?.approvalStatus && String(decisionProposal.approvalStatus).toUpperCase() === 'APPROVED'),
              decisionProposal?.approvalStatus ? String(decisionProposal.approvalStatus) : 'لم يُطلب'
            ],
            ['6', 'العمل',
              Boolean(decisionProposal?.workItemId),
              decisionProposal?.workItemStatus ? String(decisionProposal.workItemStatus) : 'لم يُنشأ'
            ],
            ['7', 'النتيجة',
              Boolean(decisionProposal?.outcomeStatus && ['OBSERVED', 'COMPLETED'].includes(String(decisionProposal.outcomeStatus).toUpperCase())),
              decisionProposal?.outcomeStatus ? String(decisionProposal.outcomeStatus) : 'لم تُسجل'
            ],
          ].map(([step, label, done, status]) => (
            <div key={String(step)} className="rounded-xl border border-ink-100 bg-white px-2 py-3 text-center">
              <div className={"mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black " + (done ? "bg-primary-100 text-primary-800" : "bg-ink-100 text-ink-500")}>
                {done ? '✓' : step}
              </div>
              <div className="mt-2 text-[10px] font-bold text-ink-700">{label}</div>
              <div className="mt-1 text-[9px] text-ink-400">{status}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary-700"/><div><div className="text-[9px] font-black tracking-[.12em] text-primary-700">التالي</div><div className="mt-1 text-sm font-black">الخطوة التالية</div></div></div>
        <p className="mt-2 text-xs leading-6 text-ink-600">{packet.nextRecommendation?.statement ?? 'لا توجد توصية مثبتة قابلة للتحويل إلى خطوة الآن.'}</p>
      </div>
    </section>
  );
}
