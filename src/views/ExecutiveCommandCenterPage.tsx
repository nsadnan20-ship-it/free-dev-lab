import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpLeft, BarChart3, Brain, CalendarRange, CheckCircle2, CircleAlert,
  FileSearch, Package, RefreshCw, ShieldCheck, Sparkles, Clock3, TrendingUp, Upload, WalletCards
} from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PriorityBadge, SeverityBadge } from '@/components/ui/Badge';
import { LoadingState, ErrorState, EmptyState, DataUnavailableState } from '@/components/ui/States';
import { TrendChart } from '@/components/ui/Charts';
import { TruthContextStrip } from '@/components/TruthContextStrip';
import { fetchDashboardIntelligence, fetchDashboardSnapshot, type DashboardKPIs } from '@/lib/dashboard-canonical';
import { formatCurrency, formatNumber, relativeTime } from '@/lib/format';
import { resolveCurrentCompanyId } from '@/lib/supabase';
import { fetchDecisionWorkItems, fetchPendingDecisionApprovals, fetchRecentDecisionActivity, type DecisionActivityRecord, type DecisionWorkItemRecord } from '@/lib/report-decisions';
import { loadPersistedOutcomes, type DecisionOutcome } from '@/lib/analytics/outcome-feedback';
import type { Alert, Recommendation } from '@/lib/types';

const PERIODS = [
  { value: 3, label: '3 أشهر' },
  { value: 6, label: '6 أشهر' },
  { value: 12, label: '12 شهرًا' },
] as const;

