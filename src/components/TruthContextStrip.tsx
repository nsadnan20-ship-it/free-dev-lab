import { CalendarRange, CheckCircle2, Database, ShieldAlert } from 'lucide-react';

type TruthState = 'CONFIRMED' | 'CALCULATED' | 'INSUFFICIENT_DATA';

interface TruthContextStripProps {
  months: number;
  status: TruthState;
  asOf: string;
}

const stateMeta: Record<TruthState, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  CONFIRMED: { label: 'مصدر مؤكد', className: 'text-success-700 bg-success-50 ring-success-100', icon: CheckCircle2 },
  CALCULATED: { label: 'محسوب من المصدر', className: 'text-primary-700 bg-primary-50 ring-primary-100', icon: CheckCircle2 },
  INSUFFICIENT_DATA: { label: 'بيانات غير كافية', className: 'text-warning-700 bg-warning-50 ring-warning-100', icon: ShieldAlert },
};

export function TruthContextStrip({ months, status, asOf }: TruthContextStripProps) {
  const meta = stateMeta[status];
  const StateIcon = meta.icon;
  return (
    <section aria-label="سياق حقيقة البيانات" className="rounded-[12px] border border-ink-200 bg-white p-3 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Database size={16} className="shrink-0 text-primary-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-black text-ink-900">سياق المؤشرات</p>
            <p className="text-[11px] leading-5 text-ink-400">هذه اللقطة هي مرجع القراءة الحالية؛ لا تُستبدل القيم غير المتاحة بأرقام افتراضية.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] sm:flex sm:flex-wrap sm:items-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1.5 font-semibold text-ink-600 ring-1 ring-inset ring-ink-100"><CalendarRange size={13} aria-hidden="true" />الفترة: آخر {months} {months === 1 ? 'شهر' : 'أشهر'}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1.5 font-semibold text-ink-600 ring-1 ring-inset ring-ink-100">اللقطة: {asOf}</span>
          <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-bold ring-1 ring-inset ' + meta.className}><StateIcon size={13} aria-hidden="true" />{meta.label}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1.5 font-semibold text-ink-600 ring-1 ring-inset ring-ink-100">المؤسسة الحالية · مسار مصدر معتمد</span>
        </div>
      </div>
    </section>
  );
}
