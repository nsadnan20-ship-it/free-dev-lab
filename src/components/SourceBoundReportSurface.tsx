import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowLeft, CheckCircle2, Clock3, FileSearch, Filter, Search, ShieldCheck, X, XCircle } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { fetchSmartReport, type SmartReportDetail } from '@/lib/report-smart';
import { formatCurrency, formatNumber } from '@/lib/format';
import { ReportIntelligencePanel } from '@/components/ReportIntelligencePanel';
import { completeSourceDecisionWorkItem, createApprovedDecisionWorkItemForCurrentUser, decideSourceDecisionApproval, fetchSourceDecisionAuditTrace, fetchSourceDecisionProposals, requestSourceDecisionApproval, startSourceDecisionWorkItem, type DecisionAuditTrace, type SourceDecisionState } from '@/lib/report-decisions';
import { getAuthenticatedUser } from '@/lib/auth-session';

export type SourceBoundReportMode = 'executive' | 'trust' | 'decision' | 'work';

const STAGE_LABELS: Record<string, string> = {
  queued: 'الاصطفاف',
  fingerprinted: 'البصمة',
  extracted: 'الاستخراج',
  canonicalized: 'الكاننة',
  validated: 'التحقق',
  analyzed: 'التحليل',
  decisioned: 'القرار',
  committed: 'الاعتماد',
  rendered: 'العرض',
};

const STATE_LABELS: Record<string, string> = {
  TRUSTED: 'موثوق',
  VERIFIED: 'موثق',
  REVIEW: 'مراجعة',
  BLOCKED: 'محظور',
  PARTIAL: 'جزئي',
  GAP_DETECTED: 'فجوة اعتماد مكتشفة',
  NO_DECISION_COMMITTED: 'لا قرار معتمد',
  NO_ACTION_COMMITTED: 'لا إجراء معتمد',
  NOT_AVAILABLE: 'غير متاح',
  INSUFFICIENT_SAMPLE: 'عينة غير كافية',
  INSUFFICIENT_DATA: 'بيانات غير كافية',
  PENDING_EVIDENCE: 'الدليل النهائي غير مثبت',
  PENDING: 'قيد المراجعة',
  PROPOSED: 'مقترح',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغى',
  OPEN: 'مفتوح',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  FAILED: 'فشل',
  NOT_COMMITTED: 'غير معتمد',
  CALCULATED: 'محسوب',
  AVAILABLE: 'متاح',
  UNAVAILABLE: 'غير متاح',
  AWAITING_EVIDENCE_SNAPSHOT: 'لا توجد لقطة دليل مثبتة',
  NOT_PROVEN: 'غير مثبت',
  READY: 'جاهز',
};

