import { AlertTriangle, ArrowLeft, FileText, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import { formatCurrency, formatNumber } from '@/lib/format';
import { parseNumber } from '@/lib/file-engine/normalizer';
import type { SmartReportDetail } from '@/lib/report-smart';
import { selectExecutiveRecommendation, selectExecutiveSignal } from '@/lib/report-intelligence/report-smart-insights';
import { BusinessDataExplorer } from '@/components/SourceBoundReportSurface';

const SPECIALTY_LABELS: Record<string, string> = {
  sales: 'المبيعات',
  sales_qty: 'صافي المبيعات',
  incoming: 'الوارد',
  net_inbound: 'صافي الوارد',
  opening_stock: 'الرصيد الافتتاحي',
  daily_sales_rate: 'معدل البيع اليومي',
  stockout_days: 'أيام حتى النفاد',
  purchases: 'المشتريات',
  inventory: 'المخزون',
  receivables: 'الذمم والتحصيل',
  profitability: 'الربحية',
  payments: 'المدفوعات والسيولة',
};

const FIELD_LABELS: Record<string, string> = {
  product_name: 'الصنف',
  item_name: 'الصنف',
  item: 'الصنف',
  product: 'الصنف',
  customer_name: 'العميل',
  customer: 'العميل',
  supplier_name: 'المورد',
  supplier: 'المورد',
  invoice_number: 'رقم الفاتورة',
  invoice_date: 'تاريخ الفاتورة',
  due_date: 'تاريخ الاستحقاق',
  quantity: 'الكمية',
  qty: 'الكمية',
  amount: 'المبلغ',
  total_amount: 'الإجمالي',
  local_amount: 'الإجمالي',
  total: 'الإجمالي',
  paid_amount: 'المدفوع',
  balance: 'الرصيد',
  outstanding_balance: 'الرصيد المستحق',
  current_stock: 'المخزون الحالي',
  stock: 'المخزون',
  unit_cost: 'تكلفة الوحدة',
  cost: 'التكلفة',
  value: 'القيمة',
  sales: 'المبيعات',
  purchases: 'المشتريات',
  profit: 'الربح',
  gross_profit: 'الربح الإجمالي',
  margin: 'الهامش',
  gross_margin: 'الهامش الإجمالي',
  category: 'الفئة',
  warehouse: 'المستودع',
  date: 'التاريخ',
  status: 'الحالة',
};

function compactFieldLabel(value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) return 'حقل';
  const normalized = key.toLowerCase().replace(/[\s_-]+/g, '');
  const match = Object.entries(FIELD_LABELS).find(([candidate]) =>
    normalized === candidate.toLowerCase().replace(/[\s_-]+/g, ''),
  );
  return match?.[1] ?? 'مؤشر تشغيلي';
}

function reportTitle(report: SmartReportDetail): string {
  const label = SPECIALTY_LABELS[report.specialty ?? ''];
  return label ? 'تقرير ' + label : 'تقرير أعمال ذكي';
}

function reportContextLabel(report: SmartReportDetail): string {
  const specialty = SPECIALTY_LABELS[report.specialty ?? ''] ?? 'تحليل أعمال';
  return 'تحليل ' + specialty + ' من المصدر الحالي';
}

function friendlyState(value: unknown): string {
  const labels: Record<string, string> = {
    VERIFIED: 'موثق',
    TRUSTED: 'موثوق',
    REVIEW: 'مراجعة مطلوبة',
    BLOCKED: 'محظور',
    PROPOSED: 'مقترح',
    APPROVED: 'معتمد',
    REJECTED: 'مرفوض',
    COMPLETED: 'مكتمل',
    IN_PROGRESS: 'قيد التنفيذ',
    OPEN: 'مفتوح',
    PENDING: 'بانتظار الإجراء',
    PENDING_EVIDENCE: 'الدليل النهائي غير مثبت',
    AWAITING_EVIDENCE_SNAPSHOT: 'لا توجد لقطة دليل مثبتة',
    SIGNALS_PRESENT: 'إشارات مثبتة',
    READY: 'جاهز للقرار',
    PARTIAL_ANALYSIS: 'تحليل جزئي',
    NOT_AVAILABLE: 'غير متاح',
    INSUFFICIENT_SAMPLE: 'العينة غير كافية',
    INSUFFICIENT_DATA: 'البيانات غير كافية',
  };
  const key = String(value ?? '').trim();
  return labels[key] ?? (key ? 'حالة مسجلة' : 'غير متاح');
}

function parseNumeric(value: unknown): number | null {
  return parseNumber(value);
}

function normalizeBusinessKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function businessField(value: unknown): string | null {
  const key = normalizeBusinessKey(value);
  const aliases: Record<string,string[]> = {
    date: ['date','invoice_date','التاريخ','تاريخ الفاتورة'],
    invoice_number: ['invoice_number','invoice number','رقم الفاتورة','رقم الفاتوره'],
    invoice_type: ['invoice_type','invoice type','نوع الفاتورة','نوع الفاتوره'],
    customer_name: ['customer_name','customer','اسم العميل','العميل'],
    supplier_name: ['supplier_name','supplier','اسم المورد','المورد'],
    product_name: ['product_name','product','item_name','item','name','اسم الصنف','اسم المنتج','الصنف'],
    total: ['total','total_amount','الإجمالي','الاجمالي','اجمالي الفاتورة','اجمالي الفاتوره'],
    net_amount: ['net_amount','مبلغ الصافي بالمحلي','الصافي بالمحلي'],
    balance: ['balance','الرصيد','الرصيد المستحق','outstanding_balance'],
    credit: ['credit','دائن'],
    debit: ['debit','مدين'],
    quantity: ['quantity','qty','الكمية','العدد'],
    price: ['price','السعر'],
    cost: ['cost','التكلفة'],
    profit: ['profit','الربح'],
    margin: ['margin','الهامش'],
  };
  for (const [canonical, values] of Object.entries(aliases)) {
    if (values.some((candidate) => normalizeBusinessKey(candidate) === key)) return canonical;
  }
  return null;
}

function rowValue(row: Record<string, unknown>, field: string): unknown {
  if (row[field] != null && row[field] !== '') return row[field];
  const target = businessField(field);
  if (!target) return row[field];
  const entry = Object.entries(row).find(([key, value]) => businessField(key) === target && value != null && value !== '');
  return entry?.[1] ?? row[field];
}

function reportColumns(report: SmartReportDetail) {
  const isArtifactHeader = (value: string) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(value.trim()) || /^20\d{2}-?$/.test(value.trim());
  const dataset = report.sourceAnalysis?.datasets?.[0];
  const columns = dataset && typeof dataset === 'object' && Array.isArray((dataset as Record<string, unknown>).columns)
    ? (dataset as Record<string, unknown>).columns as unknown[]
    : [];
  const rows = report.canonicalRows.map((row) => row.data);
  const result = new Map<string, { key: string; name: string; mappedField: string | null; statistics?: Record<string, unknown> }>();
  for (const item of columns) {
    const column = item && typeof item === 'object' ? item as Record<string, unknown> : { name: String(item ?? '') };
    const name = String(column.name ?? column.mappedField ?? '').trim();
    if (!name || isArtifactHeader(name)) continue;
    const mapped = String(column.mappedField ?? businessField(name) ?? '').trim() || null;
    const key = mapped ?? name;
    if (!result.has(key)) result.set(key, { key, name, mappedField: mapped, statistics: column.statistics && typeof column.statistics === 'object' ? column.statistics as Record<string, unknown> : undefined });
  }
  for (const row of rows.slice(0, 500)) {
    for (const name of Object.keys(row)) {
      const mapped = businessField(name);
      if (mapped && !result.has(mapped)) result.set(mapped, { key: mapped, name, mappedField: mapped });
    }
  }
  return [...result.values()];
}

function isAggregateCustomerRow(row: Record<string, unknown>): boolean {
  const label = String(row.customer_name ?? row['اسم العميل'] ?? row.supplier_name ?? row['اسم المورد'] ?? '').trim();
  if (/^(?:الإجمالي|اجمالي|المجموع|total|grand\s+total)\s*:?[\s]*$/iu.test(label)) return true;
  const invoice = String(row.invoice_number ?? row['رقم الفاتوره'] ?? '').trim();
  const date = String(row.date ?? row.invoice_date ?? row['التاريخ'] ?? '').trim();
  const amount = parseNumeric(row.total ?? row.total_amount ?? row['اجمالي الفاتوره'] ?? row.net_amount ?? row['مبلغ الصافي بالمحلي']);
  return !invoice && !date && amount != null;
}

function executableRows(report: SmartReportDetail) {
  return report.canonicalRows
    .map((row) => row.data)
    .filter((row) => !isAggregateCustomerRow(row));
}

