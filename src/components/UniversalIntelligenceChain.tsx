import { ArrowLeft, CheckCircle2, CircleAlert, CircleDashed, Fingerprint, Lightbulb, ShieldCheck, Target, Workflow } from 'lucide-react';
import type { UniversalIntelligenceResult, UniversalIntelligenceStageStatus } from '@/lib/universal-report-intelligence';

function statusMeta(status: UniversalIntelligenceStageStatus) {
  if (status === 'VERIFIED' || status === 'TRUSTED') {
    return { label: status === 'VERIFIED' ? 'مثبت' : 'موثوق', className: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 };
  }
  if (status === 'DERIVED') {
    return { label: 'مشتق', className: 'border-primary-200 bg-primary-50 text-primary-900', icon: Lightbulb };
  }
  if (status === 'PROPOSED') {
    return { label: 'مقترح', className: 'border-amber-200 bg-amber-50 text-amber-900', icon: Target };
  }
  if (status === 'GAP_DETECTED') {
    return { label: 'فجوة', className: 'border-amber-300 bg-amber-50 text-amber-950', icon: CircleAlert };
  }
  if (status === 'INSUFFICIENT_DATA') {
    return { label: 'بيانات غير كافية', className: 'border-danger-200 bg-danger-50 text-danger-900', icon: CircleAlert };
  }
  if (status === 'NOT_AVAILABLE') {
    return { label: 'غير متاح', className: 'border-ink-200 bg-ink-50 text-ink-600', icon: CircleDashed };
  }
  return { label: 'مراجعة مطلوبة', className: 'border-warning-200 bg-warning-50 text-warning-900', icon: CircleAlert };
}

function stageConnector(status: UniversalIntelligenceStageStatus) {
  if (status === 'VERIFIED' || status === 'TRUSTED') return 'bg-emerald-300';
  if (status === 'DERIVED' || status === 'PROPOSED') return 'bg-primary-300';
  return 'bg-ink-200';
}

export function UniversalIntelligenceChain({ result }: { result: UniversalIntelligenceResult }) {
  const strongest = result.intelligence.advisorBrief.headline || result.intelligence.summary;
  const archetypeLabel = result.archetype?.title
    ? result.archetype.title
    : result.archetypeState === 'REVIEW_REQUIRED'
      ? 'النمط يحتاج مراجعة'
      : 'نمط عام / غير محدد';

  return (
    <section dir="rtl" className="space-y-4 rounded-[22px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="section-kicker">UNIVERSAL BUSINESS INTELLIGENCE</div>
          <h2 className="mt-1 text-xl font-black text-ink-950">من المصدر إلى قرار قابل للتنفيذ</h2>
          <p className="mt-1 max-w-4xl text-xs leading-6 text-ink-500">
            العقل يجمع استخراج الملف، التعيين الدلالي، كشف النمط، الإشارات، أسئلة الأعمال، الأدلة، التوصيات، ومسار القرار في سياق واحد.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-3 py-2 text-ink-700">
            <Fingerprint size={13} />
            قوة التحليل المصدرية {result.confidence}%
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-2 text-primary-900">
            <ShieldCheck size={13} />
            حالة الفهم: {archetypeLabel}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-ink-950 p-4 text-white">
        <div className="text-[9px] font-black tracking-[.14em] text-primary-200">EXECUTIVE SIGNAL</div>
        <div className="mt-1 text-base font-black leading-7">{strongest}</div>
        <div className="mt-2 text-[11px] leading-5 text-ink-200">
          {result.intelligence.businessQuestion}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {result.stages.map((item, index) => {
          const meta = statusMeta(item.status);
          const Icon = meta.icon;
          return (
            <div key={item.key} className="relative rounded-2xl border border-ink-200 bg-ink-50/50 p-4">
              {index < result.stages.length - 1 && (
                <span aria-hidden className={'hidden xl:block absolute -left-[13px] top-10 h-px w-3 ' + stageConnector(item.status)} />
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-white shadow-sm">
                    <Icon size={15} />
                  </span>
                  <div>
                    <div className="text-[9px] font-black text-ink-400">{String(index + 1).padStart(2, '0')}</div>
                    <div className="text-xs font-black text-ink-900">{item.label}</div>
                  </div>
                </div>
                <span className={'rounded-full border px-2.5 py-1 text-[9px] font-black ' + meta.className}>{meta.label}</span>
              </div>
              <div className="mt-3 text-sm font-black leading-6 text-ink-950">{item.headline}</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-600">{item.detail}</div>
              {item.evidence.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.evidence.slice(0, 3).map((evidence) => (
                    <span key={evidence} className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[9px] text-ink-500">
                      {evidence}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-white p-2.5 text-[9px] leading-5 text-ink-600">
                <Workflow size={12} className="mt-0.5 shrink-0 text-primary-600" />
                <span>{item.next}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-black text-primary-950">
            <Lightbulb size={14} />
            ماذا يعني هذا للمستخدم؟
          </div>
          <div className="mt-2 text-sm leading-6 text-primary-950">
            {result.intelligence.advisorBrief.recommendedAction || 'لا توجد خطوة تنفيذية مؤهلة قبل اكتمال الدليل.'}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white/80 p-3">
              <div className="text-[9px] font-black text-primary-700">المالك</div>
              <div className="mt-1 text-[10px] font-bold text-primary-950">{result.intelligence.advisorBrief.ownerHint || 'غير محدد'}</div>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <div className="text-[9px] font-black text-primary-700">القياس</div>
              <div className="mt-1 text-[10px] font-bold text-primary-950">{result.intelligence.advisorBrief.measurement || 'يحتاج تعريفًا'}</div>
            </div>
            <div className="rounded-xl bg-white/80 p-3">
              <div className="text-[9px] font-black text-primary-700">الأثر</div>
              <div className="mt-1 text-[10px] font-bold text-primary-950">{result.intelligence.advisorBrief.expectedOutcome || 'غير مثبت'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-black text-amber-950">حدود القرار</div>
          <div className="mt-2 text-[10px] leading-5 text-amber-900">
            {result.intelligence.advisorBrief.proofRequirement}
          </div>
          <div className="mt-3 text-[10px] font-bold text-amber-950">
            الحقول المربوطة: {result.mappedFieldCount}/{Math.max(1, result.totalFieldCount)} · حالة القرار: {result.advisory.actionState}
          </div>
          <div className="mt-1 text-[10px] font-bold text-amber-950">
            حالة النتيجة: {result.advisory.outcomeState} · المقارنة: لا تُخترع دون مرجع موثق
          </div>
        </div>
      </div>

      <details className="rounded-2xl border border-ink-200 bg-ink-50/70 p-4">
        <summary className="cursor-pointer text-xs font-black text-ink-800">أسئلة المستشار التي تم اختبارها</summary>
        {result.topQuestions.length ? (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {result.topQuestions.map((question) => (
              <div key={question.id} className="rounded-xl border border-ink-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-black text-ink-900">{question.label}</div>
                <span className="rounded-full bg-ink-50 px-2 py-1 text-[8px] font-black text-ink-500">{question.state}</span>
              </div>
              <div className="mt-1 text-[10px] leading-5 text-ink-600">{question.answer}</div>
              {question.followUp && (
                <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-primary-700">
                  <ArrowLeft size={11} />
                  {question.followUp}
                </div>
              )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-ink-200 bg-white p-3 text-[10px] leading-5 text-ink-600">
            لم يتم إنشاء سؤال استشاري إضافي من الدليل الحالي؛ لا نملأ المساحة بأسئلة شكلية.
          </div>
        )}
      </details>
    </section>
  );
}
