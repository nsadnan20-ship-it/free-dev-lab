import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpLeft, BarChart3, Brain, CalendarRange, CheckCircle2, CircleAlert, FileSearch,
  Package, RefreshCw, Sparkles, TrendingUp, WalletCards
} from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { TruthContextStrip } from '@/components/TruthContextStrip';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

import { LoadingState, ErrorState, DataUnavailableState } from '@/components/ui/States';
const TrendChart = lazy(() => import('@/components/ui/Charts').then(m => ({ default: m.TrendChart })));
const CategoryPieChart = lazy(() => import('@/components/ui/Charts').then(m => ({ default: m.CategoryPieChart })));
const HorizontalBarChart = lazy(() => import('@/components/ui/Charts').then(m => ({ default: m.HorizontalBarChart })));
import { fetchDashboardSnapshot, fetchDashboardIntelligence } from '@/lib/dashboard-canonical';
import { formatCurrency } from '@/lib/format';
import type { Recommendation, Alert } from '@/lib/types';
import type {
  DashboardKPIs,
  MonthlyTrend,
  TopEntity,
  CategoryBreakdown,
  AgingDashboard,
} from '@/lib/dashboard-canonical';
import { readWorkspacePreferences, type WorkspacePreferences } from '@/lib/workspace-mode';

const TREND_RANGES = [
  { value: 3, label: '3 أشهر' },
  { value: 6, label: '6 أشهر' },
  { value: 12, label: '12 شهرًا' },
] as const;

const metricStatus = (
  value: number | null,
  snapshotStatus: DashboardKPIs['status'],
): 'CONFIRMED' | 'CALCULATED' | 'INSUFFICIENT_DATA' =>
  value === null ? 'INSUFFICIENT_DATA' : snapshotStatus === 'CONFIRMED' ? 'CONFIRMED' : 'CALCULATED';

function StatusLine({ status, text }: { status: DashboardKPIs['status']; text: string }) {
  const icon = status === 'INSUFFICIENT_DATA'
    ? <CircleAlert size={13} />
    : <CheckCircle2 size={13} />;
  const tone = status === 'INSUFFICIENT_DATA'
    ? 'text-warning-700 bg-warning-50'
    : 'text-success-700 bg-success-50';

  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black ' + tone}>
      {icon}
      {text}
    </span>
  );
}

