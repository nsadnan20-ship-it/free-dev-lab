import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from '@/lib/router-compat';
import { FileBarChart, ShoppingCart, Package, Receipt, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, LoadingState, ErrorState, DataUnavailableState, userFacingError } from '@/components/ui/States';
import { DataTable } from '@/components/ui/DataTable';
import { TrendChart, HorizontalBarChart, CategoryPieChart } from '@/components/ui/Charts';
import { fetchDashboardSnapshot, fetchInventoryReportSnapshot } from '@/lib/dashboard-canonical';
import { fetchSmartReport, fetchSmartReportCatalog, type SmartReportCatalogItem, type SmartReportDetail } from '@/lib/report-smart';
import { ReportIntelligencePanel } from '@/components/ReportIntelligencePanel';
import { selectExecutiveSignal } from '@/lib/report-intelligence/report-smart-insights';
import { CustomerReportSurface } from '@/components/CustomerReportSurface';
import { BusinessDataExplorer } from '@/components/SourceBoundReportSurface';
import { fetchSalesInvoices, fetchPurchaseInvoices, fetchPurchaseSummary, fetchSalesExportRows, fetchPurchaseExportRows, fetchInventoryExportRows, fetchReceivablesExportRows } from '@/lib/queries-compat';
import { formatCurrency, formatNumber, formatDate } from '@/lib/format';
import { downloadReportArtifact } from '@/lib/report-execution/download';
import type { SalesInvoice, PurchaseInvoice } from '@/lib/types';
import type { DashboardKPIs, MonthlyTrend, TopEntity, CategoryBreakdown, AgingBucket, InventoryReportRow } from '@/lib/dashboard-canonical';

function businessLifecycleLabel(value: unknown): string {
  const key = String(value ?? '').trim();
  const labels: Record<string, string> = {
    NOT_COMMITTED: 'لم يُعتمد بعد',
    PROPOSED: 'توصية بانتظار القرار',
    APPROVED: 'معتمد',
    REJECTED: 'مرفوض',
    NO_ACTION_COMMITTED: 'لا يوجد إجراء موثق بعد',
    ACTIONABLE: 'قابل للتحويل إلى عمل',
    IN_PROGRESS: 'قيد التنفيذ',
    COMPLETED: 'مكتمل',
    NOT_RECORDED: 'لم تُسجل نتيجة',
    OBSERVED: 'نتيجة مرصودة',
    MEASURED: 'نتيجة مقاسة',
    LEARNING_PENDING: 'بانتظار التعلم',
    LEARNED: 'تم تسجيل التعلم',
  };
  return labels[key] ?? (key ? 'حالة تحتاج مراجعة' : 'غير متاح');
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return userFacingError(raw);
}

function specialtyLabel(value: unknown): string {
  const key = String(value ?? '').trim().toLowerCase();
  const labels: Record<string, string> = { sales: 'مبيعات', purchases: 'مشتريات', inventory: 'مخزون', receivables: 'ذمم وتحصيل', profitability: 'ربحية', payments: 'سيولة ومدفوعات' };
  return labels[key] ?? 'أعمال';
}

function reportStateLabel(value: unknown): string {
  const key = String(value ?? '').trim();
  const labels: Record<string,string> = {
    VERIFIED: 'موثق',
    TRUSTED: 'موثوق',
    PENDING_EVIDENCE: 'الدليل النهائي غير مثبت',
    AWAITING_EVIDENCE_SNAPSHOT: 'لا توجد لقطة دليل مثبتة',
    SIGNALS_PRESENT: 'إشارات مثبتة',
    READY: 'جاهز للقرار',
    PARTIAL_ANALYSIS: 'تحليل جزئي',
    GAP_DETECTED: 'فجوة في التغطية',
    REVIEW_REQUIRED: 'مراجعة مطلوبة',
    INSUFFICIENT_DATA: 'بيانات غير كافية',
    CALCULATED: 'محسوب',
    CONFIRMED: 'مثبت',
  };
  return labels[key] ?? (key ? 'يحتاج مراجعة' : 'غير متاح');
}

function ReportTruthBar({ status, asOf, period, note }: { status: string; asOf?: string; period: string; note?: string }) {
  const normalized = status === 'CONFIRMED' || status === 'CALCULATED' ? status : 'INSUFFICIENT DATA';
  const tone = normalized === 'CONFIRMED'
    ? 'border-success-200 bg-success-50 text-success-800'
    : normalized === 'CALCULATED'
      ? 'border-primary-200 bg-primary-50 text-primary-800'
      : 'border-warning-200 bg-warning-50 text-warning-900';
  const statusLabel = normalized === 'CONFIRMED' ? 'مثبت' : normalized === 'CALCULATED' ? 'محسوب' : 'بيانات غير كافية';
  return <section aria-label="سياق حقيقة التقرير" className={'flex flex-wrap items-center gap-2 rounded-[12px] border px-3 py-2.5 text-[10px] ' + tone}>
    <span className="font-black">{statusLabel}</span>
    <span>الفترة: {period}</span>
    {asOf && <span>حتى: {asOf}</span>}
    {note && <span className="text-current/70">{note}</span>}
    <span className="mr-auto font-semibold">القيم غير المتاحة تبقى غير متاحة ولا تُستبدل بتقديرات.</span>
  </section>;
}

function useOptionalSourceReport() {
  const [params] = useSearchParams();
  const jobId = params.get('reportJobId')?.trim() || '';
  const expectedSourceHash = params.get('sourceHash')?.trim() || '';
  const [report, setReport] = useState<SmartReportDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!jobId) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await fetchSmartReport(jobId, expectedSourceHash, { signal: AbortSignal.timeout(25000) });
      if (version !== requestVersion.current) return;
      if (next && expectedSourceHash && next.sourceHash !== expectedSourceHash) {
        throw new Error('REPORT_SOURCE_HASH_MISMATCH');
      }
      setReport(next);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(errorMessage(cause));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [jobId, expectedSourceHash]);

  useEffect(() => {
    void load();
  }, [load]);

  return { jobId, report, loading, error, retry: load };
}

