import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowUpLeft, Brain, CheckCircle2, CircleAlert, Lightbulb,
  RefreshCw, Sparkles, Target, TrendingUp, WalletCards, XCircle, Zap
} from 'lucide-react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { DeterministicIntelligenceAssistant } from '@/components/DeterministicIntelligenceAssistant';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SeverityBadge, PriorityBadge, ConfidenceBadge } from '@/components/ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { ForecastChart } from '@/components/ui/Charts';
import {
  fetchRecommendations,
  fetchAlerts,
  fetchForecasts,
  updateRecommendationStatus,
} from '@/lib/queries';
import { formatCurrency, relativeTime } from '@/lib/format';
import type { Recommendation, Alert, Forecast } from '@/lib/types';
import { fetchSmartReport, type SmartReportDetail } from '@/lib/report-smart';

function MetricStrip({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="ag-metric-tile rounded-[14px] border border-ink-200 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 text-[10px] font-black text-ink-400">
        <span className="text-primary-700">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-[25px] font-black tabular-nums text-ink-950">{value}</div>
      <div className="mt-1 text-[10px] text-ink-400">{note}</div>
    </div>
  );
}


async function loadOptionalSourceReport(params: URLSearchParams): Promise<SmartReportDetail | null> {
  const jobId = params.get('reportJobId')?.trim() || '';
  const sourceHash = params.get('sourceHash')?.trim() || '';
  if (!jobId || !/^sha256:[0-9a-fA-F]{64}$/.test(sourceHash)) return null;
  const report = await fetchSmartReport(jobId, sourceHash);
  if (!report) return null;
  if (report.sourceHash !== sourceHash) throw new Error('INVALID_REPORT_CONTEXT');
  return report;
}

