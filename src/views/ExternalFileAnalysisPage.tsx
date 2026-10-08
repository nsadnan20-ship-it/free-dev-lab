import { useMemo, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { AlertCircle, BarChart3, CheckCircle2, Download, FileImage, FileSpreadsheet, FileText, Loader2, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/States';
import { detectFormat } from '@/lib/file-engine/detector';
import { securityScan, computeSHA256 } from '@/lib/file-engine/security';
import { parseFile } from '@/lib/file-engine/adapters';
import { FORMAT_LABELS, MAX_FILE_SIZE, type FileFormat, type Dataset } from '@/lib/file-engine/types';
import { deriveReportIntelligence, type BusinessFinding, type ReportIntelligence } from '@/lib/report-intelligence/report-smart-insights';
import { buildUniversalReportIntelligence } from '@/lib/universal-report-intelligence';
import { buildGenericFileIntelligence } from '@/lib/file-engine/generic-intelligence';
import { UniversalIntelligenceChain } from '@/components/UniversalIntelligenceChain';
import { GenericFileIntelligenceCard } from '@/components/GenericFileIntelligenceCard';

function fileIcon(format: FileFormat) {
  if (['xlsx','xls','xlsm','csv','tsv','ods'].includes(format)) return <FileSpreadsheet size={18}/>;
  if (['pdf','docx','doc','rtf','txt','markdown'].includes(format)) return <FileText size={18}/>;
  if (['jpg','jpeg','png','webp','tiff','bmp'].includes(format)) return <FileImage size={18}/>;
  return <FileText size={18}/>;
}

function inferSpecialty(dataset: Dataset): 'inventory' | 'sales' | 'purchases' | 'receivables' | 'payments' | undefined {
  const normalize = (value: string) => value.toLowerCase().normalize('NFKC').replace(/[\\s_./-]+/g, '');
  const fields = new Set([
    ...dataset.columns.map((column) => column.mappedField).filter(Boolean) as string[],
    ...dataset.columns.map((column) => normalize(column.name)),
  ]);
  const has = (...aliases: string[]) => aliases.some((alias) => fields.has(alias) || [...fields].some((field) => field.includes(alias)));
  if (has('current_stock', 'currentstock', 'stockout_days', 'stockoutdays', 'daily_sales_rate', 'dailysalesrate', 'salesqty') || (has('currentstock', 'الرصيدالحالي', 'المخزونالحالي') && has('productcode', 'salesqty', 'warehouse'))) return 'inventory';
  if (has('supplier_name', 'suppliername', 'المورد') && has('total', 'net_amount', 'netamount')) return 'purchases';
  if (has('balance', 'الرصيدالمستحق', 'المتبقي') && (has('paid_amount', 'paidamount', 'paid', 'المدفوع') || has('credit', 'دائن'))) return 'receivables';
  if (has('paid_amount', 'paidamount', 'paid', 'المدفوع') && !has('total', 'net_amount', 'netamount')) return 'payments';
  if (has('customer_name', 'customername', 'customer', 'client', 'العميل') && has('total', 'net_amount', 'netamount', 'salesqty')) return 'sales';
  if (has('sales_qty', 'salesqty', 'كميةالمبيعات') && (has('product_name', 'productname', 'product', 'item', 'productcode', 'sku') || has('warehouse', 'المستودع'))) return 'inventory';
  return undefined;
}

function buildPreviewIntelligence(dataset: Dataset): ReportIntelligence {
  const specialty = inferSpecialty(dataset);
  const base = deriveReportIntelligence({
    specialty,
    rowCount: dataset.rowCount,
    sourceAnalysis: { datasets: [dataset] },
    canonicalRows: dataset.rows.map((data, index) => ({ row_number: index + 1, data })),
  });

  const normalize = (value: string) => value.toLowerCase().normalize('NFKC').replace(/[\s_./-]+/g, '');
  const normalizedHeaders = new Set(dataset.columns.map((column) => normalize(column.name)));
  const inventoryShape = normalizedHeaders.has('currentstock') && normalizedHeaders.has('salesqty');
  if (!inventoryShape) return base;
  const findColumn = (...aliases: string[]) => dataset.columns.find((column) => {
    const keys = [column.mappedField ?? '', column.name].map(normalize);
    return aliases.some((alias) => keys.some((key) => key.includes(normalize(alias))));
  });
  const valueOf = (row: Record<string, unknown>, column: typeof dataset.columns[number] | undefined): unknown => {
    if (!column) return undefined;
    return row[column.name] ?? row[column.mappedField ?? ''];
  };

  const stockColumn = findColumn('currentStock', 'current_stock', 'stock', 'الرصيدالحالي', 'الرصيد', 'المخزونالحالي');
  const salesColumn = findColumn('salesQty', 'sales_qty', 'sales', 'كميةالمبيعات', 'صافيالمبيعات');
  const dailyRateColumn = findColumn('dailySalesRate', 'daily_sales_rate', 'معدل البيع اليومي', 'معدل البيع ليومي');
  const stockoutDaysColumn = findColumn('stockoutDays', 'stockout_days', 'الفترة المتوقعة لنفاد الكمية', 'الفترةالمتوقعةلنفادالكمية', 'أيام النفاد');
  const skuColumn = findColumn('productCode', 'product_code', 'sku', 'رقمالصنف', 'كودالصنف');
  const warehouseColumn = findColumn('warehouse', 'المستودع', 'المخزن');
  const documentColumn = findColumn('documentNo', 'invoice_number', 'document_number', 'رقمالمستند', 'رقمالفاتورة');

  if (!stockColumn || !salesColumn) return base;
  if (!dailyRateColumn && !stockoutDaysColumn) return base;

  const rows = dataset.rows.map((row, index) => {
    const stock = Number(valueOf(row, stockColumn));
    const sales = Number(valueOf(row, salesColumn));
    const dailyRate = dailyRateColumn ? Number(valueOf(row, dailyRateColumn)) : NaN;
    const sourceStockoutDays = stockoutDaysColumn ? Number(valueOf(row, stockoutDaysColumn)) : NaN;
    const coverageDays = Number.isFinite(sourceStockoutDays)
      ? sourceStockoutDays
      : Number.isFinite(dailyRate) && dailyRate > 0
        ? stock / dailyRate
        : NaN;
    return {
      index,
      sales,
      stock,
      dailyRate,
      coverageDays,
      sku: String(valueOf(row, skuColumn) ?? 'غير محدد'),
      warehouse: String(valueOf(row, warehouseColumn) ?? 'غير محدد'),
      document: String(valueOf(row, documentColumn) ?? 'ROW-' + (index + 1)),
    };
  }).filter((row) => Number.isFinite(row.stock) && Number.isFinite(row.sales) && row.sales > 0 && Number.isFinite(row.coverageDays) && row.coverageDays >= 0);

  const lowCoverage = rows.filter((row) => row.coverageDays <= 30).sort((a, b) => a.coverageDays - b.coverageDays);
  if (!lowCoverage.length) return base;

  const latest = lowCoverage[0];
  const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
  const lowSales = lowCoverage.reduce((sum, row) => sum + row.sales, 0);
  const lowStock = lowCoverage.reduce((sum, row) => sum + row.stock, 0);
  const totalStock = rows.reduce((sum, row) => sum + row.stock, 0);

  const topRisk: BusinessFinding = {
    id: 'preview:inventory:low-coverage',
    kind: 'RISK',
    priority: latest.coverageDays <= 7 ? 'high' : 'medium',
    title: latest.coverageDays <= 7 ? 'نفاد قريب يحتاج تدخلًا' : 'أصناف ذات تغطية قصيرة',
    statement: 'الصنف ' + latest.sku + ' في ' + latest.warehouse + ' لديه تغطية مصدرية تبلغ ' + latest.coverageDays.toFixed(1) + ' يومًا، مع ' + latest.sales + ' مبيعات و' + latest.stock + ' رصيد.',
    value: latest.coverageDays,
    unit: 'days',
    dimensionLabel: 'الصنف',
    dimensionValue: latest.sku,
    evidence: lowCoverage.slice(0, 5).map((row) => row.document + ' · ' + row.sku + ' · تغطية ' + row.coverageDays.toFixed(1) + ' يوم · مبيعات ' + row.sales + ' · رصيد ' + row.stock),
    limitation: 'المصدر لا يثبت مهلة التوريد أو نقطة إعادة الطلب أو كمية شراء؛ لذلك يحدد التحليل الأولوية ولا يخترع كمية.',
    action: 'راجع الأصناف ذات التغطية القصيرة، ثبّت المالك والتوقيت، ثم اعتمد التوريد أو التحويل بعد التحقق من مهلة التوريد ونقطة إعادة الطلب.',
  };

  return {
    ...base,
    businessQuestion: 'أين توجد أصناف معرضة للنفاد خلال 30 يومًا أو أقل؟',
    summary: 'تم فحص ' + dataset.rowCount + ' صفًا من المصدر مباشرة، وظهرت ' + lowCoverage.length + ' صفوف لا تتجاوز تغطتها 30 يومًا.',
    advisorBrief: {
      health: 'REVIEW_REQUIRED',
      headline: topRisk.statement,
      topFinding: null,
      topRisk,
      topOpportunity: null,
      recommendedAction: topRisk.action,
      ownerHint: 'مدير المخزون / المشتريات',
      expectedOutcome: 'خفض عدد الأصناف التي تقع عند 30 يومًا أو أقل بعد المعالجة وإعادة القياس بنفس قاعدة المصدر.',
      measurement: 'نجاح المعالجة = انخفاض عدد الصفوف ذات التغطية ≤ 30 يومًا؛ النطاق المثبت ' + lowCoverage.length + ' صفوف من ' + rows.length + '.',
      proofRequirement: 'المصدر ' + dataset.name + '، ' + dataset.rowCount + ' صفًا، والتوصية مشتقة من فترة النفاد المصدرية أو الرصيد ÷ معدل البيع اليومي.',
    },
    guidance: {
      focus: topRisk.title,
      inspect: [
        lowCoverage.length + ' صفوف بتغطية ≤ 30 يومًا',
        (totalSales > 0 ? ((lowSales / totalSales) * 100).toFixed(1) + '%' : 'غير متاح') + ' من وحدات المبيعات داخل الصفوف المتأثرة',
        (totalStock > 0 ? ((lowStock / totalStock) * 100).toFixed(1) + '%' : 'غير متاح') + ' من الرصيد الحالي داخل الصفوف المتأثرة',
      ],
      ownerHint: 'مدير المخزون / المشتريات',
      boundary: topRisk.limitation,
    },
  };
}

function PreviewIntelligenceCard({ intelligence }: { intelligence: ReportIntelligence }) {
  const brief = intelligence.advisorBrief;
  const healthLabel = brief.health === 'REVIEW_REQUIRED' ? 'يحتاج تدخلًا' : brief.health === 'ATTENTION' ? 'انتباه' : 'مستقر';
  const top = brief.topRisk ?? brief.topFinding ?? brief.topOpportunity;
  return <Card className="border-emerald-200 bg-emerald-50/40">
    <CardHeader
      title="التقرير الاستشاري الأولي"
      subtitle="النتيجة مشتقة مباشرة من صفوف الملف نفسه؛ لا توجد أرقام ملخصة خارج المصدر."
      action={<Badge variant={brief.health === 'REVIEW_REQUIRED' ? 'danger' : brief.health === 'ATTENTION' ? 'warning' : 'success'}>{healthLabel}</Badge>}
    />
    <CardBody>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <div className="text-[10px] font-black tracking-[.08em] text-primary-700">EXECUTIVE JUDGMENT</div>
          <h3 className="mt-2 text-lg font-black text-ink-950">{brief.headline}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">{intelligence.businessQuestion}</p>
          {top && <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="text-xs font-black text-ink-700">{top.title}</div>
            <p className="mt-1 text-sm leading-6 text-ink-700">{top.statement}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {top.evidence.slice(0, 3).map((evidence) => <span key={evidence} className="rounded-lg bg-white px-2.5 py-1.5 text-ink-500">{evidence}</span>)}
            </div>
          </div>}
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-primary-100 bg-primary-50 p-4">
            <div className="text-xs font-black text-primary-900">ماذا نفعل الآن؟</div>
            <p className="mt-1 text-sm leading-6 text-primary-900">{brief.recommendedAction ?? 'لا توجد توصية تنفيذية كافية من الحقول المتاحة.'}</p>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-4 text-sm">
            <div><span className="font-black">المالك:</span> {brief.ownerHint}</div>
            <div className="mt-2"><span className="font-black">القياس:</span> {brief.measurement ?? 'يحتاج تعريف مؤشر قبل اعتماد القرار.'}</div>
            <div className="mt-2"><span className="font-black">المتوقع:</span> {brief.expectedOutcome ?? 'لا توجد نتيجة متوقعة مثبتة.'}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <b>حد الدليل:</b> {brief.proofRequirement} {intelligence.guidance.boundary}
      </div>
    </CardBody>
  </Card>;
}

function downloadCsv(dataset: Dataset) {
  const columns = dataset.columns.map(c => c.name);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = [columns, ...dataset.rows.slice(0, 50000).map(row => columns.map(c => row[c]))].map(row => row.map(esc).join(',')).join('\n');
  const blob = new Blob([new TextEncoder().encode('\uFEFF' + body)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${dataset.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 0);
}

export function ExternalFileAnalysisPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);
  const [file, setFile] = useState<{name:string;size:number;format:FileFormat;hash:string}|null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  async function analyze(selected: File) {
    setLoading(true); setError(null); setDatasets([]); setActive(0);
    try {
      if (selected.size > MAX_FILE_SIZE) throw new Error(`حجم الملف يتجاوز الحد الآمن (${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB)`);
      const buffer = await selected.arrayBuffer();
      const scan = securityScan(selected, buffer);
      if (!scan.passed) throw new Error(scan.issues.join(' — '));
      const detection = detectFormat(selected, buffer);
      if (detection.format === 'unknown') throw new Error('تعذر تحديد صيغة الملف');
      const hash = await computeSHA256(buffer);
      const parsed = await parseFile(buffer, selected.name, detection.format);
      if (!parsed.length) throw new Error('لم يتم العثور على بيانات قابلة للتحليل داخل الملف');
      selectedFileRef.current = selected;
      setFile({ name:selected.name, size:selected.size, format:detection.format, hash });
      setDatasets(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحليل الملف');
    } finally { setLoading(false); }
  }

  const dataset = datasets[active] ?? null;
  const intelligence = useMemo(() => dataset ? buildPreviewIntelligence(dataset) : null, [dataset]);
  const specialty = useMemo(() => dataset ? inferSpecialty(dataset) : undefined, [dataset]);
  const universalIntelligence = useMemo(() => dataset ? buildUniversalReportIntelligence({
    specialty: specialty ?? null,
    rowCount: dataset.rowCount,
    sourceAnalysis: { datasets: [dataset] },
    canonicalRows: dataset.rows.map((data, index) => ({ row_number: index + 1, data })),
    sourcePath: file?.name ?? dataset.name,
    sourceHash: file?.hash ?? null,
  }) : null, [dataset, file, specialty]);
  const genericIntelligence = useMemo(() => !specialty && dataset ? buildGenericFileIntelligence(dataset, file?.format ?? 'unknown') : null, [dataset, file?.format, specialty]);
  const summary = useMemo(() => dataset ? {
    mapped: dataset.columns.filter(c => !!c.mappedField).length,
    unmapped: dataset.columns.filter(c => !c.mappedField).length,
    review: dataset.columns.filter(c => c.requiresReview).length,
    issues: dataset.columns.reduce((n,c) => n + c.qualityIssues.length, 0),
  } : null, [dataset]);

  return <div className="ag-file-lab space-y-6" dir="rtl">
    <PageHeader title="مختبر الملفات والبيانات" subtitle="حلّل أي ملف خارجي دون إجباره على نموذج أعمال مسبق، مع إبقاء الحقول الأصلية متاحة للمراجعة." />
    <Card><CardBody>
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] items-center">
        <div><div className="flex items-center gap-2"><Sparkles size={18}/><h2 className="font-semibold">ذكاء الملفات الشامل</h2></div><p className="mt-2 text-sm leading-6 text-ink-500">فحص أمني → كشف الصيغة → استخراج → تهيئة تحليلية → مطابقة → جودة → جاهزية للتحليل. هذا المسار تحليلي ولا يكتب سجلات الأعمال تلقائيًا.</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="neutral">كل الأعمدة</Badge><Badge variant="neutral">أنواع البيانات</Badge><Badge variant="neutral">دليل المطابقة</Badge><Badge variant="neutral">إشارات الجودة</Badge><Badge variant="neutral">OCR عربي + إنجليزي</Badge><Badge variant="neutral">بصمة SHA-256</Badge></div></div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={loading} className="btn-primary inline-flex items-center justify-center gap-2 min-w-52"><Upload size={18}/>{loading ? 'جارٍ التحليل...' : 'تحليل أي ملف خارجي'}</button>
      </div>
      <input ref={inputRef} type="file" className="hidden" accept="*/*" onChange={e => { const f=e.target.files?.[0]; if(f) void analyze(f); e.currentTarget.value=''; }}/>
      <div onClick={() => inputRef.current?.click()} className="mt-5 cursor-pointer rounded-2xl border-2 border-dashed border-ink-200 p-8 text-center hover:border-primary-400 transition-colors"><Upload className="mx-auto mb-2 text-primary-500" size={30}/><b>اسحب الملف هنا أو اضغط للاختيار</b><p className="mt-1 text-xs text-ink-400">الحد الآمن {Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB · لا توجد كتابة تلقائية لبيانات الأعمال</p></div>
      {error && <div className="mt-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-700 flex gap-2"><AlertCircle size={17}/>{error}</div>}
    </CardBody></Card>
    {file && datasets.length > 0 && <Card className="border-primary-200 bg-primary-50/40"><CardBody>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-[.08em] text-primary-700">NEXT · SMART REPORT</div>
          <div className="mt-1 text-base font-black text-ink-950">تم التعرف على المصدر — لا تتوقف عند أخطاء الجودة</div>
          <p className="mt-1 text-xs leading-5 text-ink-600">الجدول وإشارات الجودة هنا مرحلة فهم فقط. مرّر الملف إلى المسار الكانوني ليُبنى التقرير الذكي المرتبط بالبصمة، ثم تظهر الإشارات والتوصيات والتنبؤ المشروط والإرشادات ومسار القرار.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const selected = selectedFileRef.current;
            if (selected) navigate('/import', { state: { preloadedFile: selected } });
          }}
          className="btn-primary inline-flex items-center gap-2 whitespace-nowrap"
        >
          <Sparkles size={16}/> تحويل إلى تقرير ذكي
        </button>
      </div>
    </CardBody></Card>}
    {file && intelligence && <PreviewIntelligenceCard intelligence={intelligence} />}
    {file && genericIntelligence && <GenericFileIntelligenceCard intelligence={genericIntelligence} format={file.format} />}
    {file && <Card><CardBody><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{fileIcon(file.format)}<div><b>{file.name}</b><div className="text-xs text-ink-400">{FORMAT_LABELS[file.format]} · {file.size.toLocaleString()} بايت · بصمة SHA-256: {file.hash.slice(0,16)}…</div></div></div><Badge variant="success"><ShieldCheck size={13}/> اجتاز الفحص الأمني</Badge></div></CardBody></Card>}
    {file && universalIntelligence && <details className="progressive-disclosure rounded-[20px] border border-ink-200 bg-white shadow-card">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div><div className="section-kicker">تفاصيل التحليل</div><div className="mt-1 text-base font-black text-ink-950">كيف وصل النظام إلى هذه النتيجة؟</div><div className="mt-1 text-[10px] leading-5 text-ink-500">المسار الكامل والدليل الفني متاحان للمراجعة دون إغراق النتيجة التنفيذية.</div></div>
          <span className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1.5 text-[10px] font-black text-ink-600">فتح التفاصيل</span>
        </div>
      </summary>
      <div className="border-t border-ink-100 p-3 lg:p-4"><UniversalIntelligenceChain result={universalIntelligence}/></div>
    </details>}
    {datasets.length > 1 && <Card><CardBody><div className="flex gap-2 overflow-x-auto">{datasets.map((d,i)=><button key={`${d.id}-${i}`} type="button" aria-pressed={i===active} onClick={()=>setActive(i)} className={`whitespace-nowrap rounded-xl border px-4 py-2 text-xs font-semibold ${i===active?'border-primary-500 bg-primary-50 text-primary-700':'border-ink-200 bg-white text-ink-600'}`}>ورقة/مجموعة {i+1}: {d.name}</button>)}</div></CardBody></Card>}
    {dataset && <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{[['الصفوف',dataset.rowCount],['الأعمدة',dataset.columnCount],['المعيّنة',summary?.mapped??0],['غير المعيّنة',summary?.unmapped??0],['مشاكل الجودة',summary?.issues??0]].map(([label,value])=><Card key={String(label)}><CardBody><div className="text-xs text-ink-400">{label}</div><div className="mt-1 text-xl font-bold">{Number(value).toLocaleString()}</div></CardBody></Card>)}</div>
      <Card><CardHeader title="ذكاء المخطط" subtitle="كل حقل يحتفظ بهويته الأصلية ويُعامل كمرشح مستقل للمطابقة والتحليل" action={<button type="button" onClick={()=>downloadCsv(dataset)} className="btn-secondary text-xs inline-flex items-center gap-1"><Download size={14}/> تصدير البيانات المحللة</button>}/><CardBody><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-ink-100"><th className="p-2 text-right">الحقل الأصلي</th><th className="p-2 text-right">الحقل القياسي</th><th className="p-2 text-right">النوع</th><th className="p-2 text-right">الثقة</th><th className="p-2 text-right">الفرادة</th><th className="p-2 text-right">القيم الفارغة</th></tr></thead><tbody>{dataset.columns.map(c=><tr key={c.name} className="border-b border-ink-50"><td className="p-2 font-medium">{c.name}</td><td className="p-2">{c.mappedField||<span className="text-ink-400">غير معين — محفوظ</span>}</td><td className="p-2">{c.dataType}</td><td className="p-2">{c.mappingConfidence}%</td><td className="p-2">{Math.round(c.uniqueRatio*100)}%</td><td className="p-2">{c.nullCount.toLocaleString()}</td></tr>)}</tbody></table></div></CardBody></Card>
      <Card><CardHeader title="المعاينة" subtitle={`عرض ${Math.min(dataset.preview.length, 50)} صفًا مع ${dataset.columnCount} عمودًا`}/><CardBody><div className="overflow-x-auto"><DataTable columns={dataset.columns.map(c=>({key:c.name,label:c.name,render:(r:any)=>String(r[c.name]??'')}))} data={dataset.preview.slice(0,50)} emptyMessage="لا توجد صفوف للعرض"/></div></CardBody></Card>
      <Card><CardHeader title="إشارات الجودة والتوصيات"/><CardBody><div className="grid gap-2 md:grid-cols-2">{dataset.columns.flatMap(c=>c.qualityIssues.map(issue=><div key={`${c.name}-${issue}`} className="flex gap-2 rounded-xl bg-warning-50 p-3 text-xs text-warning-800"><AlertCircle size={14}/><span><b>{c.name}</b>: {issue}</span></div>))}{!dataset.columns.some(c=>c.qualityIssues.length)&&<div className="flex gap-2 text-sm text-success-700"><CheckCircle2 size={16}/> لا توجد إشارات جودة على الحقول المفحوصة.</div>}</div></CardBody></Card>
      <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-5"><div className="flex items-center gap-2 font-semibold"><BarChart3 size={18}/> قرار المعالجة</div><p className="mt-2 text-sm leading-6 text-ink-600">{summary?.unmapped ? `تم اكتشاف ${summary.unmapped} حقل غير معيّن. هذه الحقول لا تُحذف؛ تبقى متاحة للتحليل والتعيين اللاحق.` : 'المخطط المكتشف قابل للربط مع النموذج القياسي، مع بقاء المصدر الأصلي محفوظًا.'}</p></div>
    </>}
    {loading && <Card><CardBody><div className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-primary-500" size={30}/><p className="mt-3 text-sm">جارٍ بناء ملف التعريف والتحليل…</p></div></CardBody></Card>}
  </div>;
}
