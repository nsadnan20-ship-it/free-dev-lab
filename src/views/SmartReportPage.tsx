import { CommercialValueChain } from '@/components/CommercialValueChain';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileSearch, ShieldCheck, Search, Columns3, ArrowDownUp, Download, RotateCcw } from 'lucide-react';
import { Link, useParams, useSearchParams } from '@/lib/router-compat';
import { ErrorState, LoadingState, PageHeader, userFacingError } from '@/components/ui/States';
import { fetchSmartReport, type SmartReportDetail } from '@/lib/report-smart';
import { selectExecutiveRecommendation, selectExecutiveSignal } from '@/lib/report-intelligence/report-smart-insights';
import { ReportIntelligencePanel } from '@/components/ReportIntelligencePanel';
import { SmartReportAdvisorySurface } from '@/components/SmartReportAdvisorySurface';
import { ReportDecisionCockpit } from '@/components/ReportDecisionCockpit';
import { formatNumber } from '@/lib/format';
import { parseNumber } from '@/lib/file-engine/normalizer';
import { downloadReportArtifact } from '@/lib/report-execution/download';
import { BusinessDataExplorer } from '@/components/SourceBoundReportSurface';
import { UniversalIntelligenceChain } from '@/components/UniversalIntelligenceChain';
import { GenericFileIntelligenceCard } from '@/components/GenericFileIntelligenceCard';
import { buildUniversalReportIntelligence } from '@/lib/universal-report-intelligence';
import { SourceValueBrief, type BriefSource } from '@/components/SourceValueBrief';

function textValue(value: unknown): string {
  if (value == null || value === '') return 'غير متاح';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function stateLabel(value: string | null): string {
  const labels: Record<string, string> = {
    TRUSTED: 'موثوق',
    REVIEW: 'مراجعة',
    BLOCKED: 'محظور',
    VERIFIED: 'موثق',
    ACCEPTED: 'مقبول',
    UNVERIFIED: 'غير موثق بعد',
    LEGACY_UNRESOLVED: 'تحقق تاريخي يحتاج إعادة إثبات',
    READY: 'جاهز للقرار',
    OPEN: 'مفتوح',
    IN_PROGRESS: 'قيد التنفيذ',
    COMPLETED: 'مكتمل',
    FAILED: 'فشل',
    PENDING: 'قيد المراجعة',
    AVAILABLE: 'متاح',
    CALCULATED: 'محسوب',
    OBSERVED: 'مرصود',
    FULL_SOURCE: 'المصدر كامل',
    PARTIAL_FETCH_CEILING: 'تحليل جزئي — حد القراءة 50,000',
    PARTIAL_FETCH_ERROR: 'تحليل جزئي — تعذر قراءة جزء من المصدر',
    AWAITING_EVIDENCE_SNAPSHOT: 'الدليل النهائي غير مثبت',
    AVAILABLE_FROM_CANONICAL_ANALYSIS: 'متاح من التحليل الكانوني',
    NOT_COMMITTED: 'غير معتمد',
    NO_DECISION_COMMITTED: 'لا قرار معتمد',
    NO_ACTION_COMMITTED: 'لا إجراء معتمد',
    NOT_AVAILABLE: 'غير متاح',
    INSUFFICIENT_SAMPLE: 'عينة غير كافية',
    PENDING_EVIDENCE: 'الدليل النهائي غير مثبت',
    GAP_DETECTED: 'فجوة اعتماد مكتشفة',
    SIGNALS_PRESENT: 'إشارات مثبتة',
    NO_EXCEPTIONAL_SIGNALS: 'لا توجد إشارات استثنائية',
    REVIEW_REQUIRED: 'المراجعة مطلوبة',
    PROPOSED: 'مقترح',
    PARTIAL_ANALYSIS: 'تحليل جزئي',
    INSUFFICIENT_DATA: 'البيانات غير كافية',
    NOT_READY: 'غير جاهز',
  };
  return value ? (labels[value] ?? (value.includes('_') ? 'حالة تحتاج مراجعة' : value)) : 'غير متاح';
}

type SmartColumn = {
  name?: string;
  dataType?: string;
  nullCount?: number;
  mappingConfidence?: number;
  statistics?: { sum?: number; mean?: number; min?: number; max?: number; count?: number };
  mappedField?: string | null;
};

function numberValue(value: unknown): number | null {
  return parseNumber(value);
}

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().normalize('NFKC').replace(/[\s_\-]+/g, '');
}

function formatMetric(value: number | null): string {
  return value == null ? 'غير متاح' : new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(value);
}

function dataKey(column: SmartColumn | null | undefined): string {
  return String(column?.mappedField ?? column?.name ?? '').trim();
}

function displayColumnLabel(column: string): string {
  const key = String(column ?? '').trim();
  const normalized = key.toLowerCase().replace(/[\s_-]+/g, '');
  const labels: Record<string, string> = {
    balance: 'الرصيد', credit: 'دائن', debit: 'مدين', amount: 'المبلغ', total: 'الإجمالي',
    net_amount: 'صافي المبلغ', gross_amount: 'الإجمالي قبل الخصم', subtotal: 'المجموع الفرعي',
    tax_amount: 'الضريبة', paid_amount: 'المدفوع', invoice_number: 'رقم الفاتورة', invoice_date: 'تاريخ الفاتورة',
    customer_name: 'اسم العميل', supplier_name: 'اسم المورد', product_name: 'اسم الصنف', quantity: 'الكمية',
    date: 'التاريخ', currency: 'العملة', invoice_type: 'نوع الفاتورة', unit_price: 'سعر الوحدة', price: 'السعر',
    item_name: 'اسم الصنف', sku: 'رمز الصنف', warehouse: 'المستودع', category: 'الفئة',
    description: 'الوصف', account_name: 'الحساب', account_number: 'رقم الحساب', movement_number: 'رقم الحركة',
    'دائن': 'دائن', 'الرصيد': 'الرصيد', 'مدين': 'مدين',
    'الصنف': 'اسم الصنف', 'اسم الصنف': 'اسم الصنف', 'المادة': 'اسم الصنف', 'اسم المادة': 'اسم الصنف',
    'الخامة': 'اسم الصنف', 'اسم الخامة': 'اسم الصنف', 'الخامات': 'اسم الصنف',
    'العميل': 'اسم العميل', 'اسم العميل': 'اسم العميل', 'المورد': 'اسم المورد', 'اسم المورد': 'اسم المورد',
    'رقم الصنف': 'رمز الصنف', 'كود الصنف': 'رمز الصنف', 'رمز الصنف': 'رمز الصنف', 'الوحدة': 'الوحدة',
    'البيان': 'الوصف', 'الوصف': 'الوصف', 'التاريخ 2026-': 'التاريخ',
    'رقم الحركة': 'رقم الحركة', 'رقم السند': 'رقم المستند',
    current_stock: 'الرصيد الحالي', opening_stock: 'الرصيد الافتتاحي', inbound: 'الوارد', net_inbound: 'صافي الوارد',
    transfers_pending: 'تحويل غير مستلم', sales_qty: 'صافي المبيعات', daily_sales_rate: 'معدل البيع اليومي', annual_sales_rate: 'معدل البيع العام',
    stockout_days: 'الفترة المتوقعة للنفاد (يوم)', stock_age_days: 'عمر المخزون', stock_age_period_days: 'عمر المخزون للفترة',
    'العبوه': 'العبوة', 'العبوة': 'العبوة', 'الرصيد الإفتتاحي': 'الرصيد الافتتاحي', 'الـوارد': 'الوارد',
    'تحويل غير مستلم': 'تحويل غير مستلم', 'صافي الوارد': 'صافي الوارد', 'صافي مبيعات مرحل': 'صافي مبيعات مرحل', 'صافي مبيعات لم يرحل': 'صافي مبيعات لم يرحل',
    'صافي المبيعات': 'صافي المبيعات', 'معدل البيع ليومي': 'معدل البيع اليومي', 'معدل البيع العام': 'معدل البيع العام',
    'الفترةالمتوقعةلنفادالكمية': 'الفترة المتوقعة للنفاد (يوم)', 'عمرالمخزون': 'عمر المخزون', 'عمرالمخزونللفترة': 'عمر المخزون للفترة',
  };
  const exact = labels[key] ?? labels[normalized];
  if (exact) return exact;
  if (/التاريخ/.test(key)) return 'التاريخ';
  if (/اسم.?الصنف|الخامة/.test(key)) return 'اسم الصنف';
  if (/اسم.?العميل/.test(key)) return 'اسم العميل';
  if (/اسم.?المورد/.test(key)) return 'اسم المورد';
  if (/الرصيد/.test(key)) return 'الرصيد';
  if (/دائن/.test(key)) return 'دائن';
  if (/مدين/.test(key)) return 'مدين';
  return key || 'حقل المصدر';
}


function canonicalFieldName(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const key = normalizeKey(raw);
  const aliases: Array<[string,string[]]> = [
    ['date',['date','invoice_date','التاريخ','تاريخ الفاتورة','التاريخ 2026-']],
    ['invoice_number',['invoice_number','invoice number','رقم الفاتورة','رقم الفاتوره']],
    ['invoice_type',['invoice_type','invoice type','نوع الفاتورة','نوع الفاتوره']],
    ['customer_name',['customer_name','customer','client','اسم العميل','العميل']],
    ['supplier_name',['supplier_name','supplier','اسم المورد','المورد']],
    ['product_name',['product_name','product','item_name','item','name','اسم الصنف','اسم المنتج','الصنف','المادة','اسم المادة','الخامة','اسم الخامة']],
    ['sku',['sku','product_code','productcode','item_code','رقم الصنف','كود الصنف','رمز الصنف']],
    ['current_stock',['current_stock','currentstock','stock','balance','الرصيد','الرصيد الحالي','المخزون الحالي','الكمية المتوفرة','الكمية المتاحة']],
    ['daily_sales_rate',['daily_sales_rate','dailysalesrate','معدل البيع اليومي','معدل البيع ليومي']],
    ['annual_sales_rate',['annual_sales_rate','annualsalesrate','معدل البيع العام','معدل البيع السنوي']],
    ['stockout_days',['stockout_days','stockoutdays','الفترة المتوقعة لنفاد الكمية','الفترةالمتوقعةلنفادالكمية','أيام النفاد']],
    ['stock_age_days',['stock_age_days','stockagedays','عمر المخزون','عمرالمخزون']],
    ['stock_age_period_days',['stock_age_period_days','stockageperioddays','عمر المخزون للفترة','عمرالمخزونللفترة']],
    ['total',['total','total_amount','اجمالي الفاتورة','اجمالي الفاتوره','الإجمالي','الاجمالي']],
    ['net_amount',['net_amount','مبلغ الصافي بالمحلي','مبلغ صافي المحلي','الصافي بالمحلي']],
    ['paid_amount',['paid_amount','paid','المدفوع']],
    ['balance',['balance','الرصيد','الرصيد المستحق','outstanding_balance']],
    ['credit',['credit','دائن']],
    ['debit',['debit','مدين']],
    ['quantity',['quantity','qty','الكمية','العدد']],
    ['unit_price',['unit_price','سعر الوحدة']],
    ['cost',['cost','cost_price','التكلفة']],
    ['price',['price','السعر']],
    ['category',['category','الفئة','التصنيف']],
    ['warehouse',['warehouse','المستودع','المخزن']],
    ['opening_stock',['opening_stock','openingstock','الرصيد الافتتاحي','الرصيدالإفتتاحي','المخزون الافتتاحي']],
    ['net_inbound',['net_inbound','netinbound','صافي الوارد','صافيوارد']],
    ['sales_qty',['sales_qty','salesqty','صافي المبيعات','صافيالمبيعات','كمية المبيعات']],
  ];
  for (const [canonical, candidates] of aliases) {
    if (candidates.some(candidate => normalizeKey(candidate) === key)) return canonical;
  }
  return null;
}