function SourceIntelligenceRail({ report }: { report: SmartReportDetail }) {
  const intelligence = report.intelligence;
  const topSignal = intelligence.signals[0];
  const topRecommendation = intelligence.recommendations[0];
  return (
    <section dir="rtl" className="rounded-[18px] border border-primary-200 bg-primary-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black tracking-[.12em] text-primary-800">SOURCE-BOUND INTELLIGENCE</div>
          <h2 className="mt-1 text-base font-black text-ink-950">{report.specialty === 'sales' ? 'تقرير المبيعات' : report.specialty === 'purchases' ? 'تقرير المشتريات' : report.specialty === 'inventory' ? 'تقرير المخزون' : report.specialty === 'receivables' ? 'تقرير الذمم والتحصيل' : report.specialty === 'profitability' ? 'تقرير الربحية' : 'تقرير أعمال ذكي'}</h2>
          <div className="mt-1 text-[10px] text-ink-500">تحليل مصدر محدد · {report.rowCount ?? 0} سجل · الدليل مرتبط بالتقرير الحالي</div>
        </div>
        <Link to={'/reports/smart/' + encodeURIComponent(report.jobId) + '?sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-primary text-[10px]">افتح التقرير الذكي <ArrowUpLeft size={12}/></Link>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-[9px] font-black text-ink-400">الإشارات</div><div className="mt-1 text-sm font-black">{intelligence.signals.length}</div><div className="mt-1 text-[10px] leading-4 text-ink-600">{topSignal?.title ?? 'لا توجد إشارة استثنائية مثبتة'}</div></div>
        <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-[9px] font-black text-ink-400">التوصيات</div><div className="mt-1 text-sm font-black">{intelligence.recommendations.length}</div><div className="mt-1 text-[10px] leading-4 text-ink-600">{topRecommendation?.action ?? 'لا توجد توصية مصدرية كافية'}</div></div>
        <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-[9px] font-black text-ink-400">التنبؤ</div><div className="mt-1 text-sm font-black">{intelligence.forecast.status === 'AVAILABLE' ? 'متاح' : 'عينة غير كافية'}</div><div className="mt-1 text-[10px] leading-4 text-ink-600">{intelligence.forecast.note}</div></div>
        <div className="rounded-xl border border-ink-200 bg-white p-3"><div className="text-[9px] font-black text-ink-400">الإرشاد</div><div className="mt-1 text-sm font-black">{intelligence.advisorBrief.health === 'HEALTHY' ? 'سليم' : intelligence.advisorBrief.health === 'ATTENTION' ? 'يحتاج انتباهًا' : 'مراجعة مطلوبة'}</div><div className="mt-1 text-[10px] leading-4 text-ink-600">{intelligence.guidance.focus}</div></div>
      </div>
      <div className="mt-2 grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6" aria-label="طبقات ذكاء التقرير">
        {[
          { label: 'تحليلي', value: intelligence.findings.length, note: 'Finding' },
          { label: 'تفسيري', value: intelligence.signals.filter((signal) => Boolean(signal.message && signal.soWhat)).length, note: 'WHY → SO WHAT' },
          { label: 'تحذيري', value: intelligence.signals.filter((signal) => ['critical','high','medium'].includes(signal.severity)).length, note: 'Severity' },
          { label: 'تنبؤي', value: intelligence.forecast.status === 'AVAILABLE' ? 1 : 0, note: intelligence.forecast.status === 'AVAILABLE' ? 'متاح' : 'غير كافٍ' },
          { label: 'إرشادي', value: intelligence.guidance.inspect.length, note: 'Inspect' },
          { label: 'توصية', value: intelligence.recommendations.length, note: 'Recommendation' },
        ].map((layer) => (
          <div key={layer.label} className="rounded-xl border border-ink-200 bg-white p-3">
            <div className="text-[9px] font-black text-ink-400">{layer.label}</div>
            <div className="mt-1 text-lg font-black text-ink-950">{layer.value}</div>
            <div className="mt-1 text-[8px] font-bold text-ink-500">{layer.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SourceRecommendationsDetail({ report }: { report: SmartReportDetail }) {
  const priorityLabel: Record<string,string> = { urgent:'عاجل', high:'مرتفع', medium:'متوسط', low:'منخفض' };
  const items = report.intelligence.recommendations;
  return (
    <section dir="rtl" className="rounded-[18px] border border-primary-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-[9px] font-black tracking-[.12em] text-primary-700">REPORT RECOMMENDATIONS</div><h2 className="mt-1 text-base font-black text-ink-950">توصيات التقرير نفسه</h2></div>
        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[9px] font-black text-primary-800">{items.length} توصية</span>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.length ? items.map((item) => (
          <article key={item.id} className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary-100 px-2 py-1 text-[8px] font-black text-primary-800">{priorityLabel[item.priority] ?? item.priority}</span><span className="text-xs font-black text-ink-900">{item.title}</span></div>
            <div className="mt-2 text-[10px] leading-5 text-ink-700">{item.action}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[9px]"><div className="rounded-lg bg-white p-2"><b>لماذا</b><div className="mt-1 text-ink-600">{item.why}</div></div><div className="rounded-lg bg-white p-2"><b>المسؤول والنتيجة</b><div className="mt-1 text-ink-600">{item.ownerHint} · {item.expectedOutcome}</div></div></div>
            <details className="mt-2 rounded-lg border border-ink-100 bg-ink-50/50 px-2.5 py-2">
              <summary className="cursor-pointer text-[8px] font-black text-ink-400">عرض الدليل</summary>
              <div className="mt-1 text-[9px] leading-4 text-ink-500">{item.evidence.join(' · ')}</div>
            </details>
          </article>
        )) : <div className="rounded-xl border border-dashed border-ink-200 p-4 text-[10px] text-ink-500">لا توجد توصية مصدرية كافية حاليًا.</div>}
      </div>
    </section>
  );
}

function SourceSignalsDetail({ report }: { report: SmartReportDetail }) {
  const priorityLabel: Record<string,string> = { P0:'عاجل', P1:'مرتفع', P2:'متوسط', P3:'منخفض' };
  const signals = report.intelligence.signals;
  const severityLabel: Record<string, string> = {
    critical: 'حرج',
    high: 'تحذيري',
    medium: 'تنبيهي',
    low: 'ملاحظة',
    info: 'إرشادي',
  };
  return (
    <section dir="rtl" className="rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black tracking-[.12em] text-warning-700">SOURCE SIGNALS</div>
          <h2 className="mt-1 text-base font-black text-ink-950">كل الإشارات المثبتة في هذا التقرير</h2>
        </div>
        <span className="rounded-full bg-warning-50 px-2.5 py-1 text-[9px] font-black text-warning-900">{signals.length} إشارة</span>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {signals.length ? signals.map((signal) => (
          <article key={signal.id} className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-warning-100 px-2 py-1 text-[8px] font-black text-warning-900">{severityLabel[signal.severity] ?? signal.severity}</span>
              <span className="rounded-full bg-ink-100 px-2 py-1 text-[8px] font-black text-ink-700">{priorityLabel[signal.priority] ?? signal.priority}</span>
              <span className="text-xs font-black text-ink-900">{signal.title}</span>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-ink-700">{signal.message}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[9px]">
              <div className="rounded-lg bg-white p-2"><b>SO WHAT</b><div className="mt-1 text-ink-600">{signal.soWhat}</div></div>
              <div className="rounded-lg bg-white p-2"><b>IMPACT / OWNER</b><div className="mt-1 text-ink-600">{signal.impact} · {signal.ownerHint}</div></div>
            </div>
            <details className="mt-2 rounded-lg border border-ink-100 bg-ink-50/50 px-2.5 py-2">
              <summary className="cursor-pointer text-[8px] font-black text-ink-400">عرض الدليل</summary>
              <div className="mt-1 text-[9px] leading-4 text-ink-500">{signal.evidence.join(' · ')}</div>
            </details>
          </article>
        )) : <div className="rounded-xl border border-dashed border-ink-200 p-4 text-[10px] text-ink-500">لا توجد إشارة استثنائية مثبتة من هذا المصدر.</div>}
      </div>
    </section>
  );
}

function SourceGuidanceDetail({ report }: { report: SmartReportDetail }) {
  const guidance = report.intelligence.guidance;
  return (
    <section dir="rtl" className="rounded-[18px] border border-primary-200 bg-primary-50/50 p-4 shadow-sm">
      <div className="text-[9px] font-black tracking-[.12em] text-primary-800">SOURCE GUIDANCE</div>
      <h2 className="mt-1 text-base font-black text-ink-950">الإرشاد المبني على نفس التقرير</h2>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-3"><div className="text-[8px] font-black text-primary-700">FOCUS</div><div className="mt-1 text-[10px] leading-5 text-ink-700">{guidance.focus}</div></div>
        <div className="rounded-xl bg-white p-3"><div className="text-[8px] font-black text-primary-700">OWNER</div><div className="mt-1 text-[10px] leading-5 text-ink-700">{guidance.ownerHint}</div></div>
        <div className="rounded-xl bg-white p-3"><div className="text-[8px] font-black text-primary-700">BOUNDARY</div><div className="mt-1 text-[10px] leading-5 text-ink-700">{guidance.boundary}</div></div>
      </div>
      <div className="mt-3 rounded-xl bg-white p-3">
        <div className="text-[8px] font-black text-primary-700">INSPECT NEXT</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {guidance.inspect.map((item, index) => <div key={index} className="rounded-lg border border-primary-100 bg-primary-50/30 p-2 text-[9px] leading-5 text-ink-700">{index + 1}. {item}</div>)}
        </div>
      </div>
    </section>
  );
}

function SourceForecastDetail({ report }: { report: SmartReportDetail }) {
  const forecast = report.intelligence.forecast;
  return (
    <section dir="rtl" className="rounded-[18px] border border-ink-200 bg-ink-950 p-4 text-white shadow-sm">
      <div className="text-[9px] font-black tracking-[.12em] text-primary-200">REPORT FORECAST</div>
      <h2 className="mt-1 text-base font-black">التنبؤ الخاص بهذا التقرير</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white/5 p-3"><div className="text-[8px] text-ink-300">الحالة</div><div className="mt-1 text-sm font-black">{forecast.status === 'AVAILABLE' ? 'متاح' : 'عينة غير كافية'}</div></div>
        <div className="rounded-xl bg-white/5 p-3"><div className="text-[8px] text-ink-300">الفترات</div><div className="mt-1 text-sm font-black">{forecast.observedPeriods}</div></div>
        <div className="rounded-xl bg-white/5 p-3"><div className="text-[8px] text-ink-300">القيمة التالية</div><div className="mt-1 text-sm font-black">{forecast.nextValue == null ? 'غير متاح' : forecast.nextValue.toLocaleString('ar-YE', { maximumFractionDigits: 2 })}</div></div>
        <div className="rounded-xl bg-white/5 p-3"><div className="text-[8px] text-ink-300">الاتجاه</div><div className="mt-1 text-sm font-black">{forecast.direction ?? 'غير متاح'}</div></div>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-ink-300">{forecast.note}</p>
    </section>
  );
}

export function IntelligenceCenterPage() {
  const [sourceParams] = useSearchParams();
  const [sourceReport, setSourceReport] = useState<SmartReportDetail | null>(null);
  const [sourceReportError, setSourceReportError] = useState<string | null>(null);
  const sourceQueryKey = sourceParams.toString();
  useEffect(() => {
    let active = true;
    void loadOptionalSourceReport(new URLSearchParams(sourceQueryKey)).then((value) => {
      if (!active) return;
      setSourceReport(value);
      setSourceReportError(null);
    }).catch((cause) => {
      if (!active) return;
      setSourceReport(null);
      setSourceReportError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [sourceQueryKey]);
const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [recs, nextAlerts, nextForecasts] = await Promise.allSettled([
        fetchRecommendations(),
        fetchAlerts(),
        fetchForecasts(),
      ]);
      const failures: string[] = [];
      if (recs.status === 'fulfilled') setRecommendations(recs.value);
      else failures.push('التوصيات العامة: ' + (recs.reason instanceof Error ? recs.reason.message : 'فشل التحميل'));
      if (nextAlerts.status === 'fulfilled') setAlerts(nextAlerts.value);
      else failures.push('الإشارات العامة: ' + (nextAlerts.reason instanceof Error ? nextAlerts.reason.message : 'فشل التحميل'));
      if (nextForecasts.status === 'fulfilled') setForecasts(nextForecasts.value);
      else failures.push('التنبؤات العامة: ' + (nextForecasts.reason instanceof Error ? nextForecasts.reason.message : 'فشل التحميل'));
      setError(failures.length ? failures.join(' · ') : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل مركز الذكاء');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const newRecommendations = useMemo(
    () => recommendations.filter((item) => item.status === 'new'),
    [recommendations],
  );
  const activeAlerts = useMemo(
    () => alerts.filter((item) => !item.is_read),
    [alerts],
  );
  const companyForecasts = useMemo(
    () => forecasts.filter((item) => item.entity_type === 'company'),
    [forecasts],
  );
  const visibleActiveAlerts = useMemo(() => activeAlerts.slice(0, 24), [activeAlerts]);
  const visibleNewRecommendations = useMemo(() => newRecommendations.slice(0, 24), [newRecommendations]);

  const decideRecommendation = useCallback(async (recommendationId: string, status: 'accepted' | 'rejected') => {
    if (decisionId) return;
    try {
      setDecisionId(recommendationId);
      setError(null);
      await updateRecommendationStatus(recommendationId, status);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة التوصية.');
    } finally {
      setDecisionId(null);
    }
  }, [decisionId, load]);

  const forecastChartData = useMemo(
    () => companyForecasts.map((forecast) => {
      const date = new Date(forecast.period);
      const labels = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      return {
        label: labels[date.getMonth()],
        forecast_value: forecast.forecast_value,
        upper_bound: forecast.upper_bound,
        lower_bound: forecast.lower_bound,
      };
    }),
    [companyForecasts],
  );

  if (loading && !sourceReport) return <LoadingState message="جارٍ تجميع الإشارات والتوصيات والتنبؤات..." />;
  if (error && !sourceReport) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div dir="rtl" className="ag-intelligence-suite-surface space-y-5 animate-fade-in pb-10">
      {error && sourceReport ? <section className="rounded-2xl border border-warning-200 bg-warning-50 p-4 text-warning-900"><div className="text-[9px] font-black tracking-[.12em]">GENERIC INTELLIGENCE READBACK</div><div className="mt-1 text-sm font-black">استمر عرض ذكاء التقرير المصدرّي رغم تعطل جزء من السجل العام</div><div className="mt-2 text-[10px] leading-5">{error}</div></section> : null}
      {sourceReportError && <ErrorState message={sourceReportError} onRetry={() => void loadOptionalSourceReport(new URLSearchParams(sourceQueryKey)).then(setSourceReport).catch((cause) => setSourceReportError(cause instanceof Error ? cause.message : String(cause)))} />}
      {sourceReport && <SourceIntelligenceRail report={sourceReport} />}
      {sourceReport && <SourceSignalsDetail report={sourceReport} />}
      {sourceReport && <SourceGuidanceDetail report={sourceReport} />}
      <section className="ag-command-hero rounded-[20px] border border-ink-200 bg-ink-950 p-5 text-white shadow-elevated lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black text-primary-300">
              <Brain size={15} />
              محلل الأعمال
            </div>
            <h1 className="mt-2 text-[25px] font-black tracking-tight lg:text-[31px]">الانتباه → الفهم → القرار</h1>
            <p className="mt-2 text-[12px] leading-6 text-ink-300">
              هذه المساحة لا تصنع أرقامًا جديدة. تجمع الإشارات المتاحة من المصدر، تشرح حدودها، ثم تدفعك إلى القرار أو التقرير المناسب.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-[9px] border border-white/15 bg-white/10 px-3.5 py-2.5 text-[11px] font-bold text-white hover:bg-white/15 disabled:opacity-60">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              تحديث
            </button>
            <Link to="/decision-experience" className="btn-primary text-[11px]">مساحة القرار <ArrowUpLeft size={13} /></Link>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-ink-200">دليل قبل الاستنتاج</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-ink-200">التنبؤ موسوم بطبيعته</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-ink-200">لا قرار دون مسار قابل للمراجعة</span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricStrip label="إشارات نشطة" value={activeAlerts.length} note="تحتاج انتباهًا غير مقروء" icon={<AlertTriangle size={15} />} />
        <MetricStrip label="قرارات مقترحة" value={newRecommendations.length} note="بانتظار المراجعة" icon={<Lightbulb size={15} />} />
        <MetricStrip label="تنبؤات مصدرية" value={forecasts.length} note="المتاح من المصدر الحالي" icon={<TrendingUp size={15} />} />
      </section>

      <DeterministicIntelligenceAssistant
        recommendationsCount={recommendations.length}
        activeAlertsCount={activeAlerts.length}
        forecastsCount={forecasts.length}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/command-center" className="card card-hover p-4">
          <div className="flex items-center justify-between"><CircleAlert size={17} className="text-danger-700"/><span className="badge-danger">EARLY WARNING</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">الإشارات ومحركات التغير</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">تحقيق الإشارة يبدأ من مركز القيادة حيث تظهر الحالة والسياق قبل القرار.</p>
        </Link>
        <Link to="/intelligence/forecasts" className="card card-hover p-4">
          <div className="flex items-center justify-between"><TrendingUp size={17} className="text-primary-700"/><span className="badge-primary">FORECAST</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">التنبؤ + الاختبار الرجعي</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">التنبؤات متاحة من المصدر؛ الاختبار الرجعي مستقل عن العرض ولا يُملأ بنتيجة تقديرية.</p>
        </Link>
        <Link to="/intelligence/scenarios" className="card card-hover p-4">
          <div className="flex items-center justify-between"><Target size={17} className="text-primary-700"/><span className="badge-primary">WHAT-IF</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">السيناريوهات</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">انتقل إلى حارس السيناريوهات مع بقاء شروط الحقيقة والحساب الحتمي في المقدمة.</p>
        </Link>
        <div className="card p-4">
          <div className="flex items-center justify-between"><Sparkles size={17} className="text-warning-700"/><span className="badge-warning">غير متاح</span></div>
          <div className="mt-3 text-sm font-black text-ink-900">Decision Playbooks</div>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">قوالب اللعبات التنفيذية تحتاج مسار سجل مستقل؛ لن تُعرض كقوالب جاهزة مزيفة.</p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader
            title="ماذا يجب أن أراجع أولًا؟"
            subtitle="الإشارة أولًا، ثم السياق، ثم مسار القرار."
            action={<Link to="/command-center" className="btn-ghost text-[11px]">مركز القيادة <ArrowUpLeft size={13} /></Link>}
          />
          <CardBody>
            <div className="space-y-3">
              {visibleActiveAlerts.map((alert) => (
                <article key={alert.id} className="rounded-[14px] border border-ink-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-50 text-danger-700">
                      <CircleAlert size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={alert.severity} />
                        <span className="text-[10px] text-ink-400">{relativeTime(alert.created_at)}</span>
                      </div>
                      <div className="mt-2 text-[13px] font-black text-ink-900">{alert.title}</div>
                      {alert.description && <p className="mt-1 text-[11px] leading-5 text-ink-500">{alert.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/command-center" className="btn-secondary text-[11px]">تحقيق الإشارة <ArrowUpLeft size={13} /></Link>
                        <Link to="/metrics" className="btn-ghost text-[11px]">فحص المؤشر</Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {activeAlerts.length === 0 && <EmptyState title="لا توجد إشارات نشطة حاليًا" message="لم يتم العثور على تنبيه مصدرّي يحتاج انتباهًا الآن." />}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="طابور القرار"
            subtitle="التوصية لا تتحول إلى نتيجة فعلية إلا عبر المسار التشغيلي الموثق."
            action={<Link to="/decision-experience" className="btn-ghost text-[11px]">فتح مساحة القرار <ArrowUpLeft size={13} /></Link>}
          />
          <CardBody>
            <div className="space-y-3">
              {visibleNewRecommendations.map((recommendation) => (
                <article key={recommendation.id} className="rounded-[14px] border border-primary-100 bg-primary-50/25 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                      <Sparkles size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={recommendation.priority} />
                        <ConfidenceBadge confidence={recommendation.confidence} />
                      </div>
                      <div className="mt-2 text-[13px] font-black text-ink-900">{recommendation.title}</div>
                      {recommendation.description && <p className="mt-1 text-[11px] leading-5 text-ink-500">{recommendation.description}</p>}
                      {recommendation.expected_impact !== undefined && recommendation.expected_impact !== null && (
                        <div className="mt-2 text-[10px] font-bold text-success-700">الأثر المتوقع: {formatCurrency(recommendation.expected_impact)}</div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void decideRecommendation(recommendation.id, 'accepted')}
                          disabled={decisionId !== null}
                          className="btn-primary text-[11px] disabled:cursor-wait disabled:opacity-60"
                        >
                          <CheckCircle2 size={13} /> {decisionId === recommendation.id ? 'جارٍ الحفظ…' : 'قبول'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void decideRecommendation(recommendation.id, 'rejected')}
                          disabled={decisionId !== null}
                          className="btn-secondary text-[11px] disabled:cursor-wait disabled:opacity-60"
                        >
                          <XCircle size={13} /> {decisionId === recommendation.id ? 'جارٍ الحفظ…' : 'رفض'}
                        </button>
                        <Link to="/decision-inbox" className="btn-ghost text-[11px]">مركز القرارات</Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {newRecommendations.length === 0 && <EmptyState title="لا توجد توصيات جديدة" message="لن يتم تصنيع توصية بديلة عند غياب إشارة مصدرية." />}
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_.55fr]">
        <Card>
          <CardHeader
            title="نبض التنبؤ"
            subtitle="عرض ما هو متاح من المصدر مع الحفاظ على طبيعته كتنبؤ."
            action={<ConfidenceBadge confidence="FORECAST" />}
          />
          <CardBody>
            {forecastChartData.length
              ? <ForecastChart data={forecastChartData} />
              : <EmptyState title="لا توجد تنبؤات مصدرية" message="لن يتم إنشاء منحنى تقديري دون بيانات موثقة." />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="ماذا بعد؟" subtitle="أقصر طريق من الرؤية إلى الإجراء" />
          <CardBody>
            <div className="space-y-2.5">
              <Link to="/reports/receivables" className="flex items-center gap-3 rounded-xl border border-ink-100 p-3 hover:border-primary-200 hover:bg-primary-50/30">
                <WalletIcon />
                <span className="min-w-0 flex-1"><strong className="block text-[12px]">افحص التحصيل</strong><span className="text-[10px] text-ink-400">الذمم والأعمار والعملاء</span></span>
                <ArrowUpLeft size={13} className="text-ink-300" />
              </Link>
              <Link to="/reports/profitability" className="flex items-center gap-3 rounded-xl border border-ink-100 p-3 hover:border-primary-200 hover:bg-primary-50/30">
                <MarginIcon />
                <span className="min-w-0 flex-1"><strong className="block text-[12px]">افحص الربحية</strong><span className="text-[10px] text-ink-400">الإيراد والتكلفة والهامش</span></span>
                <ArrowUpLeft size={13} className="text-ink-300" />
              </Link>
              <Link to="/reports/inventory-intelligence" className="flex items-center gap-3 rounded-xl border border-ink-100 p-3 hover:border-primary-200 hover:bg-primary-50/30">
                <Target size={16} className="text-primary-700" />
                <span className="min-w-0 flex-1"><strong className="block text-[12px]">افحص المخزون</strong><span className="text-[10px] text-ink-400">الحركة وإعادة الطلب والتعرض</span></span>
                <ArrowUpLeft size={13} className="text-ink-300" />
              </Link>
            </div>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="حدود الذكاء" subtitle="المنتج يوضح ما يعرفه وما لا يعرفه بدل تحويل الاحتمال إلى حقيقة." />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-success-50 p-4"><CheckCircle2 className="text-success-700" size={17} /><div className="mt-2 text-[12px] font-black text-success-900">مصدر مثبت</div><p className="mt-1 text-[10px] leading-5 text-success-800">تظهر البيانات المصدرية مع حالتها وسياقها.</p></div>
            <div className="rounded-xl bg-warning-50 p-4"><CircleAlert className="text-warning-700" size={17} /><div className="mt-2 text-[12px] font-black text-warning-900">مراجعة مطلوبة</div><p className="mt-1 text-[10px] leading-5 text-warning-800">الحالات الناقصة أو غير الكافية لا تتحول إلى أرقام مصطنعة.</p></div>
            <div className="rounded-xl bg-ink-50 p-4"><Zap className="text-ink-500" size={17} /><div className="mt-2 text-[12px] font-black text-ink-900">التوقع ليس نتيجة</div><p className="mt-1 text-[10px] leading-5 text-ink-600">التنبؤ والتوصية يظلان موسومين حتى تثبت النتيجة التشغيلية.</p></div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function WalletIcon() {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><WalletCards size={15} /></div>;
}

function MarginIcon() {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><TrendingUp size={15} /></div>;
}

function recommendationStatusLabel(status: string): string {
  if (status === 'new') return 'جديدة';
  if (status === 'accepted') return 'مقبولة';
  if (status === 'rejected') return 'مرفوضة';
  if (status === 'approved') return 'معتمدة';
  if (status === 'in_progress') return 'قيد التنفيذ';
  if (status === 'completed') return 'مكتملة';
  if (status === 'dismissed') return 'مستبعدة';
  return status;
}

function priorityLabel(priority: string): string {
  const normalized = priority.toLowerCase();
  if (normalized === 'critical' || normalized === 'urgent') return 'عاجلة';
  if (normalized === 'high') return 'مرتفعة';
  if (normalized === 'medium') return 'متوسطة';
  if (normalized === 'low') return 'منخفضة';
  return priority;
}

function SummaryStrip({ cells }: { cells: Array<{ label: string; value: string | number; note: string }> }) {
  return (
    <section className="ag-decision-strip" aria-label="ملخص الذكاء">
      {cells.map((cell) => (
        <div key={cell.label} className="ag-decision-cell">
          <span className="ag-decision-label">{cell.label}</span>
          <span className="ag-decision-value">{cell.value}</span>
          <span className="mt-1 block text-[9px] text-ink-400">{cell.note}</span>
        </div>
      ))}
    </section>
  );
}

export function RecommendationsPage() {
  const [sourceParams] = useSearchParams();
  const [sourceReport, setSourceReport] = useState<SmartReportDetail | null>(null);
  const [sourceReportError, setSourceReportError] = useState<string | null>(null);
  const sourceQueryKey = sourceParams.toString();
  useEffect(() => {
    let active = true;
    void loadOptionalSourceReport(new URLSearchParams(sourceQueryKey)).then((value) => {
      if (!active) return;
      setSourceReport(value);
      setSourceReportError(null);
    }).catch((cause) => {
      if (!active) return;
      setSourceReport(null);
      setSourceReportError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [sourceQueryKey]);
const [items, setItems] = useState<Recommendation[]>([]);
  const [filter, setFilter] = useState<'all' | 'new' | 'accepted' | 'rejected'>('all');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setItems(await fetchRecommendations());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل التوصيات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: items.length,
    new: items.filter((item) => item.status === 'new').length,
    accepted: items.filter((item) => item.status === 'accepted').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
    withImpact: items.filter((item) => item.expected_impact !== null || item.impact_result !== null).length,
  }), [items]);

  const visibleItems = filter === 'all' ? items : items.filter((item) => item.status === filter);

  const handleStatus = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      setPendingId(id);
      setError(null);
      await updateRecommendationStatus(id, status);
      setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة التوصية');
    } finally {
      setPendingId(null);
    }
  };

  if (loading && !sourceReport) return <LoadingState message="جارٍ تجميع التوصيات من المصدر المعتمد..." />;
  if (error && !sourceReport) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div dir="rtl" className="ag-intelligence-suite-surface space-y-5 animate-fade-in pb-10">
      {error && sourceReport ? <section className="rounded-2xl border border-warning-200 bg-warning-50 p-4 text-warning-900"><div className="text-[9px] font-black tracking-[.12em]">قراءة التوصيات العامة</div><div className="mt-1 text-sm font-black">توصيات التقرير المصدرّي ظاهرة رغم تعطل سجل التوصيات العام</div><div className="mt-2 text-[10px] leading-5">{error}</div></section> : null}
      {sourceReportError && <ErrorState message={sourceReportError} onRetry={() => void loadOptionalSourceReport(new URLSearchParams(sourceQueryKey)).then(setSourceReport).catch((cause) => setSourceReportError(cause instanceof Error ? cause.message : String(cause)))} />}
      {sourceReport && <SourceIntelligenceRail report={sourceReport} />}
      {sourceReport && <SourceRecommendationsDetail report={sourceReport} />}
      <section className="ag-intelligence-hero rounded-[20px] bg-ink-950 p-5 text-white shadow-elevated lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black text-primary-300"><Brain size={16}/>الذكاء والقرار</div>
            <h1 className="mt-2 text-[24px] font-black tracking-tight lg:text-[30px]">التوصيات التي يمكن مراجعتها الآن</h1>
            <p className="mt-2 text-[12px] leading-6 text-ink-300">كل توصية تبقى مرتبطة بحالتها وثقتها ومصدرها. قبولها أو رفضها يغيّر حالة السجل الحقيقي ولا ينشئ نتيجة تنفيذية من تلقاء نفسه.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-[9px] border border-white/15 bg-white/10 px-3.5 py-2.5 text-[11px] font-bold text-white hover:bg-white/15"><RefreshCw size={14}/>تحديث</button>
            <Link to="/decision-experience" className="btn-primary text-[11px]">مساحة القرار <ArrowUpLeft size={13}/></Link>
          </div>
        </div>
      </section>

      <SummaryStrip cells={[
        { label: 'إجمالي التوصيات', value: counts.all, note: 'السجل المتاح حاليًا' },
        { label: 'بانتظار المراجعة', value: counts.new, note: 'حالة جديدة' },
        { label: 'مقبولة', value: counts.accepted, note: 'قرار مراجعة مسجل' },
        { label: 'مرتبطة بأثر', value: counts.withImpact, note: 'أثر متوقع أو نتيجة مسجلة' },
      ]}/>

      <Card>
        <CardHeader
          title="مرشح التوصيات"
          subtitle={visibleItems.length + ' من ' + items.length + ' توصية'}
          action={
            <div className="flex flex-wrap gap-1.5">
              {([['all','الكل'],['new','الجديدة'],['accepted','المقبولة'],['rejected','المرفوضة']] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilter(key)} className={filter === key ? 'rounded-full bg-ink-950 px-3 py-1.5 text-[10px] font-bold text-white' : 'rounded-full bg-ink-50 px-3 py-1.5 text-[10px] font-bold text-ink-600 hover:bg-ink-100'}>
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
          }
        />
        <CardBody>
          {visibleItems.length ? (
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <article key={item.id} className="rounded-[15px] border border-ink-200 bg-white p-4 transition hover:border-primary-200 hover:shadow-card">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                      {item.status === 'new' ? <Lightbulb size={18}/> : item.status === 'accepted' ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[14px] font-black text-ink-900">{item.title}</h2>
                        <ConfidenceBadge confidence={item.confidence}/>
                        <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[10px] font-bold text-ink-600">{priorityLabel(item.priority)}</span>
                        <span className={item.status === 'new' ? 'rounded-full bg-warning-50 px-2.5 py-1 text-[10px] font-bold text-warning-800' : item.status === 'accepted' ? 'rounded-full bg-success-50 px-2.5 py-1 text-[10px] font-bold text-success-700' : 'rounded-full bg-ink-50 px-2.5 py-1 text-[10px] font-bold text-ink-500'}>
                          {recommendationStatusLabel(item.status)}
                        </span>
                      </div>
                      {item.description && <p className="mt-2 text-[11px] leading-5 text-ink-500">{item.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-400">
                        <span>الفئة: {item.category || 'غير محددة'}</span>
                        <span>المسؤول: {item.owner || 'غير محدد'}</span>
                        <span>{item.expected_impact !== null ? 'أثر متوقع مسجل' : item.impact_result !== null ? 'نتيجة أثر مسجلة' : 'الأثر غير مثبت بعد'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {item.status === 'new' && <>
                        <button type="button" disabled={pendingId === item.id} onClick={() => void handleStatus(item.id, 'accepted')} className="btn-primary text-xs"><CheckCircle2 size={14}/>قبول</button>
                        <button type="button" disabled={pendingId === item.id} onClick={() => void handleStatus(item.id, 'rejected')} className="btn-secondary text-xs"><XCircle size={14}/>رفض</button>
                      </>}
                      <Link to="/decision-inbox" className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50">مساحة الدليل <ArrowLeft size={14}/></Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="لا توجد توصيات في هذا المرشح" message={items.length ? 'غيّر عامل التصفية لرؤية الحالات الأخرى.' : 'لا توجد توصيات مصدرية قابلة للمراجعة حاليًا.'}/>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function ForecastsPage() {
  const [sourceParams] = useSearchParams();
  const [sourceReport, setSourceReport] = useState<SmartReportDetail | null>(null);
  const [sourceReportError, setSourceReportError] = useState<string | null>(null);
  const sourceQueryKey = sourceParams.toString();
  useEffect(() => {
    let active = true;
    void loadOptionalSourceReport(new URLSearchParams(sourceQueryKey)).then((value) => {
      if (!active) return;
      setSourceReport(value);
      setSourceReportError(null);
    }).catch((cause) => {
      if (!active) return;
      setSourceReport(null);
      setSourceReportError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [sourceQueryKey]);
const [items, setItems] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setItems(await fetchForecasts());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل التنبؤات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const company = useMemo(() => items.filter((item) => item.entity_type === 'company'), [items]);
  const chart = useMemo(() => {
    const labels = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return company.map((item) => {
      const date = new Date(item.period);
      return { label: labels[date.getMonth()] || item.period, forecast_value: item.forecast_value, upper_bound: item.upper_bound, lower_bound: item.lower_bound };
    });
  }, [company]);
  const latestPeriod = useMemo(
    () => items.length ? [...items].sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime())[0]?.period || 'غير متاح' : 'غير متاح',
    [items],
  );
  const qualityBounded = useMemo(() => items.filter((item) => item.quality_score !== null).length, [items]);

  if (loading && !sourceReport) return <LoadingState message="جارٍ تجميع التنبؤات المصدرية..." />;
  if (error && !sourceReport) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div dir="rtl" className="ag-intelligence-suite-surface space-y-5 animate-fade-in pb-10">
      {error && sourceReport ? <section className="rounded-2xl border border-warning-200 bg-warning-50 p-4 text-warning-900"><div className="text-[9px] font-black tracking-[.12em]">قراءة التنبؤات العامة</div><div className="mt-1 text-sm font-black">تنبؤ التقرير المصدرّي ظاهر رغم تعطل جدول التنبؤ العام</div><div className="mt-2 text-[10px] leading-5">{error}</div></section> : null}
      {sourceReportError && <ErrorState message={sourceReportError} onRetry={() => void loadOptionalSourceReport(new URLSearchParams(sourceQueryKey)).then(setSourceReport).catch((cause) => setSourceReportError(cause instanceof Error ? cause.message : String(cause)))} />}
      {sourceReport && <SourceIntelligenceRail report={sourceReport} />}
      {sourceReport && <SourceForecastDetail report={sourceReport} />}
      <section className="ag-intelligence-hero rounded-[20px] bg-ink-950 p-5 text-white shadow-elevated lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-black text-primary-300"><TrendingUp size={16}/>التنبؤات</div>
            <h1 className="mt-2 text-[24px] font-black tracking-tight lg:text-[30px]">قراءة المستقبل مع إبقاء حدوده مرئية</h1>
            <p className="mt-2 text-[12px] leading-6 text-ink-300">التنبؤ نتيجة تقديرية وموسومة بذلك. لا يتم إنشاء منحنى بديل عند غياب البيانات، ولا تتحول التقديرات إلى حقيقة محاسبية أو رقم مؤكد.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 self-start rounded-[9px] border border-white/15 bg-white/10 px-3.5 py-2.5 text-[11px] font-bold text-white hover:bg-white/15"><RefreshCw size={14}/>تحديث</button>
        </div>
      </section>

      <SummaryStrip cells={[
        {label:'إجمالي التنبؤات',value:items.length,note:'سجلات تقديرية متاحة'},
        {label:'على مستوى الشركة',value:company.length,note:'السلسلة المعروضة'},
        {label:'مع درجة جودة',value:qualityBounded,note:'حالة جودة مصدرية مسجلة'},
        {label:'آخر فترة',value:latestPeriod,note:'أحدث فترة في السجل'},
      ]}/>

      <section className="rounded-[16px] border border-warning-200 bg-warning-50/70 p-4">
        <div className="flex items-start gap-3">
          <Target size={17} className="mt-0.5 shrink-0 text-warning-700"/>
          <div><div className="text-xs font-black text-warning-900">التنبؤ — ليس حقيقة تنفيذية</div><p className="mt-1 text-[10px] leading-5 text-warning-800">تستخدم هذه المساحة للاتجاه والتخطيط. القرار التنفيذي يجب أن يقرأ التنبؤ مع المصدر والثقة ونطاق عدم اليقين، ثم ينتقل إلى مساحة القرار.</p></div>
        </div>
      </section>

      <Card>
        <CardHeader title="منحنى التنبؤ" subtitle={chart.length ? 'السلسلة المتاحة على مستوى الشركة' : 'لا توجد سلسلة مصدرية قابلة للعرض'} action={<ConfidenceBadge confidence="FORECAST"/>}/>
        <CardBody>{chart.length ? <ForecastChart data={chart}/> : <EmptyState title="لا توجد تنبؤات مصدرية" message="لن يتم إنشاء منحنى تقديري من دون بيانات تنبؤية موثوقة."/>}</CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Link to="/decision-experience" className="card card-hover p-4"><div className="flex items-center justify-between"><Sparkles size={17} className="text-primary-700"/><span className="badge-primary">القرار</span></div><div className="mt-3 text-sm font-black text-ink-900">انقل الإشارة إلى القرار</div><p className="mt-1 text-[10px] leading-5 text-ink-500">استخدم التنبؤ كمدخل للسياق والسيناريو، لا كبديل عن الحقيقة الكانونية.</p><div className="mt-3 text-[10px] font-bold text-primary-700">فتح مساحة القرار <ArrowUpLeft size={12} className="inline"/></div></Link>
        <Link to="/trust" className="card card-hover p-4"><div className="flex items-center justify-between"><CircleAlert size={17} className="text-warning-700"/><span className="badge-warning">الثقة</span></div><div className="mt-3 text-sm font-black text-ink-900">افحص الثقة والسياق</div><p className="mt-1 text-[10px] leading-5 text-ink-500">راجع حالة المصدر قبل التعامل مع التنبؤ كمدخل قرار.</p><div className="mt-3 text-[10px] font-bold text-primary-700">فتح الثقة <ArrowUpLeft size={12} className="inline"/></div></Link>
        <Link to="/analytics" className="card card-hover p-4"><div className="flex items-center justify-between"><TrendingUp size={17} className="text-primary-700"/><span className="badge-neutral">التحليلات</span></div><div className="mt-3 text-sm font-black text-ink-900">ارجع إلى المؤشرات</div><p className="mt-1 text-[10px] leading-5 text-ink-500">قارن التوجه المستقبلي مع الأنماط الكانونية التي سبقت التنبؤ.</p><div className="mt-3 text-[10px] font-bold text-primary-700">مركز التحليلات <ArrowUpLeft size={12} className="inline"/></div></Link>
      </div>
    </div>
  );
}