function SourceBoundDomainSurface({ report, expectedSpecialty, title }: { report: SmartReportDetail; expectedSpecialty: string; title: string }) {
  return <CustomerReportSurface report={report} expectedSpecialty={expectedSpecialty} title={title} />;
}
const reportCards = [
  { path:'/reports/sales', title:'المبيعات', stage:'قياس', desc:'حركة المبيعات والفواتير والعملاء والمنتجات.', icon:ShoppingCart, iconClass:'bg-primary-50 text-primary-600' },
  { path:'/reports/purchases', title:'المشتريات', stage:'مصدر', desc:'المشتريات والموردون والتدفقات الداخلة.', icon:FileBarChart, iconClass:'bg-accent-50 text-accent-600' },
  { path:'/reports/inventory', title:'المخزون', stage:'دليل', desc:'الكمية والتكلفة والقيمة والحالات غير المكتملة.', icon:Package, iconClass:'bg-primary-50 text-primary-700' },
  { path:'/reports/receivables', title:'الذمم والتحصيل', stage:'قرار', desc:'الذمم وأعمار الاستحقاق ومتابعة التحصيل.', icon:Receipt, iconClass:'bg-warning-50 text-warning-600' },
  { path:'/reports/profitability', title:'الربحية', stage:'قرار', desc:'هوامش الربحية حسب المنتج والعميل والفئة.', icon:TrendingUp, iconClass:'bg-primary-50 text-primary-600' },
];