function valueForColumn(row: Record<string, unknown>, column: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, column) && row[column] != null && row[column] !== '') return row[column];
  const target = canonicalFieldName(column);
  if (!target) return row[column];
  for (const [key, value] of Object.entries(row)) {
    if (canonicalFieldName(key) === target && value != null && value !== '') return value;
  }
  return row[column];
}

function normalizedDatasetColumns(report: SmartReportDetail | null): SmartColumn[] {
  const dataset = report?.sourceAnalysis?.datasets?.[0];
  if (!dataset || typeof dataset !== 'object') return [];
  const rawColumns = Array.isArray((dataset as Record<string, unknown>).columns)
    ? (dataset as Record<string, unknown>).columns as unknown[]
    : [];
  return rawColumns.map((column): SmartColumn | null => {
    if (column && typeof column === 'object') {
      const item = column as Record<string, unknown>;
      const sourceName = String(item.name ?? item.mappedField ?? '').trim();
      if (!sourceName) return null;
      return {
        name: sourceName,
        mappedField: String(canonicalFieldName(sourceName) ?? item.mappedField ?? '').trim() || null,
        dataType: String(item.dataType ?? ''),
        nullCount: Number.isFinite(Number(item.nullCount)) ? Number(item.nullCount) : undefined,
        mappingConfidence: Number.isFinite(Number(item.mappingConfidence)) ? Number(item.mappingConfidence) : undefined,
        statistics: item.statistics && typeof item.statistics === 'object'
          ? item.statistics as SmartColumn['statistics']
          : undefined,
      };
    }
    const sourceName = String(column ?? '').trim();
    return sourceName ? {
      name: sourceName,
      mappedField: canonicalFieldName(sourceName),
      mappingConfidence: canonicalFieldName(sourceName) ? 85 : 0,
    } : null;
  }).filter((item): item is SmartColumn => Boolean(item));
}

function uniqueBusinessColumns(columns: SmartColumn[], rows: Array<Record<string, unknown>>): SmartColumn[] {
  const byKey = new Map<string, SmartColumn>();
  const add = (column: SmartColumn) => {
    const key = String(column.mappedField ?? canonicalFieldName(column.name) ?? column.name ?? '').trim();
    if (!key) return;
    const current = byKey.get(key);
    if (!current || Number(column.mappingConfidence ?? 0) > Number(current.mappingConfidence ?? 0)) byKey.set(key, column);
  };
  columns.forEach(add);
  for (const row of rows.slice(0, 500)) {
    for (const key of Object.keys(row)) {
      if (/^(page_number|line_number|visual_cell_\d+)$/i.test(key)) continue;
      if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(key.trim()) || /^20\d{2}-?$/.test(key.trim())) continue;
      const mapped = canonicalFieldName(key);
      if (mapped && !byKey.has(mapped)) add({ name: key, mappedField: mapped, mappingConfidence: 80 });
    }
  }
  return [...byKey.values()];
}

function buildSmartAnalysis(report: SmartReportDetail | null) {
  const rows = (report?.canonicalRows ?? [])
    .filter((row) => row && row.data && typeof row.data === 'object')
    .map((row) => row.data as Record<string, unknown>);
  const columns = uniqueBusinessColumns(normalizedDatasetColumns(report), rows);

  const numeric = columns
    .map((column) => {
      const field = String(column.mappedField ?? column.name ?? '').trim();
      const values = rows.map((row) => parseNumber(valueForColumn(row, field))).filter((value): value is number => value != null);
      const sourceStatSum = numberValue(column.statistics?.sum);
      const sum = sourceStatSum != null ? sourceStatSum : values.reduce((total, value) => total + value, 0);
      const mean = numberValue(column.statistics?.mean) ?? (values.length ? sum / values.length : null);
      return { column, sum: values.length || sourceStatSum != null ? sum : null, mean };
    })
    .filter((item) => item.sum != null || item.mean != null);

  const dimensionColumn = columns.find((column) =>
    ['customer_name','supplier_name','product_name','category','warehouse','invoice_number'].includes(
      String(column.mappedField ?? canonicalFieldName(column.name) ?? ''),
    ),
  );
  const amountColumnForRanking = columns.find((column) =>
    ['net_amount','total','total_amount','amount','value','balance','outstanding_balance','paid_amount','quantity','current_stock','stock'].includes(
      String(column.mappedField ?? canonicalFieldName(column.name) ?? ''),
    ),
  );
  const aggregateNamePattern = /^(?:الإجمالي|اجمالي|المجموع|المجموع الكلي|الإجمالي الكلي|total|grand total|subtotal|summary|ملخص)$/i;
  const topRows = dimensionColumn && amountColumnForRanking
    ? [...rows.reduce((groups, row) => {
        const name = String(valueForColumn(row, String(dimensionColumn.mappedField ?? dimensionColumn.name ?? '')) ?? 'غير مسمى').trim() || 'غير مسمى';
        const value = parseNumber(valueForColumn(row, String(amountColumnForRanking.mappedField ?? amountColumnForRanking.name ?? '')));
        if (aggregateNamePattern.test(name) || value == null || !Number.isFinite(value)) return groups;
        groups.set(name, (groups.get(name) ?? 0) + value);
        return groups;
      }, new Map<string, number>()).entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 5)
    : [];

  const completeness = rows.length && columns.length
    ? Math.round(Math.max(0, 100 - (
      columns.reduce((sum, column) => {
        const field = String(column.mappedField ?? column.name ?? '');
        return sum + rows.filter((row) => {
          const value = valueForColumn(row, field);
          return value === null || value === undefined || value === '';
        }).length;
      }, 0) / Math.max(1, rows.length * columns.length) * 100
    )))
    : report?.qualityScore ?? null;

  const findColumn = (...names: string[]) =>
    columns.find((column) => names.some((name) => canonicalFieldName(column.mappedField ?? column.name) === canonicalFieldName(name)));

  const amountColumn = findColumn('total','total_amount','amount','value','net_amount','outstanding_balance','balance');
  const age120Column = findColumn('age_over_120','over_120');
  const age30Column = findColumn('age_0_30','0_30','age030');
  const paidColumn = findColumn('paid_amount','paid');
  const quantityColumn = findColumn('quantity','qty','stock','current_stock','balance');
  const inventoryStockColumn = report?.specialty === 'inventory' ? findColumn('current_stock','stock','balance','quantity','الرصيد','الرصيد الحالي') : null;
  const inventoryStockKey = inventoryStockColumn ? dataKey(inventoryStockColumn) : '';
  const inventoryZeroCount = report?.specialty === 'inventory' ? rows.filter((row) => {
    const value = numberValue(valueForColumn(row, inventoryStockKey));
    return value != null && value <= 0;
  }).length : 0;
  const inventoryLowCoverageCount = report?.specialty === 'inventory' ? (() => {
    const coverage = findColumn('stockout_days','الفترة المتوقعة لنفاد الكمية','أيام النفاد');
    if (!coverage) return 0;
    const key = dataKey(coverage);
    return rows.filter((row) => { const value = numberValue(valueForColumn(row, key)); return value != null && value >= 0 && value <= 30; }).length;
  })() : 0;
  const inventoryStockSum = report?.specialty === 'inventory' && inventoryStockColumn
    ? rows.reduce((sum, row) => {
        const value = numberValue(valueForColumn(row, inventoryStockKey));
        return sum + (value == null ? 0 : value);
      }, 0)
    : null;
  const primaryMetricColumn = report?.specialty === 'inventory' ? inventoryStockColumn : (amountColumn ?? null);

  const metrics = [
    {
      label: report?.specialty === 'receivables' ? 'إجمالي الرصيد المستحق' : report?.specialty === 'inventory' ? 'إجمالي الرصيد الحالي' : 'أهم قيمة مالية',
      value: formatMetric(report?.specialty === 'inventory'
        ? inventoryStockSum
        : primaryMetricColumn
          ? (numberValue(primaryMetricColumn.statistics?.sum) ?? numeric.find((item) => item.column === primaryMetricColumn)?.sum ?? null)
          : null),
      detail: primaryMetricColumn ? displayColumnLabel(String(primaryMetricColumn.mappedField ?? primaryMetricColumn.name ?? '')) : 'لا توجد قيمة رقمية مثبتة',
    },
    {
      label: 'عدد الصفوف',
      value: formatMetric(report?.rowCount == null ? null : report.rowCount),
      detail: 'المصدر الكانوني',
    },
    {
      label: 'اكتمال البيانات',
      value: completeness == null ? 'غير متاح' : `${completeness}%`,
      detail: 'محسوب من الحقول المعروضة',
    },
    {
      label: report?.specialty === 'receivables' ? 'أكثر من 120 يومًا' : report?.specialty === 'inventory' ? 'أصناف بلا رصيد' : 'مؤشر عددي رئيسي',
      value: report?.specialty === 'inventory' ? formatMetric(inventoryZeroCount) : formatMetric(age120Column ? numberValue(age120Column.statistics?.sum) : (numeric[0]?.sum ?? null)),
      detail: report?.specialty === 'inventory' ? 'أصناف بلا رصيد' : (age120Column
        ? displayColumnLabel(String(age120Column.mappedField ?? age120Column.name ?? ''))
        : (numeric[0] ? displayColumnLabel(String(numeric[0].column.mappedField ?? numeric[0].column.name ?? '')) : 'غير متاح')),
    },
  ];

  if (report?.specialty === 'receivables' && age30Column) {
    metrics.push({
      label: '0–30 يومًا',
      value: formatMetric(numberValue(age30Column.statistics?.sum)),
      detail: displayColumnLabel(String(age30Column.mappedField ?? age30Column.name ?? '')),
    });
  } else if (report?.specialty === 'inventory') {
    metrics.push({
      label: 'تغطية ≤ 30 يومًا',
      value: formatMetric(inventoryLowCoverageCount),
      detail: 'عدد الأصناف ذات فترة نفاد مصدرية قصيرة',
    });
  } else if (paidColumn) {
    metrics.push({
      label: 'المدفوع',
      value: formatMetric(numberValue(paidColumn.statistics?.sum)),
      detail: displayColumnLabel(String(paidColumn.mappedField ?? paidColumn.name ?? '')),
    });
  }

  return { columns, preview: [], numeric, completeness, metrics, topRows };
}