function MoneyMetric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number | null;
  note?: string;
  icon: ReactNode;
}) {
  return (
    <div className="border-l border-ink-100 px-4 py-4 last:border-l-0">
      <div className="flex items-center gap-2 text-[10px] font-black text-ink-400">
        <span className="text-primary-700">{icon}</span>{label}
      </div>
      <div className="mt-2 text-[20px] font-black tabular-nums text-ink-950">{value === null ? 'غير متاح' : formatCurrency(value)}</div>
      {note && <div className="mt-1 text-[10px] text-ink-400">{note}</div>}
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <article className="rounded-[14px] border border-ink-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-50 text-danger-700"><CircleAlert size={17}/></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={alert.severity}/><span className="text-[10px] text-ink-400">{relativeTime(alert.created_at)}</span></div>
          <div className="mt-2 text-[13px] font-black text-ink-900">{alert.title}</div>
          {alert.description && <p className="mt-1 text-[11px] leading-5 text-ink-500">{alert.description}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[9px]">
            <div className="rounded-lg bg-ink-50 p-2"><div className="text-ink-400">لماذا</div><div className="mt-1 font-bold text-ink-800">{alert.description ?? 'سبب التنبيه غير متاح؛ راجع الدليل.'}</div></div>
            <div className="rounded-lg bg-ink-50 p-2"><div className="text-ink-400">الدليل</div><div className="mt-1 font-bold text-ink-800">{alert.metric_value == null ? 'قيمة القياس غير متاحة' : formatNumber(alert.metric_value)}{alert.threshold == null ? '' : ' · الحد ' + formatNumber(alert.threshold)}</div></div>
            <div className="rounded-lg bg-ink-50 p-2"><div className="text-ink-400">الخطوة التالية</div><div className="mt-1 font-bold text-ink-800">مراجعة القياس ثم فتح سياق القرار</div></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link to="/decision-inbox" className="btn-secondary text-[11px]">مركز القرارات <ArrowUpLeft size={13}/></Link>
            <Link to="/metrics" className="btn-ghost text-[11px]">افحص القياس</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function DecisionRow({ recommendation }: { recommendation: Recommendation }) {
  return (
    <article className="rounded-[14px] border border-primary-100 bg-primary-50/25 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><Sparkles size={17}/></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black text-primary-700">توصية</span><PriorityBadge priority={recommendation.priority}/></div>
          <div className="mt-2 text-[13px] font-black text-ink-900">{recommendation.title}</div>
          {recommendation.description && <p className="mt-1 text-[11px] leading-5 text-ink-500">{recommendation.description}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[9px]">
            <div className="rounded-lg bg-white p-2"><div className="text-ink-400">المسؤول</div><div className="mt-1 font-bold text-ink-800">{recommendation.owner ?? 'غير محدد'}</div></div>
            <div className="rounded-lg bg-white p-2"><div className="text-ink-400">الأثر المتوقع</div><div className="mt-1 font-bold text-ink-800">{recommendation.expected_impact == null ? 'غير متاح' : formatCurrency(recommendation.expected_impact)}</div></div>
            <div className="rounded-lg bg-white p-2"><div className="text-ink-400">الحالة</div><div className="mt-1 font-bold text-ink-800">{recommendation.status === 'new' ? 'جديدة' : recommendation.status === 'accepted' ? 'مقبولة' : recommendation.status === 'rejected' ? 'مرفوضة' : 'تحتاج مراجعة'}</div></div>
          </div>
          <div className="mt-3"><Link to="/decision-inbox" className="btn-primary text-[11px]">مركز القرارات <ArrowUpLeft size={13}/></Link></div>
        </div>
      </div>
    </article>
  );
}

export function ExecutiveCommandCenterPage() {
  const [months, setMonths] = useState(3);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [trend, setTrend] = useState<Awaited<ReturnType<typeof fetchDashboardSnapshot>>['trend']>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [workItems, setWorkItems] = useState<DecisionWorkItemRecord[]>([]);
  const [outcomes, setOutcomes] = useState<DecisionOutcome[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [recentActivity, setRecentActivity] = useState<DecisionActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      setError(null);
      const companyId = await resolveCurrentCompanyId();
      if (!companyId) throw new Error('TENANT_REQUIRED');
      const [snapshot, intelligence, nextWorkItems, nextOutcomes, nextPendingApprovals, nextRecentActivity] = await Promise.all([
        fetchDashboardSnapshot(months),
        fetchDashboardIntelligence(),
        fetchDecisionWorkItems(200),
        loadPersistedOutcomes(companyId),
        fetchPendingDecisionApprovals(),
        fetchRecentDecisionActivity(100),
      ]);
      setKpis(snapshot.kpis);
      setAsOf(snapshot.asOf);
      setTrend(snapshot.trend);
      setAlerts(intelligence.alerts.filter((item) => !item.is_read));
      setRecommendations(intelligence.recommendations.filter((item) => item.status === 'new' || item.status === 'accepted'));
      setWorkItems(nextWorkItems);
      setOutcomes(nextOutcomes.slice(-20).reverse());
      setPendingApprovals(nextPendingApprovals);
      setRecentActivity(nextRecentActivity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل مركز القيادة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [months]);

  useEffect(() => { void load(); }, [load]);

  const coverage = useMemo(() => {
    if (!kpis) return 0;
    const fields = [kpis.totalSales, kpis.grossProfit, kpis.totalReceivables, kpis.inventoryValue, kpis.collectionRate];
    return Math.round((fields.filter((value) => value !== null).length / fields.length) * 100);
  }, [kpis]);

  const executionSummary = useMemo(() => ({
    open: workItems.filter((item) => item.status === 'OPEN').length,
    inProgress: workItems.filter((item) => item.status === 'IN_PROGRESS').length,
    completed: workItems.filter((item) => item.status === 'COMPLETED').length,
    outcomes: outcomes.length,
    pendingApprovals,
  }), [workItems, outcomes, pendingApprovals]);

  const actionWorkItems = useMemo(() => workItems
    .filter((item) => item.status === 'OPEN' || item.status === 'IN_PROGRESS'), [workItems]);

  if (loading) return <LoadingState message="جارٍ بناء مركز القيادة من المصدر..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!kpis) return <DataUnavailableState title="مركز القيادة ينتظر الحقيقة" message="لا توجد مؤشرات أساسية موثوقة تكفي لبناء صورة تنفيذية. راجع جودة المصدر قبل اتخاذ القرار." action={<Link to="/data-quality" className="btn-primary text-[11px]">مراجعة جودة البيانات</Link>} />;

  return (
    <div dir="rtl" className="ag-command-center-surface space-y-5 animate-fade-in pb-10">
      <section className="rounded-[18px] border border-ink-200 bg-ink-950 p-5 text-white shadow-elevated lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black text-primary-300"><WalletCards size={15}/> مركز القيادة</div>
            <h1 className="mt-2 text-[25px] font-black tracking-tight lg:text-[31px]">ما يؤثر على المال والعمل الآن</h1>
            <p className="mt-2 text-[12px] leading-6 text-ink-300">شاشة واحدة تجمع الصورة المالية، إشارات الانتباه، والقرارات المقترحة، مع بقاء المصدر وحالة الدليل ظاهرين.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[10px] bg-white/10 p-1">
              {PERIODS.map((period) => <button key={period.value} type="button" onClick={() => setMonths(period.value)} className={'rounded-[8px] px-3 py-1.5 text-[10px] font-bold ' + (months === period.value ? 'bg-white text-ink-950' : 'text-ink-300 hover:bg-white/10')} aria-pressed={months === period.value}>{period.label}</button>)}
            </div>
            <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-[9px] border border-white/15 bg-white/10 px-3.5 py-2.5 text-[11px] font-bold text-white hover:bg-white/15 disabled:opacity-60"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''}/> تحديث</button>
          </div>
        </div>
      </section>

      <TruthContextStrip months={months} status={kpis.status} asOf={asOf ?? 'غير متاح'} />
      <div className="ag-decision-strip" aria-label="ملخص مركز القرار">
        <div className="ag-decision-cell">
          <span className="ag-decision-label">وضع الحقيقة</span>
          <span className="ag-decision-value">{kpis.status === 'INSUFFICIENT_DATA' ? 'بيانات غير كافية' : 'الصورة قابلة للاستخدام'}</span>
        </div>
        <div className="ag-decision-cell"><span className="ag-decision-label">تغطية القياسات</span><span className="ag-decision-value">{coverage}%</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">إشارات مفتوحة</span><span className="ag-decision-value">{alerts.length}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">توصيات للمراجعة</span><span className="ag-decision-value">{recommendations.length}</span></div>
        <div className="ag-decision-cell"><span className="ag-decision-label">حتى تاريخ</span><span className="ag-decision-value">{asOf ?? 'غير متاح'}</span></div>
      </div>
      <div className="ag-action-cluster">
        <Link to={alerts.length ? '/intelligence' : '/decision-inbox'} className="btn-primary text-[11px]">
          {alerts.length ? 'فحص الإشارات' : 'فتح مساحة القرار'} <ArrowUpLeft size={13}/>
        </Link>
        <Link to="/data-quality" className="btn-secondary text-[11px]">مراجعة جودة البيانات</Link>
        <Link to="/advisor-cases" className="btn-secondary text-[11px]">قضايا Advisor</Link>
        <Link to="/reports/executive" className="btn-ghost text-[11px]">التقرير التنفيذي</Link>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="ما يحتاج انتباهًا">
        <Card variant="action">
          <CardHeader kicker="WHAT NEEDS ATTENTION" title="ما يحتاج انتباهًا" subtitle="هذه الأولويات تُبنى فقط من السجلات الحالية؛ لا يوجد KPI اصطناعي." />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Link to="/decision-inbox" className="ag-attention-card">
                <span className="ag-attention-icon ag-attention-warning"><ShieldCheck size={15}/></span>
                <span><span className="ag-attention-label">اعتمادات معلقة</span><span className="ag-attention-value">{pendingApprovals}</span><span className="ag-attention-note">تحتاج صاحب صلاحية</span></span>
              </Link>
              <Link to="/work-center?decisionWorkFilter=open" className="ag-attention-card">
                <span className="ag-attention-icon ag-attention-neutral"><Clock3 size={15}/></span>
                <span><span className="ag-attention-label">عمل مفتوح</span><span className="ag-attention-value">{executionSummary.open}</span><span className="ag-attention-note">ينتظر البدء</span></span>
              </Link>
              <Link to="/work-center?decisionWorkFilter=in_progress" className="ag-attention-card">
                <span className="ag-attention-icon ag-attention-primary"><TrendingUp size={15}/></span>
                <span><span className="ag-attention-label">قيد التنفيذ</span><span className="ag-attention-value">{executionSummary.inProgress}</span><span className="ag-attention-note">يتطلب متابعة</span></span>
              </Link>
              <Link to="/data-quality" className="ag-attention-card">
                <span className="ag-attention-icon ag-attention-danger"><CircleAlert size={15}/></span>
                <span><span className="ag-attention-label">صحة البيانات</span><span className="ag-attention-value">{coverage}%</span><span className="ag-attention-note">{kpis.status === 'INSUFFICIENT_DATA' ? 'بيانات غير كافية' : 'تغطية القياسات المتاحة'}</span></span>
              </Link>
            </div>
          </CardBody>
        </Card>
      </section>

      <section aria-label="من الانتباه إلى الإجراء">
        <Card variant="evidence">
          <CardHeader
            kicker="من الانتباه إلى الإجراء"
            title="من الانتباه إلى الإجراء"
            subtitle="العناصر التالية هي سجلات عمل محفوظة؛ كل بطاقة تكشف السبب، الدليل، المالك، الحالة، وما حدث بعدها."
            action={<Link to="/work-center" className="btn-ghost text-[10px]">فتح كل الأعمال <ArrowUpLeft size={13}/></Link>}
          />
          <CardBody>
            {actionWorkItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-4 text-center text-[10px] text-ink-500">
                لا توجد مهمة مفتوحة أو قيد التنفيذ الآن. لا يتم إنشاء طابور بديل.
              </div>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {actionWorkItems.map((item) => (
                  <article key={item.id} className="rounded-xl border border-ink-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-black text-ink-900">{item.title}</div>
                        <div className="mt-1 text-[9px] text-ink-500">{item.department || 'قسم غير محدد'} · {item.assigneeLabel ?? 'المالك غير محدد'}</div>
                      </div>
                      <span className="rounded-full bg-primary-50 px-2 py-1 text-[8px] font-black text-primary-800">{item.status === 'OPEN' ? 'مفتوح' : item.status === 'IN_PROGRESS' ? 'قيد التنفيذ' : item.status === 'COMPLETED' ? 'مكتمل' : 'يحتاج مراجعة'}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3 text-[9px]">
                      <div className="rounded-lg bg-ink-50 p-2"><div className="text-ink-400">لماذا</div><div className="mt-1 font-bold text-ink-800">{item.title}</div></div>
                      <div className="rounded-lg bg-ink-50 p-2"><div className="text-ink-400">الدليل</div><div className="mt-1 font-bold text-ink-800">{item.evidenceSnapshotId ? 'مثبت' : 'غير متاح'}</div></div>
                      <div className="rounded-lg bg-ink-50 p-2"><div className="text-ink-400">النتيجة</div><div className="mt-1 font-bold text-ink-800">{item.actualImpact == null ? 'لم تُسجل نتيجة بعد' : formatCurrency(item.actualImpact)}</div></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={'/work-center?decisionWorkFilter=' + (item.status === 'OPEN' ? 'open' : 'in_progress')} className="btn-primary text-[9px]">فتح الإجراء <ArrowUpLeft size={12}/></Link>
                      {item.sourceReportJobId && item.sourceHash && (
                        <Link to={'/reports/smart/' + item.sourceReportJobId + '?sourceHash=' + encodeURIComponent(item.sourceHash) + '#decision-evidence-inspector'} className="btn-ghost text-[9px]">فتح الدليل والمصدر <FileSearch size={12}/></Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </section>

      <section className="ag-fast-actions" aria-label="إجراءات سريعة">
        <div>
          <div className="section-kicker">إجراءات سريعة</div>
          <h2 className="mt-1 text-sm font-black text-ink-950">انتقل مباشرة إلى العمل</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import" className="btn-primary text-[10px]"><Upload size={13}/>إدخال مصدر</Link>
          <Link to="/operations" className="btn-secondary text-[10px]"><Package size={13}/>العمليات</Link>
          <Link to="/work-center" className="btn-secondary text-[10px]"><CheckCircle2 size={13}/>مركز العمل</Link>
          <Link to="/reports/executive" className="btn-ghost text-[10px]"><FileSearch size={13}/>التقرير التنفيذي</Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link to="/reports/receivables" className="card card-hover p-4">
          <div className="flex items-center justify-between gap-3"><WalletCards size={18} className="text-primary-700"/><span className="rounded-full bg-success-50 px-2 py-1 text-[9px] font-black text-success-700">{kpis.totalReceivables === null ? 'بيانات غير كافية' : 'بيانات الذمم متاحة'}</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">استرداد الأموال</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">ابدأ من الذمم والتحصيل للتحقق من الأموال القابلة للاسترداد؛ لا يتم احتساب فرصة مالية إضافية هنا دون ledger موثّق.</p>
        </Link>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-3"><BarChart3 size={18} className="text-warning-700"/><span className="rounded-full bg-warning-50 px-2 py-1 text-[9px] font-black text-warning-800">بيانات غير كافية</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">عائد القرار</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">لا يوجد في هذا السطح سجل نتائج مالي موثّق يسمح بحساب عائد القرار دون اختلاق أثر.</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-3"><FileSearch size={18} className="text-ink-500"/><span className="rounded-full bg-ink-100 px-2 py-1 text-[9px] font-black text-ink-600">غير متاح</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">إعادة تشغيل القرار</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">إعادة التشغيل تحتاج لقطات ونتائج تاريخية مثبتة؛ الواجهة لا تصنع سجلًا بديلًا.</p>
        </div>
        <Link to="/decision-inbox" className="card card-hover p-4">
          <div className="flex items-center justify-between gap-3"><CheckCircle2 size={18} className="text-primary-700"/><span className="rounded-full bg-primary-50 px-2 py-1 text-[9px] font-black text-primary-700">مسار القرار</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">متابعة النتيجة</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">تابع نتيجة القرار من مساحة القرار مع الحفاظ على حالة الدليل وعدم تحويل التوصية إلى نجاح تلقائي.</p>
        </Link>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-ink-200 bg-white shadow-card">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <MoneyMetric label="المبيعات" value={kpis.totalSales} icon={<TrendingUp size={15}/>} note="الفترة الحالية"/>
          <MoneyMetric label="الربح الإجمالي" value={kpis.grossProfit} icon={<BarChart3 size={15}/>} note={kpis.grossMargin === null ? 'الهامش غير متاح' : 'الهامش ' + kpis.grossMargin.toFixed(1) + '%'}/>
          <MoneyMetric label="الذمم" value={kpis.totalReceivables} icon={<WalletCards size={15}/>} note={kpis.collectionRate === null ? 'التحصيل غير متاح' : 'التحصيل ' + kpis.collectionRate.toFixed(1) + '%'}/>
          <MoneyMetric label="المخزون" value={kpis.inventoryValue} icon={<Package size={15}/>} note="القيمة الحالية"/>
        </div>
      </section>

      {kpis.status === 'INSUFFICIENT_DATA' && (
        <div className="rounded-[14px] border border-warning-200 bg-warning-50 p-4 text-[11px] leading-5 text-warning-900">
          <div className="flex items-center gap-2 font-black"><CircleAlert size={15}/> لا يمكن إصدار كل الاستنتاجات بثقة</div>
          <div className="mt-1">التغطية الحالية للقياسات الرئيسية {coverage}%. البيانات غير الكافية تبقى ظاهرة كحالة، ولا تُستبدل بأصفار أو تقديرات مخفية.</div>
        </div>
      )}

      <Card>
        <CardHeader title="آخر النشاط" subtitle="قراءة مباشرة من audit_logs للمستأجر الحالي؛ لا يتم إنشاء نشاط محلي بديل." />
        <CardBody>
          {recentActivity.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-4 text-center text-[10px] text-ink-500">لا يوجد نشاط تدقيق متاح حاليًا.</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {recentActivity.map((event) => (
                <div key={event.id} className="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[8px] font-black text-ink-700">{event.action}</span>
                    <span className="mr-auto text-[8px] text-ink-400">{new Date(event.createdAt).toLocaleTimeString('ar-YE')}</span>
                  </div>
                  <div className="mt-2 text-[9px] font-bold text-ink-800">{event.entityType}</div>
                  <div className="mt-1 break-all font-mono text-[8px] text-ink-400">{event.entityId}</div>
                  <div className="mt-1 text-[8px] text-ink-500">المصدر: {event.source ?? 'غير متاح'}</div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="التنفيذ والنتيجة" subtitle="حالة العمل والنتائج المسجلة من السجلات الكانونية." action={<Link to="/work-center" className="btn-ghost text-[11px]">فتح مركز العمل <ArrowUpLeft size={13}/></Link>}/>
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-warning-100 bg-warning-50 p-3"><div className="text-[9px] text-warning-700">PENDING APPROVALS</div><div className="mt-1 text-lg font-black text-warning-950">{executionSummary.pendingApprovals}</div></div>
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-3"><div className="text-[9px] text-ink-400">OPEN</div><div className="mt-1 text-lg font-black text-ink-900">{executionSummary.open}</div></div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 p-3"><div className="text-[9px] text-primary-700">IN PROGRESS</div><div className="mt-1 text-lg font-black text-primary-950">{executionSummary.inProgress}</div></div>
            <div className="rounded-xl border border-success-100 bg-success-50 p-3"><div className="text-[9px] text-success-700">COMPLETED</div><div className="mt-1 text-lg font-black text-success-950">{executionSummary.completed}</div></div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 p-3"><div className="text-[9px] text-primary-700">النتائج المسجلة</div><div className="mt-1 text-lg font-black text-primary-950">{executionSummary.outcomes}</div></div>
          </div>
          {workItems.length === 0
            ? <div className="mt-3 rounded-xl border border-dashed border-ink-200 p-4 text-center text-[10px] text-ink-500">لا توجد عناصر عمل محفوظة للـtenant الحالي. لا يتم اختلاق طابور بديل.</div>
            : <div className="mt-3 space-y-2">
              {workItems.map((item) => <div key={item.id} className="rounded-xl border border-ink-100 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-black text-ink-900">{item.title}</span><span className="rounded-full bg-ink-50 px-2 py-1 text-[8px] font-black text-ink-600">{item.status}</span></div>
                <div className="mt-1 text-[9px] text-ink-500">{item.department} · {item.assigneeLabel ?? 'غير مكلّف'}{item.actualImpact == null ? '' : ' · الأثر الفعلي ' + formatCurrency(item.actualImpact)}</div>
              </div>)}
              {outcomes.length > 0 && <div className="rounded-xl border border-success-100 bg-success-50 p-3 text-[10px] font-bold text-success-900">آخر نتيجة مسجلة: {outcomes[0].label} · {outcomes[0].notes ?? 'بدون ملاحظة'}</div>}
            </div>}
        </CardBody>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader title="مركز الانتباه" subtitle="الإشارات التي تستحق فحصًا أو تدخلاً." action={<Link to="/intelligence" className="btn-ghost text-[11px]">الذكاء <Brain size={13}/></Link>}/>
          <CardBody>
            <div className="space-y-3">
              {alerts.map((alert) => <AlertRow key={alert.id} alert={alert}/>)}
              {alerts.length === 0 && <EmptyState title="لا توجد إشارات نشطة" message="لا يوجد تنبيه غير مقروء في المصدر الحالي." action={<Link to="/intelligence" className="btn-secondary text-[11px]">فحص مساحة الإشارات</Link>}/>} 
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="طابور القرار" subtitle="ما يمكن تحويله إلى قرار الآن." action={<Link to="/decision-experience" className="btn-ghost text-[11px]">مساحة القرار <ArrowUpLeft size={13}/></Link>}/>
          <CardBody>
            <div className="space-y-3">
              {recommendations.map((recommendation) => <DecisionRow key={recommendation.id} recommendation={recommendation}/>)}
              {recommendations.length === 0 && <EmptyState title="لا توجد توصيات قابلة للمراجعة" message="لن تتم صناعة بديل اصطناعي عند غياب الإشارة." action={<Link to="/data-quality" className="btn-secondary text-[11px]">مراجعة جودة البيانات</Link>}/>} 
            </div>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader
          title="نبض الأعمال"
          subtitle="اتجاه المبيعات والربح ضمن الفترة المختارة."
          action={<span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-400"><CalendarRange size={13}/> {months} أشهر</span>}
        />
        <CardBody>
          {trend.some((item) => item.status === 'CALCULATED')
            ? <TrendChart data={trend}/>
            : <div className="rounded-[14px] border border-ink-100 bg-ink-50/60 py-10 text-center">
              <div className="text-sm font-black text-ink-700">لا توجد بيانات اتجاه قابلة للحساب.</div>
              <p className="mt-1 text-[10px] text-ink-400">راجع جودة المصدر قبل استخدام اتجاهات المبيعات والربح كإشارة قرار.</p>
              <Link to="/data-quality" className="mt-3 inline-flex btn-secondary text-[11px]">مراجعة جودة البيانات <ArrowUpLeft size={13}/></Link>
            </div>}
        </CardBody>
      </Card>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><div className="section-kicker">ACTION SURFACES</div><h2 className="mt-1 text-lg font-black text-ink-950">انتقل من الرؤية إلى العمل</h2></div>
          <span className="text-[10px] text-ink-400">المسار يبقى مرتبطًا بسياق القرار</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link to="/reports/receivables" className="card card-hover p-4"><WalletCards size={18} className="text-primary-700"/><div className="mt-3 text-sm font-black text-ink-900">التحصيل</div><div className="mt-1 text-[10px] text-ink-400">الذمم والأعمار والعملاء</div><ArrowUpLeft size={14} className="mt-3 text-ink-300"/></Link>
          <Link to="/reports/profitability" className="card card-hover p-4"><BarChart3 size={18} className="text-primary-700"/><div className="mt-3 text-sm font-black text-ink-900">الربحية</div><div className="mt-1 text-[10px] text-ink-400">الإيراد والتكلفة والهامش</div><ArrowUpLeft size={14} className="mt-3 text-ink-300"/></Link>
          <Link to="/inventory" className="card card-hover p-4"><Package size={18} className="text-primary-700"/><div className="mt-3 text-sm font-black text-ink-900">المخزون</div><div className="mt-1 text-[10px] text-ink-400">الحركة والقيمة والمنتجات</div><ArrowUpLeft size={14} className="mt-3 text-ink-300"/></Link>
          <Link to="/import" className="card card-hover p-4"><Upload size={18} className="text-primary-700"/><div className="mt-3 text-sm font-black text-ink-900">إدخال البيانات</div><div className="mt-1 text-[10px] text-ink-400">من المصدر إلى المسار الحاكم</div><ArrowUpLeft size={14} className="mt-3 text-ink-300"/></Link>
        </div>
      </section>

      <section className="rounded-[14px] border border-ink-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><div className="text-[12px] font-black text-ink-900">خط الحقيقة</div><div className="mt-1 text-[10px] text-ink-400">المصدر → الدليل → البيانات → الإشارة → القرار → الإجراء → النتيجة.</div></div>
          <div className="flex flex-wrap gap-2">
            <Link to="/data-quality" className="btn-secondary text-[11px]">جودة البيانات <ArrowUpLeft size={13}/></Link>
            <Link to="/reports/executive" className="btn-secondary text-[11px]">التقرير التنفيذي <FileSearch size={13}/></Link>
            <Link to="/work-center" className="btn-primary text-[11px]">مركز العمل <ArrowUpLeft size={13}/></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
