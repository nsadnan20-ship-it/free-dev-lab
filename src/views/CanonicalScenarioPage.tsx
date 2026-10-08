import { useMemo, useState } from 'react';
import { ArrowUpLeft, Info, RefreshCcw, ShieldCheck, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/States';
import { formatCurrency } from '@/lib/format';

type CanonicalScenarioPageProps = {
  baseRevenue: number;
  baseCost: number;
  currency: string;
};

function formatDelta(value: number, currency: string) {
  if (value === 0) return '—';
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value), currency)}`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'غير متاح';
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(1)}%`;
}

function DeltaValue({ value, percent, currency }: { value: number; percent?: number | null; currency: string }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold ${positive ? 'text-success-700' : neutral ? 'text-ink-400' : 'text-danger-700'}`}>
      {positive ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
      <span>{formatDelta(value, currency)}</span>
      {percent != null && <span className="rounded-full bg-white/70 px-2 py-0.5 ring-1 ring-inset ring-ink-100">{formatPercent(percent)}</span>}
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  description,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  description: string;
  onChange: (value: number) => void;
  tone: 'primary' | 'warning' | 'danger';
}) {
  const valueClass = value > 0 ? 'text-success-700' : value < 0 ? 'text-danger-700' : 'text-ink-500';
  const trackClass = tone === 'warning' ? 'accent-warning-600' : tone === 'danger' ? 'accent-danger-600' : 'accent-primary-600';

  return (
    <div className="rounded-2xl border border-ink-100 bg-ink-50/55 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label className="text-xs font-black text-ink-900">{label}</label>
          <p className="mt-1 text-[10px] leading-5 text-ink-400">{description}</p>
        </div>
        <span className={`shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black ring-1 ring-inset ring-ink-100 ${valueClass}`}>
          {value > 0 ? '+' : ''}{value}%
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[9px] font-bold text-ink-400">{min}%</span>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={`w-full ${trackClass}`}
        />
        <span className="text-[9px] font-bold text-ink-400">{max > 0 ? '+' : ''}{max}%</span>
      </div>
    </div>
  );
}

export function CanonicalScenarioPage({ baseRevenue, baseCost, currency }: CanonicalScenarioPageProps) {
  const [priceChange, setPriceChange] = useState(5);
  const [volumeChange, setVolumeChange] = useState(10);
  const [costChange, setCostChange] = useState(0);

  const scenario = useMemo(() => {
    const baseProfit = baseRevenue - baseCost;
    const baseMargin = baseRevenue > 0 ? (baseProfit / baseRevenue) * 100 : null;
    const newRevenue = baseRevenue * (1 + volumeChange / 100) * (1 + priceChange / 100);
    const newCost = baseCost * (1 + costChange / 100) * (1 + volumeChange / 100);
    const newProfit = newRevenue - newCost;
    const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : null;
    const profitDelta = newProfit - baseProfit;
    const revenueDelta = newRevenue - baseRevenue;
    const costDelta = newCost - baseCost;
    const profitChange = baseProfit === 0 ? null : (profitDelta / Math.abs(baseProfit)) * 100;
    const marginDelta = baseMargin == null || newMargin == null ? null : newMargin - baseMargin;

    return {
      baseProfit,
      baseMargin,
      newRevenue,
      newCost,
      newProfit,
      newMargin,
      profitDelta,
      revenueDelta,
      costDelta,
      profitChange,
      marginDelta,
    };
  }, [baseCost, baseRevenue, costChange, priceChange, volumeChange]);

  const outcomeTone = scenario.profitDelta > 0 ? 'success' : scenario.profitDelta < 0 ? 'danger' : 'neutral';
  const outcomeLabel = scenario.profitDelta > 0 ? 'يحسن الربح ضمن الافتراضات الحالية' : scenario.profitDelta < 0 ? 'يخفض الربح ضمن الافتراضات الحالية' : 'يحافظ على الربح ضمن الافتراضات الحالية';

  const reset = () => {
    setPriceChange(5);
    setVolumeChange(10);
    setCostChange(0);
  };

  return (
    <div dir="rtl" className="ag-scenario-surface space-y-5 animate-fade-in pb-10">
      <PageHeader
        title="محاكاة السيناريوهات"
        subtitle="اختبر حساسية الربحية على قاعدة مالية موثوقة قبل نقل السؤال إلى مرحلة القرار."
        actions={
          <>
            <Link to="/intelligence" className="btn-ghost text-[10px]">العودة للذكاء</Link>
            <button type="button" onClick={reset} className="btn-secondary text-[10px]">
              <RefreshCcw size={13} aria-hidden="true" /> إعادة الضبط
            </button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[1.5rem] border border-primary-900/30 bg-ink-950 text-white shadow-elevated">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr] lg:items-end lg:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[.16em] text-primary-300">
              <ShieldCheck size={14} aria-hidden="true" />
              قاعدة مالية اجتازت بوابة الحقيقة
            </div>
            <h2 className="mt-2 text-xl font-black leading-tight lg:text-2xl">المحاكاة هنا أداة حساسية، وليست توقعًا أو ضمانًا.</h2>
            <p className="mt-3 max-w-3xl text-[11px] leading-6 text-slate-300">
              نقطة البداية مأخوذة من الإيرادات والتكلفة التي اجتازت مسار الحقيقة المالية الحالي. كل نتيجة أدناه مشتقة من الافتراضات الثلاثة فقط، ولا تضيف بيانات أو احتمالات غير موجودة.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[9px] text-slate-400">السعر</div>
              <div className="mt-1 text-sm font-black">{priceChange > 0 ? '+' : ''}{priceChange}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[9px] text-slate-400">الحجم</div>
              <div className="mt-1 text-sm font-black">{volumeChange > 0 ? '+' : ''}{volumeChange}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[9px] text-slate-400">التكلفة</div>
              <div className="mt-1 text-sm font-black">{costChange > 0 ? '+' : ''}{costChange}%</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[.86fr_1.14fr]">
        <Card variant="action">
          <CardHeader
            kicker="ASSUMPTIONS"
            title="محددات السيناريو"
            subtitle="حرّك عاملًا واحدًا أو أكثر وشاهد الأثر فورًا."
            action={<SlidersHorizontal size={17} className="text-primary-700" aria-hidden="true" />}
          />
          <CardBody className="space-y-3">
            <SliderControl
              label="تغيير السعر"
              value={priceChange}
              min={-20}
              max={20}
              description="يؤثر مباشرة في الإيرادات، مع بقاء التكلفة مرتبطة بالحجم."
              onChange={setPriceChange}
              tone="primary"
            />
            <SliderControl
              label="تغيير حجم المبيعات"
              value={volumeChange}
              min={-30}
              max={30}
              description="يحرك الإيرادات والتكلفة معًا وفق الصيغة الحالية للمحاكاة."
              onChange={setVolumeChange}
              tone="primary"
            />
            <SliderControl
              label="تغيير التكلفة"
              value={costChange}
              min={-15}
              max={15}
              description="حساسية مباشرة للتكلفة قبل تطبيق أثر حجم المبيعات."
              onChange={setCostChange}
              tone="danger"
            />
            <div className="rounded-2xl border border-ink-100 bg-white p-3 text-[10px] leading-5 text-ink-500">
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-primary-700" aria-hidden="true" />
                <span>السيناريو حساب deterministic على القاعدة المالية الحالية. لا توجد احتمالات نجاح، ولا تنبؤ زمني، ولا استنتاج سببي مخفي.</span>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant={outcomeTone === 'danger' ? 'alert' : 'decision'}>
          <CardHeader
            kicker="SCENARIO READOUT"
            title="أثر السيناريو"
            subtitle={outcomeLabel}
            action={
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ring-1 ring-inset ${
                outcomeTone === 'success' ? 'bg-success-50 text-success-700 ring-success-100' :
                outcomeTone === 'danger' ? 'bg-danger-50 text-danger-700 ring-danger-100' :
                'bg-ink-50 text-ink-600 ring-ink-100'
              }`}>
                {outcomeTone === 'success' ? 'تحسن' : outcomeTone === 'danger' ? 'تراجع' : 'محايد'}
              </span>
            }
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
                <div className="text-[9px] font-bold text-ink-400">الإيرادات</div>
                <div className="mt-1 text-[15px] font-black text-ink-950">{formatCurrency(scenario.newRevenue, currency)}</div>
                <DeltaValue value={scenario.revenueDelta} currency={currency} />
              </div>
              <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-3">
                <div className="text-[9px] font-bold text-ink-400">التكلفة</div>
                <div className="mt-1 text-[15px] font-black text-ink-950">{formatCurrency(scenario.newCost, currency)}</div>
                <DeltaValue value={scenario.costDelta} currency={currency} />
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-3 ring-1 ring-inset ring-primary-100">
                <div className="text-[9px] font-bold text-primary-600">الربح</div>
                <div className="mt-1 text-[15px] font-black text-ink-950">{formatCurrency(scenario.newProfit, currency)}</div>
                <DeltaValue value={scenario.profitDelta} percent={scenario.profitChange} currency={currency} />
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-3">
                <div className="text-[9px] font-bold text-ink-400">الهامش</div>
                <div className="mt-1 text-[15px] font-black text-ink-950">{scenario.newMargin == null ? 'غير متاح' : `${scenario.newMargin.toFixed(1)}%`}</div>
                <div className={`mt-2 text-[10px] font-bold ${scenario.marginDelta == null ? 'text-ink-400' : scenario.marginDelta >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                  {scenario.marginDelta == null ? 'لا يمكن المقارنة' : `${scenario.marginDelta > 0 ? '+' : ''}${scenario.marginDelta.toFixed(1)} نقطة`}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-950 p-4 text-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[.14em] text-primary-300">DECISION SIGNAL</div>
                  <div className="mt-1 text-sm font-black">{outcomeLabel}</div>
                  <p className="mt-1 max-w-2xl text-[10px] leading-5 text-slate-300">
                    الربح الأساسي: {formatCurrency(scenario.baseProfit, currency)} · الربح بعد السيناريو: {formatCurrency(scenario.newProfit, currency)}
                  </p>
                </div>
                <span className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black">
                  {formatPercent(scenario.profitChange)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card variant="evidence">
          <CardHeader kicker="BASELINE" title="قاعدة المقارنة" subtitle="الأرقام التي بدأت منها المحاكاة." />
          <CardBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">الإيرادات</div><div className="mt-1 text-sm font-black text-ink-900">{formatCurrency(baseRevenue, currency)}</div></div>
              <div className="rounded-2xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">التكلفة</div><div className="mt-1 text-sm font-black text-ink-900">{formatCurrency(baseCost, currency)}</div></div>
              <div className="rounded-2xl bg-ink-50 p-3"><div className="text-[9px] text-ink-400">الهامش</div><div className="mt-1 text-sm font-black text-ink-900">{scenario.baseMargin == null ? 'غير متاح' : `${scenario.baseMargin.toFixed(1)}%`}</div></div>
            </div>
          </CardBody>
        </Card>

        <Card variant="quality">
          <CardHeader kicker="BOUNDARY" title="حدود القراءة" subtitle="ما الذي تعنيه هذه النتيجة وما الذي لا تعنيه." />
          <CardBody>
            <div className="space-y-2 text-[10px] leading-5 text-ink-600">
              <div className="rounded-xl border border-success-100 bg-success-50/60 px-3 py-2">✓ تعكس النتيجة الصيغة الحسابية والافتراضات الظاهرة فقط.</div>
              <div className="rounded-xl border border-warning-100 bg-warning-50/60 px-3 py-2">! لا تثبت السببية ولا احتمال تحقق السيناريو في السوق.</div>
              <div className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2">↳ قبل اتخاذ قرار فعلي، ارجع إلى الدليل والسياق التشغيلي والقرار المعتمد.</div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black text-ink-900">الخطوة التالية</div>
          <p className="mt-1 text-[10px] text-ink-400">استخدم السيناريو لصياغة سؤال قرار، ثم ارجع إلى الأدلة والسياق قبل الاعتماد.</p>
        </div>
        <Link to="/decision-experience" className="btn-primary shrink-0 text-[10px]">فتح تجربة القرار <ArrowUpLeft size={13} /></Link>
      </div>
    </div>
  );
}
