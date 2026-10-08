import { ArrowUpLeft, CheckCircle2, CircleAlert, Database, Lightbulb, ListChecks, PlayCircle, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { Link } from '@/lib/router-compat';

export type CommercialValueStage = {
  label: string;
  englishLabel?: string;
  status: string;
  detail: string;
  href?: string;
  tone?: 'trusted' | 'active' | 'attention' | 'neutral';
};

const toneClasses: Record<NonNullable<CommercialValueStage['tone']>, string> = {
  trusted: 'border-indigo-200 bg-indigo-50/80 text-indigo-950',
  active: 'border-indigo-200 bg-indigo-50/80 text-indigo-950',
  attention: 'border-amber-200 bg-amber-50/80 text-amber-950',
  neutral: 'border-slate-200 bg-slate-50 text-slate-900',
};

function StageIcon({ index, tone }: { index: number; tone: CommercialValueStage['tone'] }) {
  const icons = [Database, ShieldCheck, Sparkles, Lightbulb, Target, ListChecks, PlayCircle, CheckCircle2];
  const Icon = icons[index] ?? CircleAlert;
  return <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ' + toneClasses[tone ?? 'neutral']}>
    <Icon size={15} />
  </span>;
}

export function CommercialValueChain({
  stages,
  title = 'من المصدر إلى النتيجة',
  subtitle = 'المنتج لا يتوقف عند التقرير: كل طبقة تبين ما ثبت، وما يمكن فعله، وما لم يُثبت بعد.',
}: {
  stages: CommercialValueStage[];
  title?: string;
  subtitle?: string;
}) {
  return (
    <section dir="rtl" aria-label="مسار القيمة من المصدر إلى النتيجة" className="ag-value-chain rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_22px_55px_-34px_rgba(15,23,42,.26)] lg:p-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="section-kicker">نظام تشغيل القيمة</div>
          <h2 className="mt-1 text-lg font-black text-slate-950 lg:text-xl">{title}</h2>
        </div>
        <p className="max-w-3xl text-[10px] leading-5 text-slate-500 lg:text-[11px]">{subtitle}</p>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="grid min-w-[1040px] grid-cols-8 gap-2.5">
          {stages.map((stage, index) => {
            const tone = stage.tone ?? (stage.status === 'VERIFIED' || stage.status === 'READY' ? 'trusted' : stage.status === 'REVIEW' ? 'attention' : index < 5 ? 'active' : 'neutral');
            const content = (
              <>
                <div className="flex items-start gap-2.5">
                  <StageIcon index={index} tone={tone} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[8px] font-black tracking-[.12em] text-slate-400">{String(index + 1).padStart(2, '0')} · {stage.englishLabel ?? stage.label}</div>
                    <div className="mt-1 text-[12px] font-black text-slate-950">{stage.label}</div>
                    <div className="mt-1 inline-flex max-w-full rounded-full border border-slate-200 bg-white px-2 py-1 text-[8px] font-black text-slate-700">{stage.status}</div>
                  </div>
                </div>
                <div className="mt-3 line-clamp-3 text-[9px] leading-5 text-slate-500">{stage.detail}</div>
                {stage.href ? <div className="mt-2 inline-flex items-center gap-1 text-[9px] font-black text-indigo-700">فتح المسار <ArrowUpLeft size={11}/></div> : null}
              </>
            );
            return stage.href
              ? <Link key={stage.label + index} to={stage.href} className="group rounded-2xl border border-slate-200 bg-slate-50/65 p-3 transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-[0_16px_34px_-26px_rgba(79,70,229,.35)]">{content}</Link>
              : <article key={stage.label + index} className="rounded-2xl border border-slate-200 bg-slate-50/65 p-3">{content}</article>;
          })}
        </div>
      </div>
    </section>
  );
}