function stateLabel(value: unknown): string {
  if (value == null || value === '') return 'غير متاح';
  return STATE_LABELS[String(value)] ?? String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function specialtyPath(specialty: string | null): string | null {
  const map: Record<string, string> = {
    sales: '/reports/sales',
    purchases: '/reports/purchases',
    inventory: '/reports/inventory',
    receivables: '/reports/receivables',
    profitability: '/reports/profitability',
  };
  return specialty ? map[specialty] ?? null : null;
}

function buildMetrics(report: SmartReportDetail) {
  const dataset = report.sourceAnalysis?.datasets?.[0];
  const obj = dataset && typeof dataset === 'object' ? dataset as Record<string, unknown> : null;
  const raw = Array.isArray(obj?.columns) ? obj.columns as unknown[] : [];
  const labels: Record<string,string> = {
    total:'الإجمالي',
    net_amount:'صافي المبيعات',
    paid_amount:'المدفوع',
    balance:'الرصيد المستحق',
    credit:'الدائن',
    debit:'المدين',
    profit:'الربح',
    margin:'الهامش',
    quantity:'الكمية',
    value:'القيمة',
    incoming:'الوارد',
    net_inbound:'صافي الوارد',
    sales_qty:'صافي المبيعات',
    daily_sales_rate:'معدل البيع اليومي',
    stockout_days:'أيام حتى النفاد',
    stock_age_days:'عمر المخزون',
    stock_age_period_days:'عمر المخزون للفترة',
    opening_stock:'الرصيد الافتتاحي',
    current_stock:'الرصيد الحالي',
  };
  const preference = report.specialty === 'sales' || report.specialty === 'purchases'
    ? ['total','net_amount','paid_amount','profit','margin','quantity']
    : report.specialty === 'receivables'
      ? ['balance','paid_amount','credit','debit']
      : report.specialty === 'payments'
        ? ['balance','credit','debit']
        : report.specialty === 'inventory'
          ? ['balance','current_stock','sales_qty','daily_sales_rate','stockout_days','incoming','net_inbound','opening_stock','quantity','value','price','cost']
          : ['total','value','balance','profit','paid_amount','quantity'];
  const rank = (field: string) => {
    const index = preference.indexOf(field);
    return index >= 0 ? index : 999;
  };
  return raw
    .map((column) => {
      if (!column || typeof column !== 'object') return null;
      const item = column as Record<string, unknown>;
      const field = String(item.mappedField ?? item.name ?? '').trim();
      const value = numberValue((item.statistics as Record<string, unknown> | undefined)?.sum ?? null);
      if (!field || value == null) return null;
      return { field, value, priority: rank(field) };
    })
    .filter((metric): metric is {field:string;value:number;priority:number} => Boolean(metric))
    .sort((a,b) => a.priority-b.priority || Math.abs(b.value)-Math.abs(a.value))
    .slice(0,4)
    .map(({field,value}) => ({label: labels[field] ?? 'مؤشر', value}));
}

function ContinuationRail({ report, decision }: { report: SmartReportDetail; decision: SourceDecisionState }) {
  const workFilter =
    decision.workItemStatus === 'COMPLETED'
      ? 'completed'
      : decision.workItemStatus === 'IN_PROGRESS'
        ? 'in_progress'
        : 'open';
  const sourcePath = '/reports/smart/' + encodeURIComponent(report.jobId) +
    '?sourceHash=' + encodeURIComponent(report.sourceHash) + '#decision-evidence-inspector';
  const recommendationQuery = decision.recommendationId
    ? '&recommendationId=' + encodeURIComponent(decision.recommendationId)
    : '';
  return (
    <section className="rounded-[18px] border border-primary-200 bg-primary-50/50 p-5" aria-label="استمرار الرحلة">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[9px] font-black tracking-[.14em] text-primary-800">RETURN / CONTINUE</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">أكمل من نفس الدليل دون إعادة البحث</h2>
          <p className="mt-1 text-[10px] leading-5 text-ink-600">الانتقالات التالية تستخدم السجلات المحفوظة لهذا المصدر؛ التنقل لا ينشئ قرارًا أو تنفيذًا جديدًا.</p>
        </div>
        <Link to={sourcePath} className="btn-secondary text-[10px]">العودة إلى المصدر والدليل</Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Link to={'/decision-experience?stage=decision' + recommendationQuery} className="rounded-xl border border-primary-200 bg-white p-3 hover:border-primary-400" aria-label="متابعة القرار">
          <div className="text-[9px] font-black text-primary-800">القرار</div>
          <div className="mt-1 text-xs font-black text-ink-900">{stateLabel(decision.status)}</div>
          <div className="mt-1 text-[9px] text-ink-500">الدليل → التوصية → القرار</div>
        </Link>
        <Link to={'/decision-experience?stage=approval' + recommendationQuery} className="rounded-xl border border-ink-200 bg-white p-3 hover:border-primary-300" aria-label="متابعة الموافقة">
          <div className="text-[9px] font-black text-ink-600">APPROVAL</div>
          <div className="mt-1 text-xs font-black text-ink-900">{stateLabel(decision.approvalStatus)}</div>
          <div className="mt-1 text-[9px] text-ink-500">الحالة المحفوظة</div>
        </Link>
        {decision.workItemId ? (
          <Link to={'/work-center?decisionWorkFilter=' + workFilter} className="rounded-xl border border-ink-200 bg-white p-3 hover:border-primary-300" aria-label="متابعة التنفيذ">
            <div className="text-[9px] font-black text-ink-600">WORK</div>
            <div className="mt-1 text-xs font-black text-ink-900">{stateLabel(decision.workItemStatus)}</div>
            <div className="mt-1 text-[9px] text-ink-500">عنصر عمل مرتبط</div>
          </Link>
        ) : (
          <div className="rounded-xl border border-warning-200 bg-warning-50/70 p-3" aria-label="التنفيذ غير متاح">
            <div className="text-[9px] font-black text-warning-900">WORK</div>
            <div className="mt-1 text-xs font-black text-warning-950">غير متاح</div>
            <div className="mt-1 text-[9px] text-warning-900">ينتظر الاعتماد الموثق</div>
          </div>
        )}
        <Link to={'/decision-experience?stage=outcome' + recommendationQuery} className="rounded-xl border border-ink-200 bg-white p-3 hover:border-primary-300" aria-label="متابعة النتيجة والتعلم">
          <div className="text-[9px] font-black text-ink-600">النتيجة والتعلّم</div>
          <div className="mt-1 text-xs font-black text-ink-900">{stateLabel(decision.outcomeStatus)}</div>
          <div className="mt-1 text-[9px] text-ink-500">النتيجة والتعلم</div>
        </Link>
        <Link to="/operations" className="rounded-xl border border-ink-200 bg-white p-3 hover:border-primary-300" aria-label="فتح مركز العمليات">
          <div className="text-[9px] font-black text-ink-600">OPERATIONS</div>
          <div className="mt-1 text-xs font-black text-ink-900">مركز العمليات</div>
          <div className="mt-1 text-[9px] text-ink-500">الطلب → الفاتورة → التحصيل</div>
        </Link>
      </div>
    </section>
  );
}

function StatusCell({ label, value }: { label: string; value: unknown }) {
  const text = stateLabel(value);
  const good = value === 'TRUSTED' || value === 'VERIFIED' || value === 'completed';
  const bad = value === 'BLOCKED' || value === 'failed';
  return (
    <div className={'rounded-xl border p-3 ' + (good ? 'border-success-200 bg-success-50' : bad ? 'border-danger-200 bg-danger-50' : 'border-ink-200 bg-ink-50')}>
      <div className="text-[9px] font-black text-ink-500">{label}</div>
      <div className="mt-1 text-xs font-black text-ink-900">{text}</div>
    </div>
  );
}

function BusinessJourneyRail({
  report,
  output,
  decision,
}: {
  report: SmartReportDetail;
  output: SmartReportDetail['renderedOutput'];
  decision: SourceDecisionState | null;
}) {
  const signalCount = report.intelligence.signals.length;
  const stages = [
    { key: 'DATA', label: 'البيانات', value: report.rowCount == null ? 'غير متاح' : formatNumber(report.rowCount) + ' صف', state: report.rowCount == null ? 'neutral' : 'good' },
    { key: 'TRUTH', label: 'الحقيقة', value: report.sourceTrustState ?? report.evidenceStatus ?? 'غير مثبت', state: report.sourceTrustState === 'TRUSTED' || report.evidenceStatus === 'VERIFIED' ? 'good' : 'neutral' },
    { key: 'SIGNAL', label: 'الإشارة', value: signalCount ? formatNumber(signalCount) + ' إشارة' : 'لا توجد إشارة', state: signalCount ? 'attention' : 'neutral' },
    { key: 'القرار', label: 'القرار', value: decision ? stateLabel(decision.status) : stateLabel(output.decisionStatus), state: decision ? 'good' : 'neutral' },
    { key: 'APPROVAL', label: 'الموافقة', value: decision?.approvalStatus ?? stateLabel(output.approvalStatus), state: decision?.approvalStatus === 'APPROVED' ? 'good' : decision?.approvalStatus === 'PENDING' ? 'attention' : 'neutral' },
    { key: 'WORK', label: 'العمل', value: decision?.workItemStatus ?? stateLabel(output.actionStatus), state: decision?.workItemStatus === 'COMPLETED' ? 'good' : decision?.workItemStatus === 'IN_PROGRESS' ? 'attention' : 'neutral' },
    { key: 'OUTCOME', label: 'النتيجة', value: decision?.outcomeStatus ?? stateLabel(output.outcomeStatus), state: decision?.outcomeStatus ? 'good' : 'neutral' },
    { key: 'LEARNING', label: 'التعلّم', value: decision?.actualImpact != null ? 'نتيجة فعلية مسجلة' : stateLabel(output.learningStatus), state: decision?.actualImpact != null ? 'good' : 'neutral' },
  ] as const;

  const nextAction = decision
    ? decision.status === 'PROPOSED' && decision.approvalStatus !== 'PENDING'
      ? 'اطلب الموافقة من صاحب الصلاحية.'
      : decision.status === 'PROPOSED' && decision.approvalStatus === 'PENDING'
        ? 'انتظر صاحب صلاحية آخر لاعتماد القرار.'
        : decision.status === 'APPROVED' && !decision.workItemId
          ? 'حوّل القرار المعتمد إلى عنصر عمل.'
          : decision.workItemStatus === 'OPEN'
            ? 'ابدأ تنفيذ عنصر العمل.'
            : decision.workItemStatus === 'IN_PROGRESS'
              ? 'سجّل الأثر الفعلي وأغلق التنفيذ بالدليل.'
              : decision.workItemStatus === 'COMPLETED'
                ? 'راجع النتيجة والتعلّم المحفوظ.'
                : 'راجع الدليل قبل الانتقال إلى الإجراء.'
    : signalCount
      ? 'اختر إشارة مثبتة وابدأ قضية Advisor.'
      : 'لا توجد إشارة مثبتة؛ راجع جودة المصدر أولًا.';

  return (
    <section className="rounded-[20px] border border-ink-200 bg-white p-4 shadow-sm" aria-label="رحلة البيانات إلى القرار">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">BUSINESS JOURNEY</div>
          <h2 className="mt-1 text-base font-black text-ink-950">من البيانات إلى القرار والنتيجة — في سياق واحد</h2>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">كل حالة هنا قراءة من المصدر والسجل الكانوني؛ لا تُعرض كتوقع أو حقيقة مالية غير مثبتة.</p>
        </div>
        <div className="max-w-xl rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2.5 text-[9px] font-black text-primary-900">
          <span className="text-primary-700">NEXT EXACT ACTION</span>
          <div className="mt-1 leading-5">{nextAction}</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1" role="list" aria-label="مراحل رحلة الأعمال">
        <div className="flex min-w-[760px] items-stretch gap-2">
          {stages.map((stage, index) => (
            <div
              key={stage.key}
              role="listitem"
              className={[
                'relative min-w-[118px] flex-1 rounded-xl border p-3',
                stage.state === 'good'
                  ? 'border-success-200 bg-success-50'
                  : stage.state === 'attention'
                    ? 'border-warning-200 bg-warning-50'
                    : 'border-ink-200 bg-ink-50',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[8px] font-black text-ink-700 shadow-sm">
                  {index + 1}
                </span>
                <span className="text-[9px] font-black text-ink-800">{stage.label}</span>
              </div>
              <div className="mt-2 truncate text-[9px] font-black text-ink-950" title={stage.value}>{stage.value}</div>
              {index < stages.length - 1 && <span className="pointer-events-none absolute -left-2 top-1/2 hidden -translate-y-1/2 text-ink-300 lg:block">←</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[8px] font-black">
        <span className="rounded-full bg-success-50 px-2.5 py-1 text-success-800">OBSERVED / PROVEN</span>
        <span className="rounded-full bg-warning-50 px-2.5 py-1 text-warning-900">ATTENTION / ACTION</span>
        <span className="rounded-full bg-ink-50 px-2.5 py-1 text-ink-600">UNKNOWN / NOT AVAILABLE</span>
        <span className="mr-auto rounded-full bg-ink-50 px-2.5 py-1 text-ink-600">المصدر محفوظ للتدقيق</span>
      </div>
    </section>
  );
}

function SourceHeader({ report }: { report: SmartReportDetail }) {
  const labels: Record<string, string> = {
    sales: 'المبيعات',
    purchases: 'المشتريات',
    inventory: 'المخزون',
    receivables: 'الذمم والتحصيل',
    profitability: 'الربحية',
    payments: 'السيولة والمدفوعات',
  };
  const title = labels[report.specialty ?? ''] ? 'تقرير ' + labels[report.specialty ?? ''] : 'تقرير أعمال ذكي';
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#0d1424] p-5 text-white shadow-[0_24px_70px_-36px_rgba(15,23,42,.9)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[9px] font-black tracking-[.16em] text-amber-200">REPORT ADVISOR</div>
          <h1 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">{title}</h1>
          <p className="mt-1 text-[11px] leading-6 text-slate-300">هذا السطح يعرض معنى التقرير وقرار الأعمال، بينما تبقى تفاصيل الملف الخام داخل طبقة الدليل.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">السجلات: {report.rowCount == null ? 'غير متاح' : formatNumber(report.rowCount)}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">الجودة: {report.qualityScore == null ? 'غير متاح' : report.qualityScore + '%'}</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">الثقة: {stateLabel(report.trustState ?? report.sourceTrustState)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={'/reports/smart/' + report.jobId + '?sourceHash=' + encodeURIComponent(report.sourceHash)} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-[#111827]">التقرير الذكي <ArrowLeft size={13}/></Link>
          <Link to={'/decision-experience?stage=evidence&reportJobId=' + report.jobId + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black text-white">الدليل والقرار <ArrowLeft size={13}/></Link>
        </div>
      </div>
    </section>
  );
}


export function BusinessDataExplorer({ report }: { report: SmartReportDetail }) {
  const rows = useMemo(
    () => report.canonicalRows
      .map((row, index) => ({ row, index, data: row.data as Record<string, unknown> }))
      .filter(({ data }) => data && typeof data === 'object'),
    [report.canonicalRows],
  );
  const columns = useMemo(() => {
    const dataset = report.sourceAnalysis?.datasets?.[0];
    const raw = dataset && typeof dataset === 'object' && Array.isArray((dataset as Record<string, unknown>).columns)
      ? (dataset as Record<string, unknown>).columns as unknown[]
      : [];
    const seen = new Set<string>();
    return raw.map((item) => {
      const column = item && typeof item === 'object' ? item as Record<string, unknown> : { name: String(item ?? '') };
      const key = String(column.mappedField ?? column.name ?? '').trim();
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return { key, name: String(column.name ?? key).trim() };
    }).filter(Boolean) as Array<{ key: string; name: string }>;
  }, [report.sourceAnalysis]);

  const resolveField = (candidates: string[]) => {
    const normalized = (value: string) => value.toLowerCase().replace(/[\\s_\\-]+/g, '');
    return columns.find((column) => {
      const key = normalized(column.key);
      const name = normalized(column.name);
      return candidates.some((candidate) => {
        const target = normalized(candidate);
        return key === target || name === target;
      });
    })?.key ?? null;
  };

  const identityField = resolveField(
    ['product_name', 'item_name', 'product', 'name', 'customer_name', 'supplier_name', 'invoice_number', 'category', 'warehouse', 'اسم الصنف', 'الصنف', 'اسم العميل', 'اسم المورد'],
  );
  const skuField = resolveField(['sku', 'product_code', 'item_code', 'رقم الصنف', 'كود الصنف', 'رمز الصنف']);
  const stockField = resolveField(['current_stock', 'balance', 'stock', 'quantity', 'الرصيد', 'الرصيد الحالي', 'المخزون الحالي']);
  const salesField = resolveField(['daily_sales_rate', 'sales_qty', 'sales', 'net_sales', 'معدل البيع اليومي', 'صافي المبيعات']);
  const stockoutField = resolveField(['stockout_days', 'stockoutdays', 'أيام النفاد', 'الفترة المتوقعة لنفاد الكمية']);
  const ageField = resolveField(['stock_age_days', 'stock_age_period_days', 'age', 'عمر المخزون', 'عمر المخزون للفترة']);
  const genericNumericField = useMemo(() => {
    if (identityField) {
      const candidates = columns.filter((column) => column.key !== identityField && rows.some(({ data }) => numberValue(data[column.key]) != null));
      return candidates[0]?.key ?? null;
    }
    return columns.find((column) => rows.some(({ data }) => numberValue(data[column.key]) != null))?.key ?? null;
  }, [columns, identityField, rows]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'zero' | 'soon' | 'aging'>('all');
  const [sortBy, setSortBy] = useState<string>(identityField ?? stockField ?? genericNumericField ?? '');
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const activeFieldLabels = useMemo(() => ({
    identity: identityField,
    sku: skuField,
    stock: stockField,
    sales: salesField,
    stockout: stockoutField,
    age: ageField,
    numeric: genericNumericField,
  }), [ageField, genericNumericField, identityField, salesField, skuField, stockField, stockoutField]);

  const classify = useCallback((data: Record<string, unknown>) => {
    const stock = stockField ? numberValue(data[stockField]) : null;
    const stockout = stockoutField ? numberValue(data[stockoutField]) : null;
    const age = ageField ? numberValue(data[ageField]) : null;
    const sales = salesField ? numberValue(data[salesField]) : null;
    return {
      zero: stock != null && stock <= 0,
      soon: stockout != null && stockout >= 0 && stockout <= 7,
      aging: age != null && age >= 120 && (sales == null || sales > 0),
      attention: (stock != null && stock <= 0) || (stockout != null && stockout >= 0 && stockout <= 7) || (age != null && age >= 120 && (sales == null || sales > 0)),
    };
  }, [ageField, salesField, stockField, stockoutField]);

  const summary = useMemo(() => rows.reduce((acc, item) => {
    const state = classify(item.data);
    acc.total += 1;
    if (state.attention) acc.attention += 1;
    if (state.zero) acc.zero += 1;
    if (state.soon) acc.soon += 1;
    if (state.aging) acc.aging += 1;
    return acc;
  }, { total: 0, attention: 0, zero: 0, soon: 0, aging: 0 }), [rows, stockField, stockoutField, ageField, salesField]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(({ data }) => {
        const state = classify(data);
        const matchesFilter =
          filter === 'all' ||
          (filter === 'attention' && state.attention) ||
          (filter === 'zero' && state.zero) ||
          (filter === 'soon' && state.soon) ||
          (filter === 'aging' && state.aging);
        if (!matchesFilter) return false;
        if (!q) return true;
        return Object.values(data).some((value) => String(value ?? '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const left = a.data[sortBy];
        const right = b.data[sortBy];
        const leftNumber = numberValue(left);
        const rightNumber = numberValue(right);
        const comparison = leftNumber != null && rightNumber != null
          ? leftNumber - rightNumber
          : String(left ?? '').localeCompare(String(right ?? ''), 'ar', { numeric: true, sensitivity: 'base' });
        return sortDesc ? -comparison : comparison;
      })
      .slice(0, 120);
  }, [classify, filter, query, rows, sortBy, sortDesc]);

  const selected = selectedIndex == null ? null : rows.find((item) => item.index === selectedIndex) ?? null;
  const label = (field: string | null, fallback: string) => {
    if (!field) return fallback;
    const found = columns.find((column) => column.key === field);
    const key = String(found?.name ?? field).trim();
    const labels: Record<string, string> = {
      product_name: 'الصنف',
      item_name: 'الصنف',
      customer_name: 'العميل',
      supplier_name: 'المورد',
      invoice_number: 'رقم الفاتورة',
      current_stock: 'الرصيد الحالي',
      balance: 'الرصيد',
      quantity: 'الكمية',
      daily_sales_rate: 'معدل البيع اليومي',
      sales_qty: 'المبيعات',
      stockout_days: 'أيام حتى النفاد',
      stock_age_days: 'عمر المخزون',
      stock_age_period_days: 'عمر المخزون',
    };
    return labels[field] ?? labels[key] ?? key;
  };
  const display = (value: unknown) => {
    if (value == null || value === '') return '—';
    const parsed = numberValue(value);
    return parsed == null ? String(value) : formatNumber(parsed);
  };
  const toggleSort = (field: string) => {
    if (!field) return;
    if (sortBy === field) setSortDesc((current) => !current);
    else {
      setSortBy(field);
      setSortDesc(true);
    }
  };
  const businessMode = report.specialty === 'inventory' || Boolean(stockField || stockoutField);

  return (
    <section className="rounded-[20px] border border-ink-200 bg-white p-5 shadow-sm lg:p-6" aria-label="مساحة البيانات الفعلية">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-black tracking-[.14em] text-primary-700"><Filter size={14}/> مساحة البيانات الفعلية</div>
          <h2 className="mt-1 text-xl font-black text-ink-950">{businessMode ? 'ما الذي يحتاج تدخّلًا الآن؟' : 'استكشف الصفوف التي صنعت التقرير'}</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-ink-500">
            هذه ليست مؤشرات وصفية: كل رقم أدناه محسوب مباشرة من صفوف التقرير الحالية، ويمكن فتح الصف لمعرفة القيم التي صنعت التصنيف.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['كل السجلات', summary.total, 'all'],
            ['تحتاج انتباهًا', summary.attention, 'attention'],
            [businessMode ? 'رصيد صفر/سالب' : 'الحالات الحرجة', businessMode ? summary.zero : summary.attention, businessMode ? 'zero' : 'attention'],
            [businessMode ? 'نفاد خلال 7 أيام' : 'كل الصفوف', businessMode ? summary.soon : summary.total, businessMode ? 'soon' : 'all'],
          ].map(([text, value, key]) => (
            <button key={String(key)} type="button" onClick={() => setFilter(key as typeof filter)} className={'rounded-xl border p-3 text-right transition ' + (filter === key ? 'border-primary-400 bg-primary-50' : 'border-ink-100 bg-ink-50 hover:border-primary-200')}>
              <div className="text-[9px] text-ink-500">{text}</div>
              <div className="mt-1 text-lg font-black tabular-nums text-ink-950">{formatNumber(Number(value))}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث داخل الصفوف: اسم صنف، عميل، رقم، قيمة..." className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pr-9 pl-3 text-xs text-ink-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100" />
        </label>
        <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-xs font-bold text-ink-700 hover:bg-ink-50"><X size={14}/> تصفير الفلاتر</button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-hidden rounded-xl border border-ink-200">
          <div className="max-h-[440px] overflow-auto">
            <table className="min-w-full text-right text-[10px]">
              <thead className="sticky top-0 bg-ink-50 text-ink-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2"><button type="button" onClick={() => toggleSort(activeFieldLabels.identity ?? '')} className="inline-flex items-center gap-1 font-black">{label(activeFieldLabels.identity, 'البيان')}<ArrowDownUp size={11}/></button></th>
                  {activeFieldLabels.sku && <th className="px-3 py-2">{label(activeFieldLabels.sku, 'الرمز')}</th>}
                  {activeFieldLabels.stock && <th className="px-3 py-2"><button type="button" onClick={() => toggleSort(activeFieldLabels.stock!)} className="inline-flex items-center gap-1 font-black">{label(activeFieldLabels.stock, 'الرصيد')}<ArrowDownUp size={11}/></button></th>}
                  {activeFieldLabels.sales && <th className="px-3 py-2"><button type="button" onClick={() => toggleSort(activeFieldLabels.sales!)} className="inline-flex items-center gap-1 font-black">{label(activeFieldLabels.sales, 'المبيعات')}<ArrowDownUp size={11}/></button></th>}
                  {activeFieldLabels.stockout && <th className="px-3 py-2"><button type="button" onClick={() => toggleSort(activeFieldLabels.stockout!)} className="inline-flex items-center gap-1 font-black">{label(activeFieldLabels.stockout, 'النفاد')}<ArrowDownUp size={11}/></button></th>}
                  {activeFieldLabels.age && <th className="px-3 py-2"><button type="button" onClick={() => toggleSort(activeFieldLabels.age!)} className="inline-flex items-center gap-1 font-black">{label(activeFieldLabels.age, 'العمر')}<ArrowDownUp size={11}/></button></th>}
                  {!activeFieldLabels.stock && !activeFieldLabels.sales && activeFieldLabels.numeric && <th className="px-3 py-2"><button type="button" onClick={() => toggleSort(activeFieldLabels.numeric!)} className="inline-flex items-center gap-1 font-black">{label(activeFieldLabels.numeric, 'القيمة')}<ArrowDownUp size={11}/></button></th>}
                  <th className="px-3 py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ row, index, data }) => {
                  const state = classify(data);
                  return (
                    <tr key={row.row_number ?? index} onClick={() => setSelectedIndex(index)} className={'cursor-pointer border-t border-ink-100 transition hover:bg-primary-50/40 ' + (selectedIndex === index ? 'bg-primary-50' : '')}>
                      <td className="px-3 py-2 font-black text-ink-400">#{row.row_number ?? index + 1}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 font-bold text-ink-900">{display(identityField ? data[identityField] : Object.values(data)[0])}</td>
                      {activeFieldLabels.sku && <td className="px-3 py-2 text-ink-600">{display(data[activeFieldLabels.sku])}</td>}
                      {activeFieldLabels.stock && <td className="px-3 py-2 font-black tabular-nums text-ink-900">{display(data[activeFieldLabels.stock])}</td>}
                      {activeFieldLabels.sales && <td className="px-3 py-2 tabular-nums text-ink-700">{display(data[activeFieldLabels.sales])}</td>}
                      {activeFieldLabels.stockout && <td className={'px-3 py-2 tabular-nums font-black ' + (numberValue(data[activeFieldLabels.stockout]) != null && numberValue(data[activeFieldLabels.stockout])! <= 7 ? 'text-danger-700' : 'text-ink-700')}>{display(data[activeFieldLabels.stockout])}</td>}
                      {activeFieldLabels.age && <td className={'px-3 py-2 tabular-nums ' + (numberValue(data[activeFieldLabels.age]) != null && numberValue(data[activeFieldLabels.age])! >= 120 ? 'text-warning-700 font-black' : 'text-ink-700')}>{display(data[activeFieldLabels.age])}</td>}
                      {!activeFieldLabels.stock && !activeFieldLabels.sales && activeFieldLabels.numeric && <td className="px-3 py-2 font-black tabular-nums text-ink-900">{display(data[activeFieldLabels.numeric])}</td>}
                      <td className="px-3 py-2">
                        {state.attention ? <span className="rounded-full bg-danger-50 px-2 py-1 text-[8px] font-black text-danger-800">{state.zero ? 'رصيد صفر/سالب' : state.soon ? 'نفاد قريب' : 'مخزون راكد'}</span> : <span className="rounded-full bg-success-50 px-2 py-1 text-[8px] font-black text-success-800">طبيعي وفق الحقول المتاحة</span>}
                      </td>
                    </tr>
                  );
                })}
                {!filteredRows.length && <tr><td colSpan={9} className="p-8 text-center text-xs text-ink-500">لا توجد صفوف تطابق الاختيار.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50 px-3 py-2 text-[9px] text-ink-500">
            <span>يعرض أول {formatNumber(filteredRows.length)} صف من نتيجة البحث الحالية.</span>
            <span>انقر صفًا لفتح تفاصيله.</span>
          </div>
        </div>

        <aside className="rounded-xl border border-primary-200 bg-primary-50/30 p-4">
          {!selected ? (
            <div className="flex h-full min-h-[220px] flex-col justify-center">
              <div className="text-xs font-black text-ink-900">اختر صفًا حقيقيًا</div>
              <p className="mt-2 text-[10px] leading-5 text-ink-500">ستظهر هنا القيم التي صنعت التصنيف، ثم تنتقل منها مباشرة إلى مساحة القرار.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-[9px] font-black tracking-[.12em] text-primary-700">تفاصيل الصف</div><h3 className="mt-1 text-sm font-black text-ink-950">{display(identityField ? selected.data[identityField] : Object.values(selected.data)[0])}</h3></div>
                <button type="button" onClick={() => setSelectedIndex(null)} className="rounded-lg border border-ink-200 bg-white p-1.5 text-ink-500 hover:text-ink-900" aria-label="إغلاق"><X size={14}/></button>
              </div>
              <div className="mt-3 space-y-2">
                {Object.entries(selected.data).slice(0, 12).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2">
                    <span className="min-w-0 text-[9px] font-bold text-ink-500">{label(key, key)}</span>
                    <span className="max-w-[150px] break-words text-left text-[10px] font-black text-ink-900">{display(value)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[9px] leading-5 text-amber-950">
                <strong>لماذا ظهر هنا؟</strong>{' '}
                {(() => {
                  const state = classify(selected.data);
                  if (state.zero) return 'الرصيد الحالي صفر أو سالب وفق الحقل المصدر.';
                  if (state.soon) return 'فترة النفاد المتوقعة لا تتجاوز 7 أيام وفق المصدر.';
                  if (state.aging) return 'عمر المخزون مرتفع مع وجود حركة بيع وفق الحقول المتاحة.';
                  return 'لا توجد قاعدة انتباه حرجة مطابقة؛ الصف عُرض لأنك اخترته.';
                })()}
              </div>
              <Link to={'/decision-experience?stage=decision&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash) + '&row=' + encodeURIComponent(String(selected.row.row_number ?? selected.index + 1))} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-ink-950 px-3 py-2.5 text-[10px] font-black text-white hover:bg-ink-800">
                افتح هذا الصف في مساحة القرار <ArrowLeft size={12}/>
              </Link>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function ExecutiveMode({ report }: { report: SmartReportDetail }) {
  const metrics = buildMetrics(report);
  const output = report.renderedOutput;
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCell label="ثقة المصدر" value={report.sourceTrustState ?? report.trustState}/>
        <StatusCell label="حالة التوثيق" value={report.reportVerificationState}/>
        <StatusCell label="القرار" value={output.decisionStatus}/>
        <StatusCell label="المعيار المقارن" value={output.benchmarkStatus}/>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.12em] text-primary-700">EXECUTIVE BRIEF</div>
          <h2 className="mt-1 text-xl font-black text-ink-950">هذه هي نتيجة المصدر نفسه</h2>
          <p className="mt-3 text-sm leading-7 text-ink-600">
            تم تحليل المصدر وربطه بالبصمة الأصلية. لا تُستبدل القيم غير الموجودة بتقديرات، ولا تُنسب نتائج تنفيذية لم تُسجل.
            حالة القرار الحالية: <strong>{stateLabel(output.decisionStatus)}</strong>، وحالة التنفيذ: <strong>{stateLabel(output.actionStatus)}</strong>.
          </p>
        </div>
        <div className="rounded-[18px] border border-ink-200 bg-ink-950 p-5 text-white shadow-sm">
          <div className="text-[9px] font-black tracking-[.12em] text-primary-200">حقائق المصدر</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/5 p-3"><div className="text-[9px] text-ink-300">الصفوف</div><div className="mt-1 text-lg font-black">{report.rowCount == null ? 'غير متاح' : formatNumber(report.rowCount)}</div></div>
            <div className="rounded-xl bg-white/5 p-3"><div className="text-[9px] text-ink-300">حقول المصدر</div><div className="mt-1 text-lg font-black">{report.sourceAnalysis?.columnCount ?? 'غير متاح'}</div></div>
            <div className="rounded-xl bg-white/5 p-3"><div className="text-[9px] text-ink-300">نوع المصدر</div><div className="mt-1 text-sm font-black">{report.sourceAnalysis?.sourceFormat ?? 'غير متاح'}</div></div>
            <div className="rounded-xl bg-white/5 p-3"><div className="text-[9px] text-ink-300">حالة المعالجة</div><div className="mt-1 text-sm font-black">{STAGE_LABELS[report.checkpointStage ?? ''] ?? report.checkpointStage ?? 'غير متاح'}</div></div>
          </div>
        </div>
      </section>
      <section className="rounded-[18px] border border-primary-200 bg-primary-50/50 p-4" aria-label="نتيجة القرار والتعلم">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.12em] text-primary-700">OUTCOME → LEARNING</div>
            <div className="mt-1 text-sm font-black text-ink-950">النتيجة المسجلة تصبح معرفة قابلة للمتابعة، وليست نجاحًا افتراضيًا.</div>
            <p className="mt-1 text-[10px] leading-5 text-ink-600">حالة التعلم تُقرأ من سجل النتيجة المرتبط بالقرار والدليل. عند غياب سجل موثوق تبقى الحالة NOT AVAILABLE.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatusCell label="النتيجة" value={output.outcomeStatus}/>
            <StatusCell label="التعلّم" value={output.learningStatus}/>
            <StatusCell label="المعيار المقارن" value={output.benchmarkStatus}/>
          </div>
        </div>
      </section>
      <BusinessDataExplorer report={report} />\n      <ReportIntelligencePanel report={report} />

      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
        <div className="text-[9px] font-black tracking-[.12em] text-primary-700">مؤشرات المصدر</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.length ? metrics.map((metric) => <div key={metric.label} className="rounded-xl bg-ink-50 p-3"><div className="text-[10px] text-ink-500">{metric.label}</div><div className="mt-1 text-base font-black">{/amount|price|total|value|cost|sales|paid|balance|revenue|profit|ربح|قيمة|سعر|مبلغ/i.test(metric.label) ? formatCurrency(metric.value) : formatNumber(metric.value)}</div></div>) : <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-xs text-warning-900">لا توجد قيمة رقمية كافية للعرض من المصدر الحالي.</div>}
        </div>
      </section>
    </>
  );
}

function TrustMode({ report }: { report: SmartReportDetail }) {
  const warnings = report.sourceAnalysis?.datasets?.length ? report.sourceAnalysis.datasets.length : 0;
  return (
    <>
      <ReportIntelligencePanel report={report} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCell label="الثقة" value={report.trustState}/>
        <StatusCell label="الدليل" value={report.evidenceStatus}/>
        <StatusCell label="التوثيق" value={report.reportVerificationState}/>
        <StatusCell label="التحليل" value={report.sourceAnalysis?.analysisStatus}/>
        <StatusCell label="التغطية الكانونية" value={report.canonicalCommitVerified ? 'VERIFIED' : 'NOT_COMMITTED'}/>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.12em] text-primary-700">حالة الدليل</div>
          <h2 className="mt-1 text-xl font-black">حالة الدليل</h2>
          <dl className="mt-4 grid gap-2 text-xs">
            <div className="flex justify-between gap-3 rounded-lg bg-ink-50 p-3"><dt>الثقة</dt><dd>{stateLabel(report.trustState ?? report.sourceTrustState)}</dd></div>
            <div className="flex justify-between gap-3 rounded-lg bg-ink-50 p-3"><dt>التوثيق</dt><dd>{stateLabel(report.reportVerificationState)}</dd></div>
            <div className="flex justify-between gap-3 rounded-lg bg-ink-50 p-3"><dt>الجودة</dt><dd>{report.qualityScore == null ? 'غير متاح' : report.qualityScore + '%'}</dd></div>
            <div className="flex justify-between gap-3 rounded-lg bg-ink-50 p-3"><dt>التغطية</dt><dd>{report.rowCount == null ? 'غير متاح' : formatNumber(report.rowCount) + ' سجل'}</dd></div>
            <details className="rounded-lg bg-ink-50 p-3"><summary className="cursor-pointer font-bold">تفاصيل المصدر الفنية</summary><div className="mt-2 break-all text-[9px] text-ink-400">الملف الأصلي: {report.sourcePath}<br/>البصمة: {report.sourceHash}</div></details>
          </dl>
        </div>
        <div className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.12em] text-primary-700">حدود الدليل</div>
          <h2 className="mt-1 text-xl font-black">ما الذي ثبت وما الذي لم يثبت؟</h2>
          <div className="mt-4 space-y-2">
            <div className={`rounded-xl border p-3 text-xs ${report.canonicalCommitVerified ? 'border-success-200 bg-success-50' : 'border-warning-200 bg-warning-50 text-warning-900'}`}>
              {report.canonicalCommitVerified ? `الاعتماد الكانوني مثبت: ${formatNumber(report.canonicalCommitCount)} سجل.` : 'الاعتماد الكانوني غير مثبت لهذا المصدر؛ لا تُرفع الثقة بالاستنتاج.'}
              {report.canonicalCommitGap != null && report.canonicalCommitGap > 0 && <span className="mr-2 font-bold text-warning-900">فجوة الاعتماد: {formatNumber(report.canonicalCommitGap)} صف.</span>}
            </div>
            <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-900">المصدر الموثوق لا تعني التقرير الموثق. حالة الدليل النهائية تعتمد على evidence acceptance مستقل.</div>
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700">حالة التحقق: {report.reportVerificationState === 'VERIFIED' ? 'موثق' : report.reportVerificationState === 'GAP_DETECTED' ? 'فجوة اعتماد' : 'الدليل النهائي غير مثبت'}</div>
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-700">المعيار المقارن: {stateLabel(report.renderedOutput.benchmarkStatus)} — لا يتم اختلاق مقارنة عند نقص العينة.</div>
          </div>
        </div>
      </section>
    </>
  );
}

function DecisionMode({ report }: { report: SmartReportDetail }) {
  const output = report.renderedOutput;
  const evidenceSnapshotId = typeof output.evidenceSnapshotId === 'string' ? output.evidenceSnapshotId.trim() : '';
  const [decisions, setDecisions] = useState<SourceDecisionState[]>([]);
  const [decisionAction, setDecisionAction] = useState<Record<string, string>>({});
  const [actualImpact, setActualImpact] = useState<Record<string, string>>({});
  const [workDueAt, setWorkDueAt] = useState<Record<string, string>>({});

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [auditTrace, setAuditTrace] = useState<DecisionAuditTrace[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const refreshDecisions = useCallback(async () => {
    const rows = await fetchSourceDecisionProposals(report.sourceHash, report.jobId);
    setDecisions(rows);
  }, [report.jobId, report.sourceHash]);

  const refreshAudit = useCallback(async (decision: SourceDecisionState) => {
    setAuditLoading(true);
    try {
      const rows = await fetchSourceDecisionAuditTrace(
        decision.id,
        decision.approvalId,
        decision.workItemId,
        decision.outcomeId,
      );
      setAuditTrace(rows);
    } catch {
      setAuditTrace([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshDecisions().catch(() => {
      if (active) setDecisions([]);
    });
    void getAuthenticatedUser().then((user) => {
      if (active) setCurrentUserId(user?.id ?? null);
    });
    return () => { active = false; };
  }, [refreshDecisions]);

  useEffect(() => {
    const latest = decisions[0];
    if (!latest) {
      setAuditTrace([]);
      return;
    }
    void refreshAudit(latest);
  }, [decisions, refreshAudit]);

  const createWorkItem = (decision: SourceDecisionState) => {
    setDecisionAction((current) => ({ ...current, [decision.id]: 'creating-work' }));
    const department = report.specialty === 'inventory'
      ? 'المخزون'
      : report.specialty === 'sales'
        ? 'المبيعات'
        : report.specialty === 'purchases'
          ? 'المشتريات'
          : report.specialty === 'receivables'
            ? 'التحصيل'
            : 'التشغيل';
    void createApprovedDecisionWorkItemForCurrentUser({
      decisionId: decision.id,
      reportJobId: report.jobId,
      sourceHash: report.sourceHash,
      signalTitle: decision.signalTitle ?? 'عنصر عمل من قرار مصدرّي',
      signalMessage: decision.signalMessage,
      signalSeverity: decision.signalSeverity,
      recommendationId: decision.recommendationId,
      evidenceSnapshotId: report.sourceAnalysis?.id ?? null,
      department,
      dueAt: workDueAt[decision.id] ? new Date(workDueAt[decision.id]).toISOString() : null,
    }).then((workItemId) => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'work-created' }));
      setDecisions((current) => current.map((item) => item.id === decision.id
        ? { ...item, workItemId, workItemStatus: 'OPEN' }
        : item));
    }).catch(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'work-error' }));
    });
  };

  const startWorkItem = (decision: SourceDecisionState) => {
    if (!decision.workItemId) return;
    setDecisionAction((current) => ({ ...current, [decision.id]: 'starting-work' }));
    void startSourceDecisionWorkItem(decision.workItemId).then(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'work-started' }));
      setDecisions((current) => current.map((item) => item.id === decision.id ? { ...item, workItemStatus: 'IN_PROGRESS' } : item));
    }).catch(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'start-error' }));
    });
  };

  const completeWorkItem = (decision: SourceDecisionState) => {
    if (!decision.workItemId || !evidenceSnapshotId) {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'evidence-error' }));
      return;
    }
    const rawImpact = actualImpact[decision.id]?.trim() ?? '';
    const parsedImpact = rawImpact ? Number(rawImpact.replace(/,/g, '')) : null;
    if (parsedImpact != null && !Number.isFinite(parsedImpact)) {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'impact-error' }));
      return;
    }
    setDecisionAction((current) => ({ ...current, [decision.id]: 'completing-work' }));
    void completeSourceDecisionWorkItem({
      workItemId: decision.workItemId,
      actualImpact: parsedImpact,
      evidenceSnapshotId,
      reportJobId: report.jobId,
      sourceHash: report.sourceHash,
    }).then(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'work-completed' }));
      setDecisions((current) => current.map((item) => item.id === decision.id ? { ...item, workItemStatus: 'COMPLETED', status: 'EXECUTED' } : item));
    }).catch(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'complete-error' }));
    });
  };

  const requestApproval = (decision: SourceDecisionState) => {
    setDecisionAction((current) => ({ ...current, [decision.id]: 'saving' }));
    void requestSourceDecisionApproval(
      decision.id,
      'طلب موافقة على قرار مقترح مرتبط بتقرير مصدر محدد؛ لا يعني الطلب أن التنفيذ حدث.',
    ).then(async () => {
      await refreshDecisions();
      setDecisionAction((current) => ({ ...current, [decision.id]: 'requested' }));
    }).catch(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'error' }));
    });
  };

  const decideApproval = (decision: SourceDecisionState, approve: boolean) => {
    if (!decision.approvalId) return;
    if (decision.approvalRequestedBy && currentUserId === decision.approvalRequestedBy) {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'self-approval-forbidden' }));
      return;
    }
    setDecisionAction((current) => ({ ...current, [decision.id]: approve ? 'approving' : 'rejecting' }));
    void decideSourceDecisionApproval(
      decision.approvalId,
      approve,
      approve ? 'اعتماد موثق لقرار مصدرّي' : 'رفض موثق لقرار مصدرّي',
    ).then(async () => {
      await refreshDecisions();
      setDecisionAction((current) => ({ ...current, [decision.id]: approve ? 'approved' : 'rejected' }));
    }).catch(() => {
      setDecisionAction((current) => ({ ...current, [decision.id]: 'approval-error' }));
    });
  };

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatusCell label="القرار" value={output.decisionStatus}/>
        <StatusCell label="الموافقة" value={output.approvalStatus}/>
        <StatusCell label="Action" value={output.actionStatus}/>
        <StatusCell label="النتيجة" value={output.outcomeStatus}/>
        <StatusCell label="التعلّم" value={output.learningStatus}/>
      </section>
      <BusinessJourneyRail report={report} output={output} decision={decisions[0] ?? null} />
      <ReportIntelligencePanel report={report} />

      {decisions[0] && <ContinuationRail report={report} decision={decisions[0]} />}

      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black tracking-[.12em] text-primary-700">GOVERNED DECISIONS</div>
            <h2 className="mt-1 text-lg font-black text-ink-950">القرارات المقترحة والتنفيذ المرتبط بهذا المصدر</h2>
            <p className="mt-1 text-[10px] leading-5 text-ink-500">المسار المحكوم: مقترح → موافقة → عنصر عمل → بدء → إغلاق بدليل. لا يوجد تنفيذ تلقائي ولا انتقال صامت بين الحالات.</p>
          </div>
          <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[9px] font-black text-ink-600">{formatNumber(decisions.length)}</span>
        </div>

        <div className="mt-4 space-y-3">
          {decisions.length ? decisions.map((decision) => (
            <article key={decision.id} className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-ink-900">{decision.signalTitle ?? decision.decisionKey}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-ink-600">{stateLabel(decision.status)}</span>
                    {decision.workItemStatus && <span className="rounded-full bg-primary-50 px-2 py-1 text-[9px] font-bold text-primary-800">العمل: {decision.workItemStatus}</span>}
                    {decision.outcomeStatus && <span className="rounded-full bg-success-50 px-2 py-1 text-[9px] font-bold text-success-800">النتيجة: {decision.outcomeStatus}</span>}
                  </div>
                  <p className="mt-1 text-[10px] leading-5 text-ink-600">{decision.signalMessage ?? 'إشارة مصدرية مرتبطة بهذا القرار.'}</p>
                  {(decision.actualImpact != null || decision.expectedImpact != null || decision.outcomeStatus) && (
                    <div className="mt-2 flex flex-wrap gap-3 text-[9px] text-ink-500">
                      <span>المتوقع: {decision.expectedImpact == null ? 'غير متاح' : formatNumber(decision.expectedImpact)}</span>
                      <span>الفعلي: {decision.actualImpact == null ? 'غير متاح' : formatNumber(decision.actualImpact)}</span>
                      <span>التعلم: {decision.outcomeStatus ?? 'غير مسجل'}</span>
                      {decision.outcomeQuality != null && <span>جودة النتيجة: {formatNumber(decision.outcomeQuality)}</span>}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-ink-400">
                    <span>السجل محفوظ وقابل للتتبع</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {decision.status === 'PROPOSED' && decision.approvalStatus !== 'PENDING' && (
                    <button type="button" disabled={decisionAction[decision.id] === 'saving'} onClick={() => requestApproval(decision)} className="btn-primary text-[10px] disabled:opacity-50" data-testid={'request-approval-' + decision.id}>
                      {decisionAction[decision.id] === 'saving' ? 'جارٍ طلب الموافقة...' : decisionAction[decision.id] === 'requested' ? 'تم طلب الموافقة' : 'طلب الموافقة'}
                    </button>
                  )}

                  {decision.status === 'PROPOSED' && decision.approvalStatus === 'PENDING' && (
                    currentUserId === decision.approvalRequestedBy ? (
                      <span className="rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-2 text-[9px] font-black text-warning-900">بانتظار صاحب صلاحية آخر — يمنع الاعتماد الذاتي</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => decideApproval(decision, true)} disabled={!decision.approvalId || decisionAction[decision.id] === 'approving'} className="btn-primary text-[10px] disabled:opacity-50" data-testid={'approve-decision-' + decision.id}>
                          {decisionAction[decision.id] === 'approving' ? 'جارٍ الاعتماد...' : 'اعتماد القرار'}
                        </button>
                        <button type="button" onClick={() => decideApproval(decision, false)} disabled={!decision.approvalId || decisionAction[decision.id] === 'rejecting'} className="btn-secondary text-[10px] disabled:opacity-50" data-testid={'reject-decision-' + decision.id}>
                          {decisionAction[decision.id] === 'rejecting' ? 'جارٍ الرفض...' : 'رفض القرار'}
                        </button>
                      </div>
                    )
                  )}

                  {decision.status === 'APPROVED' && !decision.workItemId && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 text-[9px] font-bold text-ink-600">
                        الموعد
                        <input
                          type="date"
                          value={workDueAt[decision.id] ?? ''}
                          onChange={(event) => setWorkDueAt((current) => ({ ...current, [decision.id]: event.target.value }))}
                          className="bg-transparent outline-none"
                          aria-label="موعد عنصر العمل"
                        />
                      </label>
                      <button type="button" disabled={decisionAction[decision.id] === 'creating-work'} onClick={() => createWorkItem(decision)} className="btn-primary text-[10px] disabled:opacity-50" data-testid={'create-work-' + decision.id}>
                        {decisionAction[decision.id] === 'creating-work' ? 'جارٍ إنشاء عنصر العمل...' : 'إنشاء عنصر عمل لي'}
                      </button>
                    </div>
                  )}

                  {decision.workItemStatus === 'OPEN' && decision.workItemId && (
                    <button type="button" disabled={decisionAction[decision.id] === 'starting-work'} onClick={() => startWorkItem(decision)} className="btn-secondary text-[10px] disabled:opacity-50" data-testid={'start-work-' + decision.id}>
                      {decisionAction[decision.id] === 'starting-work' ? 'جارٍ بدء التنفيذ...' : 'بدء التنفيذ'}
                    </button>
                  )}

                  {decision.workItemStatus === 'IN_PROGRESS' && decision.workItemId && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={actualImpact[decision.id] ?? ''}
                        onChange={(event) => setActualImpact((current) => ({ ...current, [decision.id]: event.target.value }))}
                        placeholder="الأثر الفعلي (اختياري)"
                        aria-label="الأثر الفعلي"
                        className="min-h-9 w-44 rounded-lg border border-ink-200 bg-white px-2.5 text-[10px] outline-none focus:border-primary-400"
                      />
                      <button type="button" disabled={decisionAction[decision.id] === 'completing-work'} onClick={() => completeWorkItem(decision)} className="btn-primary text-[10px] disabled:opacity-50" data-testid={'complete-work-' + decision.id}>
                        {decisionAction[decision.id] === 'completing-work' ? 'جارٍ إغلاق التنفيذ...' : 'إغلاق التنفيذ'}
                      </button>
                    </div>
                  )}

                  {decision.workItemStatus === 'COMPLETED' && (
                    <span className="rounded-lg bg-success-50 px-2.5 py-2 text-[9px] font-black text-success-800">اكتمل التنفيذ والنتيجة مسجلة</span>
                  )}
                </div>
              </div>

              {decisionAction[decision.id] === 'start-error' && <div className="mt-3 text-[9px] font-bold text-danger-700">تعذر بدء التنفيذ؛ تحقق من المكلّف وحالة القرار.</div>}
              {decisionAction[decision.id] === 'impact-error' && <div className="mt-3 text-[9px] font-bold text-danger-700">الأثر الفعلي يجب أن يكون رقمًا صالحًا.</div>}
              {decisionAction[decision.id] === 'complete-error' && <div className="mt-3 text-[9px] font-bold text-danger-700">تعذر إغلاق التنفيذ؛ يحتاج المسار إلى قرار معتمد ودليل مصدر صالح.</div>}
              {decisionAction[decision.id] === 'evidence-error' && <div className="mt-3 text-[9px] font-bold text-danger-700">لا توجد الدليل Snapshot حقيقية مرتبطة بالتقرير؛ تم منع إغلاق التنفيذ.</div>}
              {decisionAction[decision.id] === 'work-error' && <div className="mt-3 text-[9px] font-bold text-danger-700">تعذر إنشاء عنصر العمل؛ تحقق من الصلاحية وأن القرار معتمد.</div>}
              {decisionAction[decision.id] === 'error' && <div role="alert" className="mt-3 text-[9px] font-bold text-danger-700">تعذر طلب الموافقة؛ الصلاحية أو حالة القرار تحتاج مراجعة.</div>}
              {decisionAction[decision.id] === 'approval-error' && <div role="alert" className="mt-3 text-[9px] font-bold text-danger-700">تعذر اعتماد/رفض القرار؛ تحقق من الصلاحية وحالة الموافقة.</div>}
              {decision.status === 'REJECTED' && <div className="mt-3 rounded-lg border border-danger-200 bg-danger-50 p-3 text-[9px] font-bold text-danger-800">REJECTED · القرار لم ينتقل إلى التنفيذ.</div>}
              {decision.workItemStatus === 'IN_PROGRESS' && (
                <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-[9px] leading-5 text-warning-900">
                  لقطة الدليل المطلوبة للإغلاق: {evidenceSnapshotId || 'غير متاحة'} — لا يمكن إغلاق المهمة دون الدليل Snapshot حقيقية.
                </div>
              )}
            </article>
          )) : (
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-[10px] text-ink-600">لا توجد قرارات مصدرية محفوظة بعد لهذا المصدر.</div>
          )}
        </div>
      </section>

      <section id="decision-evidence-inspector" className="rounded-[18px] border border-primary-200 bg-primary-50/40 p-5 shadow-sm" aria-label="مفتش القرار والدليل">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="section-kicker">EVIDENCE / القرار INSPECTOR</div>
            <h3 className="mt-1 text-lg font-black text-ink-950">سلسلة التتبع الكاملة</h3>
            <p className="mt-1 text-[10px] leading-5 text-ink-600">كل عقدة هنا تأتي من سجل canonical مرتبط بنفس المصدر والمستأجر؛ عند غياب العقدة تظهر كغير متاح بدل إنشاء قيمة بديلة.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={'/reports/smart/' + report.jobId + '?sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-secondary text-[9px]">فتح المصدر</Link>
            <Link to={'/decision-experience?reportJobId=' + report.jobId + '&sourceHash=' + encodeURIComponent(report.sourceHash) + '&stage=evidence'} className="btn-primary text-[9px]">فتح تجربة القرار</Link>
          </div>
        </div>

        {decisions[0] ? (() => {
          const traced = decisions[0];
          const nodes = [
            {
              key: 'source',
              label: 'Source Report',
              value: report.sourceHash.slice(0, 24) + '…',
              detail: report.sourceAnalysis?.id ? 'الدليل Snapshot: ' + report.sourceAnalysis.id : 'الدليل Snapshot: غير متاح',
              tone: report.sourceAnalysis?.id ? 'success' : 'warning',
            },
            {
              key: 'recommendation',
              label: 'Recommendation',
              value: traced.recommendationTitle ?? traced.recommendationId ?? 'غير متاح',
              detail: traced.recommendationId
                ? 'id=' + traced.recommendationId + ' · ' + (traced.recommendationStatus ?? 'غير متاح')
                : 'لا يوجد Recommendation مرتبط',
              tone: traced.recommendationId ? 'success' : 'warning',
            },
            {
              key: 'decision',
              label: 'Decision',
              value: traced.signalTitle ?? traced.decisionKey,
              detail: 'id=' + traced.id + ' · ' + traced.status,
              tone: 'primary',
            },
            {
              key: 'approval',
              label: 'Approval',
              value: traced.approvalStatus ?? 'غير متاح',
              detail: traced.approvalId ? 'id=' + traced.approvalId : 'لم يُطلب اعتماد بعد',
              tone: traced.approvalStatus === 'APPROVED' ? 'success' : traced.approvalStatus === 'PENDING' ? 'warning' : 'neutral',
            },
            {
              key: 'work',
              label: 'Action / Work',
              value: traced.workItemStatus ?? 'غير متاح',
              detail: traced.workItemId ? 'id=' + traced.workItemId : 'لا يوجد عنصر عمل',
              tone: traced.workItemStatus === 'COMPLETED' ? 'success' : traced.workItemStatus === 'IN_PROGRESS' ? 'primary' : 'neutral',
            },
            {
              key: 'outcome',
              label: 'Outcome',
              value: traced.outcomeStatus ?? 'NOT AVAILABLE',
              detail: traced.outcomeId
                ? 'id=' + traced.outcomeId + ' · الدليل: ' + (traced.outcomeEvidenceSnapshotId ?? 'غير متاح')
                : 'لا توجد نتيجة محفوظة بعد',
              tone: traced.outcomeStatus === 'positive' ? 'success' : traced.outcomeStatus === 'negative' ? 'danger' : traced.outcomeStatus ? 'warning' : 'neutral',
            },
          ] as const;

          return (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {nodes.map((node) => (
                <article key={node.key} className="rounded-xl border border-ink-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className={'h-2 w-2 rounded-full ' + (
                      node.tone === 'success' ? 'bg-success-500' :
                      node.tone === 'warning' ? 'bg-warning-500' :
                      node.tone === 'danger' ? 'bg-danger-500' :
                      node.tone === 'primary' ? 'bg-primary-500' :
                      'bg-ink-300'
                    )}/>
                    <span className="text-[9px] font-black text-ink-500">{node.label}</span>
                  </div>
                  <div className="mt-2 break-words text-[11px] font-black text-ink-900">{node.value}</div>
                  <div className="mt-1 break-all text-[9px] leading-5 text-ink-500">{node.detail}</div>
                </article>
              ))}
            </div>
          );
        })() : (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-white p-5 text-center text-[10px] text-ink-500">
            لا يوجد Decision مرتبط بهذا المصدر حتى الآن؛ تبقى السلسلة عند الدليل ولا يتم اختراع Recommendation أو Action.
          </div>
        )}
      </section>

      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck size={19} className="mt-0.5 text-primary-700"/>
          <div>
            <div className="text-[9px] font-black tracking-[.12em] text-primary-700">القرار EVIDENCE</div>
            <h2 className="mt-1 text-xl font-black">مسار القرار لهذا التقرير فقط</h2>
            <p className="mt-2 text-sm leading-7 text-ink-600">
              القرار الحالي: <strong>{stateLabel(output.decisionStatus)}</strong>. الموافقة: <strong>{stateLabel(output.approvalStatus)}</strong>. التنفيذ: <strong>{stateLabel(output.actionStatus)}</strong>. النتيجة: <strong>{stateLabel(output.outcomeStatus)}</strong>.
            </p>
            <p className="mt-2 text-xs leading-6 text-ink-500">لن تظهر توصيات أو تنبيهات عامة للشركة هنا ما لم يوجد ارتباط مصدرّي مثبت بها.</p>
          </div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <StatusCell label="التعلّم" value={output.learningStatus}/>
        <StatusCell label="Replay" value={output.replayStatus}/>
        <StatusCell label="المعيار المقارن" value={output.benchmarkStatus}/>
        <StatusCell label="الدليل" value={report.evidenceStatus}/>
      </section>
      <Link to={'/decision-experience?reportJobId=' + report.jobId + '&sourceHash=' + encodeURIComponent(report.sourceHash) + '&stage=evidence'} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink-950 px-4 text-xs font-black text-white">فتح مسار القرار <ArrowLeft size={13}/></Link>
      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm" aria-label="سجل نشاط القرار">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.12em] text-primary-700">ACTIVITY / AUDIT</div>
            <h3 className="mt-1 text-lg font-black text-ink-950">سجل ما حدث للقرار</h3>
            <p className="mt-1 text-[10px] leading-5 text-ink-500">الخط الزمني يقرأ من audit_logs للقرار والموافقة والعمل والنتيجة؛ لا يصنع نشاطًا محليًا بديلًا.</p>
          </div>
          <button type="button" onClick={() => decisions[0] && void refreshAudit(decisions[0])} disabled={auditLoading} className="btn-secondary text-[10px] disabled:opacity-50">
            {auditLoading ? 'جارٍ القراءة...' : 'تحديث السجل'}
          </button>
        </div>
        {auditTrace.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-4 text-[10px] text-ink-500">لا يوجد نشاط تدقيق متاح لهذا المسار حتى الآن.</div>
        ) : (
          <ol className="mt-4 space-y-2">
            {auditTrace.slice(-12).reverse().map((event) => (
              <li key={event.id} className="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-ink-700">{event.action}</span>
                  <span className="text-[9px] text-ink-400">{event.entityType}</span>
                  <span className="mr-auto text-[9px] text-ink-400">{new Date(event.createdAt).toLocaleString('ar-YE')}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-ink-500">
                  <span>المصدر: {event.source ?? 'غير متاح'}</span>
                  <span>الفاعل: {event.userLabel ?? 'غير متاح'}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function WorkMode({ report }: { report: SmartReportDetail }) {
  const lastStage = report.stages.length ? report.stages[report.stages.length - 1] : null;
  return (
    <>
      <ReportIntelligencePanel report={report} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCell label="Job" value={report.checkpointStage ?? lastStage?.status}/>
        <StatusCell label="Action" value={report.renderedOutput.actionStatus}/>
        <StatusCell label="النتيجة" value={report.renderedOutput.outcomeStatus}/>
        <StatusCell label="التعلّم" value={report.renderedOutput.learningStatus}/>
      </section>
      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
        <div className="text-[9px] font-black tracking-[.12em] text-primary-700">DURABLE LIFECYCLE</div>
        <div className="mt-4 space-y-2">
          {report.stages.length ? report.stages.map((stage) => {
            const completed = stage.status === 'completed';
            const failed = stage.status === 'failed';
            return <div key={stage.ordinal} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-50/50 p-3">
              {completed ? <CheckCircle2 size={16} className="shrink-0 text-success-700"/> : failed ? <XCircle size={16} className="shrink-0 text-danger-700"/> : <Clock3 size={16} className="shrink-0 text-ink-400"/>}
              <div className="min-w-0 flex-1"><div className="text-xs font-black">{stage.ordinal}. {STAGE_LABELS[stage.stage] ?? stage.stage}</div><div className="text-[10px] text-ink-500">{stage.status} · attempt {stage.attempt}</div></div>
              <div className="text-[10px] text-ink-400">{stage.completedAt ? new Date(stage.completedAt).toLocaleString('ar-YE') : 'غير مكتمل'}</div>
            </div>;
          }) : <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-xs text-warning-900">لا توجد مراحل محفوظة لهذا التقرير.</div>}
        </div>
      </section>
      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><FileSearch size={17} className="text-primary-700"/><h2 className="text-lg font-black">حد التنفيذ</h2></div>
        <p className="mt-2 text-xs leading-6 text-ink-600">اكتمال مراحل استيراد التقرير لا يعني وجود Action أو Outcome. التنفيذ التجاري يحتاج سجلًا مستقلًا؛ غيابه يبقى معلنًا.</p>


      </section>
    </>
  );
}

export function SourceBoundReportSurface({ mode, jobId, expectedSourceHash }: { mode: SourceBoundReportMode; jobId: string; expectedSourceHash?: string | null }) {
  const [report, setReport] = useState<SmartReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hash = expectedSourceHash?.trim() ?? '';
      const next = await fetchSmartReport(jobId, hash);
      if (!next) throw new Error('REPORT_SOURCE_NOT_FOUND');
      if (expectedSourceHash && next.sourceHash !== expectedSourceHash) throw new Error('REPORT_SOURCE_HASH_MISMATCH');
      setReport(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [jobId, expectedSourceHash]);

  useEffect(() => {
    let active = true;
    const hash = expectedSourceHash?.trim() ?? '';
    void fetchSmartReport(jobId, hash).then((next) => {
      if (!active) return;
      if (!next) throw new Error('REPORT_SOURCE_NOT_FOUND');
      if (hash && next.sourceHash !== hash) throw new Error('INVALID_REPORT_CONTEXT');
      setReport(next);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [jobId, expectedSourceHash]);

  const body = useMemo(() => {
    if (!report) return null;
    if (mode === 'executive') return <ExecutiveMode report={report}/>;
    if (mode === 'trust') return <TrustMode report={report}/>;
    if (mode === 'decision') return <DecisionMode report={report}/>;
    return <WorkMode report={report}/>;
  }, [mode, report]);

  if (loading) return <div dir="rtl"><LoadingState message="جارٍ تحميل النتيجة المصدرية..." /></div>;
  if (error) return <div dir="rtl"><ErrorState message={error} onRetry={() => void loadReport()} /></div>;
  if (!report) return null;

  return (
    <div dir="rtl" className="space-y-5 animate-fade-in pb-10">
      <SourceHeader report={report}/>
      {body}
    </div>
  );
}