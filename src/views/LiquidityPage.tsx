import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpLeft, CircleAlert, Landmark, RefreshCw, ShieldCheck, Target } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, LoadingState, ErrorState, DataUnavailableState } from '@/components/ui/States';
import { fetchDashboardSnapshot, type DashboardKPIs } from '@/lib/dashboard-canonical';
import { formatCurrency } from '@/lib/format';
import { ReportSourceContext } from '@/components/ReportSourceContext';

function MoneyMetric({ label, value, note }: { label: string; value: number | null; note: string }) {
  return <div className="rounded-2xl border border-ink-100 bg-white p-4"><div className="text-[10px] font-black text-ink-400">{label}</div><div className="mt-2 text-xl font-black tabular-nums text-ink-950">{value == null ? 'غير متاح' : formatCurrency(value)}</div><div className="mt-1 text-[10px] leading-5 text-ink-400">{note}</div></div>;
}

export function LiquidityPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [asOf, setAsOf] = useState('غير متاح');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      setError(null);
      const snapshot = await fetchDashboardSnapshot(6);
      setKpis(snapshot.kpis);
      setAsOf(snapshot.asOf);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل صورة السيولة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exposure = useMemo(() => {
    if (!kpis || kpis.totalReceivables == null || kpis.totalPayables == null) return null;
    return kpis.totalReceivables - kpis.totalPayables;
  }, [kpis]);

  const nextAction = useMemo(() => {
    if (kpis?.status === 'INSUFFICIENT_DATA') {
      return { to: '/import', label: 'إضافة مصدر', title: 'ابدأ بإثبات المصدر' };
    }
    if ((kpis?.overdueReceivables ?? 0) > 0) {
      return { to: '/reports/receivables', label: 'راجع المتأخرات', title: 'ابدأ بالتحصيل المتأخر' };
    }
    if ((kpis?.totalPayables ?? 0) > 0) {
      return { to: '/reports/purchases', label: 'راجع المستحقات', title: 'راجع التزامات الموردين' };
    }
    return { to: '/trust', label: 'فحص الثقة', title: 'تحقق من المصدر قبل القرار' };
  }, [kpis]);

  if (loading) return <LoadingState message="جارٍ بناء صورة السيولة من المؤشرات الكانونية..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!kpis) return <DataUnavailableState title="صورة السيولة غير متاحة" message="لم تصل مؤشرات الذمم والمستحقات من المصدر الكانوني؛ لا يتم عرض شاشة فارغة أو افتراض رصيد نقدي." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>} />;

  return <div dir="rtl" className="space-y-6 pb-10 animate-fade-in">\n    <ReportSourceContext />
    <PageHeader title="السيولة والتعرض النقدي" subtitle="قراءة موثقة للذمم والمستحقات والتحصيل؛ الرصيد النقدي البنكي لا يُعرض ما لم يوجد مصدر مثبت له." actions={<button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-secondary text-[11px]"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> تحديث</button>} />
    <section className="ag-command-hero overflow-hidden rounded-[1.75rem] p-6 text-white lg:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.14em] text-primary-200"><Landmark size={14} /> LIQUIDITY CONTROL</div>
          <h2 className="mt-2 text-2xl font-black lg:text-3xl">اعرف أين يتركز التعرض قبل أن تبحث عن النقد.</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">المسار الحالي يثبت ما هو مستحق للتحصيل وما هو مستحق للدفع ومعدل التحصيل. لا يتم تحويل ذلك إلى رصيد نقدي أو تدفق مصرفي غير موجود في المصدر.</p>
        </div>
        <Badge variant={kpis.status === 'CONFIRMED' ? 'success' : kpis.status === 'CALCULATED' ? 'primary' : 'warning'}>{kpis.status === 'CONFIRMED' ? 'مؤكد' : kpis.status === 'CALCULATED' ? 'محسوب' : 'البيانات غير كافية'}</Badge>
      </div>
      <div className="mt-5 text-[10px] text-ink-300">As Of: {asOf}</div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MoneyMetric label="إجمالي الذمم" value={kpis.totalReceivables} note="مبالغ مدينة قابلة للتحقق من المصدر." />
      <MoneyMetric label="المتأخر التحصيلي" value={kpis.overdueReceivables} note="الجزء المتأخر من الذمم، عند توفره." />
      <MoneyMetric label="المستحقات للموردين" value={kpis.totalPayables} note="التزامات الشراء الظاهرة في المؤشر الكانوني." />
      <MoneyMetric label="معدل التحصيل" value={kpis.collectionRate} note={kpis.collectionRate == null ? 'غير متاح' : 'النسبة المحسوبة من المصدر.'} />
    </section>
    <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <Card variant="kpi"><CardHeader title="صافي التعرض التجاري" subtitle="ذمم العملاء ناقص مستحقات الموردين؛ ليس رصيدًا نقديًا." /><CardBody><div className="text-3xl font-black tabular-nums text-ink-950">{exposure == null ? 'غير متاح' : formatCurrency(exposure)}</div><div className="mt-2 text-[11px] leading-6 text-ink-500">يُستخدم كمؤشر تعرض تجاري مساعد فقط، ولا يمثل النقد المتاح في البنك أو الصندوق.</div></CardBody></Card>
      <Card variant="alert"><CardHeader title="حدود المعرفة المالية" subtitle="ما يجب أن يبقى ظاهرًا بدل التقدير." /><CardBody className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50/60 p-3"><CircleAlert size={17} className="mt-0.5 shrink-0 text-warning-700" /><div><div className="text-[11px] font-black text-warning-950">الرصيد النقدي المباشر</div><p className="mt-1 text-[10px] leading-5 text-warning-900">غير متاح من المصدر الحالي؛ لا توجد خانة بنكية موثقة هنا.</p></div></div>
        <div className="flex flex-wrap gap-2"><Link to="/reports/receivables" className="btn-secondary text-[11px]">تفاصيل الذمم <ArrowUpLeft size={13}/></Link><Link to="/reports/purchases" className="btn-secondary text-[11px]">تفاصيل المشتريات <ArrowUpLeft size={13}/></Link><Link to="/trust" className="btn-ghost text-[11px]">فحص الثقة</Link></div>
      </CardBody></Card>
    </section>
    <section className="ag-decision-strip" aria-label="سياق السيولة">
      <div className="ag-decision-cell">
        <span className="ag-decision-label">الحقيقة المتاحة</span>
        <span className="ag-decision-value"><ShieldCheck size={13} className="mr-1 inline text-primary-700" /> الذمم والمستحقات ومعدل التحصيل</span>
      </div>
      <div className="ag-decision-cell">
        <span className="ag-decision-label">التعرض</span>
        <span className="ag-decision-value">{exposure == null ? 'غير متاح' : formatCurrency(exposure)}</span>
      </div>
      <div className="ag-decision-cell">
        <span className="ag-decision-label">As Of</span>
        <span className="ag-decision-value">{asOf}</span>
      </div>
      <div className="ag-decision-cell">
        <span className="ag-decision-label">الحالة</span>
        <span className="ag-decision-value">{kpis.status === "CONFIRMED" ? "مؤكد" : kpis.status === "CALCULATED" ? "محسوب" : "البيانات غير كافية"}</span>
      </div>
      <div className="ag-decision-cell">
        <span className="ag-decision-label">الخطوة التالية</span>
        <span className="ag-decision-value">
          <Target size={13} className="mr-1 inline text-primary-700" />
          <Link to={nextAction.to} className="font-bold text-primary-700 hover:underline" aria-label={'الخطوة التالية: ' + nextAction.title}>
            {nextAction.label}
          </Link>
        </span>
      </div>
    </section>
    {kpis.status === 'INSUFFICIENT_DATA' && <div className="rounded-2xl border border-warning-200 bg-warning-50/70 p-4 text-[11px] leading-6 text-warning-900">بعض المؤشرات المالية لا تكفي لإصدار صورة مكتملة. تبقى القيم غير المتاحة ظاهرة كـ«غير متاح» ولا تُستبدل بأصفار أو تقديرات.</div>}
  </div>;
}
