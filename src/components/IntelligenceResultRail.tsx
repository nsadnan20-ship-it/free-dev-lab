import { ArrowUpLeft, CheckCircle2, CircleAlert, Lightbulb, ShieldCheck, Target } from 'lucide-react';
import { Link } from '@/lib/router-compat';

export type IntelligenceResultRailProps = {
  sourceLabel: string;
  headline: string;
  signalTitle: string;
  signalMessage: string;
  evidence: string[];
  whyNow: string;
  recommendationTitle: string;
  recommendationAction: string;
  measurement: string;
  blocker: string;
  status: string;
  href?: string;
  hrefLabel?: string;
};

export function IntelligenceResultRail({
  sourceLabel,
  headline,
  signalTitle,
  signalMessage,
  evidence,
  whyNow,
  recommendationTitle,
  recommendationAction,
  measurement,
  blocker,
  status,
  href,
  hrefLabel = 'افتح التقرير الذكي',
}: IntelligenceResultRailProps) {
  return (
    <section
      dir="rtl"
      className="overflow-hidden rounded-[22px] border border-primary-200 bg-white shadow-[0_22px_60px_-38px_rgba(15,23,42,.35)]"
      aria-label="نتيجة ذكاء التقرير"
    >
      <div className="bg-[linear-gradient(135deg,#07131b,#0d2d2d)] p-4 text-white lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black tracking-[.14em] text-emerald-200">
              <ShieldCheck size={14} />
              SMART RESULT · {sourceLabel}
            </div>
            <h3 className="mt-2 text-lg font-black leading-7 lg:text-xl">{headline}</h3>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 text-[9px] font-black text-slate-100">
            {status}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4 lg:p-5">
        <article className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-amber-800">
            <CircleAlert size={13} />
            الإشارة الفعلية
          </div>
          <div className="mt-2 text-sm font-black text-amber-950">{signalTitle}</div>
          <p className="mt-1 text-[10px] leading-5 text-amber-900">{signalMessage}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-slate-600">
            <Lightbulb size={13} />
            لماذا الآن؟
          </div>
          <p className="mt-2 text-[10px] font-bold leading-5 text-slate-900">{whyNow}</p>
        </article>

        <article className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-primary-800">
            <Target size={13} />
            ماذا نفعل الآن؟
          </div>
          <div className="mt-2 text-sm font-black leading-6 text-primary-950">{recommendationTitle}</div>
          <p className="mt-1 text-[10px] leading-5 text-primary-900">{recommendationAction}</p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-emerald-800">
            <CheckCircle2 size={13} />
            كيف نعرف أن المعالجة نجحت؟
          </div>
          <p className="mt-2 text-[10px] font-bold leading-5 text-emerald-950">{measurement}</p>
        </article>
      </div>

      <div className="grid gap-3 border-t border-ink-100 bg-ink-50/70 p-4 lg:grid-cols-[1fr_auto] lg:items-center lg:p-5">
        <div>
          <div className="text-[9px] font-black text-ink-500">الدليل وحد القرار</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {evidence.length > 0
              ? evidence.slice(0, 6).map((item) => (
                <span key={item} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 font-mono text-[8px] text-ink-600">{item}</span>
              ))
              : <span className="rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-1.5 text-[9px] font-bold text-warning-900">لا توجد قرائن كافية للاعتماد.</span>}
          </div>
          <p className="mt-2 text-[10px] leading-5 text-ink-600"><b>مانع الاعتماد:</b> {blocker}</p>
        </div>
        {href ? (
          <Link to={href} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary-700 px-4 text-[10px] font-black text-white hover:bg-primary-800">
            {hrefLabel}
            <ArrowUpLeft size={13} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