export function ReportsCenterPage() {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof fetchDashboardSnapshot>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [smartReports, setSmartReports] = useState<SmartReportCatalogItem[]>([]);

  const [primarySmartReport, setPrimarySmartReport] = useState<SmartReportDetail | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);

    // The catalog is the authority for "latest report". A fixed historical
    // report job must never outrank a newer completed report from the tenant.
    const catalogPromise = fetchSmartReportCatalog(
      60,
      { signal: AbortSignal.timeout(12000) },
    );
    const dashboardPromise = fetchDashboardSnapshot(6, AbortSignal.timeout(8000));

    let catalog: SmartReportCatalogItem[] = [];
    let dashboard: Awaited<ReturnType<typeof fetchDashboardSnapshot>> | null = null;
    let firstFailure: unknown = null;

    const [catalogRead, dashboardRead] = await Promise.allSettled([catalogPromise, dashboardPromise]);

    if (catalogRead.status === 'fulfilled') {
      catalog = catalogRead.value;
      setSmartReports(catalog);
      const selected = catalog[0] ?? null;
      if (selected) {
        window.sessionStorage.setItem('aghbari:last-smart-report-job', selected.jobId);
        window.sessionStorage.setItem('aghbari:last-smart-report-source-hash', selected.sourceHash);
      }
    } else {
      firstFailure ??= catalogRead.reason;
      console.warn('[ReportsCenter] smart report catalog readback failed', catalogRead.reason);
      setSmartReports([]);
    }

    if (dashboardRead.status === 'fulfilled') {
      dashboard = dashboardRead.value;
      setSnapshot(dashboard);
    } else {
      firstFailure ??= dashboardRead.reason;
      console.warn('[ReportsCenter] dashboard snapshot readback failed', dashboardRead.reason);
      setSnapshot(null);
    }

    // Catalog/snapshot data is enough to unlock the screen; the detail read
    // enriches the first/latest report without blocking the whole customer surface.
    if (catalog.length > 0 || dashboard) setLoading(false);

    const selected = catalog[0] ?? null;
    if (selected) {
      try {
        const detail = await fetchSmartReport(
          selected.jobId,
          selected.sourceHash,
          { signal: AbortSignal.timeout(15000) },
        );
        if (detail) {
          setPrimarySmartReport(detail);
          window.sessionStorage.setItem('aghbari:last-smart-report-job', detail.jobId);
          window.sessionStorage.setItem('aghbari:last-smart-report-source-hash', detail.sourceHash);
        }
      } catch (cause) {
        firstFailure ??= cause;
        console.warn('[ReportsCenter] latest smart report detail readback failed', cause);
      }
    } else {
      setPrimarySmartReport(null);
      window.sessionStorage.removeItem('aghbari:last-smart-report-job');
      window.sessionStorage.removeItem('aghbari:last-smart-report-source-hash');
    }

    if (catalog.length === 0 && !dashboard && firstFailure) {
      setError(errorMessage(firstFailure));
    } else {
      setError(null);
    }

    if (catalog.length === 0 && !dashboard) {
      setLoading(false);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div dir="rtl" className="ag-reports-center-surface space-y-5 animate-fade-in pb-10">
        <PageHeader title="مركز التقارير" subtitle="لقطة موثقة من مسار التقارير التنفيذي." />
        <section className="rounded-[18px] border border-ink-200 bg-white p-6 shadow-card">
          <div className="text-sm font-bold text-ink-800">جارٍ تحميل اللقطة التجارية...</div>
          <div className="mt-2 text-[11px] text-ink-500">لا تُعرض أرقام تقديرية أثناء التحميل.</div>
        </section>
      </div>
    );
  }
  if (error && smartReports.length === 0) {
    return <div dir="rtl" className="ag-reports-center-surface space-y-5 animate-fade-in pb-10"><PageHeader title="مركز التقارير" subtitle="تعذر تحميل البيانات الحالية." actions={<button type="button" onClick={() => void load()} className="btn-secondary text-xs">إعادة المحاولة</button>} /><ErrorState message={error} onRetry={() => void load()} /></div>;
  }
  if (!snapshot && smartReports.length === 0) return <DataUnavailableState title="مركز التقارير ينتظر المصدر" message="لا توجد لقطة تنفيذية ولا تقارير مكتملة للعرض بعد؛ لم يتم اختلاق أي بطاقة أو رقم." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>} />;

  const persistedSmartJobId = typeof window !== 'undefined'
    ? window.sessionStorage.getItem('aghbari:last-smart-report-job')?.trim() ?? ''
    : '';
  const persistedSmartReport = persistedSmartJobId
    ? smartReports.find((report) => report.jobId === persistedSmartJobId)
    : undefined;
  const firstSmartReport = persistedSmartReport ?? smartReports[0] ?? null;
  const kpis = snapshot?.kpis ?? null;
  const aging = snapshot?.aging ?? null;
  const asOf = snapshot?.asOf ?? null;
  const months = snapshot?.months ?? null;
  const truthLabel = kpis ? (kpis.status === 'CONFIRMED' ? 'مثبت' : kpis.status === 'CALCULATED' ? 'محسوب' : 'بيانات غير كافية') : 'مصادر حقيقية محمّلة';
  const truthClass = kpis ? (kpis.status === 'CONFIRMED' ? 'badge-success' : kpis.status === 'CALCULATED' ? 'badge-primary' : 'badge-warning') : 'badge-primary';
  const nextPath = firstSmartReport
    ? '/reports/smart/' + firstSmartReport.jobId + '?sourceHash=' + encodeURIComponent(firstSmartReport.sourceHash)
    : (kpis && (kpis.status === 'INSUFFICIENT_DATA' || aging?.status === 'INSUFFICIENT_DATA') ? '/data-quality' : '/import');
  const nextLabel = firstSmartReport
    ? 'افتح أول تقرير ذكي'
    : (kpis && (kpis.status === 'INSUFFICIENT_DATA' || aging?.status === 'INSUFFICIENT_DATA') ? 'افحص جودة البيانات' : 'إضافة مصدر');

  return <div dir="rtl" className="ag-reports-center-surface space-y-5 animate-fade-in pb-10">
    <PageHeader
      title="مركز التقارير"
      subtitle="منظومة التقارير التنفيذية: كل رقم يعود إلى مصدره، وكل تفسير يبقى منفصلًا عن حقيقة البيانات."
      actions={<div className="flex items-center gap-2"><span className={`badge ${truthClass}`}>{truthLabel}</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="btn-secondary inline-flex items-center gap-2 text-xs">{refreshing ? 'جارٍ التحديث' : 'تحديث اللقطة'}</button></div>}
    />

    {primarySmartReport ? (() => {
      const signal = selectExecutiveSignal(primarySmartReport.intelligence);
      const specialty = specialtyLabel(primarySmartReport.specialty);
      const quality = primarySmartReport.qualityScore == null ? 'غير متاح' : `${Math.round(primarySmartReport.qualityScore)}%`;
      const rows = primarySmartReport.authoritativeCurrentRowCount ?? primarySmartReport.rowCount ?? 0;
      return <section className="ag-reports-primary-source rounded-[18px] border border-ink-800 bg-[linear-gradient(135deg,#0b1020,#142034)] p-5 text-white shadow-[0_24px_70px_-36px_rgba(15,23,42,.95)] lg:p-6" aria-label="التقرير الذكي الأساسي الحالي">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black tracking-[.1em] text-primary-200">
              <span>التقرير الحقيقي أولًا</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">موثق · المصدر الحالي</span>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">تقرير {specialty} قابل للقرار</h2>
            <p className="mt-2 max-w-3xl text-[11px] leading-6 text-slate-300">المصدر: {primarySmartReport.sourcePath} · {rows.toLocaleString('ar-YE')} صفًا موثقًا · جودة المصدر {quality}</p>
            {signal ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.06] p-4">
              <div className="text-[9px] font-black tracking-[.08em] text-primary-200">أهم إشارة من المصدر</div>
              <div className="mt-1 text-sm font-black text-white">{signal.title}</div>
              <p className="mt-1 text-[10px] leading-5 text-slate-300">{signal.message}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-300">
                <span className="rounded-full bg-white/10 px-2 py-1">أولوية {signal.priority}</span>
                {signal.affectedRows != null && <span className="rounded-full bg-white/10 px-2 py-1">{signal.affectedRows.toLocaleString('ar-YE')} صف متأثر</span>}
              </div>
            </div> : <p className="mt-4 text-[10px] text-slate-400">تم تحميل المصدر، ولا توجد إشارة تنفيذية مكتملة يمكن رفعها دون اختلاق.</p>}
          </div>
          <div className="flex shrink-0 flex-col gap-3 xl:w-[235px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[.05] p-3"><div className="text-[9px] text-slate-400">الرصيد الكانوني</div><div className="mt-1 text-lg font-black">{primarySmartReport.canonicalCommitCount.toLocaleString('ar-YE')}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[.05] p-3"><div className="text-[9px] text-slate-400">حالة الثقة</div><div className="mt-1 text-xs font-black">{reportStateLabel(primarySmartReport.trustState || primarySmartReport.reportVerificationState)}</div></div>
            </div>
            <Link to={'/reports/smart/' + primarySmartReport.jobId + '?sourceHash=' + encodeURIComponent(primarySmartReport.sourceHash)} className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-xs font-black text-ink-950 transition hover:bg-ink-100">فتح التقرير الذكي ←</Link>
          </div>
        </div>
      </section>
    })() : snapshot ? <section className="ag-reports-snapshot rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6" aria-label="اللقطة التنفيذية الحالية">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="section-kicker">لقطة تجارية موثقة · آخر {months} أشهر</div>
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="text-[10px] font-bold text-ink-400">المبيعات</div>
              <div className="mt-1 text-2xl font-black tracking-tight text-ink-950">{formatCurrency(snapshot.kpis.totalSales)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-ink-400">الذمم</div>
              <div className="mt-1 text-xl font-black tracking-tight text-ink-950">{formatCurrency(snapshot.kpis.totalReceivables)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-ink-400">قيمة المخزون</div>
              <div className="mt-1 text-xl font-black tracking-tight text-ink-950">{formatCurrency(snapshot.kpis.inventoryValue)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-ink-400">الفواتير</div>
              <div className="mt-1 text-xl font-black tracking-tight text-ink-950">{formatNumber(snapshot.kpis.invoiceCount)}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-ink-500">
            <span>حتى: {asOf}</span>
            <span>•</span>
            <span>أعمار الذمم: {snapshot.aging.status === 'CALCULATED' ? 'قابلة للحساب' : snapshot.aging.status === 'NO_DATA' ? 'لا توجد بيانات' : 'بيانات غير كافية'}</span>
            {snapshot.aging.unknownRows > 0 && <><span>•</span><span className="font-semibold text-warning-700">{formatNumber(snapshot.aging.unknownRows)} صفوف خارج الحكم</span></>}
          </div>
        </div>
        <div className="flex min-w-[220px] flex-col justify-between rounded-2xl bg-ink-950 p-4 text-white">
          <div>
            <div className="text-[9px] font-black tracking-[.08em] text-primary-200">الخطوة التالية</div>
            <div className="mt-2 text-sm font-black">{nextLabel}</div>
            <p className="mt-2 text-[10px] leading-5 text-ink-300">المؤشرات المعروضة تعكس اللقطة الحالية فقط؛ غياب القيمة يبقى ظاهرًا ولا يُستبدل بتقدير.</p>
          </div>
          <Link to={nextPath} className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-ink-950 transition hover:bg-ink-100">{nextLabel} ←</Link>
        </div>
      </div>
    </section> : (
      <section className="rounded-[18px] border border-primary-200 bg-[linear-gradient(135deg,#0b1020,#172033)] p-5 text-white shadow-[0_24px_60px_-36px_rgba(15,23,42,.8)] lg:p-6" aria-label="التقارير الحقيقية المحمّلة">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.12em] text-primary-200">مصادر حقيقية · قراءة العميل أولًا</div>
            <h2 className="mt-2 text-xl font-black lg:text-2xl">التقارير وصلت إلى الواجهة قبل اكتمال لقطة المؤشرات.</h2>
            <p className="mt-2 max-w-3xl text-[11px] leading-6 text-slate-300">تم تحميل {smartReports.length} تقريرًا مكتملًا من قاعدة بيانات هذا الحساب. لا ننتظر KPI ثانوي كي يرى العميل المصدر الحقيقي ويفتح التقرير الذكي.</p>
          </div>
          {firstSmartReport ? (
            <Link to={'/reports/smart/' + firstSmartReport.jobId + '?sourceHash=' + encodeURIComponent(firstSmartReport.sourceHash)} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-950">افتح أول تقرير ذكي ←</Link>
          ) : null}
        </div>
      </section>
    )}

    {primarySmartReport ? (
      <div className="ag-reports-live-intelligence space-y-4" aria-label="ذكاء التقرير والبيانات المصدرية الحالية">
        <ReportIntelligencePanel report={primarySmartReport} />
        <BusinessDataExplorer report={primarySmartReport} />
      </div>
    ) : null}

    <section className="ag-reports-explain grid gap-4 lg:grid-cols-[1.4fr_.6fr] items-end">
      <div className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
        <div className="section-kicker">بيانات → دليل → قرار</div>
        <h1 className="mt-1 text-[22px] font-black tracking-tight text-ink-950 lg:text-[28px]">التقرير ليس شاشة أرقام؛ إنه حزمة أدلة قابلة للمراجعة.</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-5 text-ink-500">استخدم التقارير لتفسير الحالة الحالية، مع الحفاظ على مؤشرات نقص البيانات والحالات غير القابلة للحساب بدل إخفائها.</p>
      </div>
      <div className="rounded-[18px] border border-ink-200 bg-ink-50 p-4 text-sm shadow-sm">
        <div className="font-semibold">قاعدة العرض</div>
        <div className="mt-2 text-[10px] leading-5 text-ink-500">مصدر واضح · حالة بيانات واضحة · لا رقم بديل عند غياب المصدر</div>
      </div>
    </section>

    <div className="ag-reports-domain-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {reportCards.map((r) => <Link key={r.path} to={r.path} className="group">
        <Card className="ag-report-card h-full overflow-hidden transition hover:-translate-y-1 hover:shadow-xl">
          <CardBody>
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${r.iconClass}`}><r.icon size={20}/></div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[10px] font-bold text-ink-500">{r.stage}</span>
                  <span className="text-xs text-ink-400 group-hover:text-primary-600">فتح التقرير ←</span>
                </div>
                <h3 className="text-base font-bold text-ink-900">{r.title}</h3>
                <p className="mt-1 text-xs leading-6 text-ink-500">{r.desc}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </Link>)}
    </div>

    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-kicker">التقارير الذكية</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">مصادر حقيقية تحولت إلى قراءة أعمال قابلة للمتابعة</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-ink-500">كل بطاقة تبدأ من مصدر موثق ثم تعرض ما أصبح متاحًا للقرار وما يحتاج متابعة، من دون إغراق العميل في تفاصيل تقنية.</p>
        </div>
        <span className="rounded-full bg-primary-50 px-3 py-1 text-[10px] font-black text-primary-700">{smartReports.length} مصدرًا ذكيًا</span>
      </div>

      {smartReports.length === 0 ? (
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
          لا توجد تقارير ذكية مكتملة حتى الآن. ابدأ بإضافة مصدر حقيقي من صفحة إدخال البيانات.
        </div>
      ) : (
        <>
          <div className="ag-reports-smart-metrics mt-4 grid gap-2 sm:grid-cols-3">
            {[
              ['مصادر موثقة', smartReports.filter((r) => r.evidenceStatus === 'VERIFIED' || r.trustState === 'TRUSTED').length, 'مصادر يمكن الاعتماد عليها في القراءة الحالية.'],
              ['جاهزة للقرار', smartReports.filter((r) => r.decisionStatus === 'APPROVED' || r.recommendationStatus === 'PROPOSED').length, 'لديها مخرج واضح يمكن متابعته ضمن المسار.'],
              ['تحتاج انتباهًا', smartReports.filter((r) => ['REVIEW','REVIEW_REQUIRED','PENDING','INSUFFICIENT_DATA','GAP_DETECTED'].includes(String(r.trustState ?? r.reportVerificationState))).length, 'نقص أو مراجعة يجب رؤيتها قبل الاعتماد.'],
            ].map(([label, value, note]) => (
              <div key={String(label)} className="rounded-xl border border-ink-100 bg-ink-50/70 p-3">
                <div className="text-[9px] font-black text-ink-500">{label}</div>
                <div className="mt-1 text-lg font-black text-ink-950">{String(value)}</div>
                <div className="mt-1 text-[8px] leading-4 text-ink-400">{note}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {smartReports.map((report, reportIndex) => {
              const modelLabel = report.archetypeState === 'SUPPORTED'
                ? 'تحليل متخصص جاهز'
                : report.archetypeState === 'REVIEW_REQUIRED'
                  ? 'التحليل يحتاج مراجعة'
                  : 'تحليل المصدر';
              return (
                <Link
                  key={report.jobId + ':' + report.sourceHash}
                  data-testid={reportIndex === 0 ? 'primary-real-smart-report-card' : undefined}
                  to={'/reports/smart/' + report.jobId + '?sourceHash=' + encodeURIComponent(report.sourceHash)}
                  className="ag-smart-report-card group rounded-2xl border border-ink-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-ink-950">{report.specialty === 'sales' ? 'تقرير المبيعات' : report.specialty === 'purchases' ? 'تقرير المشتريات' : report.specialty === 'inventory' ? 'تقرير المخزون' : report.specialty === 'receivables' ? 'تقرير الذمم والتحصيل' : report.specialty === 'profitability' ? 'تقرير الربحية' : report.specialty === 'payments' ? 'تحليل السيولة والمدفوعات' : 'تقرير أعمال ذكي'}</div>
                      <div className="mt-1 text-[10px] text-ink-500">{report.rowCount == null ? 'حجم المصدر غير متاح' : formatNumber(report.rowCount) + ' سجل'} · {specialtyLabel(report.specialty)}</div>
                    </div>
                    <span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-black ' + (report.trustState === 'TRUSTED' ? 'bg-indigo-50 text-indigo-800' : 'bg-warning-50 text-warning-800')}>{report.trustState === 'TRUSTED' ? 'موثوق' : report.trustState === 'VERIFIED' ? 'موثق' : report.trustState === 'REVIEW' || report.trustState === 'REVIEW_REQUIRED' ? 'مراجعة مطلوبة' : 'غير مكتمل'}</span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-3">
                      <div className="text-[9px] font-black text-ink-400">المصدر</div>
                      <div className="mt-1 truncate text-[10px] font-bold text-ink-800" title={report.sourcePath}>{report.sourcePath || 'مصدر غير مسمى'}</div>
                    </div>
                    <div className="rounded-xl border border-ink-100 bg-ink-50/70 p-3">
                      <div className="text-[9px] font-black text-ink-400">الفترة</div>
                      <div className="mt-1 text-[10px] font-bold text-ink-800">غير محددة في المصدر</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/60 p-3">
                    <div className="text-[9px] font-black tracking-[.08em] text-primary-700">قراءة التقرير</div>
                    <div className="mt-1 truncate text-[11px] font-black text-ink-950" title={modelLabel}>{modelLabel}</div>
                    <div className="mt-1 text-[9px] text-ink-500">الحالة: {report.archetypeState === 'REVIEW_REQUIRED' ? 'يحتاج مراجعة' : report.archetypeState === 'SUPPORTED' ? 'جاهز' : 'غير متاح'}</div>
                  </div>

                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                    <div className="text-[9px] font-black text-amber-700">أهم نتيجة مثبتة</div>
                    <div className="mt-1 text-[10px] font-bold leading-5 text-ink-900">
                      {primarySmartReport && report.jobId === primarySmartReport.jobId
                        ? (primarySmartReport.intelligence.advisorBrief.topFinding?.statement
                          || primarySmartReport.intelligence.advisorBrief.headline
                          || primarySmartReport.intelligence.summary)
                        : 'افتح التقرير الذكي لقراءة النتيجة المصدرية كاملة دون اختلاق ملخص.'}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
                    <span className="rounded-lg bg-ink-50 px-2 py-1">الجودة: {report.qualityScore == null ? '—' : report.qualityScore + '%'}</span>
                    <span className="rounded-lg bg-ink-50 px-2 py-1">حالة التقرير: {reportStateLabel(report.reportVerificationState)}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px]">
                    <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 font-bold text-ink-600">
                      الدليل: {report.evidenceStatus === 'VERIFIED' ? 'موثق' : report.evidenceStatus ? reportStateLabel(report.evidenceStatus) : 'غير متاح'}
                    </span>
                    <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 font-bold text-ink-600">
                      التوصية: {report.recommendationStatus === 'PROPOSED' ? 'مقترحة' : report.recommendationStatus === 'APPROVED' ? 'معتمدة' : report.recommendationStatus === 'COMPLETED' ? 'منفذة' : 'غير متاحة'}
                    </span>
                    <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 font-bold text-ink-600">
                      النتيجة: {report.outcomeStatus === 'MEASURED' || report.outcomeStatus === 'OBSERVED' ? 'مرصودة' : 'لم تُسجل بعد'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[9px] text-ink-400">{report.completedAt ? new Date(report.completedAt).toLocaleString('ar-YE') : 'وقت المعالجة غير متاح'}</span>
                    <span className="text-[10px] font-black text-primary-700 group-hover:translate-x-[-2px]">افتح الحزمة الاستشارية ←</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>

    <section className="ag-reports-output-grid grid gap-4 lg:grid-cols-3">
      <Link to="/reports/executive" className="card card-hover p-4">
        <div className="text-[9px] font-black tracking-[.08em] text-primary-700">مخرجات القرار</div>
        <h3 className="mt-2 text-sm font-black text-ink-900">تقارير القرار والتوصية</h3>
        <p className="mt-1 text-[10px] leading-5 text-ink-500">استخدم التقرير التنفيذي كسطح مخرجات القرار الحالي، مع بقاء الدليل والسياق ظاهرين.</p>
      </Link>
      <Link to="/data-quality" className="card card-hover p-4">
        <div className="text-[9px] font-black tracking-[.08em] text-primary-700">جودة الدليل</div>
        <h3 className="mt-2 text-sm font-black text-ink-900">جودة البيانات والتدقيق</h3>
        <p className="mt-1 text-[10px] leading-5 text-ink-500">مسار الجودة هو المصدر الحالي لمراجعة الحالات بدل إنشاء تقرير تدقيق منفصل ببيانات مكررة.</p>
      </Link>

    </section>
  </div>;
}
export function SalesReportPage(){
  const sourceContext=useOptionalSourceReport();
  const [invoices,setInvoices]=useState<SalesInvoice[]>([]);
  const [invoiceCount,setInvoiceCount]=useState<number|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const result=await fetchSalesInvoices(0,500);setInvoices(result.data);setInvoiceCount(result.count);}catch(e){setError(errorMessage(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  if(sourceContext.jobId){if(sourceContext.loading)return <LoadingState message="جارٍ تحميل نتيجة التقرير المصدرّي..." />;if(sourceContext.error)return <ErrorState message={sourceContext.error} onRetry={()=>void sourceContext.retry()} />;if(sourceContext.report)return <SourceBoundDomainSurface report={sourceContext.report} expectedSpecialty="sales" title="المبيعات" />;}
  if(loading)return <LoadingState/>; if(error)return <ErrorState message={error} onRetry={load}/>;
  const total=invoiceCount!=null&&invoiceCount<=invoices.length?invoices.reduce((sum,row)=>sum+(row.total??0),0):null;
  const paid=invoiceCount!=null&&invoiceCount<=invoices.length?invoices.reduce((sum,row)=>sum+(row.paid_amount??0),0):null;
  const average=total!=null&&invoiceCount?total/invoiceCount:null;
  const exportSales=async()=>{const rows=await fetchSalesExportRows();downloadReportArtifact('sales-report','تقرير المبيعات',['رقم الفاتورة','العميل','التاريخ','الإجمالي','المدفوع','الحالة'],rows.map(r=>({'رقم الفاتورة':r.invoice_number,'العميل':r.customer,'التاريخ':r.invoice_date,'الإجمالي':r.total,'المدفوع':r.paid_amount,'الحالة':r.status})));};
  return <div dir="rtl" className="report-page space-y-5 animate-fade-in">
    <PageHeader title="تقرير المبيعات" subtitle="سجلات المبيعات الحالية مع الحقيقة المصدرية" actions={<div className="flex items-center gap-2"><button onClick={()=>void exportSales()} className="btn-secondary text-xs">تصدير XLSX</button><button type="button" onClick={()=>window.print()} className="btn-primary print-hide text-xs">طباعة</button></div>}/>
    <ReportTruthBar status={total==null?'INSUFFICIENT_DATA':'CALCULATED'} period="غير محددة من اللقطة الحالية" note="هذه الصفحة تقرأ سجلات المبيعات مباشرة ولا تعتمد على لقطة Dashboard عامة."/>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي المبيعات</div><div className="text-xl font-bold text-ink-900">{total==null?'غير متاح':formatCurrency(total)}</div></CardBody></Card>
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">عدد الفواتير</div><div className="text-xl font-bold text-ink-900">{formatNumber(invoiceCount??invoices.length)}</div></CardBody></Card>
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">متوسط الفاتورة</div><div className="text-xl font-bold text-ink-900">{average==null?'غير متاح':formatCurrency(average)}</div></CardBody></Card>
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">معدل التحصيل</div><div className="text-xl font-bold text-ink-900">{total==null||paid==null||total===0?'—':((paid/total)*100).toFixed(1)+'%'}</div></CardBody></Card>
    </div>
    {invoiceCount!=null&&invoiceCount>invoices.length&&<div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">تم تحميل أول 500 سجل فقط من أصل {formatNumber(invoiceCount)}؛ لذلك لم يُحسب إجمالي مالي كامل من عينة محدودة.</div>}
    <Card><CardHeader title="آخر الفواتير" subtitle="عرض مباشر من سجل المبيعات"/><DataTable columns={[
      {key:'invoice_number',label:'رقم الفاتورة',render:(r:SalesInvoice)=><span className="font-medium text-primary-600">{r.invoice_number}</span>},
      {key:'customer',label:'العميل',render:(r:SalesInvoice)=>r.customer?.name||'—'},
      {key:'invoice_date',label:'التاريخ',render:(r:SalesInvoice)=>formatDate(r.invoice_date)},
      {key:'total',label:'الإجمالي',align:'right',render:(r:SalesInvoice)=>formatCurrency(r.total)},
      {key:'paid_amount',label:'المدفوع',align:'right',render:(r:SalesInvoice)=>formatCurrency(r.paid_amount)},
      {key:'status',label:'الحالة',align:'center',render:(r:SalesInvoice)=>{const map:Record<string,{variant:'success'|'primary'|'neutral';label:string}>={paid:{variant:'success',label:'مدفوعة'},confirmed:{variant:'primary',label:'مؤكدة'},draft:{variant:'neutral',label:'مسودة'}};const status=map[r.status]??{variant:'neutral',label:r.status};return <Badge variant={status.variant}>{status.label}</Badge>;}}
    ]} data={invoices.slice(0,20)}/></Card>
  </div>;
}

export function PurchasesReportPage(){
  const sourceContext=useOptionalSourceReport();
  const [purchases,setPurchases]=useState<PurchaseInvoice[]>([]);
  const [summary,setSummary]=useState<{total:number|null;count:number;supplier_count:number;average:number|null}>({total:null,count:0,supplier_count:0,average:null});
  const [snapshot,setSnapshot]=useState<Awaited<ReturnType<typeof fetchDashboardSnapshot>>|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const [rows,agg,snap]=await Promise.all([fetchPurchaseInvoices(0,20),fetchPurchaseSummary(),fetchDashboardSnapshot(6,AbortSignal.timeout(8000))]);setPurchases(rows.data);setSummary(agg);setSnapshot(snap);}catch(e){setError(errorMessage(e));setSnapshot(null);}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  if(sourceContext.jobId){if(sourceContext.loading)return <LoadingState message="جارٍ تحميل نتيجة التقرير المصدرّي..." />;if(sourceContext.error)return <ErrorState message={sourceContext.error} onRetry={()=>void sourceContext.retry()} />;if(sourceContext.report)return <SourceBoundDomainSurface report={sourceContext.report} expectedSpecialty="purchases" title="المشتريات" />;}
  if(loading)return <LoadingState/>; if(error)return <ErrorState message={error} onRetry={load}/>;
  const exportPurchases=async()=>{const rows=await fetchPurchaseExportRows();downloadReportArtifact('purchase-report','تقرير المشتريات',['رقم الفاتورة','المورد','التاريخ','الإجمالي','المدفوع','الحالة'],rows.map(r=>({'رقم الفاتورة':r.invoice_number,'المورد':r.supplier,'التاريخ':r.invoice_date,'الإجمالي':r.total,'المدفوع':r.paid_amount,'الحالة':r.status})));};
  return <div dir="rtl" className="report-page space-y-5 animate-fade-in">
    <PageHeader title="تقرير المشتريات" subtitle="سجلات المشتريات والموردين الحالية" actions={<div className="flex items-center gap-2"><button onClick={()=>void exportPurchases()} className="btn-secondary text-xs">تصدير XLSX</button><button type="button" onClick={()=>window.print()} className="btn-primary print-hide text-xs">طباعة</button></div>}/>
    <ReportTruthBar status={snapshot?.kpis.status ?? (summary.total == null ? 'INSUFFICIENT_DATA' : 'CALCULATED')} period="غير محددة من اللقطة الحالية" note="المشتريات تعرض أرقامها من سجلات الشراء مع لقطة Dashboard canonical للتحقق من سياق الحقيقة."/>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي المشتريات</div><div className="text-xl font-bold text-ink-900">{formatCurrency(summary.total)}</div></CardBody></Card>
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">عدد الفواتير</div><div className="text-xl font-bold text-ink-900">{formatNumber(summary.count)}</div></CardBody></Card>
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">الموردون</div><div className="text-xl font-bold text-ink-900">{formatNumber(summary.supplier_count)}</div></CardBody></Card>
      <Card><CardBody><div className="text-xs text-ink-500 mb-1">متوسط الفاتورة</div><div className="text-xl font-bold text-ink-900">{formatCurrency(summary.average)}</div></CardBody></Card>
    </div>
    <Card><CardHeader title="آخر فواتير المشتريات"/><DataTable columns={[
      {key:'invoice_number',label:'رقم الفاتورة',render:(r:PurchaseInvoice)=><span className="font-medium text-primary-600">{r.invoice_number}</span>},
      {key:'supplier',label:'المورد',render:(r:PurchaseInvoice)=>r.supplier?.name||'—'},
      {key:'invoice_date',label:'التاريخ',render:(r:PurchaseInvoice)=>formatDate(r.invoice_date)},
      {key:'total',label:'الإجمالي',align:'right',render:(r:PurchaseInvoice)=>formatCurrency(r.total)},
      {key:'paid_amount',label:'المدفوع',align:'right',render:(r:PurchaseInvoice)=>formatCurrency(r.paid_amount)}
    ]} data={purchases}/></Card>
  </div>;
}

export function InventoryReportPage(){
  const sourceContext_InventoryReportPage=useOptionalSourceReport();
  const [snapshot,setSnapshot]=useState<Awaited<ReturnType<typeof fetchInventoryReportSnapshot>>|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const load=useCallback(async()=>{if(sourceContext_InventoryReportPage.jobId){setLoading(false);return;}try{setLoading(true);setError(null);setSnapshot(await fetchInventoryReportSnapshot(0,25));}catch(e){setError(errorMessage(e));}finally{setLoading(false);}},[sourceContext_InventoryReportPage.jobId]);useEffect(()=>{void load();},[load]);if (sourceContext_InventoryReportPage.jobId) { if (sourceContext_InventoryReportPage.loading) return <LoadingState message="جارٍ تحميل نتيجة التقرير المصدرّي..." />; if (sourceContext_InventoryReportPage.error) return <ErrorState message={sourceContext_InventoryReportPage.error} onRetry={() => void sourceContext_InventoryReportPage.retry()} />; if (sourceContext_InventoryReportPage.report) return <SourceBoundDomainSurface report={sourceContext_InventoryReportPage.report} expectedSpecialty="inventory" title="المخزون" />; }
  if(loading)return <LoadingState/>;if(error)return <ErrorState message={error} onRetry={load}/>;if(!snapshot)return <DataUnavailableState title="تقرير المخزون ينتظر البيانات" message="لم تصل صورة موثوقة للمخزون؛ لا يتم تحويل غياب البيانات إلى أرقام صفرية أو صفحة فارغة." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>}/>;const exportInventory=async()=>{const rows=await fetchInventoryExportRows();downloadReportArtifact('inventory-report','تقرير المخزون',['المنتج','المستودع','الكمية','التكلفة','القيمة'],rows.map(r=>({'المنتج':r.product,'المستودع':r.warehouse,'الكمية':r.quantity,'التكلفة':r.unit_cost,'القيمة':r.value})));};return <div dir="rtl" className="report-page space-y-5 animate-fade-in"><PageHeader title="تقرير المخزون" subtitle="حالة المخزون والتقييم" actions={<div className="flex items-center gap-2"><button onClick={()=>void exportInventory()} className="btn-secondary text-xs">تصدير XLSX</button><button type="button" onClick={()=>window.print()} className="btn-primary print-hide text-xs">طباعة</button></div>}/><ReportTruthBar status={snapshot.dataStatus} period={`صفحة ${snapshot.page + 1}`} note="حالة التقييم مشتقة من صورة المخزون الحالية."/><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Card><CardBody><div className="text-xs text-ink-500 mb-1">قيمة المخزون</div><div className="text-xl font-bold text-ink-900">{snapshot.totalValue==null?'—':formatCurrency(snapshot.totalValue)}</div>{snapshot.dataStatus==='INSUFFICIENT_DATA'&&<div className="text-xs text-warning-600 mt-1">بيانات غير كافية للتقييم</div>}</CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">عدد الأصناف</div><div className="text-xl font-bold text-ink-900">{formatNumber(snapshot.totalRows)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">مخزون منخفض</div><div className="text-xl font-bold text-warning-600">{formatNumber(snapshot.lowStock)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">نفد المخزون</div><div className="text-xl font-bold text-danger-600">{formatNumber(snapshot.outOfStock)}</div></CardBody></Card></div>{snapshot.unknownRows != null && snapshot.unknownRows > 0 && <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">هناك {formatNumber(snapshot.unknownRows)} صفوف مخزون ببيانات كمية/تكلفة غير مكتملة؛ لا تدخل هذه الحالة ضمن تقييمات مؤكدة.</div>}{snapshot.unknownRows == null && snapshot.dataStatus === 'INSUFFICIENT_DATA' && <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">يوجد نقص في بيانات المخزون، لكن عدد الصفوف غير متاح من المصدر؛ لا يتم تصنيع رقم بديل.</div>}<Card><CardHeader title="تفاصيل المخزون" subtitle={`الصفحة ${snapshot.page+1} — ${snapshot.totalRows == null ? 'إجمالي غير متاح' : `${formatNumber(snapshot.totalRows)} إجمالي`}`} /><DataTable columns={[{key:'product',label:'المنتج',render:(r:InventoryReportRow)=>r.product?.name||'—'},{key:'warehouse',label:'المستودع',render:(r:InventoryReportRow)=>r.warehouse?.name||'—'},{key:'quantity',label:'الكمية',align:'right',render:(r:InventoryReportRow)=>r.quantity==null?'غير متاح':formatNumber(r.quantity)},{key:'unit_cost',label:'التكلفة',align:'right',render:(r:InventoryReportRow)=>r.unit_cost==null?'غير متاح':formatCurrency(r.unit_cost)},{key:'value',label:'القيمة',align:'right',render:(r:InventoryReportRow)=>r.value==null?'غير متاح':formatCurrency(r.value)},{key:'status',label:'الحالة',align:'center',render:(r:InventoryReportRow)=>{if(r.quantity==null||r.unit_cost==null)return <Badge variant="neutral">بيانات ناقصة</Badge>;if(r.quantity<=0)return <Badge variant="danger">نفد</Badge>;if(r.product?.reorder_point!=null&&r.quantity<=r.product.reorder_point)return <Badge variant="warning">منخفض</Badge>;return <Badge variant="success">متاح</Badge>;}}]} data={snapshot.rows} pageSize={25}/></Card></div>;}

export function ReceivablesReportPage(){
  const sourceContext_ReceivablesReportPage=useOptionalSourceReport();
  const [aging,setAging]=useState<AgingBucket[]>([]); const [agingStatus,setAgingStatus]=useState<'NO_DATA'|'CALCULATED'|'INSUFFICIENT_DATA'>('NO_DATA');const [invoices,setInvoices]=useState<SalesInvoice[]>([]); const [reportContext,setReportContext]=useState<{asOf:string;months:number}>({asOf:'',months:6});const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const load=useCallback(async()=>{if(sourceContext_ReceivablesReportPage.jobId){setLoading(false);return;}try{setLoading(true);setError(null);const snap=await fetchDashboardSnapshot(6);setReportContext({asOf:snap.asOf,months:snap.months});setAging(snap.aging.rows);setAgingStatus(snap.aging.status);setLoading(false);void fetchSalesInvoices(0,50).then((inv)=>setInvoices(inv.data.filter(i=>i.total!=null&&i.paid_amount!=null&&i.total-i.paid_amount>0))).catch(()=>setInvoices([]));}catch(e){setError(errorMessage(e));setLoading(false);}},[sourceContext_ReceivablesReportPage.jobId]);useEffect(()=>{void load();},[load]);if (sourceContext_ReceivablesReportPage.jobId) { if (sourceContext_ReceivablesReportPage.loading) return <LoadingState message="جارٍ تحميل نتيجة التقرير المصدرّي..." />; if (sourceContext_ReceivablesReportPage.error) return <ErrorState message={sourceContext_ReceivablesReportPage.error} onRetry={() => void sourceContext_ReceivablesReportPage.retry()} />; if (sourceContext_ReceivablesReportPage.report) return <SourceBoundDomainSurface report={sourceContext_ReceivablesReportPage.report} expectedSpecialty="receivables" title="الذمم والتحصيل" />; }
  if(loading)return <LoadingState/>;if(error)return <ErrorState message={error} onRetry={load}/>;const totalOutstanding=agingStatus==='CALCULATED'?aging.reduce((s,b)=>s+(b.amount??0),0):null;const exportReceivables=async()=>{const rows=await fetchReceivablesExportRows();downloadReportArtifact('receivables-report','تقرير الذمم والتحصيل',['رقم الفاتورة','العميل','تاريخ الفاتورة','تاريخ الاستحقاق','الإجمالي','المدفوع','المتبقي'],rows.map(r=>({'رقم الفاتورة':r.invoice_number,'العميل':r.customer,'تاريخ الفاتورة':r.invoice_date,'تاريخ الاستحقاق':r.due_date,'الإجمالي':r.total,'المدفوع':r.paid_amount,'المتبقي':r.balance})));};return <div dir="rtl" className="report-page space-y-5 animate-fade-in"><PageHeader title="تقرير الذمم والتحصيل" subtitle="تحليل الذمم المدينة وأعمار الفواتير" actions={<div className="flex items-center gap-2"><button onClick={()=>void exportReceivables()} className="btn-secondary text-xs">تصدير XLSX</button><button type="button" onClick={()=>window.print()} className="btn-primary print-hide text-xs">طباعة</button></div>}/><ReportTruthBar status={agingStatus === 'CALCULATED' ? 'CALCULATED' : 'INSUFFICIENT_DATA'} asOf={reportContext.asOf || undefined} period={`آخر ${reportContext.months} أشهر`} note="أعمار الذمم تبقى غير محسوبة عندما لا تكفي البيانات."/><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي الذمم</div><div className="text-xl font-bold text-ink-900">{formatCurrency(totalOutstanding)}</div></CardBody></Card>{aging.map(b=><Card key={b.bucket}><CardBody><div className="text-xs text-ink-500 mb-1">{b.bucket} يوم</div><div className="text-lg font-bold text-ink-900">{formatCurrency(b.amount)}</div><div className="text-xs text-ink-400 mt-1">{b.count} فاتورة</div></CardBody></Card>)}</div><Card><CardHeader title="الفواتير المستحقة" subtitle="الفواتير غير المدفوعة بالكامل"/><DataTable columns={[{key:'invoice_number',label:'رقم الفاتورة',render:(r:SalesInvoice)=><span className="font-medium text-primary-600">{r.invoice_number}</span>},{key:'customer',label:'العميل',render:(r:SalesInvoice)=>r.customer?.name||'—'},{key:'invoice_date',label:'تاريخ الفاتورة',render:(r:SalesInvoice)=>formatDate(r.invoice_date)},{key:'due_date',label:'تاريخ الاستحقاق',render:(r:SalesInvoice)=>formatDate(r.due_date)},{key:'total',label:'الإجمالي',align:'right',render:(r:SalesInvoice)=>formatCurrency(r.total)},{key:'paid_amount',label:'المدفوع',align:'right',render:(r:SalesInvoice)=>formatCurrency(r.paid_amount)},{key:'balance',label:'المتبقي',align:'right',render:(r:SalesInvoice)=><span className="font-semibold text-danger-600">{r.total==null||r.paid_amount==null?'—':formatCurrency(r.total-r.paid_amount)}</span>}]} data={invoices}/></Card></div>;}

export function ProfitabilityReportPage(){
  const sourceContext_ProfitabilityReportPage=useOptionalSourceReport();
  const [snapshot,setSnapshot]=useState<Awaited<ReturnType<typeof fetchDashboardSnapshot>>|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const load=useCallback(async()=>{try{setLoading(true);setError(null);setSnapshot(await fetchDashboardSnapshot(6));}catch(e){setError(errorMessage(e));}finally{setLoading(false);}},[]);useEffect(()=>{void load();},[load]);if (sourceContext_ProfitabilityReportPage.jobId) { if (sourceContext_ProfitabilityReportPage.loading) return <LoadingState message="جارٍ تحميل نتيجة التقرير المصدرّي..." />; if (sourceContext_ProfitabilityReportPage.error) return <ErrorState message={sourceContext_ProfitabilityReportPage.error} onRetry={() => void sourceContext_ProfitabilityReportPage.retry()} />; if (sourceContext_ProfitabilityReportPage.report) return <SourceBoundDomainSurface report={sourceContext_ProfitabilityReportPage.report} expectedSpecialty="profitability" title="الربحية" />; }
  if(loading)return <LoadingState/>;if(error)return <ErrorState message={error} onRetry={load}/>;if(!snapshot)return <DataUnavailableState title="تقرير الربحية ينتظر البيانات" message="لا يمكن عرض الربحية دون صورة بيانات موثوقة؛ لا يتم اختلاق تكلفة أو هامش عند غياب المصدر." action={<Link to="/import" className="btn-primary text-[11px]">إضافة مصدر</Link>}/>;const {kpis,categories}=snapshot;const exportProfitability=()=>downloadReportArtifact('profitability-report','تقرير الأرباح والربحية',['الفئة','المبيعات','الربح','الهامش','الكمية'],categories.map(category=>({'الفئة':category.name,'المبيعات':category.sales,'الربح':category.profit,'الهامش':category.sales>0?`${((category.profit/category.sales)*100).toFixed(1)}%`:null,'الكمية':category.quantity})));return <div dir="rtl" className="report-page space-y-5 animate-fade-in"><PageHeader title="تقرير الأرباح والربحية" subtitle="تحليل الربحية حسب الفئة والمنتج" actions={<div className="flex items-center gap-2"><button onClick={exportProfitability} className="btn-secondary text-xs">تصدير XLSX</button><button type="button" onClick={()=>window.print()} className="btn-primary print-hide text-xs">طباعة</button></div>}/><ReportTruthBar status={kpis.status} asOf={snapshot.asOf} period={`آخر ${snapshot.months} أشهر`} note="الربحية تعتمد على تكلفة مثبتة في اللقطة؛ لا يتم تعويض النقص."/><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي المبيعات</div><div className="text-xl font-bold text-ink-900">{formatCurrency(kpis.totalSales)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي التكلفة</div><div className="text-xl font-bold text-ink-900">{formatCurrency(kpis.totalCost)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">إجمالي الربح</div><div className="text-xl font-bold text-success-600">{formatCurrency(kpis.grossProfit)}</div></CardBody></Card><Card><CardBody><div className="text-xs text-ink-500 mb-1">هامش الربح</div><div className="text-xl font-bold text-success-600">{kpis.grossMargin==null?'—':`${kpis.grossMargin.toFixed(1)}%`}</div></CardBody></Card></div><Card><CardHeader title="الربحية حسب الفئة"/><DataTable columns={[{key:'name',label:'الفئة'},{key:'sales',label:'المبيعات',align:'right',render:(r:CategoryBreakdown)=>formatCurrency(r.sales)},{key:'profit',label:'الربح',align:'right',render:(r:CategoryBreakdown)=>formatCurrency(r.profit)},{key:'margin',label:'الهامش',align:'right',render:(r:CategoryBreakdown)=>r.sales>0?`${((r.profit/r.sales)*100).toFixed(1)}%`:'—'},{key:'quantity',label:'الكمية',align:'right',render:(r:CategoryBreakdown)=>formatNumber(r.quantity)}]} data={categories}/></Card></div>;}