function numericColumns(report: SmartReportDetail) {
  const rows = executableRows(report);
  const preferences: Record<string, string[]> = {
    sales: ['total', 'paid_amount', 'profit', 'margin', 'quantity', 'balance'],
    purchases: ['total', 'paid_amount', 'profit', 'margin', 'quantity', 'balance'],
    receivables: ['balance', 'age_over_120', 'age_90_120', 'age_61_90', 'age_31_60'],
    payments: ['balance', 'credit', 'debit'],
    inventory: ['balance', 'current_stock', 'sales_qty', 'incoming', 'net_inbound', 'opening_stock', 'quantity', 'value', 'price', 'cost'],
  };
  const preferred = preferences[report.specialty ?? ''] ?? ['total','amount','value','balance','paid_amount','quantity','profit','margin'];
  const rank = (field: string | null) => {
    const key = String(field ?? '');
    const index = preferred.indexOf(key);
    return index >= 0 ? index : 999;
  };
  return reportColumns(report)
    .map((column) => {
      const field = column.mappedField ?? column.key;
      const values = rows.map((row) => parseNumeric(rowValue(row, field))).filter((value): value is number => value != null);
      if (!values.length) return null;
      return { ...column, value: values.reduce((sum, value) => sum + value, 0), priority: rank(column.mappedField) };
    })
    .filter((item): item is { key: string; name: string; mappedField: string | null; value: number; priority: number; statistics?: Record<string, unknown> } => Boolean(item))
    .sort((a, b) => a.priority - b.priority || Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 4);
}

function contributionRows(report: SmartReportDetail) {
  const rows = executableRows(report);
  const fields = reportColumns(report);
  const dimension = ['customer_name','supplier_name','product_name','category','warehouse']
    .map((field) => fields.find((column) => String(column.mappedField) === field))
    .find(Boolean);
  const measure = ['total','sales','purchases','profit','balance','value','outstanding_balance','net_amount']
    .map((field) => fields.find((column) => String(column.mappedField) === field))
    .find(Boolean);
  if (!dimension || !measure) return [];
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const name = String(rowValue(row, dimension.mappedField ?? dimension.key) ?? '').trim();
    const value = parseNumeric(rowValue(row, measure.mappedField ?? measure.key));
    if (!name || value == null) continue;
    grouped.set(name, (grouped.get(name) ?? 0) + value);
  }
  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 6);
}