function reportVerificationLabel(value: string): string {
  if (value === 'VERIFIED') return 'الدليل النهائي موثق';
  if (value === 'GAP_DETECTED') return 'فجوة في الإثبات';
  return 'الدليل النهائي غير مثبت';
}

function reportRowCountLabel(value: number | null | undefined): string {
  return value == null ? 'عدد السجلات غير متاح' : formatNumber(value) + ' سجل';
}

function EvidenceInspector({ report }: { report: SmartReportDetail }) {
  const gap = report.canonicalCommitGap;
  const verification = report.reportVerificationState;
  const verificationClass = verification === 'VERIFIED'
    ? 'border-indigo-200 bg-indigo-50 text-indigo-900'
    : verification === 'GAP_DETECTED'
      ? 'border-danger-200 bg-danger-50 text-danger-900'
      : 'border-warning-200 bg-warning-50 text-warning-900';
  return (
    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-kicker">فحص الدليل</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">سلسلة الثقة لهذا التقرير</h2>
          <p className="mt-1 text-xs leading-6 text-ink-500">المصدر الموثوق لا يعني أن التقرير موثق نهائيًا. الاعتماد الكانوني يثبت تغطية البيانات، بينما قبول الدليل مرحلة مستقلة.</p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${verificationClass}`}>{reportVerificationLabel(verification)}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-ink-50 p-4"><div className="text-[9px] font-black text-ink-500">نوع التقرير</div><div className="mt-2 text-sm font-black">{report.specialty === 'sales' ? 'تقرير المبيعات' : report.specialty === 'purchases' ? 'تقرير المشتريات' : report.specialty === 'inventory' ? 'تقرير المخزون' : report.specialty === 'receivables' ? 'تقرير الذمم والتحصيل' : report.specialty === 'profitability' ? 'تقرير الربحية' : 'تقرير أعمال ذكي'}</div><div className="mt-1 text-[10px] text-ink-500">الثقة: {stateLabel(report.sourceTrustState ?? report.trustState)}</div></div>
        <div className="rounded-xl bg-ink-50 p-4"><div className="text-[9px] font-black text-ink-500">ارتباط المصدر</div><div className="mt-2 text-sm font-black">مرتبط بالمصدر الأصلي</div><div className="mt-1 text-[10px] text-ink-500">البصمة الكاملة متاحة في تفاصيل التدقيق.</div></div>
        <div className="rounded-xl bg-ink-50 p-4"><div className="text-[9px] font-black text-ink-500">تغطية البيانات</div><div className="mt-2 text-sm font-black">{formatNumber(report.canonicalCommitCount)} سجل</div><div className="mt-1 text-[10px] text-ink-500">{gap == null ? 'حالة الفجوة غير متاحة' : gap > 0 ? `فجوة: ${formatNumber(gap)} سجل` : 'التغطية الكانونية مكتملة'}</div></div>
        <div className="rounded-xl bg-ink-50 p-4"><div className="text-[9px] font-black text-ink-500">حالة التحليل</div><div className="mt-2 text-sm font-black">{stateLabel(report.sourceAnalysis?.analysisStatus ?? 'غير متاح')}</div><div className="mt-1 text-[10px] text-ink-500">{report.sourceAnalysis?.rowCount == null ? 'غير متاح' : `${formatNumber(report.sourceAnalysis.rowCount)} سجلًا محللًا`}</div></div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
          <div className="text-[9px] font-black text-ink-500">حالة الدليل</div>
          <div className="mt-2 text-sm font-black">{stateLabel(report.evidenceStatus)}</div>
          <div className="mt-1 text-[10px] text-ink-500">القبول: {stateLabel(String(report.renderedOutput.evidenceAcceptanceStatus ?? 'غير متاح'))} · الجاهزية: {stateLabel(String(report.renderedOutput.decisionReadiness ?? 'غير متاح'))}</div>
          
        </div>
        <div className={`rounded-xl border p-4 ${verificationClass}`}>
          <div className="text-[9px] font-black">حالة التوثيق</div>
          <div className="mt-2 text-sm font-black">{reportVerificationLabel(verification)}</div>
          <div className="mt-1 text-[10px]">ثقة المصدر: {stateLabel(report.sourceTrustState ?? report.trustState)} · توثيق التقرير: {reportVerificationLabel(verification)}</div>
          {report.renderedOutput.legacyPriorVerification === true ? <div className="mt-2 rounded-lg border border-warning-300 bg-warning-50 px-2 py-1 text-[9px] font-bold text-warning-900">حالة VERIFIED القديمة تم استبدالها بدليل Passport مستقل.</div> : null}
        </div>
      </div>
      <details className="mt-3 rounded-2xl border border-ink-200 bg-ink-50/70 p-4">
        <summary className="cursor-pointer text-[10px] font-black text-ink-700">تفاصيل التدقيق الفني</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-white p-3"><div className="text-[9px] font-black text-ink-500">بصمة المصدر</div><div className="mt-1 break-all font-mono text-[9px] text-ink-500">{report.sourceHash}</div></div>
          <div className="rounded-xl bg-white p-3"><div className="text-[9px] font-black text-ink-500">عملية التقرير</div><div className="mt-1 break-all font-mono text-[9px] text-ink-500">{report.jobId}</div></div>
          <div className="rounded-xl bg-white p-3"><div className="text-[9px] font-black text-ink-500">الاستيراد الكانوني</div><div className="mt-1 text-[10px] text-ink-500">{report.canonicalAnalysisScope === 'FULL_SOURCE' ? 'المصدر الكامل' : 'قراءة جزئية تحتاج مراجعة'}</div></div>
          <div className="rounded-xl bg-white p-3"><div className="text-[9px] font-black text-ink-500">لقطة الدليل</div><div className="mt-1 break-all font-mono text-[9px] text-ink-500">{String(report.renderedOutput.evidenceSnapshotId ?? 'غير موجود')}</div></div>
        </div>
      </details>

      <div className="mt-3 rounded-2xl border border-primary-200 bg-primary-50/45 p-4" aria-label="بوابة الدليل قبل القرار">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black tracking-[0.12em] text-primary-700">بوابة الدليل</div>
            <h3 className="mt-1 text-sm font-black text-ink-950">الاعتماد الكانوني والدليل النهائي مرحلتان منفصلتان</h3>
            <p className="mt-1 text-[10px] leading-5 text-ink-600">اكتمال Commit يثبت تغطية البيانات الكانونية فقط. لا تصبح النتيجة Verified إلا بعد وجود لقطة الدليل صريح مرتبط بالمصدر.</p>
          </div>
          {verification !== 'VERIFIED' ? (
            <Link to="/trust" className="btn-secondary text-[10px]">فتح بوابة الأدلة <ArrowLeft size={12} /></Link>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-3">
            <div className="text-[8px] font-black text-ink-400">التغطية الكانونية</div>
            <div className="mt-1 text-[10px] font-black text-ink-900">{gap == null ? 'غير متاح' : gap > 0 ? `فجوة ${formatNumber(gap)} صف` : report.canonicalCommitVerified ? 'مغطى' : 'غير مثبت'}</div>
          </div>
          <div className="rounded-xl bg-white p-3">
            <div className="text-[8px] font-black text-ink-400">لقطة الدليل</div>
            <div className="mt-1 text-[10px] font-black text-ink-900">{verification === 'VERIFIED' ? 'موجود ومثبت' : report.evidenceStatus === 'AWAITING_EVIDENCE_SNAPSHOT' ? 'لا توجد لقطة دليل مثبتة' : stateLabel(report.evidenceStatus)}</div>
          </div>
          <div className="rounded-xl bg-white p-3">
            <div className="text-[8px] font-black text-ink-400">جاهزية القرار</div>
            <div className="mt-1 text-[10px] font-black text-ink-900">{verification === 'VERIFIED' ? 'الدليل متاح للمراجعة' : 'لا يوجد اعتماد دليلي نهائي بعد'}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function statusTone(value: string | null): string {
  if (value === 'TRUSTED' || value === 'VERIFIED') return 'border-indigo-200 bg-indigo-50 text-indigo-900';
  if (value === 'REVIEW' || value === 'AWAITING_EVIDENCE_SNAPSHOT') return 'border-warning-200 bg-warning-50 text-warning-900';
  return 'border-ink-200 bg-ink-50 text-ink-700';
}


function SourceDataWorkspace({ report, initialSearch }: { report: SmartReportDetail; initialSearch?: string }) {
  const dataset = report.sourceAnalysis?.datasets?.[0];
  const definitionColumns = useMemo(() => normalizedDatasetColumns(report), [report, dataset]);
  const rows = useMemo(() => report.canonicalRows.map((row) => row.data), [report.canonicalRows]);
  const discoveredColumns = useMemo(() => {
    const technical = /^(page_number|line_number|visual_cell_\\d+)$/i;
    const businessColumns = uniqueBusinessColumns(definitionColumns, rows);
    return businessColumns
      .map((column) => String(column.mappedField ?? canonicalFieldName(column.name) ?? column.name ?? '').trim())
      .filter(Boolean)
      .filter((column, index, all) => all.indexOf(column) === index)
      .filter((column) => !technical.test(column) && (rows.length === 0 || rows.some((row) => {
        const value = valueForColumn(row, column);
        return value !== null && value !== undefined && value !== '';
      })));
  }, [definitionColumns, rows]);

  const numericColumns = useMemo(() => discoveredColumns.filter((column) => {
    const values = rows.slice(0, 200).map((row) => numberValue(row[column])).filter((value): value is number => value != null);
    return values.length >= 3;
  }), [discoveredColumns, rows]);

  const storageKey = 'aghbari.report-view.v2.' + report.jobId + '.' + report.sourceHash;
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState(discoveredColumns[0] ?? '');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [showColumns, setShowColumns] = useState(false);
  const [selectedRowNumber, setSelectedRowNumber] = useState<number | null>(null);
  const [groupColumn, setGroupColumn] = useState('');
  const [aggregateColumn, setAggregateColumn] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(discoveredColumns.slice(0, 8));

  useEffect(() => {
    if (initialSearch != null && initialSearch !== '') {
      setSearch(initialSearch);
      setPage(0);
    }
  }, [initialSearch]);

  useEffect(() => {
    if (!discoveredColumns.length) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setSortColumn(discoveredColumns[0]);
        setVisibleColumns(discoveredColumns.slice(0, 8));
        return;
      }
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const savedVisible = Array.isArray(saved.visibleColumns)
        ? saved.visibleColumns.map(String).filter((value) => discoveredColumns.includes(value))
        : [];
      const savedSort = typeof saved.sortColumn === 'string' && discoveredColumns.includes(saved.sortColumn)
        ? saved.sortColumn
        : discoveredColumns[0];
      setVisibleColumns(savedVisible.length ? savedVisible : discoveredColumns.slice(0, 8));
      setSortColumn(savedSort);
      setSortDirection(saved.sortDirection === 'desc' ? 'desc' : 'asc');
      setPageSize([25, 50, 100].includes(Number(saved.pageSize)) ? Number(saved.pageSize) : 50);
      setGroupColumn(typeof saved.groupColumn === 'string' && discoveredColumns.includes(saved.groupColumn) ? saved.groupColumn : '');
      setAggregateColumn(typeof saved.aggregateColumn === 'string' && numericColumns.includes(saved.aggregateColumn) ? saved.aggregateColumn : (numericColumns[0] ?? ''));
    } catch {
      setSortColumn(discoveredColumns[0]);
      setVisibleColumns(discoveredColumns.slice(0, 8));
    }
  }, [storageKey, discoveredColumns]);

  useEffect(() => {
    setSelectedRowNumber(null);
  }, [search, sortColumn, sortDirection, pageSize]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [rows, search]);

  const orderedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const a = valueForColumn(left, sortColumn);
      const b = valueForColumn(right, sortColumn);
      const an = numberValue(a);
      const bn = numberValue(b);
      const comparison = an != null && bn != null ? an - bn : String(a ?? '').localeCompare(String(b ?? ''), 'ar');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  const groupedRows = useMemo(() => {
    if (!groupColumn || !aggregateColumn) return [];
    const groups = new Map<string, { key: string; count: number; sum: number }>();
    for (const row of filteredRows) {
      const key = String(valueForColumn(row, groupColumn) ?? 'غير محدد').trim() || 'غير محدد';
      const value = numberValue(valueForColumn(row, aggregateColumn));
      const current = groups.get(key) ?? { key, count: 0, sum: 0 };
      current.count += 1;
      if (value != null) current.sum += value;
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => b.sum - a.sum).slice(0, 50);
  }, [filteredRows, groupColumn, aggregateColumn]);

  const pageCount = Math.max(1, Math.ceil(orderedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = orderedRows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const persistView = () => window.localStorage.setItem(storageKey, JSON.stringify({ visibleColumns, sortColumn, sortDirection, pageSize, groupColumn, aggregateColumn, savedAt: Date.now() }));
  const resetView = () => {
    setSearch('');
    setSortColumn(discoveredColumns[0] ?? '');
    setSortDirection('asc');
    setPageSize(50);
    setPage(0);
    setGroupColumn('');
    setAggregateColumn(numericColumns[0] ?? '');
    setVisibleColumns(discoveredColumns.slice(0, 8));
    window.localStorage.removeItem(storageKey);
  };
  const exportRows = () => {
    const body = orderedRows.map((row) => visibleColumns.map((column) => '"' + String(valueForColumn(row, column) ?? '').replace(/"/g, '""') + '"').join(','));
    const csv = '\uFEFF' + [visibleColumns.map((value) => '"' + value.replace(/"/g, '""') + '"').join(','), ...body].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (report.sourcePath.replace(/\.[^.]+$/, '') || 'report') + '-view.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    downloadReportArtifact(
      report.sourceHash,
      report.sourcePath,
      visibleColumns,
      orderedRows.map((row) => visibleColumns.reduce<Record<string, unknown>>((result, column) => {
        result[column] = valueForColumn(row, column) ?? '';
        return result;
      }, {})),
      'xlsx',
    );
  };

  return (
    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="section-kicker">مساحة بيانات التقرير</div>
          <h2 className="mt-1 text-lg font-black text-ink-950">استكشاف البيانات الحقيقية</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-ink-500">البحث والفرز وإظهار الأعمدة والتصدير تعمل على الصفوف الكانونية لهذا التقرير، لا على معاينة منفصلة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={persistView} className="btn-primary inline-flex items-center gap-2 text-[10px]">حفظ العرض <CheckCircle2 size={14}/></button>
          <button type="button" onClick={resetView} className="btn-secondary inline-flex items-center gap-2 text-[10px]">إعادة الضبط <RotateCcw size={14}/></button>
          <button type="button" onClick={exportRows} className="btn-secondary inline-flex items-center gap-2 text-[10px]">تصدير CSV <Download size={14}/></button>
          <button type="button" onClick={exportXlsx} className="btn-secondary inline-flex items-center gap-2 text-[10px]">تصدير XLSX <Download size={14}/></button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">البحث داخل التقرير</span>
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"/>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="ابحث داخل كل أعمدة التقرير..." className="min-h-11 w-full rounded-xl border border-ink-200 bg-ink-50/60 py-2 pr-9 pl-3 text-xs outline-none focus:border-primary-400 focus:bg-white" />
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-[10px] font-bold text-ink-600">
          ترتيب
          <select value={sortColumn} onChange={(event) => { setSortColumn(event.target.value); setPage(0); }} className="bg-transparent outline-none">
            {discoveredColumns.map((column) => <option key={column} value={column}>{displayColumnLabel(column)}</option>)}
          </select>
          <button type="button" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')} aria-label="عكس اتجاه الترتيب" className="rounded-lg p-1 hover:bg-white"><ArrowDownUp size={14}/></button>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-[10px] font-bold text-ink-600">
          الصفوف
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} className="bg-transparent outline-none">
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-[10px] font-bold text-ink-600">
          تجميع
          <select value={groupColumn} onChange={(event) => setGroupColumn(event.target.value)} className="bg-transparent outline-none">
            <option value="">بدون تجميع</option>
            {discoveredColumns.map((column) => <option key={column} value={column}>{displayColumnLabel(column)}</option>)}
          </select>
        </label>
        {groupColumn && (
          <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-[10px] font-bold text-ink-600">
            التجميع المالي
            <select value={aggregateColumn} onChange={(event) => setAggregateColumn(event.target.value)} className="bg-transparent outline-none">
              {numericColumns.map((column) => <option key={column} value={column}>{displayColumnLabel(column)}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={() => setShowColumns((value) => !value)} aria-expanded={showColumns} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-[10px] font-bold text-ink-700 hover:bg-ink-50"><Columns3 size={14}/> الأعمدة ({visibleColumns.length}/{discoveredColumns.length})</button>
        <div className="mr-auto text-[10px] text-ink-500">{formatNumber(orderedRows.length)} صف مطابق · {formatNumber(rows.length)} صف كانونـي</div>
      </div>

      {groupColumn && (
        <section className="mt-3 rounded-xl border border-primary-200 bg-primary-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="section-kicker">التحليل المجمع</div>
              <div className="mt-1 text-sm font-black text-ink-950">ملخص التجميع الكانوني</div>
              <div className="mt-1 text-[10px] text-ink-600">التجميع يحسب من الصفوف المفلترة الحالية، وليس من المعاينة.</div>
            </div>
            <div className="text-[9px] text-primary-800">حتى 50 مجموعة معروضة</div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-primary-200 bg-white">
            {groupedRows.length ? (
              <table className="min-w-full text-right text-[10px]">
                <thead className="bg-primary-50"><tr><th className="px-3 py-2 font-black text-primary-900">المجموعة</th><th className="px-3 py-2 font-black text-primary-900">الصفوف</th><th className="px-3 py-2 font-black text-primary-900">المجموع</th></tr></thead>
                <tbody>{groupedRows.map((group) => <tr key={group.key} className="border-t border-primary-100"><td className="px-3 py-2 font-bold text-ink-900">{group.key}</td><td className="px-3 py-2 text-ink-600">{formatNumber(group.count)}</td><td className="px-3 py-2 font-black text-ink-900">{formatNumber(group.sum)}</td></tr>)}</tbody>
              </table>
            ) : <div className="p-5 text-center text-[10px] text-ink-500">لا توجد مجموعات قابلة للحساب بعد.</div>}
          </div>
        </section>
      )}

      {showColumns && (
        <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50/70 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {discoveredColumns.map((column) => {
              const active = visibleColumns.includes(column);
              return <label key={column} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[10px] font-bold text-ink-700"><input type="checkbox" checked={active} onChange={() => setVisibleColumns((current) => active ? current.filter((item) => item !== column) : [...current, column])}/><span className="min-w-0 truncate">{displayColumnLabel(column)}</span></label>;
            })}
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200">
        {visibleRows.length ? (
          <table className="min-w-full text-right text-[10px]">
            <thead className="bg-ink-50"><tr><th className="sticky right-0 bg-ink-50 px-3 py-2 text-ink-400">#</th>{visibleColumns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 font-black text-ink-600">{displayColumnLabel(column)}</th>)}</tr></thead>
            <tbody>{visibleRows.map((row, index) => {
              const rowNumber = safePage * pageSize + index + 1;
              const active = selectedRowNumber === rowNumber;
              return <tr key={rowNumber} onClick={() => setSelectedRowNumber(rowNumber)} className={'cursor-pointer border-t border-ink-100 ' + (active ? 'bg-primary-50/60' : 'hover:bg-ink-50/70')} aria-selected={active}>
                <td className={'sticky right-0 px-3 py-2 font-mono ' + (active ? 'bg-primary-50/80 text-primary-700' : 'bg-white text-ink-400')}>{rowNumber}</td>
                {visibleColumns.map((column) => <td key={column} className="max-w-[280px] whitespace-nowrap px-3 py-2 text-ink-800">{textValue(valueForColumn(row, column))}</td>)}
              </tr>;
            })}</tbody>
          </table>
        ) : <div className="p-8 text-center text-xs text-ink-500">لا توجد صفوف مطابقة لبحثك.</div>}
      </div>

      {selectedRowNumber != null && orderedRows[selectedRowNumber - 1] && (
        <aside className="mt-4 rounded-xl border border-primary-200 bg-primary-50/50 p-4" aria-label="تفاصيل الصف المحدد">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="section-kicker">فحص السجل</div>
              <div className="mt-1 text-sm font-black text-ink-950">تفاصيل الصف #{selectedRowNumber}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={'/trust?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-secondary text-[10px]">الأدلة</Link>
              <Link to={'/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-primary text-[10px]">مسار القرار</Link>
              <button type="button" onClick={() => setSelectedRowNumber(null)} className="btn-secondary text-[10px]">إغلاق</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.keys(orderedRows[selectedRowNumber - 1]).filter((key) => !/^(page_number|line_number|visual_cell_\d+)$/i.test(key)).map((key) => (
              <div key={key} className="rounded-lg border border-ink-100 bg-white p-3">
                <div className="text-[9px] font-black text-ink-400">{displayColumnLabel(key)}</div>
                <div className="mt-1 break-words text-[11px] font-bold text-ink-800">{textValue(valueForColumn(orderedRows[selectedRowNumber - 1], key))}</div>
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] text-ink-500">صفحة {safePage + 1} من {pageCount}</div>
        <div className="flex gap-2"><button type="button" disabled={safePage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="btn-secondary text-[10px] disabled:opacity-40">السابق</button><button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="btn-secondary text-[10px] disabled:opacity-40">التالي</button></div>
      </div>
    </section>
  );
}

export function SmartReportPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const [report, setReport] = useState<SmartReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const expectedSourceHash = searchParams.get('sourceHash')?.trim() ?? '';
    setLoading(true);
    setError(null);
    if (!jobId?.trim() || (expectedSourceHash && !/^sha256:[0-9a-fA-F]{64}$/.test(expectedSourceHash))) {
      setReport(null);
      setError(userFacingError('INVALID_REPORT_CONTEXT'));
      setLoading(false);
      return () => { active = false; };
    }
    void fetchSmartReport(jobId, expectedSourceHash, { signal: AbortSignal.timeout(25000) }).then((next) => {
      if (active) setReport(next)
    }).catch((reason) => {
      if (active) setError(userFacingError(reason instanceof Error ? reason.message : String(reason)));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [jobId, searchParams]);

  const dataset = useMemo(() => {
    const first = report?.sourceAnalysis?.datasets?.[0];
    return first && typeof first === 'object' ? first as Record<string, unknown> : null;
  }, [report]);

  const previewRows = useMemo(() => {
    const preview = dataset?.preview;
    return Array.isArray(preview) ? preview.slice(0, 10).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object') : [];
  }, [dataset]);

  const columns = useMemo(() => {
    const first = previewRows[0];
    return first ? Object.keys(first).slice(0, 8) : [];
  }, [previewRows]);
  const columnLabel = (column: string): string => {
    const labels: Record<string,string> = {
      invoice_number:'رقم الفاتورة',
      invoice_type:'نوع الفاتورة',
      customer:'العميل',
      customer_name:'العميل',
      date:'التاريخ',
      invoice_date:'تاريخ الفاتورة',
      total:'الإجمالي',
      net_amount:'صافي القيمة',
      paid_amount:'المدفوع',
      balance:'الرصيد المستحق',
      credit:'الدائن',
      debit:'المدين',
      quantity:'الكمية',
      unit_price:'سعر الوحدة',
      product:'الصنف',
      product_name:'الصنف',
      supplier:'المورد',
      warehouse:'المستودع',
      status:'الحالة',
    };
    return labels[column] ?? displayColumnLabel(column);
  };

  const smartAnalysis = useMemo(() => buildSmartAnalysis(report), [report]);
  const briefSources = useMemo(() => {
    const groups = new Map<string, BriefSource>();
    for (const row of report?.canonicalRows ?? []) {
      const name = String(row.data._source_sheet ?? report?.sourcePath ?? 'المصدر');
      const group = groups.get(name) ?? { name, rows: [] };
      group.rows.push(row.data);
      groups.set(name, group);
    }
    return [...groups.values()];
  }, [report]);
  const universalIntelligence = useMemo(() => report ? buildUniversalReportIntelligence({
    specialty: report.specialty,
    rowCount: report.rowCount,
    sourceAnalysis: report.sourceAnalysis,
    canonicalRows: report.canonicalRows,
    renderedOutput: report.renderedOutput,
    sourcePath: report.sourcePath,
    sourceHash: report.sourceHash,
    reportJobId: report.jobId,
    archetypeId: report.archetypeId,
    evidenceSnapshotId: typeof report.renderedOutput.evidenceSnapshotId === 'string' ? report.renderedOutput.evidenceSnapshotId : null,
    evidencePassportId: typeof report.renderedOutput.evidencePassportId === 'string' ? report.renderedOutput.evidencePassportId : null,
  }) : null, [report]);

  if (loading) return <div dir="rtl"><LoadingState message="جارٍ بناء التقرير الذكي من المصدر الحقيقي..." /></div>;
  if (error) return <div dir="rtl" className="space-y-5"><PageHeader title="التقرير الذكي" subtitle="تعذر قراءة نتيجة التقرير المربوطة بالمصدر." /><ErrorState message={error} onRetry={() => {
    setLoading(true);
    setError(null);
    const expectedSourceHash = searchParams.get('sourceHash')?.trim() ?? '';
    if (!jobId?.trim() || (expectedSourceHash && !/^sha256:[0-9a-fA-F]{64}$/.test(expectedSourceHash))) {
      setError('INVALID_REPORT_CONTEXT');
      setLoading(false);
      return;
    }
    void fetchSmartReport(jobId, expectedSourceHash).then((next) => {
      setReport(next);
    }).catch((reason) => setError(userFacingError(reason instanceof Error ? reason.message : String(reason)))).finally(() => setLoading(false));
  }} /></div>;
  if (!report) return <div dir="rtl" className="space-y-5"><PageHeader title="التقرير الذكي" subtitle="التقرير المطلوب غير موجود أو غير مكتمل." /><div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-sm text-warning-900">لا توجد مخرجات ذكية مثبتة لهذا التقرير.</div></div>;

  const output = report.renderedOutput;
  const outputs = Array.isArray(output.outputs) ? output.outputs.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
  const surfaceLinks = outputs.filter((item) => typeof item.path === 'string');
  const decisionKeys: Array<[string,string]> = [['recommendationStatus','التوصية'],['decisionStatus','القرار'],['approvalStatus','الموافقة'],['actionStatus','التنفيذ'],['outcomeStatus','النتيجة'],['learningStatus','التعلّم'],['benchmarkStatus','المقارنة'],['replayStatus','إعادة التشغيل']];
  const sourceIsVerified = report.reportVerificationState === 'VERIFIED';
  const businessSummary = report.specialty === 'receivables'
    ? 'هذا المصدر هو تقرير ذمم مدينة. تمت قراءة أرصدة العملاء وشرائح الأعمار من المصدر الكانوني؛ القرارات والتحصيل الفعلي لا تُنسب للمصدر ما لم توجد معاملة موثقة.'
    : report.specialty === 'inventory'
      ? 'هذا المصدر هو تقرير مخزون. المؤشرات المستخرجة تعكس الكميات والقيم التي ظهرت في المصدر، مع فصل البيانات الناقصة عن القيم المؤكدة.'
      : report.specialty === 'sales'
        ? 'هذا المصدر هو تقرير مبيعات. المؤشرات المستخرجة مرتبطة بالمصدر نفسه ولا تعني توقعًا أو نتيجة مستقبلية.'
        : report.specialty === 'purchases'
          ? 'هذا المصدر هو تقرير مشتريات. التحليل يعرض ما ثبت في المصدر، مع إبقاء أثر القرار والتنفيذ منفصلًا.'
          : 'هذا المصدر تم تحليله من بنيته وبياناته الفعلية، وتبقى المخرجات مربوطة بالمصدر دون اختلاق حقائق غير موجودة.';

  const topFinding = report.intelligence.advisorBrief.topFinding;
  const topRisk = report.intelligence.advisorBrief.topRisk;
  const topOpportunity = report.intelligence.advisorBrief.topOpportunity;
  const executiveSignal = selectExecutiveSignal(report.intelligence);
  const primaryRecommendation = selectExecutiveRecommendation(report.intelligence, executiveSignal);

  const advisorHeadline = executiveSignal?.message
    || report.intelligence.advisorBrief.headline
    || 'لا يوجد حكم استشاري مثبت من المصدر الحالي.';
  const advisorAction = primaryRecommendation?.action
    || report.intelligence.advisorBrief.recommendedAction
    || 'لا توجد خطوة تنفيذية مؤهلة قبل اكتمال الدليل.';
  const advisorImpact = primaryRecommendation?.impact
    || executiveSignal?.impact
    || 'الأثر الفعلي غير مثبت؛ لا نخلط بين المتوقع والمتحقق.';
  const advisorWhyNow = primaryRecommendation?.whyNow
    || executiveSignal?.soWhat
    || topFinding?.statement
    || 'لا توجد قرينة إضافية كافية لتحديد سبب الأولوية.';
  const advisorMeasurement = primaryRecommendation?.measurement
    || report.intelligence.advisorBrief.measurement
    || 'لا توجد آلية قياس مثبتة بعد.';
  const advisorDeadline = primaryRecommendation?.deadlineHint || 'التوقيت يحدد بعد اعتماد الدليل والمالك.';
  const advisorOwner = primaryRecommendation?.ownerHint
    || report.intelligence.advisorBrief.ownerHint
    || executiveSignal?.ownerHint
    || 'مالك الإجراء غير محدد.';
  const advisorBlocker = primaryRecommendation?.blocker
    || primaryRecommendation?.limitation
    || report.intelligence.advisorBrief.proofRequirement
    || 'لا يوجد مانع موثق إضافي.';
  const advisorEvidence = executiveSignal?.evidence?.length
    ? executiveSignal.evidence
    : primaryRecommendation?.evidence?.length
      ? primaryRecommendation.evidence
      : topFinding?.evidence ?? [];
  const confidenceLabel =
    report.reportVerificationState === 'VERIFIED' && report.qualityScore != null
      ? `ثقة المصدر ${report.qualityScore}% · الدليل موثق`
      : report.reportVerificationState === 'PARTIAL_ANALYSIS'
        ? 'القراءة جزئية · الذكاء المصدرّي متاح ضمن النطاق المقروء'
        : report.sourceTrustState === 'TRUSTED'
          ? `المصدر موثوق${report.qualityScore != null ? ' · الجودة ' + report.qualityScore + '%' : ''} · الدليل النهائي غير مثبت`
          : 'الذكاء المصدرّي متاح · الدليل النهائي غير مثبت';

  return <div dir="rtl" className="report-page ag-smart-report-surface space-y-5 animate-fade-in pb-10">
    <PageHeader
      title={report.specialty === 'sales' ? 'تقرير المبيعات' : report.specialty === 'purchases' ? 'تقرير المشتريات' : report.specialty === 'inventory' ? 'تقرير المخزون' : report.specialty === 'receivables' ? 'تقرير الذمم والتحصيل' : report.specialty === 'profitability' ? 'تقرير الربحية' : report.specialty === 'payments' ? 'تحليل السيولة والمدفوعات' : 'تقرير أعمال ذكي'}
      subtitle="تقرير ذكي مربوط بالبصمة الأصلية، وليس نسخة تجريبية أو تقريرًا عامًا."
      actions={<div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const url = window.location.origin + '/reports/smart/' + report.jobId + '?sourceHash=' + encodeURIComponent(report.sourceHash);
            void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
          className="btn-secondary inline-flex items-center gap-2 text-xs"
        >
          {copied ? 'تم نسخ الرابط' : 'نسخ رابط التقرير'}
        </button>
        <Link to={'/work-center?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-secondary inline-flex items-center gap-2 text-xs">مركز العمل</Link>
        <Link to={'/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-primary inline-flex items-center gap-2 text-xs">مسار القرار</Link>
        <Link to="/reports" className="btn-secondary inline-flex items-center gap-2 text-xs"><ArrowLeft size={14}/> مركز التقارير</Link>
      </div>}
    />

    <SourceValueBrief sources={briefSources}/>
    <section id="executive-layer" className="executive-hero rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card lg:p-7">
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[10px] font-black tracking-[.12em] text-amber-300">لوحة القرار التنفيذي</div>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-black text-emerald-200">الذكاء المصدرّي متاح</span>
          </div>
          <h2 className="mt-2 text-2xl font-black leading-tight lg:text-3xl">حكم المستشار: ماذا ينبغي أن تعرفه الإدارة الآن؟</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{advisorHeadline}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="ag-report-hero-stat min-h-[108px] rounded-2xl border border-white/10 bg-white/[.045] p-3.5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-indigo-200/25 hover:bg-white/[.065]">
              <div className="flex items-center gap-2 text-[9px] font-black text-slate-400"><ShieldCheck size={13}/> الثقة المصدرية</div>
              <div className="mt-2 text-sm font-black text-white">{stateLabel(report.sourceTrustState ?? report.trustState)}</div>
              <div className="mt-1 text-[9px] text-slate-400">{report.qualityScore == null ? "جودة غير متاحة" : "جودة المصدر " + report.qualityScore + "%"}</div>
            </div>
            <div className="ag-report-hero-stat min-h-[108px] rounded-2xl border border-white/10 bg-white/[.045] p-3.5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-indigo-200/25 hover:bg-white/[.065]">
              <div className="flex items-center gap-2 text-[9px] font-black text-slate-400"><FileSearch size={13}/> السجلات الموثقة</div>
              <div className="mt-2 text-sm font-black text-white">{reportRowCountLabel(report.rowCount)}</div>
              <div className="mt-1 text-[9px] text-slate-400">{report.authoritativeCurrentRowCount == null ? "العدد المعتمد غير متاح" : "المعتمد " + formatNumber(report.authoritativeCurrentRowCount)}</div>
            </div>
            <div className="ag-report-hero-stat min-h-[108px] rounded-2xl border border-white/10 bg-white/[.045] p-3.5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-indigo-200/25 hover:bg-white/[.065]">
              <div className="flex items-center gap-2 text-[9px] font-black text-slate-400"><CheckCircle2 size={13}/> الدليل</div>
              <div className="mt-2 text-sm font-black text-white">{reportVerificationLabel(report.reportVerificationState)}</div>
              <div className="mt-1 text-[9px] text-slate-400">{report.evidenceStatus ? stateLabel(report.evidenceStatus) : "حالة الدليل غير متاحة"}</div>
            </div>
            <div className="ag-report-hero-stat min-h-[108px] rounded-2xl border border-white/10 bg-white/[.045] p-3.5 transition-transform duration-200 hover:-translate-y-0.5 hover:border-indigo-200/25 hover:bg-white/[.065]">
              <div className="flex items-center gap-2 text-[9px] font-black text-slate-400"><ShieldCheck size={13}/> جاهزية القرار</div>
              <div className="mt-2 text-sm font-black text-white">{stateLabel(String(output.decisionReadiness ?? output.decisionStatus ?? "NOT_READY"))}</div>
              <div className="mt-1 text-[9px] text-slate-400">{report.specialty ? "تحليل متخصص" : "تحليل عام من بنية المصدر"}</div>
            </div>
          </div>
          <div className="ag-report-tech-meta mt-3 flex flex-wrap gap-x-4 gap-y-1.5 overflow-hidden rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <span data-testid="smart-report-source" className="min-w-0 truncate text-[9px] font-bold text-slate-300">المصدر: {report.sourcePath}</span>
            <span data-testid="smart-report-source-hash" className="max-w-full truncate font-mono text-[8px] text-slate-500">SHA: {report.sourceHash}</span>
            <span data-testid="smart-report-job-id" className="max-w-full truncate font-mono text-[8px] text-slate-500">JOB: {report.jobId}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[10px] font-bold text-slate-200">{confidenceLabel}</span>
            <span className="rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[10px] font-bold text-slate-200">{reportRowCountLabel(report.rowCount)}</span>
            <span className="rounded-full border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-[10px] font-bold text-slate-200">{report.specialty === 'sales' ? 'المبيعات' : report.specialty === 'purchases' ? 'المشتريات' : report.specialty === 'inventory' ? 'المخزون' : report.specialty === 'receivables' ? 'الذمم والتحصيل' : report.specialty === 'profitability' ? 'الربحية' : 'تحليل عام'}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/25 bg-amber-300/10 p-4">
          <div className="text-[10px] font-black tracking-[.14em] text-amber-300">الخطوة التالية</div>
          <div className="mt-2 text-lg font-black">{primaryRecommendation?.title ?? 'لا يوجد إجراء موصى به للاعتماد الآن'}</div>
          <p className="mt-2 text-xs leading-6 text-slate-300">{primaryRecommendation?.action ?? report.intelligence.advisorBrief.recommendedAction ?? 'يجب التحقق من المصدر قبل تحويله إلى قرار.'}</p>
          <Link to={'/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950">افتح الدليل ثم القرار</Link>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700 bg-white/[.035] p-4">
          <div className="text-[9px] font-black text-slate-400">أهم نتيجة</div>
          <div className="mt-2 text-sm font-black">{executiveSignal?.title ?? topFinding?.title ?? 'لا توجد نتيجة مثبتة بعد'}</div>
          <div className="mt-1 text-[10px] leading-5 text-slate-400">{executiveSignal?.message ?? topFinding?.statement ?? 'لا يتم اختلاق نتيجة عندما لا يثبتها المصدر.'}</div>
        </div>
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[.06] p-4">
          <div className="text-[9px] font-black text-rose-200">أهم خطر</div>
          <div className="mt-2 text-sm font-black">{topRisk?.title ?? 'لا يوجد خطر مثبت'}</div>
          <div className="mt-1 text-[10px] leading-5 text-slate-400">{topRisk?.statement ?? 'لا توجد إشارة خطر مثبتة من المصدر الحالي.'}</div>
        </div>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.05] p-4">
          <div className="text-[9px] font-black text-cyan-200">أهم فرصة</div>
          <div className="mt-2 text-sm font-black">{topOpportunity?.title ?? (executiveSignal?.priority === 'P2' || executiveSignal?.priority === 'P3' ? executiveSignal.title : 'لا توجد فرصة مثبتة')}</div>
          <div className="mt-1 text-[10px] leading-5 text-slate-400">{topOpportunity?.statement ?? 'لا يتم إنشاء فرصة من دون دليل.'}</div>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {smartAnalysis.metrics.slice(0, 4).map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[.045] p-3.5">
            <div className="text-[9px] font-bold text-slate-400">{metric.label}</div>
            <div className="mt-1.5 text-lg font-black text-white">{metric.value}</div>
            <div className="mt-1 truncate text-[9px] text-slate-400">{metric.detail}</div>
          </div>
        ))}
      </div>
    </section>

    {universalIntelligence && (
      <details className="progressive-disclosure rounded-[22px] border border-ink-200 bg-white shadow-card">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">الإثبات التفصيلي</div>
              <div className="mt-1 text-base font-black text-ink-950">كيف وصل التقرير إلى الحكم والقرار المقترح؟</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-500">المسار الكامل والتعيين والدليل متاح للمراجعة، بينما تبقى شاشة العميل مركزة على النتيجة والتصرف.</div>
            </div>
            <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-[10px] font-black text-ink-600">فتح الإثبات</span>
          </div>
        </summary>
        <div className="border-t border-ink-100 p-3 lg:p-4">
          <UniversalIntelligenceChain result={universalIntelligence} />
        </div>
      </details>
    )}

    {!report.specialty && (
      <section aria-label="ذكاء الملف العام" data-testid="smart-report-generic-intelligence">
        <GenericFileIntelligenceCard
          intelligence={report.intelligence}
          format={report.sourceAnalysis?.sourceFormat ?? 'generic'}
        />
      </section>
    )}

    <section id="advisor-decision-brief" data-testid="smart-report-advisor-brief" className="rounded-[22px] border border-primary-200 bg-[linear-gradient(145deg,#f5fbf9,#ffffff)] p-5 shadow-card lg:p-7" aria-label="الخلاصة الاستشارية للتقرير">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-kicker text-primary-700">ملخص القرار · ماذا يفعل المدير بهذه المعلومة؟</div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-ink-950">التقرير لا يصف الأرقام؛ يحدد القضية والتصرف التالي</h2>
          <p className="mt-2 max-w-4xl text-xs leading-6 text-ink-600">هذه الطبقة هي نقطة البداية التنفيذية. الأرقام والصفوف التفصيلية أدناه تستخدم لإثبات الحكم، وليست بديلًا عنه.</p>
        </div>
        <span className={'badge ' + (sourceIsVerified ? 'badge-success' : 'badge-warning')}>{sourceIsVerified ? 'الأساس موثق' : 'الدليل يحتاج مراجعة'}</span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-[20px] border border-ink-200 bg-white p-5">
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">الحكم التنفيذي</div>
          <div className="mt-2 text-lg font-black leading-8 text-ink-950">{advisorHeadline}</div>
          <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/70 p-3">
            <div className="text-[9px] font-black text-primary-700">لماذا الآن؟</div>
            <div className="mt-1 text-[11px] leading-6 text-primary-950">{advisorWhyNow}</div>
          </div>
        </article>

        <article className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-5">
          <div className="text-[9px] font-black tracking-[.14em] text-amber-800">ما الذي ينبغي فعله؟</div>
          <div className="mt-2 text-base font-black leading-7 text-amber-950">{advisorAction}</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-white/70 p-3">
              <div className="text-[9px] font-black text-ink-400">المالك</div>
              <div className="mt-1 text-[10px] font-black text-ink-900">{advisorOwner}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white/70 p-3">
              <div className="text-[9px] font-black text-ink-400">المعيار</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-800">{advisorMeasurement}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white/70 p-3">
              <div className="text-[9px] font-black text-ink-400">التوقيت</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-800">{advisorDeadline}</div>
            </div>
          </div>
        </article>
      </div>

      {advisorEvidence.filter((item) => item.startsWith('sample=')).length > 0 && (
        <section className="mt-3 rounded-2xl border border-primary-200 bg-white p-4" aria-label="الدليل الحاسم من المصدر">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="section-kicker text-primary-700">الدليل الحاسم</div>
              <div className="mt-1 text-sm font-black text-ink-950">صفوف فعلية صنعت الإشارة الحالية</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-500">هذه أمثلة مباشرة من المصدر، وليست قيمًا تجريبية أو ملخصات منفصلة.</div>
            </div>
            <span className="rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[9px] font-black text-primary-800">{advisorEvidence.filter((item) => item.startsWith('sample=')).length} أدلة</span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {advisorEvidence.filter((item) => item.startsWith('sample=')).slice(0, 6).map((item) => (
              <div key={item} className="rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-[10px] leading-5 text-ink-800">
                {item.replace(/^sample=/, '')}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="text-[9px] font-black tracking-[.12em] text-ink-400">ماذا يعني ذلك؟</div>
          <div className="mt-2 text-sm font-black leading-6 text-ink-950">{executiveSignal?.soWhat || topRisk?.statement || topFinding?.statement || 'لا توجد دلالة تنفيذية إضافية مثبتة.'}</div>
        </article>
        <article className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="text-[9px] font-black tracking-[.12em] text-ink-400">نطاق الأثر</div>
          <div className="mt-2 text-sm font-black leading-6 text-ink-950">{advisorImpact}</div>
        </article>
        <article className="rounded-2xl border border-warning-200 bg-warning-50/70 p-4">
          <div className="text-[9px] font-black tracking-[.12em] text-warning-700">ما يمنعنا من الجزم؟</div>
          <div className="mt-2 text-sm font-black leading-6 text-warning-950">{advisorBlocker}</div>
        </article>
      </div>

      <div className="mt-3 rounded-2xl border border-ink-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[9px] font-black tracking-[.12em] text-ink-400">دليل الحكم</div>
            <div className="mt-1 text-xs font-black text-ink-950">الادعاءات التالية مرتبطة بالإشارة/التوصية الحالية</div>
          </div>
          <span className="text-[9px] font-bold text-ink-400">{advisorEvidence.length} عناصر دليل</span>
        </div>
        {advisorEvidence.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {advisorEvidence.slice(0, 6).map((item) => (
              <div key={item} className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5 text-[10px] leading-5 text-ink-700">{item}</div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-3 text-[10px] text-warning-900">لا يوجد دليل تفصيلي كافٍ في الحزمة الحالية؛ لذلك لا يتم رفع مستوى الحكم.</div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={'/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-primary text-xs">ابدأ مسار القرار من هذه القضية</Link>
        <Link to={'/work-center?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="btn-secondary text-xs">حوّل التوصية إلى عمل</Link>
      </div>
    </section>

      <BusinessDataExplorer report={report} />

    

    <section id="decision-chain" data-testid="smart-report-decision-chain" className="rounded-[20px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-kicker">WHAT → WHY → SO WHAT → IMPACT → WHAT NEXT → PROOF</div>
          <h2 className="mt-1 text-xl font-black text-ink-950">من الحقيقة إلى قرار قابل للتنفيذ</h2>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">كل بطاقة هنا تقرأ من ناتج التقرير الحالي؛ عندما لا توجد أدلة كافية يظهر ذلك صراحة بدل إنشاء قيمة بديلة.</p>
        </div>
        <span className={'badge ' + (sourceIsVerified ? 'badge-success' : 'badge-warning')}>{sourceIsVerified ? 'الدليل موثق' : stateLabel(report.reportVerificationState)}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['WHAT','ماذا حدث؟',executiveSignal?.message ?? topFinding?.statement ?? report.intelligence.summary ?? businessSummary,'الحقيقة المثبتة من الصفوف والتحليل.'],
          ['WHY','لماذا؟',executiveSignal?.evidence?.[0] ?? topFinding?.evidence?.[0] ?? 'لا يوجد تفسير مصدرّي مثبت إضافي.','الدليل أو الإشارة التي تفسر النتيجة.'],
          ['SO WHAT','ماذا يعني ذلك؟',executiveSignal?.soWhat ?? topFinding?.action ?? 'لا توجد دلالة تنفيذية إضافية مثبتة بعد.','المعنى التشغيلي المنضبط دون تجاوز المصدر.'],
          ['IMPACT','ما الأثر؟',executiveSignal?.impact ?? primaryRecommendation?.impact ?? 'الأثر الفعلي غير متاح ما لم توجد نتيجة مسجلة.','لا نخلط الأثر المتوقع بالنتيجة الفعلية.'],
          ['WHAT NEXT','ما الخطوة التالية؟',primaryRecommendation?.action ?? report.intelligence.advisorBrief.recommendedAction ?? 'لا توجد توصية مصدرية كافية للاعتماد الآن.','التوصية تبقى مقترحًا حتى تُعتمد في مسار القرار.'],
          ['PROOF','ما الدليل؟',sourceIsVerified ? ('VERIFIED · ' + (typeof output.evidenceSnapshotId === 'string' && output.evidenceSnapshotId.trim() ? output.evidenceSnapshotId : 'لقطة دليل موثقة') + ' · ' + report.sourceHash) : 'حالة الدليل: ' + stateLabel(report.reportVerificationState),'المصدر والبصمة ولقطة الدليل هي مرجع الإثبات.'],
        ].map(([english,arabic,value,detail]) => (
          <article key={english} data-testid={'smart-report-' + english.toLowerCase().replaceAll(' ','-')} className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black tracking-[.14em] text-primary-700">{english}</span>
              <span className="text-[9px] font-bold text-ink-400">{english === 'PROOF' ? stateLabel(report.reportVerificationState) : 'من المصدر الحالي'}</span>
            </div>
            <h3 className="mt-2 text-sm font-black text-ink-950">{arabic}</h3>
            <p className="mt-2 text-[11px] leading-6 text-ink-800">{value}</p>
            <p className="mt-2 text-[9px] leading-5 text-ink-500">{detail}</p>
          </article>
        ))}
      </div>
    </section>

    <CommercialValueChain
      stages={[
        {
          label: 'المصدر',
          englishLabel: 'المصدر',
          status: stateLabel(report.sourceTrustState ?? report.trustState),
          detail: (report.specialty === 'sales' ? 'تقرير المبيعات' : report.specialty === 'purchases' ? 'تقرير المشتريات' : report.specialty === 'inventory' ? 'تقرير المخزون' : report.specialty === 'receivables' ? 'تقرير الذمم والتحصيل' : report.specialty === 'profitability' ? 'تقرير الربحية' : report.specialty === 'payments' ? 'تحليل السيولة والمدفوعات' : 'تقرير أعمال ذكي') + ' · ' + reportRowCountLabel(report.rowCount) + ' · ' + (report.sourceAnalysis?.sourceFormat ?? 'غير متاح'),
          tone: report.sourceTrustState === 'VERIFIED' || report.trustState === 'TRUSTED' ? 'trusted' : 'active',
        },
        {
          label: 'الدليل',
          englishLabel: 'الدليل',
          status: report.reportVerificationState === 'VERIFIED' ? 'الدليل النهائي موثق' : report.reportVerificationState === 'GAP_DETECTED' ? 'فجوة في الإثبات' : 'الدليل النهائي غير مثبت',
          detail: 'الذكاء المصدرّي متاح للمراجعة؛ الاعتماد النهائي يحتاج لقطة دليل مثبتة.',
          href: '/decision-experience?stage=evidence&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash),
          tone: report.reportVerificationState === 'VERIFIED' ? 'trusted' : 'attention',
        },
        {
          label: 'الإشارات',
          englishLabel: 'الإشارات',
          status: report.intelligence.signals.length ? report.intelligence.signals.length + ' مثبتة' : 'لا توجد',
          detail: executiveSignal?.title ?? 'لا توجد إشارة استثنائية مثبتة في المصدر الحالي.',
          tone: report.intelligence.signals.length ? 'active' : 'neutral',
        },
        {
          label: 'المستشار',
          englishLabel: 'المستشار',
          status: report.intelligence.recommendations.length ? report.intelligence.recommendations.length + ' توصية' : 'غير متاح',
          detail: report.intelligence.advisorBrief.recommendedAction ?? report.intelligence.guidance.focus ?? 'لا توجد توصية مصدرية كافية حاليًا.',
          tone: report.intelligence.recommendations.length ? 'active' : 'neutral',
          href: '#smart-report-intelligence',
        },
        {
          label: 'القرار',
          englishLabel: 'القرار',
          status: stateLabel(output.decisionStatus == null ? null : String(output.decisionStatus)),
          detail: 'القرار المعتمد لا يُستنتج تلقائيًا من التوصية؛ يبقى منفصلًا وقابلًا للتدقيق.',
          href: '/decision-experience?stage=decision&reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash),
          tone: output.decisionStatus === 'APPROVED' || output.decisionStatus === 'COMMITTED' ? 'trusted' : 'attention',
        },
        {
          label: 'التنفيذ',
          englishLabel: 'التنفيذ',
          status: stateLabel(output.actionStatus == null ? null : String(output.actionStatus)),
          detail: 'مركز العمل هو طبقة التنفيذ؛ لا نخلط بين توصية ذكية وتنفيذ فعلي.',
          href: '/work-center?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash),
          tone: output.actionStatus === 'COMPLETED' || output.actionStatus === 'IN_PROGRESS' ? 'active' : 'neutral',
        },
        {
          label: 'النتيجة',
          englishLabel: 'النتيجة',
          status: stateLabel(output.outcomeStatus == null ? null : String(output.outcomeStatus)),
          detail: output.actualImpact == null ? 'لم تُسجل نتيجة فعلية بعد.' : 'الأثر الفعلي: ' + formatMetric(numberValue(output.actualImpact)),
          href: '/replay?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash),
          tone: output.outcomeStatus === 'OBSERVED' || output.outcomeStatus === 'COMPLETED' ? 'trusted' : 'neutral',
        },
        {
          label: 'التعلم',
          englishLabel: 'التعلّم',
          status: stateLabel(output.learningStatus == null ? null : String(output.learningStatus)),
          detail: 'يظهر هنا فقط ما تم رصده وتثبيته بعد التنفيذ؛ لا تُصنع نتيجة مستقبلية.',
          href: '/benchmark?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash),
          tone: output.learningStatus === 'OBSERVED' || output.learningStatus === 'READY' ? 'trusted' : 'neutral',
        },
      ]}
    />

    <details className="progressive-disclosure rounded-[20px] border border-ink-200 bg-white shadow-card">
      <summary className="cursor-pointer list-none px-5 py-4 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <div><div className="section-kicker">واجهة القرار</div><div className="mt-1 text-base font-black text-ink-950">التفاصيل التنفيذية لمسار القرار</div><div className="mt-1 text-[10px] leading-5 text-ink-500">فتح واجهة القرار الكاملة متاح عند الحاجة، بينما يبقى الملخص التنفيذي هو نقطة البداية.</div></div>
          <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-[10px] font-black text-ink-600">فتح</span>
        </div>
      </summary>
      <div className="border-t border-ink-100 p-3 lg:p-4">
        <ReportDecisionCockpit report={report}/>
      </div>
    </details>

    <details className="progressive-disclosure rounded-[20px] border border-ink-200 bg-white shadow-card">
      <summary className="cursor-pointer list-none px-5 py-4 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="section-kicker">EVIDENCE PASSPORT · المصدر · الإثبات · التفاصيل</div>
            <div className="mt-1 text-base font-black text-ink-950">التفاصيل الكاملة للتقرير</div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">افتحها فقط عندما تحتاج إلى التحقق أو استكشاف البيانات أو المخرجات المتقدمة.</div>
          </div>
          <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-[10px] font-black text-ink-600">استكشاف التفاصيل</span>
        </div>
      </summary>
      <div className="space-y-5 border-t border-ink-100 p-5 lg:p-6">
        <section className="rounded-[18px] border border-ink-200 bg-ink-50/30 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-[linear-gradient(145deg,#111827,#1e293b)] p-4 text-white shadow-[0_16px_40px_-28px_rgba(15,23,42,.7)]"><div className="text-[9px] font-black tracking-[.12em] text-primary-200">الثقة</div><div className="mt-2 text-xl font-black">{stateLabel(report.trustState)}</div><div className="mt-1 text-[10px] text-ink-300">جودة: {report.qualityScore == null ? 'غير متاح' : report.qualityScore + '%'}</div></div>
            <div className="rounded-2xl bg-white p-4"><div className="text-[9px] font-black tracking-[.12em] text-ink-500">المصدر</div><div className="mt-2 font-black text-ink-950">مرتبط بالمصدر الأصلي</div><div className="mt-1 text-[10px] text-ink-500">نوع الملف: {report.sourceAnalysis?.sourceFormat ?? 'غير متاح'} · البصمة محفوظة ضمن سجل التدقيق</div></div>
            <div className="rounded-2xl bg-white p-4"><div className="text-[9px] font-black tracking-[.12em] text-ink-500">السجلات</div><div className="mt-2 text-xl font-black text-ink-950">{report.rowCount == null ? 'غير متاح' : formatNumber(report.rowCount)}</div><div className="mt-1 text-[10px] text-ink-500">المعتمد: {report.authoritativeCurrentRowCount == null ? 'غير متاح' : formatNumber(report.authoritativeCurrentRowCount)}</div></div>
            <div className="rounded-2xl bg-white p-4"><div className="text-[9px] font-black tracking-[.12em] text-ink-500">نوع التقرير</div><div className="mt-2 text-xl font-black text-ink-950">{report.specialty ?? 'عام'}</div><div className="mt-1 text-[10px] text-ink-500">مبني على بنية المصدر الفعلية.</div></div>
          </div>
        </section>
    <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
        <div className="section-kicker">الملخص التنفيذي</div>
        <h2 className="mt-1 text-xl font-black text-ink-950">ماذا يقول هذا التقرير فعليًا؟</h2>
        <p className="mt-3 text-sm leading-7 text-ink-600">{businessSummary}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 font-bold">التخصص: {report.specialty ?? 'عام'}</span>
          <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 font-bold">الصفوف: {reportRowCountLabel(report.rowCount)}</span>
          <span className={'badge ' + (sourceIsVerified ? 'badge-success' : 'badge-warning')}>{sourceIsVerified ? 'التقرير موثق' : report.reportVerificationState === 'GAP_DETECTED' ? 'فجوة اعتماد' : 'الدليل النهائي غير مثبت'}</span>
        </div>
      </div>
      <div className="rounded-[18px] border border-ink-200 bg-ink-950 p-5 text-white shadow-card lg:p-6">
        <div className="section-kicker text-primary-200">الخطوة التالية</div>
        <h2 className="mt-1 text-lg font-black">ما الذي يمكن فعله الآن؟</h2>
        <p className="mt-3 text-[12px] leading-6 text-ink-300">
          {report.renderedOutput.actionStatus === 'NO_ACTION_COMMITTED' ? 'لا توجد عملية تنفيذية موثقة نُفذت بعد؛ يمكن استخدام التقرير كمدخل لمراجعة القرار.' : stateLabel(String(report.renderedOutput.actionStatus ?? null))}
        </p>
        <Link to={"/decision-experience?stage=evidence&reportJobId=" + encodeURIComponent(report.jobId) + "&sourceHash=" + encodeURIComponent(report.sourceHash)} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-xs font-black text-ink-950">افتح مسار القرار الموثق ←</Link>
      </div>
    </section>

    <EvidenceInspector report={report}/>
    {report.runtimeWarnings?.length ? (
      <section className="rounded-2xl border border-warning-200 bg-warning-50 p-4 text-warning-900" aria-label="تحذيرات التشغيل">
        <div className="text-[9px] font-black tracking-[.12em]">قراءة النظام</div>
        <div className="mt-1 text-sm font-black">التقرير استمر رغم وجود أجزاء تعذر قراءتها</div>
        <div className="mt-2 space-y-1">
          {report.runtimeWarnings.map((warning) => <div key={warning} className="text-[10px] leading-5">• {warning}</div>)}
        </div>
      </section>
    ) : null}

    {report.canonicalAnalysisScope === 'PARTIAL_FETCH_CEILING' ? (
      <section className="rounded-2xl border border-warning-200 bg-warning-50 p-4 text-warning-900" aria-label="حد نطاق التحليل">
        <div className="text-[9px] font-black tracking-[.12em]">نطاق التحليل</div>
        <div className="mt-1 text-sm font-black">التحليل هنا جزئي؛ المصدر يتجاوز حد القراءة المباشرة 50,000 صف.</div>
        <div className="mt-1 text-[10px] leading-5">المخرجات المعروضة لا تمثل كامل المصدر. يجب الاعتماد على تجميعات خادمية موثقة قبل أي قرار شامل.</div>
      </section>
    ) : null}

    <ReportIntelligencePanel report={report} />
    <SmartReportAdvisorySurface report={report} />

    <SourceDataWorkspace report={report} initialSearch={searchParams.get('focus') ?? ''}/>

    

    <section aria-label="سياق التقرير والدليل" className="rounded-[16px] border border-slate-700 bg-[#0b1020] p-4 text-white shadow-card">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-[9px] font-black tracking-[.12em] text-slate-400">REPORT JOB ID</div>
          <div  className="mt-1 break-all font-mono text-[10px] text-white">{report.jobId}</div>
        </div>
        <div>
          <div className="text-[9px] font-black tracking-[.12em] text-slate-400">SOURCE HASH</div>
          <div  className="mt-1 break-all font-mono text-[10px] text-white">{report.sourceHash}</div>
        </div>
        <div>
          <div className="text-[9px] font-black tracking-[.12em] text-slate-400">SOURCE</div>
          <div className="mt-1 text-[10px] font-bold text-white">{report.sourcePath}</div>
          <div className="mt-1 text-[9px] text-slate-400">الفترة: غير محددة في المصدر ما لم يثبتها الملف.</div>
        </div>
      </div>
    </section>

    

    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary-600"/><div><div className="section-kicker">الحقيقة → الدليل → الإشارة → الذكاء</div><h2 className="mt-1 text-lg font-black text-ink-950">حالة التقرير الذكي</h2></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(['evidenceStatus','signalStatus','intelligenceStatus'] as const).map((key) => {
          const value = key === 'evidenceStatus' ? (report.evidenceStatus == null ? null : String(report.evidenceStatus)) : (output[key] == null ? null : String(output[key]));
          return <div key={key} className={'rounded-xl border p-4 ' + statusTone(value)}><div className="text-[10px] font-black">{key}</div><div className="mt-2 text-sm font-bold">{stateLabel(value)}</div></div>;
        })}
      </div>
    </section>

    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex items-center gap-2"><FileSearch size={18} className="text-primary-600"/><div><div className="section-kicker">القرار → التنفيذ → النتيجة → التعلّم → المقارنة</div><h2 className="mt-1 text-lg font-black">ما الذي ثبت وما الذي لم يُثبت</h2></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {decisionKeys.map(([key, label]) => <div key={key} className="rounded-xl border border-ink-100 bg-ink-50/70 p-4"><div className="text-[10px] font-black text-ink-500">{label}</div><div className="mt-2 text-sm font-bold text-ink-900">{stateLabel(output[key] == null ? null : String(output[key]))}</div></div>)}
      </div>
    </section>

    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-primary-600"/><div><div className="section-kicker">المخرجات المتاحة</div><h2 className="mt-1 text-lg font-black">الأسطح التي أنشأها مسار التقرير</h2></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {surfaceLinks.map((surface, index) => <Link key={String(surface.key ?? index)} to={String(surface.path) + '?reportJobId=' + encodeURIComponent(report.jobId) + '&sourceHash=' + encodeURIComponent(report.sourceHash)} className="rounded-xl border border-ink-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-sm">
          <div className="text-[9px] font-black tracking-[.12em] text-primary-700">{String(surface.stage ?? 'مخرج')}</div>
          <div className="mt-2 text-sm font-black text-ink-950">{String(surface.label ?? surface.key ?? 'سطح')}</div>
          <div className="mt-2 text-[10px] text-ink-500">مرتبط بالتقرير الحالي · تفاصيل المصدر محفوظة</div>
        </Link>)}
      </div>
    </section>

    {smartAnalysis.topRows.length > 0 && (
      <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
        <div className="section-kicker">{report.specialty === 'receivables' ? 'أعلى مواضع التعرض' : 'أعلى البنود'}</div>
        <h2 className="mt-1 text-lg font-black">أعلى البنود الظاهرة في العينة</h2>
        <div className="mt-4 grid gap-2">
          {smartAnalysis.topRows.map((row, index) => (
            <div key={row.name + index} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black">{index + 1}</span>
                <span className="truncate text-xs font-bold text-ink-900">{row.name}</span>
              </div>
              <span className="shrink-0 text-xs font-black text-ink-950">{formatMetric(row.value)}</span>
            </div>
          ))}
        </div>
      </section>
    )}

    <section className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <div className="flex items-center justify-between gap-3"><div><div className="section-kicker">المصدر المعتمد</div><h2 className="mt-1 text-lg font-black">عينة فعلية من التقرير</h2></div><div className="text-[10px] text-ink-500">{formatNumber(previewRows.length)} صفوف معروضة من العينة</div></div>
      {previewRows.length === 0 ? <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">لا توجد عينة صفوف في لقطة التحليل؛ لا يتم اختلاقها.</div> : <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200"><table className="min-w-full text-right text-[11px]"><thead className="bg-ink-50"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 font-black text-ink-600">{columnLabel(column)}</th>)}</tr></thead><tbody>{previewRows.map((row, index) => <tr key={index} className="border-t border-ink-100">{columns.map((column) => <td key={column} className="max-w-[240px] truncate whitespace-nowrap px-3 py-2 text-ink-800">{textValue(row[column])}</td>)}</tr>)}</tbody></table></div>}
    </section>

    <details className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-card lg:p-6">
      <summary className="cursor-pointer text-[10px] font-black text-ink-600">تفاصيل التتبع الفني</summary>
      <dl className="mt-3 grid gap-3 text-[11px] sm:grid-cols-2">
        <div><dt className="font-bold text-ink-500">Job</dt><dd className="mt-1 break-all font-mono text-ink-900">{report.jobId}</dd></div>
        <div><dt className="font-bold text-ink-500">Import</dt><dd className="mt-1 break-all font-mono text-ink-900">{report.importId ?? 'غير متاح'}</dd></div>
        <div><dt className="font-bold text-ink-500">بصمة المصدر</dt><dd className="mt-1 break-all font-mono text-ink-900">{report.sourceHash}</dd></div>
        <div><dt className="font-bold text-ink-500">Analysis snapshot</dt><dd className="mt-1 break-all font-mono text-ink-900">{report.sourceAnalysis?.id ?? 'غير متاح'}</dd></div>
      </dl>
    </details>
      </div>
    </details>
  </div>;
}