function PulseMetric({
  label,
  value,
  detail,
  icon,
  status,
}: {
  label: string;
  value: number | null;
  detail?: string;
  icon: ReactNode;
  status: 'CONFIRMED' | 'CALCULATED' | 'INSUFFICIENT_DATA';
}) {
  const stateLabel = status === 'CONFIRMED' ? 'مثبت' : status === 'CALCULATED' ? 'محسوب' : 'غير كافٍ';
  const stateTone = status === 'CONFIRMED'
    ? 'text-success-700 bg-success-50'
    : status === 'CALCULATED'
      ? 'text-primary-700 bg-primary-50'
      : 'text-warning-700 bg-warning-50';

  return (
    <div className="min-w-0 border-l border-ink-100 px-4 py-3 last:border-l-0">
      <div className="flex items-center gap-2 text-[10px] font-bold text-ink-400">
        <span className="text-ink-500">{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-black tabular-nums text-ink-950">{value === null ? 'غير متاح' : formatCurrency(value)}</div>
          {detail && <div className="mt-0.5 truncate text-[10px] text-ink-400">{detail}</div>}
        </div>
        <span className={'rounded-full px-2 py-1 text-[9px] font-black ' + stateTone}>{stateLabel}</span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [snapshotAsOf, setSnapshotAsOf] = useState<string | null>(null);
  const [trend, setTrend] = useState<MonthlyTrend[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopEntity[]>([]);
  const [topProducts, setTopProducts] = useState<TopEntity[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [aging, setAging] = useState<AgingDashboard | null>(null);
  const [trendMonths, setTrendMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>(readWorkspacePreferences);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [
        {
          kpis: nextKpis,
          trend: nextTrend,
          topCustomers: customers,
          topProducts: products,
          categories: nextCategories,
          aging: nextAging,
          asOf: nextAsOf,
        },
        intelligence,
      ] = await Promise.all([
        fetchDashboardSnapshot(trendMonths),
        fetchDashboardIntelligence(),
      ]);

      setKpis(nextKpis);
      setSnapshotAsOf(nextAsOf);
      setTrend(nextTrend);
      setTopCustomers(customers.slice(0, 5));
      setTopProducts(products.slice(0, 5));
      setCategories(nextCategories);
      setAging(nextAging);
      setRecommendations(intelligence.recommendations);
      setAlerts(intelligence.alerts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فشل تحميل لوحة الأعمال');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [trendMonths]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const sync = () => setWorkspacePreferences(readWorkspacePreferences());
    window.addEventListener('storage', sync);
    window.addEventListener('report-advisor:workspace-preferences', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('report-advisor:workspace-preferences', sync);
    };
  }, []);

  const liveAlerts = useMemo(
    () => alerts.filter((item) => !item.is_read),
    [alerts],
  );
  const liveRecommendations = useMemo(
    () => recommendations.filter((item) => item.status === 'new' || item.status === 'accepted'),
    [recommendations],
  );
  const decisionAccountability = useMemo(() => {
    const actionable = recommendations.filter((item) => item.status === 'new' || item.status === 'accepted');
    const owned = actionable.filter((item) => item.owner?.trim()).length;
    const outcomes = actionable.filter((item) => item.impact_result?.trim()).length;
    const pending = recommendations.filter((item) => item.status === 'new').length;

    return {
      total: actionable.length,
      owned,
      outcomes,
      pending,
      ownerCoverage: actionable.length ? Math.round((owned / actionable.length) * 100) : null,
      outcomeCoverage: actionable.length ? Math.round((outcomes / actionable.length) * 100) : null,
    };
  }, [recommendations]);

  const dashboardNextAction = useMemo(() => {
    if (kpis?.status === 'INSUFFICIENT_DATA') {
      return {
        to: '/data-quality',
        label: 'مراجعة جودة البيانات',
        title: 'الصورة تحتاج مراجعة قبل اتخاذ القرار',
        description: 'توجد مؤشرات غير متاحة أو غير مثبتة. أصلح مصدر الحقيقة أولًا بدل اتخاذ قرار من صورة ناقصة.',
      };
    }
    if (decisionAccountability.pending > 0) {
      return {
        to: '/decision-inbox',
        label: 'مراجعة القرارات',
        title: decisionAccountability.pending + ' توصية جديدة تنتظر المراجعة',
        description: 'هناك توصيات دخلت مرحلة القرار ولم تُحسم بعد؛ راجع الأدلة والمالك والأثر المتوقع قبل الإجراء.',
      };
    }
    if (liveAlerts.length > 0) {
      return {
        to: '/command-center',
        label: 'فتح الإشارات',
        title: liveAlerts[0]?.title ?? 'توجد إشارات جديدة',
        description: 'توجد إشارات غير مقروءة في المسار الحالي. افتح مركز القرار لفحصها وربطها بالإجراء المناسب.',
      };
    }
    if (!trend.some((item) => item.status === 'CALCULATED')) {
      return {
        to: '/import/analyze',
        label: 'تحليل مصدر',
        title: 'لا يوجد اتجاه قابل للحساب من المصدر الحالي',
        description: 'قبل الاعتماد على تحليل الحركة، افحص المصدر الحالي أو حلّل مستندًا/بيانات جديدة عبر المسار الموحد.',
      };
    }
    return {
      to: '/analytics',
      label: 'فتح التحليل',
      title: 'الصورة صالحة للمتابعة والتحليل',
      description: 'لا توجد إشارة عاجلة أو قرارات معلقة؛ انتقل إلى التحليل لاستخراج الفرص والقيم الداعمة للقرار.',
    };
  }, [kpis?.status, decisionAccountability.pending, liveAlerts, trend]);

  if (loading) return <LoadingState message="جارٍ بناء صورة الأعمال من المصدر..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!kpis || !aging) return <DataUnavailableState title="صورة الأعمال غير مكتملة" message="تعذر بناء المؤشرات الأساسية كاملة من المصدر الحالي؛ لا نعرض لوحة فارغة ولا نصنع قيمًا بديلة." action={<Link to="/data-quality" className="btn-primary text-[11px]">مراجعة جودة البيانات</Link>} />;

  const evidenceMetrics = [
    kpis.totalSales,
    kpis.grossProfit,
    kpis.totalReceivables,
    kpis.inventoryValue,
    kpis.totalCustomers,
    kpis.totalProducts,
    kpis.invoiceCount,
    kpis.collectionRate,
  ];
  const coverage = Math.round((evidenceMetrics.filter((value) => value !== null).length / evidenceMetrics.length) * 100);
  const emptyAnalysisAction = kpis.status === 'INSUFFICIENT_DATA'
    ? { to: '/data-quality', label: 'مراجعة جودة البيانات' }
    : { to: '/analytics', label: 'فتح التحليل' };

  return (
    <div dir="rtl" className="animate-fade-in space-y-5 pb-10">
      <section className="ag-dashboard-header ag-command-hero rounded-[20px] border border-[#394267] px-5 py-6 shadow-elevated lg:px-7 lg:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#c7d2fe]">
              <Sparkles size={15} />
              لوحة ذكاء الأعمال · الأغبري
            </div>
            <h1 className="mt-2 max-w-3xl text-[27px] font-black tracking-tight text-white lg:text-[34px]">نبض الأعمال</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#cbd5e1]">
              صورة تنفيذية موثقة لأداء العمل اليوم — من البيانات إلى التحليل ثم الإشارة والقرار. لا تعرض المنصة رقمًا غير مدعوم بمصدره وحالته.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/command-center" className="btn-primary text-[11px]"><Sparkles size={14} /> مركز القرار</Link>
            <Link to="/reports/executive" className="btn-secondary text-[11px]"><FileSearch size={13} /> التقرير التنفيذي</Link>
            <Link to="/import/analyze" className="btn-ghost text-[11px]">تحليل المستندات</Link>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <StatusLine status={kpis.status} text={kpis.status === 'INSUFFICIENT_DATA' ? 'الصورة تحتاج مراجعة' : 'الصورة صالحة للاستخدام'} />
          <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[10px] font-semibold text-ink-500">تغطية المؤشرات {coverage}%</span>
          <span className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-ink-400">حتى: {snapshotAsOf ?? 'غير متاح'}</span>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="mr-auto inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[10px] font-bold text-primary-800 hover:bg-primary-100 disabled:opacity-60">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            تحديث الصورة
          </button>
        </div>
      </section>

      <TruthContextStrip months={trendMonths} status={kpis.status} asOf={snapshotAsOf ?? 'غير متاح'} />
      
      <section className="grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
        <Card>
          <CardHeader title="ملخص القرار في دقيقة" subtitle="أهم إشارة ثم الخطوة التالية، من الحالة الحية الحالية." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[14px] border border-ink-200 bg-ink-50/55 p-4">
                <div className="text-[10px] font-black text-ink-400">أهم إشارة</div>
                <div className="mt-1.5 text-sm font-black text-ink-900">{liveAlerts[0]?.title ?? 'لا توجد إشارة غير مقروءة الآن'}</div>
                <p className="mt-1 text-[11px] leading-5 text-ink-500">{liveAlerts[0]?.description ?? 'لا توجد إشارة تحتاج تدخلًا في اللحظة الحالية.'}</p>
              </div>
              <div className="rounded-[14px] border border-primary-100 bg-primary-50/40 p-4">
                <div className="text-[10px] font-black text-primary-700">الخطوة التالية</div>
                <div className="mt-1.5 text-sm font-black text-ink-900">{dashboardNextAction.title}</div>
                <p className="mt-1 text-[11px] leading-5 text-ink-500">{dashboardNextAction.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link to={dashboardNextAction.to} className="btn-primary text-[11px]">{dashboardNextAction.label} <ArrowUpLeft size={13} /></Link>
                  <Link to="/command-center" className="btn-ghost text-[11px]">مركز القيادة</Link>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="تغطية الحقيقة والقرار" subtitle="اكتمال الصورة التنفيذية، ومدى جاهزية التوصيات للتنفيذ والمتابعة." />
          <CardBody>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-black tabular-nums text-ink-950">{coverage}%</div>
                <div className="mt-1 text-[10px] font-semibold text-ink-400">تغطية المؤشرات الحالية</div>
              </div>
              <div className="text-left text-[11px] text-ink-500">
                <div>{decisionAccountability.total} توصية قابلة للتنفيذ</div>
                <div className="mt-1">آخر تحديث: {snapshotAsOf ?? 'غير متاح'}</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-primary-600" style={{ width: coverage + '%' }} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-2.5">
                <div className="text-[9px] font-black text-ink-400">مالك محدد</div>
                <div className="mt-1 text-sm font-black text-ink-900">
                  {decisionAccountability.ownerCoverage === null ? 'لا توجد' : decisionAccountability.ownerCoverage + '%'}
                </div>
                <div className="mt-0.5 text-[9px] text-ink-400">{decisionAccountability.owned}/{decisionAccountability.total || 0}</div>
              </div>
              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-2.5">
                <div className="text-[9px] font-black text-ink-400">نتيجة أثر مسجلة</div>
                <div className="mt-1 text-sm font-black text-ink-900">
                  {decisionAccountability.outcomeCoverage === null ? 'لا توجد' : decisionAccountability.outcomeCoverage + '%'}
                </div>
                <div className="mt-0.5 text-[9px] text-ink-400">{decisionAccountability.outcomes}/{decisionAccountability.total || 0}</div>
              </div>
              <Link to="/decision-inbox" className="rounded-xl border border-primary-100 bg-primary-50/60 p-2.5 transition-colors hover:bg-primary-100">
                <div className="text-[9px] font-black text-primary-700">تحتاج مراجعة</div>
                <div className="mt-1 text-sm font-black text-ink-900">{decisionAccountability.pending}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold text-primary-700">افتح المسار <ArrowUpLeft size={11} /></div>
              </Link>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="ag-dashboard-kpi"><CardBody><PulseMetric label="الإيرادات" value={kpis.totalSales} icon={<TrendingUp size={16} />} status={metricStatus(kpis.totalSales, kpis.status)} detail="الفترة الحالية" /></CardBody></Card>
        <Card className="ag-dashboard-kpi"><CardBody><PulseMetric label="الربح الإجمالي" value={kpis.grossProfit} icon={<BarChart3 size={16} />} status={metricStatus(kpis.grossProfit, kpis.status)} detail={kpis.grossMargin === null ? 'الهامش غير متاح' : 'الهامش ' + kpis.grossMargin.toFixed(1) + '%'} /></CardBody></Card>
        <Card className="ag-dashboard-kpi"><CardBody><PulseMetric label="التحصيل والذمم" value={kpis.totalReceivables} icon={<WalletCards size={16} />} status={metricStatus(kpis.totalReceivables, kpis.status)} detail={kpis.collectionRate === null ? 'التحصيل غير متاح' : 'نسبة التحصيل ' + kpis.collectionRate.toFixed(1) + '%'} /></CardBody></Card>
        <Card className="ag-dashboard-kpi"><CardBody><PulseMetric label="قيمة المخزون" value={kpis.inventoryValue} icon={<Package size={16} />} status={metricStatus(kpis.inventoryValue, kpis.status)} detail={kpis.invoiceCount === null ? 'عدد الفواتير غير متاح' : 'الفواتير ' + kpis.invoiceCount.toLocaleString('en-US')} /></CardBody></Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="section-kicker">الذكاء القابل للتنفيذ</div>
            <h2 className="mt-1 text-[17px] font-black text-ink-950">التنبيهات والتوصيات والقرارات</h2>
          </div>
          <Link to="/command-center" className="btn-ghost text-[11px]">فتح مركز القرار <ArrowUpLeft size={13} /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/command-center" className="ag-dashboard-action rounded-[14px] border border-ink-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700"><TrendingUp size={18} /></div><span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-black text-primary-700">{alerts.length}</span></div>
            <div className="mt-3 text-[13px] font-black text-ink-900">المستجدات والتغيرات</div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-500">{liveAlerts[0]?.title ?? 'لا توجد مستجدات تحتاج انتباهًا الآن'}</div>
          </Link>
          <Link to="/intelligence/recommendations" className="ag-dashboard-action rounded-[14px] border border-primary-100 bg-primary-50/45 p-4 shadow-card">
            <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-700"><Sparkles size={18} /></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-primary-700">{liveRecommendations.length}</span></div>
            <div className="mt-3 text-[13px] font-black text-ink-900">توصيات قابلة للتنفيذ</div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-500">{liveRecommendations[0]?.title ?? 'لا توجد توصيات جديدة في المصدر الحالي'}</div>
          </Link>
          <Link to="/command-center" className="ag-dashboard-action rounded-[14px] border border-danger-100 bg-danger-50/55 p-4 shadow-card">
            <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-danger-700"><CircleAlert size={18} /></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-danger-700">{liveAlerts.length}</span></div>
            <div className="mt-3 text-[13px] font-black text-ink-900">تنبيهات مهمة</div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-500">{liveAlerts.length ? 'توجد إشارات غير مقروءة مرتبطة بالمسار الحالي.' : 'لا توجد تنبيهات غير مقروءة الآن.'}</div>
          </Link>
          <Link to="/decision-experience?stage=decision" className="ag-dashboard-action rounded-[14px] border border-warning-100 bg-warning-50/55 p-4 shadow-card">
            <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-warning-700"><CircleAlert size={18} /></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-warning-700">{recommendations.filter(item => item.status === 'new').length}</span></div>
            <div className="mt-3 text-[13px] font-black text-ink-900">قرارات تحتاج مراجعة</div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-500">{recommendations.some(item => item.status === 'new') ? 'توجد توصيات جديدة لمراجعتها قبل الإجراء.' : 'لا توجد قرارات معلقة للمراجعة.'}</div>
          </Link>
        </div>
      </section>

      {workspacePreferences.dashboardWidgets.includes('analysis') && (
        <Suspense fallback={<div className="h-72 animate-pulse rounded-[16px] bg-ink-100" aria-label="جارٍ تحميل التحليلات" />}>
          <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="section-kicker">نبض الأعمال</div>
              <h2 className="mt-1 text-lg font-black text-ink-950">الحركة التي تهم القرار</h2>
              <p className="mt-1 text-xs text-ink-500">اتجاه المبيعات والربح من المصدر الكانوني، مع إمكانية تغيير الفترة.</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-sm">
              <CalendarRange size={15} className="mx-2 text-ink-400" />
              {TREND_RANGES.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  onClick={() => setTrendMonths(item.value)}
                  className={'rounded-lg px-3 py-1.5 text-xs font-bold ' + (trendMonths === item.value ? 'bg-ink-950 text-white' : 'text-ink-500 hover:bg-ink-50')}
                  aria-pressed={trendMonths === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.45fr_.75fr]">
            <Card>
              <CardBody>
                {trend.some((item) => item.status === 'CALCULATED')
                  ? <TrendChart data={trend} />
                  : <div className="rounded-[14px] border border-warning-100 bg-warning-50/55 p-5">
                      <div className="text-sm font-black text-ink-800">لا توجد بيانات اتجاه قابلة للحساب.</div>
                      <p className="mt-1 text-[10px] leading-5 text-ink-500">تبقى الحالة غير مثبتة بدل تحويل غياب السجل إلى اتجاه مصطنع.</p>
                      <Link to={emptyAnalysisAction.to} className="mt-3 inline-flex btn-secondary text-[11px]">{emptyAnalysisAction.label} <ArrowUpLeft size={13} /></Link>
                    </div>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="تركيب النشاط" subtitle="الفئات المثبتة في المصدر" />
              <CardBody>
                {categories.length
                  ? <CategoryPieChart data={categories.map((item) => ({ ...item, name: item.categoryStatus === 'UNKNOWN' ? 'غير محدد' : item.name ?? 'غير محدد' }))} />
                  : <div className="rounded-[14px] border border-warning-100 bg-warning-50/55 p-5">
                      <div className="text-sm font-black text-ink-800">لا توجد بيانات فئات.</div>
                      <p className="mt-1 text-[10px] leading-5 text-ink-500">لا يتم تصنيع تركيب للفئات عند غياب المصدر الكانوني.</p>
                      <Link to={emptyAnalysisAction.to} className="mt-3 inline-flex btn-secondary text-[11px]">{emptyAnalysisAction.label} <ArrowUpLeft size={13} /></Link>
                    </div>}
              </CardBody>
            </Card>
          </div>
        </section>
        </Suspense>
      )}

      <Suspense fallback={<div className="grid gap-4 lg:grid-cols-3"><div className="h-72 animate-pulse rounded-[16px] bg-ink-100" /><div className="h-72 animate-pulse rounded-[16px] bg-ink-100" /><div className="h-72 animate-pulse rounded-[16px] bg-ink-100" /></div>}>
            <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="فرص العملاء" subtitle="أعلى العملاء بحسب البيانات الحالية" />
          <CardBody>
            {topCustomers.length ? <HorizontalBarChart data={topCustomers} dataKey="value" nameKey="name" height={210} /> : <div className="rounded-[14px] border border-warning-100 bg-warning-50/55 p-5"><div className="text-sm font-black text-ink-800">لا توجد بيانات عملاء قابلة للترتيب.</div><p className="mt-1 text-[10px] leading-5 text-ink-500">راجع المصدر وجودة البيانات قبل استخدام ترتيب العملاء كسياق قرار.</p><Link to="/data-quality" className="mt-3 inline-flex btn-secondary text-[11px]">مراجعة جودة البيانات <ArrowUpLeft size={13} /></Link></div>}
            <Link to="/customers" className="mt-3 flex items-center justify-center gap-1 text-[11px] font-bold text-primary-700">فتح العملاء <ArrowUpLeft size={13} /></Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="فرص المنتجات" subtitle="الأعلى حركة/قيمة في المصدر" />
          <CardBody>
            {topProducts.length ? <HorizontalBarChart data={topProducts} dataKey="value" nameKey="name" height={210} /> : <div className="rounded-[14px] border border-warning-100 bg-warning-50/55 p-5"><div className="text-sm font-black text-ink-800">لا توجد بيانات منتجات قابلة للترتيب.</div><p className="mt-1 text-[10px] leading-5 text-ink-500">راجع المصدر وجودة البيانات قبل استخدام حركة المنتجات كسياق قرار.</p><Link to="/data-quality" className="mt-3 inline-flex btn-secondary text-[11px]">مراجعة جودة البيانات <ArrowUpLeft size={13} /></Link></div>}
            <Link to="/products" className="mt-3 flex items-center justify-center gap-1 text-[11px] font-bold text-primary-700">فتح المنتجات <ArrowUpLeft size={13} /></Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="تحصيل وذمم"
            subtitle={aging.status === 'CALCULATED' && aging.totalAmount !== null ? 'الإجمالي: ' + formatCurrency(aging.totalAmount) : aging.status === 'NO_DATA' ? 'لا توجد بيانات ذمم' : 'بيانات غير كافية'}
          />
          <CardBody>
            <div className="space-y-1">
              {aging.rows.map((bucket) => (
                <div key={bucket.bucket} className="flex items-center justify-between border-b border-ink-100 py-2.5 last:border-b-0">
                  <span className="text-xs font-semibold text-ink-600">{bucket.bucket}</span>
                  <span className="text-xs tabular-nums text-ink-500">{bucket.amount === null ? 'غير متاح' : formatCurrency(bucket.amount)} · {bucket.count} فاتورة</span>
                </div>
              ))}
              {aging.unknownRows > 0 && <div className="pt-3 text-[11px] text-ink-400">سجلات بلا تاريخ استحقاق: {aging.unknownRows} فاتورة.</div>}
            </div>
            <Link to="/reports/receivables" className="mt-3 flex items-center justify-center gap-1 text-[11px] font-bold text-primary-700">فتح التحصيل <ArrowUpLeft size={13} /></Link>
          </CardBody>
        </Card>
      </section>
      </Suspense>

      <section className="rounded-[14px] border border-primary-100 bg-primary-50/35 p-4 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="section-kicker">الخطوة التالية · من الحقيقة الحالية</div>
            <h2 className="mt-1 text-base font-black text-ink-950">{dashboardNextAction.title}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-500">{dashboardNextAction.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={dashboardNextAction.to} className="btn-primary text-[11px]">{dashboardNextAction.label} <ArrowUpLeft size={13} /></Link>
            <Link to="/work-center" className="btn-secondary text-[11px]">مركز العمل <ArrowUpLeft size={13} /></Link>
            <Link to="/intelligence" className="btn-ghost text-[11px]">القرار والذكاء <Brain size={13} /></Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-ink-200 bg-ink-200 sm:grid-cols-4">
        <div className="bg-white px-3.5 py-3"><div className="text-[10px] font-semibold text-ink-400">العملاء</div><div className="mt-1 text-[15px] font-black tabular-nums text-ink-900">{kpis.totalCustomers === null ? 'غير متاح' : kpis.totalCustomers}</div></div>
        <div className="bg-white px-3.5 py-3"><div className="text-[10px] font-semibold text-ink-400">المنتجات</div><div className="mt-1 text-[15px] font-black tabular-nums text-ink-900">{kpis.totalProducts === null ? 'غير متاح' : kpis.totalProducts}</div></div>
        <div className="bg-white px-3.5 py-3"><div className="text-[10px] font-semibold text-ink-400">الفواتير</div><div className="mt-1 text-[15px] font-black tabular-nums text-ink-900">{kpis.invoiceCount === null ? 'غير متاح' : kpis.invoiceCount}</div></div>
        <div className="bg-white px-3.5 py-3"><div className="text-[10px] font-semibold text-ink-400">التحصيل</div><div className="mt-1 text-[15px] font-black tabular-nums text-ink-900">{kpis.collectionRate === null ? 'غير متاح' : kpis.collectionRate + '%'}</div></div>
      </section>
    </div>
  );
}