export function CustomerReportSurface({
  report,
  expectedSpecialty,
  title,
}: {
  report: SmartReportDetail;
  expectedSpecialty: string;
  title: string;
}) {
  const actualMatches = report.specialty === expectedSpecialty;
  const displayTitle = 'تقرير ' + title;
  const metrics = numericColumns(report);
  const contractMetric = (() => {
    if (expectedSpecialty === 'inventory') {
      return {
        label: 'عدد الأصناف',
        value: actualMatches ? (report.authoritativeCurrentRowCount ?? report.rowCount ?? null) : null,
        kind: 'count' as const,
      };
    }
    const totalMetric = metrics.find((item) => {
      const field = String(item.mappedField ?? '').trim();
      return field === 'total' || field === 'sales' || field === 'purchases' || field === 'net_amount';
    });
    return {
      label: expectedSpecialty === 'purchases' ? 'إجمالي المشتريات' : 'إجمالي المبيعات',
      value: actualMatches ? (totalMetric?.value ?? null) : null,
      kind: 'money' as const,
    };
  })();
  const contributors = contributionRows(report);
  const advisor = report.intelligence.advisorBrief;
  const topSignal = selectExecutiveSignal(report.intelligence);
  const topRecommendation = selectExecutiveRecommendation(report.intelligence, topSignal);
  const dataset = report.sourceAnalysis?.datasets?.[0];
  const rawColumns = dataset && typeof dataset === 'object' && Array.isArray((dataset as Record<string, unknown>).columns)
    ? (dataset as Record<string, unknown>).columns as Array<Record<string, unknown>>
    : [];

  return (
    <div dir="rtl" className="report-page space-y-5 animate-fade-in pb-12">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1424] p-5 text-white shadow-[0_24px_70px_-36px_rgba(15,23,42,.9)] lg:p-7">
        <div className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-52 w-52 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-[9px] font-black tracking-[.16em] text-amber-200">
            <FileText size={14} /> الأغبري · مستشار الأعمال
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 tracking-normal text-slate-300">مصدر محدد</span>
          </div>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight lg:text-4xl">{displayTitle}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{reportContextLabel(report)} — ما يراه العميل هنا هو معنى التقرير وقرار الأعمال، وليس أسماء أعمدة الملف الخام.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={'/reports/smart/' + encodeURIComponent(report.jobId) + '?sourceHash=' + encodeURIComponent(report.sourceHash)} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-[#111827] hover:bg-amber-200">فتح التقرير الذكي <ArrowLeft size={14} /></Link>
              <Link to={'/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black text-white hover:bg-white/10">الدليل والقرار <ArrowLeft size={14} /></Link>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5"><div className="text-[9px] text-slate-400">سجلات التقرير</div><div className="mt-1 text-xl font-black">{report.rowCount == null ? 'غير متاح' : formatNumber(report.rowCount)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5"><div className="text-[9px] text-slate-400">جودة المصدر</div><div className="mt-1 text-xl font-black">{report.qualityScore == null ? 'غير متاح' : report.qualityScore + '%'}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5"><div className="text-[9px] text-slate-400">الثقة</div><div className="mt-1 text-xl font-black">{friendlyState(report.trustState ?? report.sourceTrustState)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5"><div className="text-[9px] text-slate-400">حالة القرار</div><div className="mt-1 text-xl font-black">{friendlyState(report.renderedOutput.decisionStatus)}</div></div>
          </div>
        </div>
      </section>

      {!actualMatches && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
          المصدر الحالي مصنّف كـ{SPECIALTY_LABELS[report.specialty ?? ''] ?? 'تحليل عام'}؛ لم يتم تحويله إلى تقرير {title} غير مثبت.
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.12em] text-indigo-700"><Sparkles size={15} /> القراءة التنفيذية</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">ماذا يعني التقرير للإدارة؟</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">{advisor?.headline ?? 'لا توجد خلاصة استشارية مثبتة بعد؛ يعرض النظام ما يمكن إثباته فقط ولا يملأ الفراغ بتخمين.'}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black text-slate-400">أهم نتيجة</div><div className="mt-1 text-sm font-black text-slate-950">{advisor?.topFinding?.title ?? 'لا توجد نتيجة مثبتة'}</div><p className="mt-1 text-[10px] leading-5 text-slate-600">{advisor?.topFinding?.statement ?? 'لا توجد قراءة كافية من المصدر الحالي.'}</p></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"><div className="flex items-center gap-1 text-[9px] font-black text-amber-800"><AlertTriangle size={12}/> أهم خطر</div><div className="mt-1 text-sm font-black text-amber-950">{advisor?.topRisk?.title ?? 'لا يوجد خطر مثبت'}</div><p className="mt-1 text-[10px] leading-5 text-amber-900">{advisor?.topRisk?.statement ?? 'لا يوجد خطر يمكن إثباته من البيانات الحالية.'}</p></div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4"><div className="text-[9px] font-black text-indigo-800">الخطوة التالية</div><div className="mt-1 text-sm font-black text-slate-950">{topRecommendation?.title ?? advisor?.recommendedAction ?? 'تحقق من الدليل'}</div><p className="mt-1 text-[10px] leading-5 text-slate-600">{topRecommendation?.action ?? advisor?.expectedOutcome ?? 'لا يوجد إجراء مؤهل قبل اكتمال الإثبات.'}</p></div>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.12em] text-slate-500"><ShieldCheck size={15} />الثقة</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">هل يصلح التقرير لاتخاذ قرار؟</h2>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[9px] text-slate-400">حالة الإثبات</div>
            <div className="mt-1 text-lg font-black text-slate-950">{friendlyState(report.reportVerificationState ?? report.evidenceStatus)}</div>
            <div className="mt-1 text-[10px] leading-5 text-slate-600">لا تتحول القراءة إلى توصية تنفيذية عندما يكون المصدر غير مكتمل أو غير موثق.</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] text-slate-400">التحليل</div><div className="mt-1 text-sm font-black">{friendlyState(report.sourceAnalysis?.analysisStatus)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] text-slate-400">اعتماد السجلات</div><div className="mt-1 text-sm font-black">{report.canonicalCommitVerified ? 'موثق' : 'غير مكتمل'}</div></div>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-[10px] font-black tracking-[.12em] text-indigo-700">المؤشرات التجارية</div><h2 className="mt-1 text-xl font-black text-slate-950">الأرقام التي تهم القرار</h2><p className="mt-1 text-[10px] text-slate-500">تُعرض بأسماء أعمال مفهومة بدل أسماء الأعمدة الخام.</p></div>
          <div className="text-[10px] font-bold text-slate-400">{metrics.length} مؤشرات رئيسية</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/55 p-4">
            <div className="text-[10px] font-bold text-indigo-700">{contractMetric.label}</div>
            <div className="mt-2 text-2xl font-black tabular-nums text-slate-950">
              {contractMetric.value == null
                ? 'غير متاح'
                : contractMetric.kind === 'count'
                  ? formatNumber(contractMetric.value)
                  : formatCurrency(contractMetric.value)}
            </div>
            <div className="mt-1 text-[9px] leading-5 text-slate-500">
              {actualMatches ? 'من السجلات الكانونية الحالية.' : 'القيمة غير متاحة لأن المصدر الحالي لا يثبت هذا التخصص.'}
            </div>
          </div>
          {metrics.slice(0, 3).map(({ mappedField, value }, index) => (
            <div key={(mappedField ?? 'field') + index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-bold text-slate-500">{compactFieldLabel(mappedField ?? '')}</div>
              <div className="mt-2 text-2xl font-black tabular-nums text-slate-950">{/amount|total|sales|purchase|profit|value|balance|cost|revenue|مبلغ|إجمالي|مبيعات|مشتريات|ربح|قيمة|رصيد|تكلفة/i.test(mappedField ?? '') ? formatCurrency(value) : formatNumber(value)}</div>
            </div>
          ))}
          {!metrics.length && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:col-span-2 lg:col-span-4">لا يوجد مؤشر مالي أو تشغيلي مكتمل بما يكفي لعرضه كحقيقة رقمية.</div>}
        </div>
      </section>

      <BusinessDataExplorer report={report} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black tracking-[.12em] text-indigo-700">مسار القرار</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">من الحقيقة إلى التنفيذ</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['الدليل', friendlyState(report.evidenceStatus)],
              ['التوصية', friendlyState(report.renderedOutput.recommendationStatus)],
              ['القرار', friendlyState(report.renderedOutput.decisionStatus)],
              ['النتيجة', friendlyState(report.renderedOutput.outcomeStatus)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-950">{value}</div></div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={'/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2.5 text-[10px] font-black text-white">فتح الدليل والقرار <ArrowLeft size={13}/></Link>
            <Link to="/work-center" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black text-slate-800">مركز العمل <ArrowLeft size={13}/></Link>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-[#111827] p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.12em] text-amber-200"><TrendingUp size={14}/>الإشارة</div>
          <h2 className="mt-1 text-xl font-black">أقوى إشارة في التقرير</h2>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-black">{topSignal?.title ?? 'لا توجد إشارة استثنائية مثبتة'}</div>
            <p className="mt-2 text-[11px] leading-6 text-slate-300">{topSignal?.message ?? 'المصدر الحالي لم يثبت انحرافًا يستحق رفعه كتنبيه.'}</p>
            <div className="mt-3 rounded-xl bg-white/5 p-3"><div className="text-[9px] font-black text-amber-200">الخطوة التالية</div><div className="mt-1 text-[10px] leading-5 text-slate-200">{topRecommendation?.action ?? 'لا إجراء قبل مراجعة الدليل.'}</div></div>
          </div>
        </div>
      </section>

      <details className="group rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-[10px] font-black tracking-[.12em] text-slate-500">تفاصيل الدليل</div><div className="mt-1 text-base font-black text-slate-950">تفاصيل المصدر عند الحاجة فقط</div><div className="mt-1 text-[10px] text-slate-500">التفاصيل الخام ليست الواجهة الرئيسية للعميل.</div></div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] font-black text-slate-600">عرض الدليل</span>
          </div>
        </summary>
        <div className="border-t border-slate-100 p-5 lg:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] text-slate-400">نوع المصدر</div><div className="mt-1 text-sm font-black">{report.sourceAnalysis?.sourceFormat ?? 'غير متاح'}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] text-slate-400">الحقول المكتشفة</div><div className="mt-1 text-sm font-black">{rawColumns.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] text-slate-400">حالة الكاننة</div><div className="mt-1 text-sm font-black">{report.canonicalCommitVerified ? 'مكتملة' : 'تحتاج مراجعة'}</div></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {rawColumns.slice(0, 12).map((column, index) => (
              <span key={String(column.name ?? index)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[9px] font-black text-slate-700">{compactFieldLabel(column.mappedField ?? column.name)}</span>
            ))}
          </div>
          {contributors.length ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-black text-slate-500">أبرز المساهمين بالقيمة</div>
              <div className="mt-3 space-y-2">
                {contributors.map((row, index) => (
                  <div key={row.name + index} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"><span className="truncate text-xs font-bold text-slate-800">{row.name}</span><span className="shrink-0 text-xs font-black text-slate-950">{formatNumber(row.value ?? 0)}</span></div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[10px] leading-5 text-indigo-900">تم فصل التفاصيل الخام عن سطح القرار عمدًا. اسم المصدر والبصمة الكاملة يبقيان في طبقة التدقيق ولا يُستخدمان كعنوان للمستخدم.</div>
        </div>
      </details>
    </div>
  );
}
