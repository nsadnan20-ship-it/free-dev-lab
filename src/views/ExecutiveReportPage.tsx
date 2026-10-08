import { useCallback, useEffect, useState } from 'react';
import { ReportSourceContext } from '@/components/ReportSourceContext';
import { SourceBoundReportSurface } from '@/components/SourceBoundReportSurface';
import { ArrowLeft, FileText, Printer, RefreshCw, ShieldCheck, Target, TrendingUp } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { fetchDashboardIntelligence, fetchDashboardSnapshot, type DashboardKPIs, type MonthlyTrend } from '@/lib/dashboard-canonical';
import type { Alert, Recommendation } from '@/lib/types';
import { formatCurrency, formatNumber } from '@/lib/format';
import { TruthContextStrip } from '@/components/TruthContextStrip';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
    <p className="text-xs font-medium text-ink-500">{label}</p>
    <p className="mt-1 text-xl font-black tracking-tight text-ink-950">{value}</p>
    <p className="mt-1 text-[11px] text-ink-400">{hint}</p>
  </div>;
}

function recommendationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'قيد المراجعة',
    proposed: 'مقترح',
    approved: 'معتمد',
    in_progress: 'قيد التنفيذ',
    completed: 'مكتمل',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
  };
  return labels[status] ?? status;
}

function TrendStrip({ trend }: { trend: MonthlyTrend[] }) {
  const points = trend.slice(-6);
  const values = points.map((point) => typeof point.sales === 'number' && Number.isFinite(point.sales) ? point.sales : null);
  const finiteSales = values.filter((value): value is number => value !== null);
  const max = Math.max(...finiteSales, 1);
  return <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
    {points.map((point, index) => {
      const sales = values[index];
      const height = sales == null ? 0 : Math.max(10, Math.round((sales / max) * 100));
      return <div key={`${point.month}-${index}`} className="min-w-0">
        <div className="flex h-24 items-end rounded-xl bg-ink-50 p-2">
          <div className="w-full rounded-lg bg-primary-500/80" style={{ height: `${height}%` }} title={sales == null ? undefined : formatCurrency(sales)} />
        </div>
        <p className="mt-2 truncate text-center text-[11px] text-ink-500">{point.month}</p>
      </div>;
    })}
  </div>;
}

function ExecutiveReportGeneralPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [trend, setTrend] = useState<MonthlyTrend[]>([]);
  const [asOf, setAsOf] = useState<string>('غير متاح');
  const [data, setData] = useState<{ alerts: Alert[]; recommendations: Recommendation[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshot, intelligence] = await Promise.all([fetchDashboardSnapshot(6), fetchDashboardIntelligence()]);
      setKpis(snapshot.kpis);
      setTrend(snapshot.trend);
      setAsOf(snapshot.asOf);
      setData(intelligence);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل التقرير التنفيذي.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recommendations = data?.recommendations ?? [];
  const activeDecisionCount = recommendations.filter((item) => ['pending', 'proposed', 'approved', 'in_progress'].includes(item.status)).length;
  const accountableDecisionCount = recommendations.filter((item) => Boolean(item.owner)).length;
  const recordedOutcomeCount = recommendations.filter((item) => Boolean(item.impact_result?.trim())).length;
  const nextAction = kpis?.status !== 'CALCULATED'
    ? { to: '/data-quality', label: 'مراجعة جودة البيانات', reason: 'الحقيقة المالية أو التشغيلية غير مكتملة بعد.' }
    : data?.alerts.length
      ? { to: '/decision-inbox', label: 'فتح مركز القرارات', reason: 'هناك تنبيهات مصدرية تحتاج إلى متابعة.' }
      : recommendations.length
        ? { to: '/decision-inbox', label: 'مراجعة القرارات', reason: 'هناك توصيات مصدرية جاهزة للمراجعة.' }
        : { to: '/trust', label: 'فحص الدليل', reason: 'لا توجد عناصر قرار نشطة؛ راجع مصدر الحقيقة قبل الانتقال.' };

  return <div dir="rtl" className="ag-executive-report report-page space-y-5 pb-10 print:space-y-3">
      <ReportSourceContext />
    <header className="ag-exec-hero overflow-hidden rounded-[14px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-primary-700"><FileText size={15}/> EXECUTIVE REPORTING</div>
          <h1 className="mt-1.5 text-[24px] font-black tracking-tight text-ink-950 lg:text-[30px]">التقرير التنفيذي</h1>
          <p className="mt-2 max-w-3xl text-[11px] leading-5 text-ink-500">من المؤشر إلى القرار: ملخص تشغيلي مبني على المصادر المعتمدة، مع إبقاء أي فجوة بيانات معلنة بدل اختلاق قيمة.</p>
        </div>
        <div className="print-hide flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary text-xs disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث</button>
          <button type="button" onClick={() => window.print()} className="btn-primary text-xs"><Printer size={17} /> طباعة / PDF</button>
        </div>
      </div>
    </header>

    {loading && <LoadingState message="جارٍ بناء التقرير التنفيذي من المصادر المعتمدة..." />}
    {error && <ErrorState message={error} onRetry={() => void load()} />}

    {!loading && !error && <>
      <section className="ag-decision-strip" aria-label="ملخص التقرير التنفيذي">
        <div className="ag-decision-cell"><span className="ag-decision-label">المبيعات</span><span className="ag-decision-value">{kpis?.totalSales == null ? 'غير متاح' : formatCurrency(kpis.totalSales)}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">الهامش</span><span className="ag-decision-value">{kpis?.grossMargin == null ? 'غير متاح' : `${kpis.grossMargin.toFixed(1)}%`}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">التحصيل</span><span className="ag-decision-value">{kpis?.collectionRate == null ? 'غير متاح' : `${kpis.collectionRate.toFixed(1)}%`}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">التنبيهات</span><span className="ag-decision-value">{data?.alerts.length ?? 0}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">الحالة</span><span className="ag-decision-value">{kpis?.status === 'CALCULATED' ? 'محسوبة' : kpis?.status === 'INSUFFICIENT_DATA' ? 'البيانات غير كافية' : kpis?.status ? 'تحتاج مراجعة' : 'غير متاح'}</span></div>
      </section>

      <TruthContextStrip months={6} status={kpis?.status ?? 'INSUFFICIENT_DATA'} asOf={asOf} />
      <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm" aria-label="الخطوة التالية في التقرير التنفيذي">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-primary-700">NEXT ACTION</div><p className="mt-1 text-sm font-black text-ink-900">{nextAction.label}</p><p className="mt-1 text-[11px] text-ink-500">{nextAction.reason}</p></div>
          <Link to={nextAction.to} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink-950 px-4 text-xs font-bold text-white hover:bg-ink-800">متابعة الإجراء <ArrowLeft size={13} className="mr-1" /></Link>
        </div>
      </section>

      <section className="ag-exec-panel rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-primary-600">الملخص التنفيذي</p><h2 className="mt-1 text-lg font-black">لقطة الإدارة الحالية</h2></div><span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] font-bold text-primary-700">المصدر: بيانات الشركة المعتمدة</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="إجمالي المبيعات" value={kpis?.totalSales == null ? 'غير متاح' : formatCurrency(kpis.totalSales)} hint="الفترة المعتمدة في المصدر" />
          <Metric label="الهامش الإجمالي" value={kpis?.grossMargin == null ? 'غير متاح' : `${kpis.grossMargin.toFixed(1)}%`} hint="لا يعرض عند نقص المصدر" />
          <Metric label="معدل التحصيل" value={kpis?.collectionRate == null ? 'غير متاح' : `${kpis.collectionRate.toFixed(1)}%`} hint="مؤشر التحصيل" />
          <Metric label="الذمم المتأخرة" value={kpis?.overdueReceivables == null ? 'غير متاح' : formatCurrency(kpis.overdueReceivables)} hint="رصيد يحتاج متابعة" />
        </div>
      </section>

      <section className="ag-exec-panel rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><TrendingUp size={18} className="text-primary-600" /><div><h2 className="text-lg font-black">نبض المبيعات</h2><p className="text-xs text-ink-500">آخر 6 أشهر من المصدر المعتمد</p></div></div>
        <div className="mt-5">{trend.length ? <TrendStrip trend={trend} /> : <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-500">لا توجد سلسلة زمنية كافية للعرض.</p>}</div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-danger-600">الانتباه</p><h2 className="mt-1 text-lg font-black">أهم التنبيهات</h2></div><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{formatNumber(data?.alerts.length ?? 0)}</span></div>
          <div className="mt-4 space-y-3">{(data?.alerts ?? []).map((alert) => <article key={alert.id} className="rounded-xl border border-ink-100 p-4"><p className="font-bold text-ink-900">{alert.title}</p><Link to="/decision-inbox" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-primary-700">فتح مركز القرارات <ArrowLeft size={13} /></Link></article>)}{!(data?.alerts?.length) && <EmptyState title="لا توجد تنبيهات مصدرية حاليًا." message="لا يتم تصنيع تنبيه عند غياب الإشارة المثبتة." action={<Link to="/trust" className="btn-secondary min-h-11">فحص الدليل</Link>} />}</div>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-primary-600">الإجراء</p><h2 className="mt-1 text-lg font-black">التوصيات النشطة</h2></div><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">{formatNumber(data?.recommendations.length ?? 0)}</span></div>
          <div className="mt-4 space-y-3">{(data?.recommendations ?? []).map((rec, index) => <article key={rec.id ?? index} className="rounded-xl border border-ink-100 p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary-50 px-2 py-1 text-[9px] font-black text-primary-700">{recommendationStatusLabel(rec.status)}</span>{rec.owner && <span className="rounded-full bg-ink-50 px-2 py-1 text-[9px] font-bold text-ink-500">المسؤول: {rec.owner}</span>}</div>
            <p className="mt-2 font-bold text-ink-900">{rec.title}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-ink-500"><span>الأثر المتوقع: {rec.expected_impact == null ? 'غير متاح' : formatCurrency(rec.expected_impact)}</span><span>الأثر الفعلي: {rec.impact_result ?? 'غير مسجل'}</span></div>
            <Link to="/decision-experience" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary-700">فتح مساحة القرار <ArrowLeft size={13} /></Link>
          </article>)}{!(data?.recommendations?.length) && <EmptyState title="لا توجد توصيات مصدرية حاليًا." message="لا تُنتج توصية بديلة عند غياب الإشارة المثبتة." action={<Link to="/trust" className="btn-secondary min-h-11">فحص الدليل</Link>} />}</div>
        </div>
      </section>

      <section className="ag-exec-warning rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 text-amber-900"><Target size={18} /><h2 className="font-black">حدود الدليل</h2></div>
        <p className="mt-2 text-sm leading-7 text-amber-900">المصدر والحساب والموثوقية التشغيلية تحتاج دليلًا تشغيليًا موثقًا. هذا التقرير لا يحول غياب الدليل إلى نجاح ولا يدعي تنفيذ قرار أو نتيجة فعلية.</p>
      </section>

      <section className="ag-exec-panel rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary-600" /><h2 className="text-lg font-black">القرار والمساءلة والنتيجة</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs text-ink-500">القرار</p><p className="mt-1 text-lg font-black">{activeDecisionCount}</p><p className="mt-1 text-[10px] text-ink-500">{accountableDecisionCount} منها لها مسؤول مسجل</p></div>
          <div className="rounded-xl bg-ink-50 p-4" aria-label="Actual Outcome"><p className="text-xs text-ink-500">النتيجة الفعلية</p><p className="mt-1 text-lg font-black">{recordedOutcomeCount}</p><p className="mt-1 text-[10px] text-ink-500">توصية لديها أثر فعلي مسجل</p></div>
          <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs text-ink-500">التعلّم</p><p className="mt-1 font-bold">{recordedOutcomeCount ? 'يوجد أثر يحتاج مراجعة' : 'لا يوجد أثر فعلي مثبت بعد'}</p><p className="mt-1 text-[10px] text-ink-500">لا تُستنتج نتيجة من غياب السجل</p></div>
        </div>
        <Link to="/decision-experience" className="mt-4 inline-flex rounded-xl bg-ink-950 px-4 py-2.5 text-xs font-bold text-white">فتح مساحة القرار</Link>
      </section>
    </>}
  </div>;
}

export function ExecutiveReportPage() {
  const [params] = useSearchParams();
  const reportJobId = params.get('reportJobId')?.trim() ?? '';
  const sourceHash = params.get('sourceHash')?.trim() ?? '';
  if (reportJobId) {
    return <SourceBoundReportSurface mode="executive" jobId={reportJobId} expectedSourceHash={sourceHash} />;
  }
  return <ExecutiveReportGeneralPage />;
}