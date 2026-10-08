import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, FileText, Printer, Target, Wand2 } from 'lucide-react';
import { Link, useLocation } from '@/lib/router-compat';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/States';
import { CommercialValueChain } from '@/components/CommercialValueChain';
import { UniversalIntelligenceChain } from '@/components/UniversalIntelligenceChain';
import { IntelligenceResultRail } from '@/components/IntelligenceResultRail';
import { buildUniversalReportIntelligence } from '@/lib/universal-report-intelligence';
import inventoryCsv from '../../tests/fixtures/realistic-reports/28-inventory-stockout-reorder.csv?raw';

type LiveRow = {
  documentNo: string;
  documentDate: string;
  productCode: string;
  productName: string;
  warehouse: string;
  salesQty: number;
  currentStock: number;
  netAmount: number;
  cost: number;
  profit: number;
  paidAmount: number;
};

const CSV_HEADERS = ['documentNo','documentDate','productCode','productName','warehouse','salesQty','currentStock','netAmount','cost','profit','paidAmount'] as const;

function parseInventoryFixture(source: string): LiveRow[] {
  const lines = source.trim().split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (header !== CSV_HEADERS.join(',')) {
    throw new Error('Inventory fixture header does not match the expected canonical schema.');
  }

  return lines.map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== CSV_HEADERS.length) {
      throw new Error(`Inventory fixture row ${index + 2} has ${cells.length} columns; expected ${CSV_HEADERS.length}.`);
    }

    const [
      documentNo,
      documentDate,
      productCode,
      productName,
      warehouse,
      salesQty,
      currentStock,
      netAmount,
      cost,
      profit,
      paidAmount,
    ] = cells;

    const numeric = [salesQty, currentStock, netAmount, cost, profit, paidAmount].map(Number);
    if (numeric.some(value => !Number.isFinite(value))) {
      throw new Error(`Inventory fixture row ${index + 2} contains a non-numeric measure.`);
    }

    return {
      documentNo,
      documentDate,
      productCode,
      productName,
      warehouse,
      salesQty: numeric[0],
      currentStock: numeric[1],
      netAmount: numeric[2],
      cost: numeric[3],
      profit: numeric[4],
      paidAmount: numeric[5],
    };
  });
}

const LIVE_ROWS = parseInventoryFixture(inventoryCsv);
const LIVE_TOTALS = LIVE_ROWS.reduce((totals, row) => ({
  salesQty: totals.salesQty + row.salesQty,
  currentStock: totals.currentStock + row.currentStock,
  netAmount: totals.netAmount + row.netAmount,
  profit: totals.profit + row.profit,
}), { salesQty: 0, currentStock: 0, netAmount: 0, profit: 0 });

const LOW_COVERAGE_ROWS = LIVE_ROWS.filter(row => row.salesQty > 0 && row.currentStock / row.salesQty < 2);

const PREVIEW_DATASET = {
  name: '28-inventory-stockout-reorder.csv',
  rowCount: LIVE_ROWS.length,
  columns: CSV_HEADERS.map((name) => ({
    name,
    mappedField:
      name === 'documentNo' ? 'invoice_number'
      : name === 'documentDate' ? 'date'
      : name === 'productCode' ? 'sku'
      : name === 'productName' ? 'product_name'
      : name === 'warehouse' ? 'warehouse'
      : name === 'salesQty' ? 'sales_qty'
      : name === 'currentStock' ? 'current_stock'
      : name === 'netAmount' ? 'net_amount'
      : name === 'cost' ? 'cost'
      : name === 'profit' ? 'profit'
      : name === 'paidAmount' ? 'paid_amount'
      : null,
    dataType: typeof LIVE_ROWS[0]?.[name as keyof LiveRow] === 'number' ? 'number' : 'text',
    nullCount: 0,
    mappingConfidence: 100,
  })),
  rows: LIVE_ROWS.map((row) => ({
    ...row,
    invoice_number: row.documentNo,
    date: row.documentDate,
    sku: row.productCode,
    product_name: row.productName,
    sales_qty: row.salesQty,
    current_stock: row.currentStock,
    net_amount: row.netAmount,
    paid_amount: row.paidAmount,
  })),
  preview: LIVE_ROWS.slice(0, 10),
};

const PUBLIC_SMART_INTELLIGENCE = buildUniversalReportIntelligence({
  specialty: 'inventory',
  rowCount: PREVIEW_DATASET.rowCount,
  sourceAnalysis: { datasets: [PREVIEW_DATASET] },
  canonicalRows: PREVIEW_DATASET.rows.map((data, index) => ({ row_number: index + 1, data })),
  sourcePath: PREVIEW_DATASET.name,
  sourceHash: 'preview:28-inventory-stockout-reorder',
  reportJobId: 'preview-smart-report-28',
  tenantId: 'preview',
});

type Capability = {
  id: string;
  title: string;
  description: string;
  path: string;
  keywords: string[];
};

const CAPABILITIES: Capability[] = [
  { id: 'dashboard', title: 'مركز القيادة ولوحة المؤشرات', description: 'المبيعات والسيولة والذمم والعملاء والمنتجات وصحة الأعمال في صورة تنفيذية واحدة.', path: '/', keywords: ['dashboard', 'kpi', 'executive', 'sales', 'cash', 'receivables', 'business health', 'لوحة', 'مبيعات', 'مؤشرات', 'مالية', 'قيادة'] },
  { id: 'import', title: 'استيراد بيانات قائم على الدليل', description: 'استيراد وتحقق ومطابقة وحفظ منضبط عبر المسار المعتمد.', path: '/import', keywords: ['import', 'excel', 'csv', 'upload', 'validation', 'reconciliation', 'etl', 'رفع', 'استيراد', 'تحقق', 'جودة', 'مطابقة'] },
  { id: 'data-quality', title: 'جودة البيانات والمراجعة', description: 'مراجعة فجوات البيانات ومشكلات التحقق والسجلات المحجوبة قبل الاعتماد.', path: '/data-quality', keywords: ['quality', 'review', 'duplicates', 'validation', 'quarantine', 'جودة', 'مراجعة', 'تكرار', 'سجلات'] },
  { id: 'reports', title: 'التقارير التجارية', description: 'تقارير المبيعات والمخزون والذمم والربحية والتقرير التنفيذي.', path: '/reports', keywords: ['report', 'reporting', 'sales report', 'inventory report', 'finance'] },
  { id: 'receivables', title: 'الذمم والأعمار', description: 'الأرصدة المستحقة وتصنيف الأعمار وواجهات تركز على التحصيل.', path: '/reports/receivables', keywords: ['receivables', 'aging', 'collections', 'ar', 'debtor', 'ذمم', 'أعمار', 'تحصيل', 'مدين'] },
  { id: 'profitability', title: 'ذكاء الربحية', description: 'تقارير المبيعات والتكلفة والربح الإجمالي من الـFixture الكانوني مع سياق الدليل.', path: '/reports/profitability', keywords: ['profitability', 'margin', 'gross profit', 'cost', 'finance', 'ربحية', 'هامش', 'ربح', 'تكلفة'] },
  { id: 'inventory', title: 'ذكاء المخزون', description: 'موقف المخزون والحركة والأصناف منخفضة الرصيد وتحليل الإتاحة.', path: '/reports/inventory-intelligence', keywords: ['inventory', 'stock', 'warehouse', 'availability', 'slow movers', 'مخزون', 'مستودع', 'إتاحة', 'أصناف'] },
  { id: 'demand', title: 'الطلب والتنبؤ', description: 'سرعة الطلب والتنبؤات وواجهات التخطيط المقيدة بالبيانات.', path: '/reports/demand-velocity', keywords: ['demand', 'forecast', 'forecasting', 'planning', 'seasonality', 'طلب', 'تنبؤ', 'تخطيط', 'موسمية'] },
  { id: 'analytics', title: 'تحليلات العملاء والمحفظة', description: 'تحليل RFM وABC والأعمار للتقسيم وتحديد الأولويات.', path: '/analytics', keywords: ['analytics', 'rfm', 'abc', 'segmentation', 'customer value', 'تحليل', 'عملاء', 'محفظة', 'تقسيم'] },
  { id: 'intelligence', title: 'ذكاء القرار', description: 'توصيات وتنبؤات ودعم قرار مرتبط بالدليل.', path: '/intelligence', keywords: ['recommendations', 'decision', 'ai', 'decision intelligence', 'توصيات', 'قرار', 'دعم القرار', 'ذكاء القرار'] },
  { id: 'scenarios', title: 'السيناريوهات وتحليل ماذا لو', description: 'واجهات سيناريو منضبطة مع حدود واضحة للبيانات والدليل.', path: '/intelligence/scenarios', keywords: ['scenario', 'what if', 'simulation', 'optimization', 'سيناريو', 'ماذا لو', 'محاكاة', 'تحسين'] },
  { id: 'metrics', title: 'حوكمة المؤشرات والأدلة', description: 'تعريفات المؤشرات والحل الكانوني وسلسلة الدليل.', path: '/metrics', keywords: ['metrics', 'governance', 'evidence', 'provenance', 'definitions', 'مؤشرات', 'حوكمة', 'دليل', 'تعريفات'] },
  { id: 'customers', title: 'تشغيل العملاء', description: 'بحث العملاء وصفحاتهم وإنشاؤهم ضمن نطاق الشركة الحالية.', path: '/customers', keywords: ['customers', 'crm', 'client', 'customer management'] },
  { id: 'products', title: 'تشغيل المنتجات', description: 'المنتجات والبحث برقم الصنف والإنشاء المنضبط ضمن نطاق الشركة.', path: '/products', keywords: ['products', 'sku', 'catalog', 'items'] },
  { id: 'inventory-page', title: 'المخزون التشغيلي', description: 'جدول المخزون التشغيلي مع حالة الإتاحة وإعادة الطلب.', path: '/inventory', keywords: ['inventory operations', 'reorder', 'stock table'] },
  { id: 'decision', title: 'تجربة القرار', description: 'مسار قرار قائم على الدليل وواجهة إجراءات منضبطة.', path: '/decision-experience', keywords: ['decision experience', 'actions', 'approvals', 'workflow'] },
];

function scoreCapability(requirement: string, capability: Capability): number {
  const source = requirement.trim().toLowerCase();
  if (!source) return 0;
  let score = 0;
  for (const keyword of capability.keywords) {
    if (source.includes(keyword.toLowerCase())) score += keyword.includes(' ') ? 3 : 2;
  }
  return score;
}

function PreviewMetric({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-bold text-ink-500">{label}</div>
      <div className="mt-1.5 text-2xl font-black tabular-nums text-ink-950">{value}</div>
      <div className="mt-1 text-[9px] text-ink-400">{meta}</div>
    </div>
  );
}

function PreviewNavigation({ currentPath }: { currentPath: string }) {
  const sections = [
    {
      title: 'الرئيسية',
      items: [
        ['/', 'لوحة الأعمال'],
        ['/reports', 'التقارير'],
        ['/reports/smart/demo', 'أنشئ التقرير الذكي من ملفك الحقيقي'],
        ['/reports/executive', 'التقرير التنفيذي'],
      ],
    },
    {
      title: 'التحليل',
      items: [
        ['/reports/sales', 'المبيعات'],
        ['/reports/inventory', 'المخزون'],
        ['/reports/profitability', 'الربحية'],
        ['/reports/receivables', 'الذمم المشتقة'],
        ['/reports/demand-velocity', 'حركة الطلب'],
        ['/analytics/liquidity', 'السيولة المشتقة'],
      ],
    },
    {
      title: 'الذكاء والقرار',
      items: [
        ['/intelligence', 'ذكاء القرار'],
        ['/intelligence/recommendations', 'التوصيات'],
        ['/intelligence/forecasts', 'الاتجاه'],
        ['/decision-experience', 'القرار'],
        ['/work-center', 'العمل'],
      ],
    },
    {
      title: 'الثقة والحوكمة',
      items: [
        ['/data-quality', 'جودة البيانات'],
        ['/trust', 'الثقة'],
        ['/replay', 'إعادة التتبع'],
        ['/benchmark', 'المقارنة'],
        ['/reports/smart/demo', 'التقرير الذكي الحقيقي'],
      ],
    },
  ] as const;

  return (
    <nav aria-label="تنقل معاينة المنتج" className="rounded-[20px] border border-ink-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-primary-600">PRODUCT PREVIEW NAVIGATION</div>
            <div className="mt-1 text-sm font-black text-ink-950">تنقل بين مساحات المنتج بنفس بيانات المعاينة</div>
          </div>
          <Link
            to="/?auth=1"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-ink-200 px-3 text-[10px] font-black text-ink-700 hover:bg-ink-50"
          >
            اختبار الدخول الحقيقي
          </Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          {sections.map(section => (
            <div key={section.title} className="rounded-xl border border-ink-100 bg-ink-50/60 p-2.5">
              <div className="px-2 py-1 text-[9px] font-black text-ink-500">{section.title}</div>
              <div className="mt-1 grid gap-1">
                {section.items.map(([href, label]) => {
                  const active = currentPath === href || (href !== '/' && currentPath.startsWith(href + '/'));
                  return (
                    <Link
                      key={href}
                      to={href}
                      className={`inline-flex min-h-9 items-center justify-between rounded-lg px-2.5 py-2 text-[10px] font-black transition ${active ? 'bg-primary-700 text-white' : 'text-ink-700 hover:bg-white hover:text-primary-700'}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span>{label}</span>
                      <span aria-hidden="true">←</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

function PreviewSourceBanner() {
  return (
    <section className="rounded-[22px] border border-ink-800 bg-[linear-gradient(135deg,#08111f,#102737)] p-5 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,.9)]">
      <div className="text-[9px] font-black tracking-[.14em] text-primary-200">PREVIEW · FIXTURE-BOUND</div>
      <h1 className="mt-2 text-2xl font-black tracking-tight">بيانات المعاينة مشتقة من Fixture واحد، بدون اختلاق</h1>
      <p className="mt-2 max-w-3xl text-[11px] leading-6 text-slate-300">
        هذه المعاينة مبنية على Fixture محفوظ داخل المستودع: <strong>28-inventory-stockout-reorder.csv</strong>.
        القيم هنا تصلح لإثبات سلوك المنتج ومسار الحساب في المعاينة، وليست بيانات شركة حيّة أو بديلًا عن جلسة tenant مصادق عليها.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-300">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{LIVE_ROWS.length} صفًا</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{LIVE_TOTALS.salesQty} وحدة مبيعات</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{LIVE_TOTALS.currentStock} رصيد حالي</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} YER صافي مبيعات</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{LOW_COVERAGE_ROWS.length} إشارات مشتقة من الـFixture</span>
      </div>
    </section>
  );
}


function BuyerProofPanel() {
  const paidTotal = LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0);
  const outstanding = LIVE_TOTALS.netAmount - paidTotal;
  const margin = LIVE_TOTALS.netAmount > 0 ? (LIVE_TOTALS.profit / LIVE_TOTALS.netAmount) * 100 : null;
  const firstSales = LIVE_ROWS[0]?.salesQty ?? null;
  const lastSales = LIVE_ROWS[LIVE_ROWS.length - 1]?.salesQty ?? null;
  const salesGrowth = firstSales && firstSales > 0 && lastSales != null
    ? ((lastSales - firstSales) / firstSales) * 100
    : null;
  const latestLow = [...LOW_COVERAGE_ROWS].sort((a, b) => b.documentDate.localeCompare(a.documentDate))[0] ?? null;

  const proofs = [
    {
      label: 'المخزون',
      value: String(LOW_COVERAGE_ROWS.length),
      unit: 'إشارات',
      detail: 'صفوف تحت حد التغطية 2.00',
      tone: 'warning',
    },
    {
      label: 'المبيعات',
      value: salesGrowth == null ? 'غير متاح' : salesGrowth.toFixed(1) + '%',
      unit: 'نمو',
      detail: firstSales != null && lastSales != null ? 'من ' + firstSales + ' إلى ' + lastSales + ' وحدة' : 'لا توجد سلسلة كافية',
      tone: 'primary',
    },
    {
      label: 'التحصيل',
      value: outstanding.toLocaleString('ar-YE'),
      unit: 'YER',
      detail: 'رصيد مفتوح مشتق من الصافي − المدفوع',
      tone: 'warning',
    },
    {
      label: 'الربحية',
      value: margin == null ? 'غير متاح' : margin.toFixed(1) + '%',
      unit: 'هامش',
      detail: 'الربح ÷ صافي المبيعات من الصفوف نفسها',
      tone: 'success',
    },
  ] as const;

  return (
    <section dir="rtl" className="overflow-hidden rounded-[24px] border border-primary-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,.4)]">
      <div className="bg-[linear-gradient(135deg,#07151c,#0e2d2c)] p-5 text-white lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.18em] text-primary-200">BUYER PROOF · 30 SECOND READ</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">الزبون لا يشتري «لوحة»؛ يشتري إجابة وقرارًا ودليلًا</h2>
            <p className="mt-2 max-w-4xl text-xs leading-6 text-slate-300">
              هذه اللقطة تعرض أربع إجابات أعمال مشتقة من نفس الـFixture. الهدف من المنتج هو أن يأخذ الزبون تقريره الحقيقي، ويصل من المصدر إلى قرار يمكن مراجعته وقياس نتيجته.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4 lg:min-w-[260px]">
            <div className="text-[9px] font-black tracking-[.12em] text-slate-400">أقوى دليل حالي</div>
            <div className="mt-2 text-lg font-black text-white">
              {latestLow ? latestLow.productCode + ' · تغطية ' + (latestLow.currentStock / latestLow.salesQty).toFixed(2) : 'لا توجد إشارة منخفضة'}
            </div>
            <div className="mt-1 text-[10px] leading-5 text-slate-300">أحدث صف تحت حد التغطية، مع الاحتفاظ برقم المستند والمستودع كمصدر للإشارة.</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-ink-100 bg-ink-50/70 p-5 sm:grid-cols-2 xl:grid-cols-4 lg:p-6">
        {proofs.map(item => (
          <article key={item.label} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <div className="text-[9px] font-black text-ink-400">{item.label}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-ink-950">{item.value}</span>
              <span className="text-[10px] font-bold text-ink-400">{item.unit}</span>
            </div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">{item.detail}</div>
          </article>
        ))}
      </div>

      <div className="grid gap-3 p-5 lg:grid-cols-4 lg:p-6">
        {[
          ['1', 'الحقيقة', '12 صفًا و11 حقلًا من ملف المصدر؛ لا توجد أرقام ملخصة خارج الصفوف.'],
          ['2', 'الإشارة', '3 صفوف منخفضة التغطية؛ أحدثها SKU-2 في WH-3 بتغطية 1.84 تقريبًا.'],
          ['3', 'التوصية', 'مراجعة إعادة الطلب والتحقق من مهلة التوريد قبل تثبيت كمية شراء.'],
          ['4', 'القياس', 'نجاح القرار = عودة التغطية إلى 2.00 فأعلى؛ النتيجة الفعلية لا تُخترع مسبقًا.'],
        ].map(([index, title, detail]) => (
          <article key={index} className="rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-700 text-[10px] font-black text-white">{index}</span>
              <span className="text-xs font-black text-ink-950">{title}</span>
            </div>
            <p className="mt-3 text-[10px] leading-5 text-ink-600">{detail}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-ink-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-ink-500">
          <CheckCircle2 size={15} className="text-success-600" />
          النتيجة قابلة للإثبات، والتوقعات منفصلة عن النتائج الفعلية.
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/reports/smart/demo" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary-700 px-4 py-2.5 text-[10px] font-black text-white">حلّل ملفك وابنِ التقرير الذكي</Link>
          <Link to="/decision-experience" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-[10px] font-black text-primary-800">جرّب القرار</Link>
          <Link to="/try-report" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-ink-200 px-4 py-2.5 text-[10px] font-black text-ink-800">جرّب تقريرك الآن</Link>
        </div>
      </div>
    </section>
  );
}

function PreviewAdvisorReport() {
  const lowSalesQty = LOW_COVERAGE_ROWS.reduce((sum, row) => sum + row.salesQty, 0);
  const lowStockQty = LOW_COVERAGE_ROWS.reduce((sum, row) => sum + row.currentStock, 0);
  const lowSalesShare = LIVE_TOTALS.salesQty > 0 ? (lowSalesQty / LIVE_TOTALS.salesQty) * 100 : 0;
  const lowStockShare = LIVE_TOTALS.currentStock > 0 ? (lowStockQty / LIVE_TOTALS.currentStock) * 100 : 0;
  const latestLow = [...LOW_COVERAGE_ROWS].sort((a, b) => b.documentDate.localeCompare(a.documentDate))[0] ?? null;
  const overallGrowth = LIVE_ROWS[0]?.salesQty > 0
    ? ((LIVE_ROWS[LIVE_ROWS.length - 1].salesQty - LIVE_ROWS[0].salesQty) / LIVE_ROWS[0].salesQty) * 100
    : null;
  const margin = LIVE_TOTALS.netAmount > 0 ? (LIVE_TOTALS.profit / LIVE_TOTALS.netAmount) * 100 : null;
  const paidTotal = LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0);
  const outstanding = LIVE_TOTALS.netAmount - paidTotal;
  const outstandingShare = LIVE_TOTALS.netAmount > 0 ? (outstanding / LIVE_TOTALS.netAmount) * 100 : null;

  const recommendation = 'مراجعة إعادة الطلب للأصناف الثلاثة منخفضة التغطية، ثم تثبيت خطة شراء بعد التحقق من مهلة التوريد ونقطة إعادة الطلب.';
  const whyNow = latestLow
    ? `آخر صف منخفض التغطية هو ${latestLow.productCode} في ${latestLow.warehouse} بتغطية ${(latestLow.currentStock / latestLow.salesQty).toFixed(2)}، بينما سجل المصدر ارتفاعًا في وحدات المبيعات من ${LIVE_ROWS[0].salesQty} إلى ${LIVE_ROWS[LIVE_ROWS.length - 1].salesQty}.`
    : 'تظهر الإشارة من الصفوف المصدرية الحالية.';
  const measurement = 'نجاح المعالجة = عودة تغطية الصفوف الثلاثة إلى 2.00 فأعلى مع استمرار مراقبة المبيعات والرصيد.';
  const blocker = 'المصدر لا يحتوي مهلة توريد أو نقطة إعادة طلب أو كمية شراء موصى بها؛ لذلك لا نحسب أمر شراء أو أثرًا ماليًا غير مثبت.';
  const proof = LOW_COVERAGE_ROWS.map(row => `${row.documentNo} · ${row.productCode} · تغطية ${(row.currentStock / row.salesQty).toFixed(2)}`);

  return (
    <section className="overflow-hidden rounded-[24px] border border-primary-200 bg-white shadow-[0_24px_70px_-45px_rgba(15,23,42,.35)]" dir="rtl" aria-label="التقرير الذكي الاستشاري">
      <div className="bg-[linear-gradient(135deg,#07151c,#0d2a2a)] p-5 text-white lg:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="text-[9px] font-black tracking-[.18em] text-primary-200">ADVISOR-FIRST SMART REPORT</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">الخلاصة التي يحتاجها المدير، لا جدول الأرقام</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              التقرير لا يكتفي بوصف ما في المصدر؛ يحدد القضية الحالية، يشرح لماذا ظهرت، يقدّر نطاق التعرض بما يمكن إثباته، ثم يحدد القرار المقترح وحدوده.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4 xl:min-w-[240px]">
            <div className="text-[9px] font-black tracking-[.14em] text-slate-300">حكم التقرير</div>
            <div className="mt-2 text-xl font-black text-white">يحتاج تدخلًا تشغيليًا</div>
            <div className="mt-1 text-[10px] leading-5 text-slate-300">المشكلة الأساسية: التغطية بدأت تنخفض تحت حد 2.00 في آخر ثلاث فترات.</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-ink-100 bg-ink-50/70 p-5 md:grid-cols-4 lg:p-6">
        <div className="rounded-2xl border border-warning-200 bg-warning-50 p-4">
          <div className="text-[9px] font-black text-warning-800">ما المشكلة؟</div>
          <div className="mt-2 text-sm font-black text-warning-950">3 صفوف تحت حد التغطية</div>
          <div className="mt-1 text-[10px] leading-5 text-warning-900/80">كلها في آخر ثلاث فترات من الـFixture.</div>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="text-[9px] font-black text-ink-500">لماذا الآن؟</div>
          <div className="mt-2 text-sm font-black text-ink-950">المبيعات ترتفع</div>
          <div className="mt-1 text-[10px] leading-5 text-ink-500">من {LIVE_ROWS[0].salesQty} إلى {LIVE_ROWS[LIVE_ROWS.length - 1].salesQty} وحدة ({overallGrowth == null ? 'غير متاح' : overallGrowth.toFixed(1) + '%'}).</div>
        </div>
        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
          <div className="text-[9px] font-black text-primary-700">ما حجم التعرض؟</div>
          <div className="mt-2 text-sm font-black text-primary-950">{lowSalesShare.toFixed(1)}% من وحدات المبيعات</div>
          <div className="mt-1 text-[10px] leading-5 text-primary-900/75">مرتبطة بصفوف تغطيتها أقل من 2.00، وتمثل {lowStockShare.toFixed(1)}% من الرصيد الحالي.</div>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="text-[9px] font-black text-ink-500">ما وضع الأعمال؟</div>
          <div className="mt-2 text-sm font-black text-ink-950">هامش {margin == null ? 'غير متاح' : margin.toFixed(1) + '%'}</div>
          <div className="mt-1 text-[10px] leading-5 text-ink-500">المبيعات الصافية {LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} YER، والمفتوح المشتق {outstanding.toLocaleString('ar-YE')} YER ({outstandingShare == null ? 'غير متاح' : outstandingShare.toFixed(1) + '%'}).</div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_.85fr] lg:p-6">
        <article className="rounded-[20px] border border-ink-200 bg-white p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">WHY · السبب</div>
          <h3 className="mt-1 text-lg font-black text-ink-950">{whyNow}</h3>
          <p className="mt-3 text-xs leading-6 text-ink-600">
            التغطية هي الرصيد الحالي ÷ وحدات المبيعات في الصف. الصفوف الثلاثة الأخيرة هي الوحيدة تحت 2.00، لذلك الإشارة ليست مجرد انخفاض عام في المخزون؛ إنها تركّز واضح في آخر الفترات ومع ارتفاع المبيعات.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {LOW_COVERAGE_ROWS.map(row => (
              <div key={row.documentNo} className="rounded-xl border border-warning-200 bg-warning-50/70 p-3">
                <div className="text-[9px] font-black text-warning-800">{row.productCode} · {row.warehouse}</div>
                <div className="mt-1 text-base font-black text-warning-950">{(row.currentStock / row.salesQty).toFixed(2)}×</div>
                <div className="mt-1 text-[9px] leading-4 text-warning-900/75">{row.salesQty} مبيعات · {row.currentStock} رصيد</div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[20px] border border-primary-200 bg-[linear-gradient(145deg,#f3fbf8,#ffffff)] p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">SO WHAT · ماذا يعني؟</div>
          <h3 className="mt-1 text-lg font-black text-ink-950">هناك خطر تشغيلي يستحق تدخل المخزون قبل أن يتحول إلى نفاد</h3>
          <p className="mt-3 text-xs leading-6 text-ink-700">
            لا نستنتج فقد مبيعات أو تكلفة نفاد مالية لأن المصدر لا يثبت ذلك. الذي نستطيع إثباته هو أن ثلث وحدات المبيعات تقريبًا تأتي من صفوف أصبحت تحت حد التغطية، وأن آخر صف منخفض التغطية موجود في أحدث فترة من العينة.
          </p>
          <div className="mt-4 rounded-xl border border-ink-200 bg-white p-3">
            <div className="text-[9px] font-black text-ink-400">نطاق الأثر المثبت</div>
            <div className="mt-1 text-sm font-black text-ink-950">{lowSalesShare.toFixed(1)}% من وحدات المبيعات ضمن الصفوف المتأثرة</div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">ليس تقديرًا لخسارة مالية مستقبلية.</div>
          </div>
        </article>
      </div>

      <div className="grid gap-4 border-t border-ink-100 bg-ink-50/50 p-5 lg:grid-cols-[1fr_1fr] lg:p-6">
        <article className="rounded-[20px] border border-primary-300 bg-white p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.14em] text-primary-700">RECOMMENDATION · التوصية</div>
          <h3 className="mt-1 text-lg font-black text-ink-950">{recommendation}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
              <div className="text-[9px] font-black text-ink-400">WHY NOW</div>
              <div className="mt-1 text-[10px] leading-5 text-ink-700">المبيعات صاعدة، وآخر 3 صفوف دخلت تحت 2.00.</div>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
              <div className="text-[9px] font-black text-ink-400">OWNER</div>
              <div className="mt-1 text-[10px] font-black text-ink-800">مدير المخزون / المشتريات</div>
            </div>
            <div className="rounded-xl border border-success-200 bg-success-50 p-3">
              <div className="text-[9px] font-black text-success-700">MEASUREMENT</div>
              <div className="mt-1 text-[10px] leading-5 text-success-900">{measurement}</div>
            </div>
            <div className="rounded-xl border border-warning-200 bg-warning-50 p-3">
              <div className="text-[9px] font-black text-warning-700">BLOCKER</div>
              <div className="mt-1 text-[10px] leading-5 text-warning-900">{blocker}</div>
            </div>
          </div>
        </article>

        <article className="rounded-[20px] border border-ink-200 bg-white p-5 shadow-sm">
          <div className="text-[9px] font-black tracking-[.14em] text-ink-500">EVIDENCE · الدليل</div>
          <h3 className="mt-1 text-lg font-black text-ink-950">الصفوف التي بنت عليها التوصية</h3>
          <div className="mt-3 space-y-2">
            {proof.map(item => (
              <div key={item} className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5 text-[10px] font-bold text-ink-700">{item}</div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/decision-experience" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary-700 px-3.5 py-2 text-[10px] font-black text-white">حوّلها إلى قرار</Link>
            <Link to="/work-center" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-[10px] font-black text-ink-800">اذهب للعمل</Link>
          </div>
        </article>
      </div>

      <div className="border-t border-ink-100 bg-white p-5 lg:p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
            <div className="text-[9px] font-black text-ink-400">CONFIDENCE</div>
            <div className="mt-1 text-sm font-black text-ink-900">Source-derived</div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">كل claim أعلاه يمكن رده إلى صفوف الـFixture.</div>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
            <div className="text-[9px] font-black text-ink-400">EXPECTED OUTCOME</div>
            <div className="mt-1 text-sm font-black text-ink-900">رفع التغطية</div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">الهدف قابل للقياس؛ الكمية المطلوب شراؤها غير مثبتة.</div>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
            <div className="text-[9px] font-black text-ink-400">RISK</div>
            <div className="mt-1 text-sm font-black text-ink-900">شراء زائد</div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">يجب عدم تحويل الإشارة إلى كمية شراء قبل توفر lead time وreorder point.</div>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
            <div className="text-[9px] font-black text-ink-400">LIMITATION</div>
            <div className="mt-1 text-sm font-black text-ink-900">Fixture تجريبي</div>
            <div className="mt-1 text-[10px] leading-5 text-ink-500">هذا يثبت سلوك المنتج، لا يمثل بيانات عميل حي.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewInventoryTable({ rows = LIVE_ROWS }: { rows?: LiveRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white">
      <table className="min-w-[980px] w-full text-right text-xs">
        <thead className="bg-ink-50">
          <tr>
            {['المستند','التاريخ','SKU','الصنف','المستودع','المبيعات','الرصيد','التغطية','الصافي','الربح','الحالة'].map(label => (
              <th key={label} className="px-3 py-3 font-black text-ink-700">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const coverage = row.currentStock / row.salesQty;
            const low = coverage < 2;
            return (
              <tr key={row.documentNo} className="border-t border-ink-100 hover:bg-primary-50/40">
                <td className="px-3 py-3 font-black">{row.documentNo}</td>
                <td className="px-3 py-3">{row.documentDate}</td>
                <td className="px-3 py-3 font-mono">{row.productCode}</td>
                <td className="px-3 py-3">{row.productName}</td>
                <td className="px-3 py-3">{row.warehouse}</td>
                <td className="px-3 py-3">{row.salesQty}</td>
                <td className="px-3 py-3 font-black">{row.currentStock}</td>
                <td className="px-3 py-3">{coverage.toFixed(2)}</td>
                <td className="px-3 py-3">{row.netAmount.toLocaleString('ar-YE')}</td>
                <td className="px-3 py-3 font-black">{row.profit.toLocaleString('ar-YE')}</td>
                <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${low ? 'bg-warning-50 text-warning-800' : 'bg-success-50 text-success-800'}`}>{low ? 'تغطية منخفضة' : 'مراقبة'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewDomainAdvisor({ domain }: { domain: 'sales' | 'profitability' | 'receivables' }) {
  const [decisionState, setDecisionState] = useState<'جاهز' | 'مسودة قرار منشأة'>('جاهز');
  const paidTotal = LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0);
  const outstandingRows = LIVE_ROWS.filter(row => row.netAmount > row.paidAmount);
  const outstandingTotal = outstandingRows.reduce((sum, row) => sum + (row.netAmount - row.paidAmount), 0);
  const collectionRate = LIVE_TOTALS.netAmount > 0 ? (paidTotal / LIVE_TOTALS.netAmount) * 100 : null;
  const rowMargins = LIVE_ROWS
    .filter(row => row.netAmount > 0)
    .map(row => ({ ...row, margin: (row.profit / row.netAmount) * 100 }))
    .sort((a, b) => a.margin - b.margin);
  const weakestMargin = rowMargins[0] ?? null;
  const topSalesRow = [...LIVE_ROWS].sort((a, b) => b.netAmount - a.netAmount)[0] ?? null;
  const recentDelta = LIVE_ROWS.length >= 2 ? LIVE_ROWS[LIVE_ROWS.length - 1].netAmount - LIVE_ROWS[LIVE_ROWS.length - 2].netAmount : null;

  const model = domain === 'sales'
    ? {
        label: 'مبيعات',
        recommendation: recentDelta != null && recentDelta < 0
          ? 'افتح تحليل التغير لآخر فترتين قبل اعتماد خطة مبيعات جديدة.'
          : 'ثبّت متابعة الصفوف الأعلى قيمة، ثم راقب التغير في الفترة التالية.',
        health: recentDelta != null && recentDelta < 0 ? 'يحتاج تفسيرًا' : 'اتجاه إيجابي يحتاج متابعة',
        issue: recentDelta != null && recentDelta < 0
          ? 'القيمة في أحدث صف أقل من الصف السابق؛ يلزم تفكيك التغير قبل اعتماد خطة مبيعات.'
          : 'المصدر يثبت قيمة مبيعات قابلة للقراءة، مع اختلافات بين الصفوف يمكن تحويلها إلى متابعة تشغيلية.',
        why: topSalesRow ? `أعلى صف قيمة هو ${topSalesRow.documentNo} بقيمة ${topSalesRow.netAmount.toLocaleString('ar-YE')} YER، لذلك يبدأ الفحص من مصدر القيمة الأعلى.` : 'القيمة الكلية متاحة من المصدر.',
        soWhat: 'الرقم الإجمالي وحده لا يشرح سبب الحركة؛ المطلوب معرفة أي أصناف/فترات صنعت التغير ثم تحويلها إلى متابعة.',
        next: 'راجع الصفوف الأعلى قيمة، ثم قارن آخر الفترات قبل تثبيت خطة المبيعات.',
        owner: 'مسؤول المبيعات',
        measure: 'أعد قياس صافي المبيعات في الفترة التالية مع الاحتفاظ بنفس تعريف الحقل والمصدر.',
        blocker: 'لا يوجد بُعد عميل في هذا الـFixture، لذلك لا يتم اختلاق تركّز العملاء أو RFM.',
        risk: 'خطر اتخاذ خطة مبيعات على الإجمالي فقط دون معرفة محرك التغير.',
      }
    : domain === 'profitability'
      ? {
          label: 'ربحية',
          recommendation: weakestMargin
            ? `ابدأ بمراجعة ${weakestMargin.documentNo} قبل أي تغيير تسعيري.`
            : 'أعد حساب الهامش على نفس المصدر قبل اتخاذ قرار تسعير.',
          health: weakestMargin && weakestMargin.margin < 10 ? 'تحتاج مراجعة' : 'قابلة للمتابعة',
          issue: weakestMargin && weakestMargin.margin < 10
            ? `يوجد صف بهامش منخفض يبلغ ${weakestMargin.margin.toFixed(1)}%، ما يستحق فحص السعر والتكلفة قبل التوسع.`
            : 'الهامش المحسوب من المصدر متاح، ولا تظهر من هذا الـFixture وحده قضية هامش حرجة مثبتة.',
          why: weakestMargin ? `أضعف صف من حيث الهامش هو ${weakestMargin.documentNo} عند ${weakestMargin.margin.toFixed(1)}%.` : 'الهامش محسوب من الربح ÷ صافي المبيعات.',
          soWhat: 'الهامش المنخفض لا يثبت السبب؛ يجب عزل السعر والتكلفة على مستوى الصف قبل أي قرار تسعير.',
          next: 'افتح الصفوف الأقل هامشًا، وطابق السعر والتكلفة مع المصدر الأصلي، ثم حدد الإجراء.',
          owner: 'المدير المالي / مسؤول التسعير',
          measure: 'أعد حساب الهامش بعد الإجراء من نفس الحقول وبنفس المصدر.',
          blocker: 'لا توجد فئة منتج مستقلة أو تكلفة معيارية خارج الحقول الحالية؛ لذلك لا يتم اختلاق سبب الهامش.',
          risk: 'خطر تعديل السعر أو التكلفة بناءً على هامش إجمالي دون معرفة مصدر التآكل.',
        }
      : {
          label: 'تحصيل',
          recommendation: outstandingTotal > 0
            ? 'رتّب الصفوف المفتوحة حسب الرصيد ثم اربطها بعميل وتاريخ استحقاق قبل إجراء التحصيل.'
            : 'لا تنشئ إجراء تحصيل قبل ظهور رصيد مفتوح مثبت.',
          health: outstandingTotal > 0 ? 'تحتاج أولوية' : 'لا يوجد رصيد مفتوح مثبت',
          issue: outstandingTotal > 0
            ? `يوجد ${outstandingTotal.toLocaleString('ar-YE')} YER رصيد مفتوح مشتق من الصافي ناقص المدفوع.`
            : 'لا يظهر رصيد مفتوح من الحقول الحالية.',
          why: outstandingRows.length ? `يوجد ${outstandingRows.length} صفوف مفتوحة؛ الأولوية تبدأ من الصفوف ذات الرصيد الأعلى.` : 'لا يوجد صف مفتوح مثبت.',
          soWhat: 'هذا مؤشر مفتوح مشتق وليس دفتر ذمم محاسبيًا؛ لا يمكن إثبات عمر الدين أو العميل من هذا المصدر.',
          next: 'رتّب الصفوف المفتوحة حسب الرصيد، ثم اربطها بعميل وتاريخ استحقاق قبل إجراء التحصيل.',
          owner: 'مسؤول التحصيل',
          measure: 'أعد قياس الرصيد المفتوح ونسبة المدفوع بعد الإجراء من نفس المصدر.',
          blocker: 'لا يوجد مفتاح عميل أو تاريخ استحقاق في الـFixture؛ لذلك لا يتم اختلاق أعمار أو أولويات عميل.',
          risk: 'خطر معاملة الرصيد المفتوح كذمم قابلة للتحصيل دون التحقق من طبيعتها واستحقاقها.',
        };

  return (
    <section className="overflow-hidden rounded-[22px] border border-primary-200 bg-white shadow-sm">
      <div className="bg-[linear-gradient(135deg,#07151c,#102b30)] p-5 text-white lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.16em] text-primary-200">ADVISOR · {model.label.toUpperCase()}</div>
            <h3 className="mt-1 text-2xl font-black tracking-tight">{model.health}</h3>
            <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300">{model.issue}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.06] px-4 py-3 text-right">
            <div className="text-[9px] text-slate-400">المالك</div>
            <div className="mt-1 text-sm font-black text-white">{model.owner}</div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3 lg:p-6">
        {[
          ['لماذا الآن؟', model.why],
          ['ماذا يعني؟', model.soWhat],
          ['الخطوة التالية', model.next],
          ['القياس', model.measure],
          ['العائق', model.blocker],
          ['التوصية', model.recommendation],
          ['المخاطر', model.risk],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-ink-100 bg-ink-50/70 p-4">
            <div className="text-[9px] font-black text-primary-700">{label}</div>
            <div className="mt-2 text-[11px] leading-5 font-semibold text-ink-800">{value}</div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-ink-100 bg-white p-5 lg:p-6">
        <button
          type="button"
          onClick={() => setDecisionState('مسودة قرار منشأة')}
          disabled={decisionState !== 'جاهز'}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary-700 px-4 py-2.5 text-[10px] font-black text-white disabled:bg-success-600 disabled:text-white"
        >
          {decisionState === 'جاهز' ? 'إنشاء مسودة قرار' : 'تم إنشاء مسودة القرار'}
        </button>
        <Link to="/decision-experience" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-[10px] font-black text-primary-800">فتح مساحة القرار</Link>
        <Link to="/work-center" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-ink-200 px-4 py-2.5 text-[10px] font-black text-ink-800">افتح مسار العمل</Link>
        <span className="inline-flex min-h-10 items-center rounded-xl border border-ink-100 bg-ink-50 px-4 py-2.5 text-[10px] font-black text-ink-500">المعاينة لا تحفظ قرارًا فعليًا</span>
      </div>
    </section>
  );
}

type PreviewSmartResult = {
  sourceLabel: string; headline: string; signalTitle: string; signalMessage: string;
  whyNow: string; recommendationTitle: string; recommendationAction: string;
  measurement: string; blocker: string; status: string; evidence: string[]; href: string;
};
function getPreviewSmartResult(route: string): PreviewSmartResult {
  const sourceLabel = PREVIEW_DATASET.name;
  const first = LIVE_ROWS[0]; const last = LIVE_ROWS[LIVE_ROWS.length - 1];
  const paidTotal = LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0);
  const open = LIVE_TOTALS.netAmount - paidTotal;
  const margin = LIVE_TOTALS.netAmount > 0 ? (LIVE_TOTALS.profit / LIVE_TOTALS.netAmount) * 100 : 0;
  const base = { sourceLabel, measurement: 'أعد القياس من نفس source/job/evidence lineage بعد أي إجراء.', href: '/reports/smart/demo' };
  if (route === '/' || route === '/reports' || route === '/reports/sales') return { ...base,
    headline: 'المبيعات ترتفع 137.5% بينما 768 YER ما تزال مفتوحة مشتقة.', signalTitle: 'نمو المبيعات',
    signalMessage: 'salesQty ارتفع من 8 إلى 19 وحدة في طرفي العينة.', whyNow: 'أحدث الفترات تحمل أعلى وحدات مبيعات؛ لذلك يجب قراءة النمو مع التحصيل.',
    recommendationTitle: 'تابع النمو والتحصيل معًا', recommendationAction: 'راجع الصفوف الأعلى قيمة ثم افصل نمو المبيعات عن الرصيد المفتوح قبل اعتماد خطة جديدة.',
    blocker: 'لا يوجد customer_id؛ لا يتم اختلاق RFM أو تركّز عملاء.', status: 'مبيعات · Source-derived', evidence: ['salesQty=8→19','netAmount=3,186 YER','open=' + open.toLocaleString('ar-YE') + ' YER'] };
  if (route === '/reports/inventory' || route === '/reports/inventory-intelligence' || route === '/inventory') return { ...base,
    headline: '3 صفوف حديثة تحت تغطية 2.00 مع ارتفاع الطلب.', signalTitle: 'مخاطر تغطية مركزة',
    signalMessage: 'DOC-28-010/011/012 تحمل تغطية 1.82–1.84.', whyNow: 'الانخفاض ظهر في أحدث الفترات مع وصول المبيعات إلى 17–19 وحدة.',
    recommendationTitle: 'راجع إعادة الطلب للأصناف الثلاثة', recommendationAction: 'تحقق من lead time وreorder point ثم ثبّت خطة الشراء.',
    blocker: 'المصدر لا يحتوي lead time أو reorder point أو purchase quantity.', status: 'مخزون · Actionable', evidence: ['DOC-28-010','DOC-28-011','DOC-28-012'] };
  if (route === '/reports/profitability') return { ...base,
    headline: 'الهامش الكلي 28.8% والربح 918 YER مثبتان من المصدر.', signalTitle: 'ربحية قابلة للتفسير',
    signalMessage: 'profit ÷ netAmount = ' + margin.toFixed(1) + '% من الصفوف نفسها.', whyNow: 'يمكن عزل الصفوف الأقل هامشًا قبل تعديل التسعير.',
    recommendationTitle: 'ابدأ بالصفوف الأقل هامشًا', recommendationAction: 'طابق السعر والتكلفة في الصفوف الأقل هامشًا قبل اعتماد تغيير تسعيري.',
    blocker: 'سبب الهامش وتكلفة معيارية خارج الحقول الحالية غير مثبتة.', status: 'ربحية · Source-derived', evidence: ['profit=918 YER','netAmount=3,186 YER','margin=' + margin.toFixed(1) + '%'] };
  if (route === '/reports/receivables' || route === '/analytics/liquidity') return { ...base,
    headline: '768 YER رصيد مفتوح مشتق؛ ليس دفتر ذمم محاسبيًا.', signalTitle: 'رصيد مفتوح مشتق',
    signalMessage: 'netAmount − paidAmount = 768 YER.', whyNow: 'الرصيد قابل للقياس، لكن العميل والاستحقاق غير مثبتين.',
    recommendationTitle: 'تحقق قبل إجراء التحصيل', recommendationAction: 'اربط الصفوف المفتوحة بعميل وdueDate من المصدر المحاسبي الفعلي.',
    blocker: 'customer_id وdueDate غير موجودين.', status: 'مالي · Derived', evidence: ['netAmount=3,186 YER','paidAmount=2,418 YER','open=768 YER'] };
  if (route === '/reports/demand-velocity' || route === '/intelligence/forecasts') return { ...base,
    headline: 'اتجاه الطلب صاعد 137.5% بين طرفي العينة.', signalTitle: 'اتجاه طلب صاعد',
    signalMessage: 'salesQty انتقل من 8 إلى 19 وحدة.', whyNow: 'آخر 3 فترات منخفضة التغطية أيضًا.',
    recommendationTitle: 'اربط اتجاه الطلب بالمخزون', recommendationAction: 'راقب salesQty مع currentStock قبل اعتماد كمية شراء.',
    blocker: 'لا توجد lead time أو reorder point؛ لا يوجد forecast شراء معتمد.', status: 'طلب · Trend-derived', evidence: ['salesGrowth=137.5%','periods=12','lowCoverage=3'] };
  if (route === '/decision-experience' || route === '/decision-inbox' || route === '/command-center' || route === '/advisor-cases' || route === '/intelligence' || route === '/intelligence/recommendations') return { ...base,
    headline: '3 إشارات قابلة للتحويل إلى مسودة قرار، وليست قرارًا معتمدًا.', signalTitle: 'P1 · مراجعة تغطية المخزون',
    signalMessage: 'أحدث 3 صفوف تحت 2.00 ويمكن ردّها إلى أدلة محددة.', whyNow: 'الإشارة حديثة ومتزامنة مع ارتفاع salesQty.',
    recommendationTitle: 'أنشئ مسودة قرار مراجعة', recommendationAction: 'اربط المسودة بـDOC-28-010/011/012 وتحقق من مدخلات الشراء المفقودة.',
    blocker: 'لا يوجد قرار فعلي أو outcome محفوظ في Fixture المعاينة.', status: 'Decision-ready · pending approval', evidence: ['DOC-28-010','DOC-28-011','DOC-28-012'] };
  if (route === '/work-center' || route === '/operations') return { ...base,
    headline: 'هناك عمل محدد؛ Outcome التنفيذ لم يحدث بعد.', signalTitle: '3 أعمال مراجعة',
    signalMessage: 'كل صف منخفض التغطية يمكن تحويله إلى عمل قابل للتتبع.', whyNow: 'الأدلة محددة، لكن التنفيذ الحقيقي غير مثبت.',
    recommendationTitle: 'حوّل الإشارة إلى عمل', recommendationAction: 'أنشئ مهام مراجعة lead time/reorder point ثم اربطها بالقرار.',
    blocker: 'لا توجد نتيجة تنفيذ حقيقية في المصدر.', status: 'Work-ready · outcome pending', evidence: ['lowCoverage=3','owner=inventory/procurement','outcome=pending'] };
  if (route === '/trust' || route === '/metrics' || route === '/data-quality' || route === '/import' || route === '/import/analyze') return { ...base,
    headline: 'المصدر مقروء والحكم قابل لإعادة التتبع إلى صفوفه.', signalTitle: 'Source-derived evidence',
    signalMessage: '12 صفًا و11 حقلاً تدخل في الحسابات المعروضة.', whyNow: 'كل claim يجب أن يبقى مربوطًا بالمصدر والدليل نفسه أثناء التنقل.',
    recommendationTitle: 'حافظ على lineage', recommendationAction: 'لا تعيد تعريف المصدر عند الانتقال؛ استخدم Report Context نفسه.',
    blocker: 'المعاينة Fixture وليست tenant حيًا.', status: 'Provenance · source-bound', evidence: ['rows=12','columns=11','fixture=' + sourceLabel] };
  if (route === '/analytics/rfm' || route === '/customers') return { ...base,
    headline: 'تحليل العملاء محجوب لأن customer_id غير موجود.', signalTitle: 'Customer dimension missing',
    signalMessage: 'لا توجد هوية عميل موثوقة في المصدر.', whyNow: 'أي RFM أو تركّز عملاء الآن سيكون اختلاقًا.',
    recommendationTitle: 'أضف customer_id', recommendationAction: 'اربط sales rows بمعرف عميل ثم أعد تشغيل التحليل.',
    blocker: 'customer_id غير موجود.', status: 'BLOCKED · insufficient data', evidence: ['customer_id=absent','rows=12'] };
  if (route === '/analytics/aging') return { ...base,
    headline: 'Aging غير قابل للاشتقاق لأن dueDate مفقود.', signalTitle: 'تاريخ الاستحقاق مفقود',
    signalMessage: 'المصدر يوفر documentDate ولا يوفر dueDate.', whyNow: '768 YER المفتوحة لا تكفي لبناء buckets عمرية.',
    recommendationTitle: 'أضف dueDate', recommendationAction: 'بعد توفر dueDate أعد تصنيف الأرصدة المفتوحة مع lineage.',
    blocker: 'dueDate غير موجود.', status: 'BLOCKED · due date missing', evidence: ['documentDate=present','dueDate=absent','open=768 YER'] };
  if (route === '/reports/purchases' || route === '/suppliers') return { ...base,
    headline: 'لا يوجد ذكاء مشتريات قابل للإثبات من هذا المصدر.', signalTitle: 'Purchasing source missing',
    signalMessage: 'purchase_qty وpurchase_amount وsupplier غير موجودة.', whyNow: 'ملء الشاشة بأرقام مشتريات سيحوّل نقص البيانات إلى بيانات وهمية.',
    recommendationTitle: 'اربط مصدر مشتريات حقيقي', recommendationAction: 'أدخل supplier_id وpurchase fields ثم أعد تشغيل intelligence.',
    blocker: 'حقول المشتريات والمورد غير موجودة.', status: 'BLOCKED · purchasing source missing', evidence: ['supplier_id=absent','purchase_qty=absent','purchase_amount=absent'] };
  if (route === '/benchmark') return { ...base,
    headline: 'Benchmark غير متاح دون cohort مرجعي مستقل.', signalTitle: 'لا توجد عينة مقارنة',
    signalMessage: 'المعاينة تمثل عينة واحدة فقط.', whyNow: 'أي benchmark رقمي الآن سيكون مختلقًا.',
    recommendationTitle: 'أدخل reference cohort', recommendationAction: 'اربط نفس المؤشر بعينة مرجعية مستقلة قبل المقارنة.',
    blocker: 'reference cohort غير موجود.', status: 'BLOCKED · no benchmark sample', evidence: ['sample=1','referenceCohort=absent'] };
  if (route === '/replay') return { ...base,
    headline: 'Replay مكتمل حتى decision gate؛ Outcome لم يحدث بعد.', signalTitle: 'Replay جاهز',
    signalMessage: 'يمكن إعادة بناء signal → recommendation → decision gate.', whyNow: 'لدينا evidence قبل التنفيذ فقط.',
    recommendationTitle: 'انتظر Outcome الحقيقي', recommendationAction: 'بعد التنفيذ أضف outcome source ثم قارن قبل/بعد.',
    blocker: 'outcome غير موجود في Fixture.', status: 'PENDING OUTCOME', evidence: ['signal=evidence-bound','outcome=absent'] };
  return { ...base,
    headline: PUBLIC_SMART_INTELLIGENCE.intelligence.advisorBrief.headline ?? 'حكم ذكي مرتبط بالمصدر.',
    signalTitle: PUBLIC_SMART_INTELLIGENCE.intelligence.signals[0]?.title ?? 'إشارة مرتبطة بالمصدر',
    signalMessage: PUBLIC_SMART_INTELLIGENCE.intelligence.signals[0]?.message ?? PUBLIC_SMART_INTELLIGENCE.intelligence.summary,
    whyNow: PUBLIC_SMART_INTELLIGENCE.intelligence.recommendations[0]?.whyNow ?? 'راجع الدليل.',
    recommendationTitle: PUBLIC_SMART_INTELLIGENCE.intelligence.recommendations[0]?.title ?? 'مراجعة الدليل',
    recommendationAction: PUBLIC_SMART_INTELLIGENCE.intelligence.recommendations[0]?.action ?? 'راجع الدليل المرتبط بالمصدر.',
    blocker: PUBLIC_SMART_INTELLIGENCE.intelligence.recommendations[0]?.blocker ?? 'اعتماد الدليل غير مثبت.',
    status: 'Source-derived', evidence: PUBLIC_SMART_INTELLIGENCE.intelligence.signals[0]?.evidence ?? []
  };
}

function PreviewBusinessSurface({ path }: { path: string }) {
  const [decisionState, setDecisionState] = useState<Record<string, 'جاهز' | 'مسودة قرار' | 'مكتمل'>>({});
  const paidTotal = LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0);
  const outstanding = LIVE_ROWS.reduce((sum, row) => sum + (row.netAmount - row.paidAmount), 0);
  const margin = LIVE_TOTALS.netAmount > 0 ? (LIVE_TOTALS.profit / LIVE_TOTALS.netAmount) * 100 : null;
  const first = LIVE_ROWS[0];
  const last = LIVE_ROWS[LIVE_ROWS.length - 1];
  const salesGrowth = first.salesQty > 0 ? ((last.salesQty - first.salesQty) / first.salesQty) * 100 : null;
  const rowMargins = LIVE_ROWS.filter(row => row.netAmount > 0).map(row => ({ ...row, margin: (row.profit / row.netAmount) * 100 })).sort((a, b) => a.margin - b.margin);

  const route = path.replace(/\/$/, '') || '/';
  const routeTitle: Record<string, string> = {
    '/reports/smart/': 'التقرير الذكي من الـFixture',
    '/analytics': 'مركز التحليلات · حدود المصدر',
    '/analytics/rfm': 'RFM · غير متاح دون بعد العملاء',
    '/analytics/abc': 'ABC · غير متاح دون تصنيف منتجات معتمد',
    '/analytics/aging': 'أعمار التحصيل · غير متاح دون تواريخ استحقاق',
    '/analytics/liquidity': 'السيولة المشتقة من المدفوع والمفتوح',
    '/intelligence/scenarios': 'السيناريوهات · لا توجد فرضيات معتمدة',
    '/trust': 'حالة الثقة في الـFixture',
    '/metrics': 'حوكمة المؤشرات',
    '/replay': 'إعادة التتبع · لا توجد نتيجة تنفيذية',
    '/benchmark': 'Benchmark · لا توجد عينة مقارنة',
    '/connections': 'الاتصالات · حالة المعاينة',
    '/settings': 'إعدادات الشركة · تتطلب tenant',
    '/settings/profile': 'ملف المستخدم · يتطلب جلسة',
    '/master-data': 'البيانات الرئيسية',
    '/alternative-groups': 'البدائل · غير موجودة في الـFixture',
    '/onboarding': 'التجهيز التجاري · بيانات المعاينة',
    '/': 'لوحة الأعمال من الـFixture الحالي',
    '/reports': 'مركز التقارير',
    '/reports/sales': 'المبيعات الموجودة داخل الـFixture',
    '/reports/purchases': 'المشتريات · غير متاحة في هذا المصدر',
    '/reports/inventory': 'تقرير المخزون',
    '/reports/inventory-intelligence': 'ذكاء المخزون',
    '/reports/receivables': 'المبالغ المفتوحة المستخرجة من الـFixture',
    '/reports/profitability': 'الربحية المحسوبة من الـFixture',
    '/reports/demand-velocity': 'حركة الطلب من وحدات المبيعات',
    '/reports/executive': 'الملخص التنفيذي',
    '/command-center': 'مركز القرار',
    '/decision-inbox': 'صندوق القرار',
    '/decision-experience': 'تجربة القرار',
    '/advisor-cases': 'حالات المستشار',
    '/intelligence': 'ذكاء القرار',
    '/intelligence/recommendations': 'التوصيات',
    '/intelligence/forecasts': 'التوقع الاتجاهي',
    '/work-center': 'مركز العمل',
    '/operations': 'العمليات',
    '/data-quality': 'جودة المصدر',
    '/import': 'استيراد المصدر',
    '/import/analyze': 'تحليل المصدر',
    '/customers': 'العملاء · غير متاحين في هذا المصدر',
    '/products': 'المنتجات المستخرجة من الـFixture',
    '/inventory': 'المخزون التشغيلي',
  };
  const title = routeTitle[route] ?? 'مساحة المعاينة';
  
  const sourceUnavailable = (reason: string) => (
    <section className="rounded-2xl border border-warning-200 bg-warning-50/70 p-5">
      <div className="text-xs font-black text-warning-900">لا توجد بيانات كافية لهذا المجال</div>
      <p className="mt-2 text-sm leading-6 text-warning-900/80">{reason}</p>
      <div className="mt-3 text-[10px] text-warning-800">Fixture المعاينة: 28-inventory-stockout-reorder.csv · لا يتم اختلاق صفوف أو أرقام بديلة.</div>
    </section>
  );

  const previewResult = getPreviewSmartResult(route);

  const commonHeader = (
    <>
      <PreviewSourceBanner />
      <PreviewNavigation currentPath={route} />
      <div className="flex flex-col gap-1">
        <div className="text-[9px] font-black tracking-[.14em] text-primary-600">PREVIEW BUSINESS SURFACE</div>
        <h2 className="text-xl font-black text-ink-950">{title}</h2>
        <p className="text-xs leading-5 text-ink-500">النتيجة الذكية هنا مرتبطة بالمجال الحالي وليست إعادة عرض لإشارة واحدة في كل الشاشات.</p>
      </div>
      <IntelligenceResultRail
        sourceLabel={previewResult.sourceLabel}
        headline={previewResult.headline}
        signalTitle={previewResult.signalTitle}
        signalMessage={previewResult.signalMessage}
        evidence={previewResult.evidence}
        whyNow={previewResult.whyNow}
        recommendationTitle={previewResult.recommendationTitle}
        recommendationAction={previewResult.recommendationAction}
        measurement={previewResult.measurement}
        blocker={previewResult.blocker}
        status={previewResult.status}
        href={previewResult.href}
      />
    </>
  );

  let body: ReactNode;

  if (route === '/reports/purchases' || route === '/customers' || route === '/suppliers') {
    body = sourceUnavailable(
      route === '/reports/purchases'
        ? 'حقول الشراء والمورد لا توجد في Fixture الحالي. لذلك لا نعرض تقرير مشتريات مزيفًا.'
        : route === '/customers'
          ? 'لا يوجد مفتاح عميل أو سجل عميل في Fixture الحالي. هذا المسار ينتظر مصدر مبيعات/عملاء معتمد.'
          : 'لا يوجد سجل مورد في Fixture الحالي. هذا المسار ينتظر مصدر مشتريات معتمد.'
    );
  } else if (route === '/data-quality' || route === '/import' || route === '/import/analyze') {
    const malformedRows = LIVE_ROWS.filter(row =>
      !row.documentNo || !row.documentDate || !row.productCode || !row.warehouse ||
      !Number.isFinite(row.salesQty) || !Number.isFinite(row.currentStock) || !Number.isFinite(row.netAmount)
    ).length;
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="الصفوف المقروءة" value={String(LIVE_ROWS.length)} meta="canonical fixture" />
          <PreviewMetric label="أخطاء البنية" value={String(malformedRows)} meta="header + measures" />
          <PreviewMetric label="التغطية المنخفضة" value={String(LOW_COVERAGE_ROWS.length)} meta="coverage < 2.00" />
          <PreviewMetric label="حالة المصدر" value="مقروء" meta="بدون صفوف مخترعة" />
        </div>
        <div className="rounded-2xl border border-success-200 bg-success-50/60 p-5 text-sm text-success-900">
          تم تحليل الملف من 12 صفًا و11 حقولًا، وكل المقاييس الرقمية المستخدمة في الواجهة قابلة للقراءة والتحقق.
        </div>
      </>
    );
  } else if (route === '/reports/inventory' || route === '/reports/inventory-intelligence' || route === '/inventory') {
    body = (
      <>
        <PreviewAdvisorReport />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PreviewMetric label="الصفوف" value={String(LIVE_ROWS.length)} meta="المصدر" />
          <PreviewMetric label="المبيعات" value={String(LIVE_TOTALS.salesQty)} meta="وحدة" />
          <PreviewMetric label="الرصيد" value={String(LIVE_TOTALS.currentStock)} meta="وحدة" />
          <PreviewMetric label="التغطية المنخفضة" value={String(LOW_COVERAGE_ROWS.length)} meta="أقل من 2.00" />
          <PreviewMetric label="صافي الربح" value={LIVE_TOTALS.profit.toLocaleString('ar-YE')} meta="YER" />
        </div>
        <PreviewInventoryTable />
        <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-4 text-xs text-primary-900">
          الإشارة المحسوبة من الـFixture: {LOW_COVERAGE_ROWS.length} أصناف لديها تغطية أقل من 2.00. الأولوية تبدأ من هذه الصفوف الثلاثة، وليس من رقم افتراضي.
        </div>
      </>
    );
  } else if (route === '/reports/sales') {
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="صافي المبيعات" value={LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} meta="YER · من الـFixture" />
          <PreviewMetric label="الربح" value={LIVE_TOTALS.profit.toLocaleString('ar-YE')} meta="YER · من الـFixture" />
          <PreviewMetric label="معدل التحصيل المشتق" value={LIVE_TOTALS.netAmount > 0 ? ((paidTotal / LIVE_TOTALS.netAmount) * 100).toFixed(1) + '%' : 'غير متاح'} meta="paid ÷ net" />
          <PreviewMetric label="الوحدات المباعة" value={String(LIVE_TOTALS.salesQty)} meta="من نفس الـFixture" />
        </div>
        <PreviewDomainAdvisor domain="sales" />
        <PreviewInventoryTable />
      </>
    );
  } else if (route === '/reports/profitability') {
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="صافي المبيعات" value={LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} meta="YER · من الـFixture" />
          <PreviewMetric label="الربح" value={LIVE_TOTALS.profit.toLocaleString('ar-YE')} meta="YER · من الـFixture" />
          <PreviewMetric label="الهامش المحسوب" value={margin == null ? 'غير متاح' : margin.toFixed(1) + '%'} meta="profit ÷ net" />
          <PreviewMetric label="أضعف هامش صفّي" value={rowMargins[0] ? rowMargins[0].margin.toFixed(1) + '%' : 'غير متاح'} meta="أفضل/أضعف صف" />
        </div>
        <PreviewDomainAdvisor domain="profitability" />
        <PreviewInventoryTable />
      </>
    );
  } else if (route === '/reports/receivables') {
    body = (
      <>
        <div className="rounded-2xl border border-warning-200 bg-warning-50/70 p-4 text-xs text-warning-900">
          هذه ليست دفتر ذمم محاسبيًا؛ إنها قيمة مفتوحة مشتقة فقط من الحقول الموجودة في المصدر: صافي المبيعات ناقص المدفوع.
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="إجمالي الصافي" value={LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} meta="YER" />
          <PreviewMetric label="إجمالي المدفوع" value={paidTotal.toLocaleString('ar-YE')} meta="YER" />
          <PreviewMetric label="المفتوح" value={outstanding.toLocaleString('ar-YE')} meta="YER · مشتق" />
          <PreviewMetric label="نسبة المدفوع" value={LIVE_TOTALS.netAmount > 0 ? ((paidTotal / LIVE_TOTALS.netAmount) * 100).toFixed(1) + '%' : 'غير متاح'} meta="paid ÷ net" />
        </div>
        <PreviewDomainAdvisor domain="receivables" />
        <PreviewInventoryTable rows={LIVE_ROWS.filter(row => row.netAmount > row.paidAmount)} />
      </>
    );
  } else if (route.startsWith('/reports/smart/')) {
    body = (
      <>
        <PreviewAdvisorReport />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PreviewMetric label="صفوف التقرير" value={String(LIVE_ROWS.length)} meta="الـFixture" />
          <PreviewMetric label="المبيعات" value={String(LIVE_TOTALS.salesQty)} meta="وحدة" />
          <PreviewMetric label="الرصيد" value={String(LIVE_TOTALS.currentStock)} meta="وحدة" />
          <PreviewMetric label="صافي المبيعات" value={LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} meta="YER" />
          <PreviewMetric label="الربح" value={LIVE_TOTALS.profit.toLocaleString('ar-YE')} meta="YER" />
        </div>
        <PreviewInventoryTable />
      </>
    );
  } else if (route === '/analytics/liquidity') {
    body = (
      <>
        <div className="rounded-2xl border border-warning-200 bg-warning-50/70 p-4 text-xs text-warning-900">
          هذا مؤشر سيولة مشتق من حقول المدفوع والصافي الموجودة في الـFixture؛ لا يمثل دفتر بنك أو صندوقًا محاسبيًا.
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="إجمالي الصافي" value={LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} meta="YER" />
          <PreviewMetric label="إجمالي المدفوع" value={LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0).toLocaleString('ar-YE')} meta="YER" />
          <PreviewMetric label="المفتوح" value={outstanding.toLocaleString('ar-YE')} meta="YER · مشتق" />
          <PreviewMetric label="نسبة المدفوع" value={LIVE_TOTALS.netAmount > 0 ? ((LIVE_ROWS.reduce((sum, row) => sum + row.paidAmount, 0) / LIVE_TOTALS.netAmount) * 100).toFixed(1) + '%' : 'غير متاح'} meta="paid ÷ net" />
        </div>
      </>
    );
  } else if (route === '/analytics' || route === '/analytics/rfm' || route === '/analytics/abc' || route === '/analytics/aging') {
    body = sourceUnavailable(
      route === '/analytics/rfm'
        ? 'لا يوجد بُعد عميل في الـFixture؛ لا يتم اختلاق RFM.'
        : route === '/analytics/abc'
          ? 'لا يوجد تصنيف منتجات مستقل في الـFixture؛ لا يتم اختلاق ABC.'
          : route === '/analytics/aging'
            ? 'لا توجد تواريخ استحقاق/أعمار في الـFixture؛ لا يتم اختلاق buckets.'
            : 'مركز التحليلات ينتظر حقول عمل إضافية غير موجودة في الـFixture الحالي.'
    );
  } else if (route === '/trust' || route === '/metrics' || route === '/replay' || route === '/benchmark' || route === '/connections' || route === '/settings' || route === '/settings/profile' || route === '/master-data' || route === '/alternative-groups' || route === '/onboarding' || route === '/intelligence/scenarios') {
    body = (
      <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-black text-ink-900">حالة المعاينة</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <PreviewMetric label="الـFixture" value="VALIDATED" meta="12 صفًا · 11 حقلاً" />
          <PreviewMetric label="بيانات الشركة" value="غير مرتبطة" meta="لا توجد جلسة tenant" />
          <PreviewMetric label="النتيجة التنفيذية" value="غير مسجلة" meta="لا يتم تحويل المتوقع إلى actual" />
        </div>
        <p className="mt-3 text-xs leading-6 text-ink-500">
          هذه الشاشة لا تُنتج حالة شركة مصطنعة. المعروض يوضح حدود المعاينة فقط، بينما بيانات الشركة الفعلية تبقى خلف الهوية وسياق الـtenant.
        </p>
      </section>
    );
  } else if (route === '/reports/demand-velocity' || route === '/intelligence/forecasts') {
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="أول شهر" value={String(first.salesQty)} meta={first.documentDate} />
          <PreviewMetric label="آخر شهر" value={String(last.salesQty)} meta={last.documentDate} />
          <PreviewMetric label="النمو بين الطرفين" value={salesGrowth == null ? 'غير متاح' : salesGrowth.toFixed(1) + '%'} meta="اتجاه وصفي" />
          <PreviewMetric label="عدد الفترات" value={String(LIVE_ROWS.length)} meta="صفًا زمنيًا في المصدر" />
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-black text-ink-900">السلسلة المصدرية</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {LIVE_ROWS.map(row => (
              <div key={row.documentNo} className="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                <div className="text-[10px] text-ink-400">{row.documentDate}</div>
                <div className="mt-1 text-lg font-black">{row.salesQty}</div>
                <div className="text-[10px] text-ink-500">وحدة مبيعات</div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  } else if (
    route === '/command-center' || route === '/decision-inbox' || route === '/decision-experience' ||
    route === '/advisor-cases' || route === '/intelligence' || route === '/intelligence/recommendations'
  ) {
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="إشارات عمل" value={String(LOW_COVERAGE_ROWS.length)} meta="تغطية أقل من 2.00" />
          <PreviewMetric label="أولوية" value="P1" meta="مراجعة مخزون" />
          <PreviewMetric label="صفوف متأثرة" value={String(LOW_COVERAGE_ROWS.length)} meta="من الـFixture" />
          <PreviewMetric label="الأثر المالي المثبت" value="غير متاح" meta="لا يوجد سعر قرار معتمد" />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {LOW_COVERAGE_ROWS.map(row => {
            const id = row.documentNo;
            const state = decisionState[id] ?? 'جاهز';
            return (
              <article key={id} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-warning-50 px-2 py-1 text-[10px] font-black text-warning-800">{state}</span>
                  <span className="text-[10px] font-black text-primary-700">{id}</span>
                </div>
                <h3 className="mt-3 text-sm font-black text-ink-900">{row.productCode} · {row.productName}</h3>
                <p className="mt-2 text-xs leading-5 text-ink-600">المبيعات {row.salesQty} · الرصيد {row.currentStock} · التغطية {(row.currentStock / row.salesQty).toFixed(2)}</p>
                <p className="mt-1 text-[10px] text-ink-400">المستودع {row.warehouse} · صافي {row.netAmount.toLocaleString('ar-YE')} YER</p>
                <button
                  type="button"
                  disabled={state !== 'جاهز'}
                  onClick={() => setDecisionState(previous => ({ ...previous, [id]: 'مسودة قرار' }))}
                  className="mt-3 w-full rounded-xl bg-primary-700 px-3 py-2.5 text-[11px] font-black text-white disabled:bg-ink-200 disabled:text-ink-500"
                >
                  {state === 'جاهز' ? 'إنشاء مسودة قرار' : 'المسودة منشأة'}
                </button>
              </article>
            );
          })}
        </div>
      </>
    );
  } else if (route === '/work-center' || route === '/operations') {
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="أعمال تنتظر الإجراء" value={String(LOW_COVERAGE_ROWS.length)} meta="من إشارات المصدر" />
          <PreviewMetric label="المصدر" value="محكوم" meta="fixture validated" />
          <PreviewMetric label="النتيجة" value="غير مسجلة" meta="لا توجد نتيجة فعلية في المصدر" />
          <PreviewMetric label="التعلم" value="معلّق" meta="بانتظار تنفيذ حقيقي" />
        </div>
        <div className="space-y-3">
          {LOW_COVERAGE_ROWS.map(row => (
            <div key={row.documentNo} className="flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-ink-400">{row.documentNo} · {row.warehouse}</div>
                <div className="mt-1 text-sm font-black text-ink-900">مراجعة إعادة الطلب لـ {row.productCode}</div>
                <div className="mt-1 text-xs text-ink-500">سببها: تغطية {(row.currentStock / row.salesQty).toFixed(2)} فقط.</div>
              </div>
              <span className="rounded-full bg-warning-50 px-3 py-1.5 text-[10px] font-black text-warning-800">بانتظار القرار</span>
            </div>
          ))}
        </div>
      </>
    );
  } else if (route === '/reports/executive' || route === '/' || route === '/reports') {
    body = (
      <>
        <PreviewAdvisorReport />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PreviewMetric label="الصفوف" value={String(LIVE_ROWS.length)} meta="Fixture الحالي" />
          <PreviewMetric label="المبيعات" value={String(LIVE_TOTALS.salesQty)} meta="وحدة" />
          <PreviewMetric label="الرصيد" value={String(LIVE_TOTALS.currentStock)} meta="وحدة" />
          <PreviewMetric label="صافي المبيعات" value={LIVE_TOTALS.netAmount.toLocaleString('ar-YE')} meta="YER" />
          <PreviewMetric label="الربح" value={LIVE_TOTALS.profit.toLocaleString('ar-YE')} meta="YER" />
        </div>
        <PreviewInventoryTable />
        <div className="grid gap-3 md:grid-cols-3">
          <Link to="/reports/inventory" className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm hover:border-primary-200"><div className="text-xs font-black">المخزون</div><div className="mt-1 text-[10px] text-ink-400">كل الصفوف والتغطية</div></Link>
          <Link to="/decision-experience" className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm hover:border-primary-200"><div className="text-xs font-black">القرار</div><div className="mt-1 text-[10px] text-ink-400">3 إشارات قابلة للعمل</div></Link>
          <Link to="/work-center" className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm hover:border-primary-200"><div className="text-xs font-black">العمل</div><div className="mt-1 text-[10px] text-ink-400">تحويل الإشارة إلى إجراء</div></Link>
        </div>
      </>
    );
  } else if (route === '/products') {
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="أصناف مميزة في المصدر" value={String(new Set(LIVE_ROWS.map(row => row.productCode)).size)} meta="SKU" />
          <PreviewMetric label="وحدات مباعة" value={String(LIVE_TOTALS.salesQty)} meta="من الـFixture" />
          <PreviewMetric label="الرصيد الحالي" value={String(LIVE_TOTALS.currentStock)} meta="من الـFixture" />
          <PreviewMetric label="إشارة إعادة الطلب" value={String(LOW_COVERAGE_ROWS.length)} meta="تغطية منخفضة" />
        </div>
        <PreviewInventoryTable />
      </>
    );
  } else {
    body = sourceUnavailable('هذا المسار لا يملك مجال بيانات مناسبًا داخل ملف المخزون الحالي. يتم عرض حالة صريحة بدل نقل بيانات من مجال آخر.');
  }

  return (
    <div dir="rtl" className="space-y-5 pb-10">
      {commonHeader}
      {body}
      <footer className="rounded-xl border border-ink-100 bg-ink-50/70 p-3 text-[10px] leading-5 text-ink-500">
        <strong className="text-ink-700">حد المعاينة:</strong> هذه البيانات حقيقية المصدر لكنها ليست بديلًا عن جلسة شركة مصادق عليها. أي قرار أو نتيجة تنفيذية نهائية يجب أن تمر عبر الشركة والسياق الأمني الفعلي.
      </footer>
    </div>
  );
}

function ProposalCommercialDemoPage() {
  const location = useLocation();
  const demoPath = location.pathname;
  const [liveQuery, setLiveQuery] = useState('');
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, boolean>>({});
  const [jobTitle, setJobTitle] = useState('مشروع ذكاء الأعمال وتحليل البيانات');
  const [client, setClient] = useState('عميل محتمل');
  const [requirements, setRequirements] = useState('لوحة قيادة للمبيعات والمؤشرات المالية\nرفع Excel وCSV والتحقق من الجودة\nتحليل الذمم وأعمار التحصيل\nتحليل المخزون والتنبؤ بالطلب\nتوصيات ودعم القرار');

  const mapped = useMemo(() => requirements.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(requirement => {
    const ranked = CAPABILITIES.map(capability => ({ capability, score: scoreCapability(requirement, capability) })).sort((a, b) => b.score - a.score);
    const match = ranked[0];
    return { requirement, match: match && match.score > 0 ? match.capability : null };
  }), [requirements]);

  const matched = mapped.filter(item => item.match);
  const unmatched = mapped.filter(item => !item.match);

  return (
    <div dir="rtl" className="space-y-6 print:bg-white print:text-black">
      <div className="flex flex-col gap-5 rounded-[22px] border border-indigo-300/20 bg-[linear-gradient(135deg,#0b1020_0%,#172554_56%,#312e81_100%)] p-6 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,.8)] lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-primary-100"><Wand2 size={16} /> العرض التجاري · المنتج الفعلي</div>
            <h1 className="text-2xl font-black sm:text-3xl">من تقرير حقيقي إلى قرار يمكن تنفيذه وقياس نتيجته.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-100">هذه ليست شاشة شكلية منفصلة. كل خطوة أدناه تفتح مساحة فعلية من المنصة، مع الحفاظ على المصدر والدليل وحالة القرار والتنفيذ والنتيجة.</p>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['01','المصدر → الدليل','الأصل والبصمة والثقة قبل الاستنتاج.'],
              ['02','الإشارة → المستشار','سبب وأولوية وتوصية مرتبطة بالدليل.'],
              ['03','القرار → التنفيذ','اعتماد مستقل ثم انتقال السياق إلى العمل.'],
              ['04','النتيجة → التعلم','قراءة ما حدث فعليًا دون تخمين.'],
            ].map(([index, label, detail]) => (
              <div key={index} className="rounded-2xl border border-white/10 bg-white/[.06] p-3.5 shadow-sm">
                <div className="text-[9px] font-black tracking-[.12em] text-primary-200">{index}</div>
                <div className="mt-1.5 text-[11px] font-black text-white">{label}</div>
                <div className="mt-1 text-[9px] leading-5 text-slate-300">{detail}</div>
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary-900 hover:bg-primary-50 print:hidden lg:mt-1"><Printer size={16} /> طباعة / PDF</button>
      </div>

      <BuyerProofPanel />

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="section-kicker">SMART REPORT · LIVE PRODUCT SURFACE</div>
            <h2 className="text-xl font-black text-ink-950">العقل نفسه ظاهر داخل العرض، وليس مجرد وصف له</h2>
            <p className="text-[11px] leading-5 text-ink-500">هذه الطبقة تستخدم محرك ذكاء التقرير العام نفسه على الـFixture الحالي، ثم تربط الإشارة بالتوصية والدليل والقرار وحدود التنفيذ.</p>
          </div>
          <Link to="/reports/smart/demo" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary-700 px-4 text-[10px] font-black text-white">
            افتح التقرير الكامل ←
          </Link>
        </div>
        <UniversalIntelligenceChain result={PUBLIC_SMART_INTELLIGENCE} />
      </section>

      <section className="rounded-[22px] border border-ink-800 bg-[linear-gradient(135deg,#08111f,#0f2231)] p-5 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,.9)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-primary-200">Fixture المستخدم في العرض</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">هذه أرقام الـFixture، وليست بيانات شركة حيّة</h2>
            <p className="mt-2 max-w-3xl text-[11px] leading-6 text-slate-300">البيانات المعروضة أدناه تُقرأ وقت البناء مباشرة من الملف canonical fixture: 28-inventory-stockout-reorder.csv. كل مؤشر في هذه المساحة مشتق من الصفوف نفسها، ولا توجد أرقام ملخّصة مستقلة عنها.</p>
          </div>
          <Link to="/reports" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-4 py-3 text-xs font-black text-ink-950">مركز التقارير ←</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['عدد الصفوف', LIVE_ROWS.length.toLocaleString('ar-EG'), 'من الملف'],
            ['وحدات المبيعات', LIVE_TOTALS.salesQty.toLocaleString('ar-EG'), 'مجموع المصدر'],
            ['الرصيد الحالي', LIVE_TOTALS.currentStock.toLocaleString('ar-EG'), 'مجموع المصدر'],
            ['صافي المبيعات', LIVE_TOTALS.netAmount.toLocaleString('ar-EG'), 'YER · محسوب'],
            ['الربح', LIVE_TOTALS.profit.toLocaleString('ar-EG'), 'YER · محسوب'],
          ].map(([label,value,state]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[.05] p-4">
              <div className="text-2xl font-black tracking-tight">{value}</div>
              <div className="mt-1.5 text-[10px] font-bold text-white">{label}</div>
              <div className="mt-1 text-[9px] text-primary-200">{state}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5">الملف: 28-inventory-stockout-reorder.csv</span>
          <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5">YER · بيانات الـFixture كما هي محفوظة في المستودع</span>
          <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5">التغطية = الرصيد الحالي ÷ المبيعات</span>
        </div>
      </section>

      <section className="rounded-[22px] border border-ink-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-primary-600">PREVIEW BUSINESS SURFACE</div>
            <h2 className="mt-1 text-xl font-black text-ink-950">
              {demoPath.includes('/reports/inventory') ? 'المخزون الذي يمكن قراءته والعمل عليه'
                : demoPath.includes('/reports/sales') ? 'المبيعات والربحية من الصفوف نفسها'
                : demoPath.includes('/reports/receivables') ? 'الرصيد المفتوح للتحصيل'
                : demoPath.includes('/decision-experience') ? 'إشارات قابلة للتحويل إلى قرار'
                : 'بيانات المعاينة القابلة للبحث'}
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">ابحث، اقرأ، واتخذ إجراءً على نفس بيانات المعاينة. الحالة والتغطية محسوبتان من الـFixture المعروض، لا من نص تسويقي مستقل.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input value={liveQuery} onChange={event => setLiveQuery(event.target.value)} className="input h-10 w-full sm:w-80" placeholder="ابحث بالمستند أو الصنف أو المستودع" aria-label="بحث في البيانات المصدرية" />
          </div>
        </div>

        {(() => {
          const query = liveQuery.trim().toLowerCase();
          const filtered = LIVE_ROWS.filter(row => [row.documentNo, row.productCode, row.productName, row.warehouse, row.documentDate].join(' ').toLowerCase().includes(query));
          const totalSales = LIVE_TOTALS.salesQty;
          const totalStock = LIVE_TOTALS.currentStock;
          const totalNet = LIVE_TOTALS.netAmount;
          const totalProfit = LIVE_TOTALS.profit;
          const lowCoverage = LOW_COVERAGE_ROWS;
          const decisionRows = lowCoverage.slice(0, 3);
          return (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['عدد الصفوف', LIVE_ROWS.length.toLocaleString('ar-EG'), 'من الـFixture'],
                  ['المبيعات', totalSales.toLocaleString('ar-EG'), 'وحدة'],
                  ['الرصيد الحالي', totalStock.toLocaleString('ar-EG'), 'وحدة'],
                  ['صافي المبيعات', totalNet.toLocaleString('ar-EG'), 'YER'],
                  ['الربح', totalProfit.toLocaleString('ar-EG'), 'YER'],
                ].map(([label, value, meta]) => (
                  <div key={label} className="rounded-xl border border-ink-100 bg-ink-50/70 p-3">
                    <div className="text-[10px] font-bold text-ink-500">{label}</div>
                    <div className="mt-1 text-xl font-black text-ink-950">{value}</div>
                    <div className="mt-0.5 text-[9px] text-ink-400">{meta}</div>
                  </div>
                ))}
              </div>

              {demoPath.includes('/decision-experience') ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {decisionRows.map(row => {
                    const coverage = row.currentStock / row.salesQty;
                    const created = Boolean(decisionDrafts[row.documentNo]);
                    return (
                      <article key={row.documentNo} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-warning-50 px-2 py-1 text-[10px] font-black text-warning-800">{created ? 'مسودة قرار منشأة' : 'تغطية منخفضة'}</span>
                          <span className="text-[10px] font-black text-primary-700">{row.documentNo}</span>
                        </div>
                        <h3 className="mt-3 font-black text-ink-900">{row.productCode} · {row.productName}</h3>
                        <p className="mt-2 text-xs leading-5 text-ink-600">المبيعات {row.salesQty} · الرصيد {row.currentStock} · التغطية {coverage.toFixed(2)}</p>
                        <p className="mt-1 text-[10px] text-ink-400">المستودع {row.warehouse} · صافي {row.netAmount.toLocaleString('ar-EG')} YER</p>
                        <button type="button" className="mt-3 w-full rounded-xl bg-primary-700 px-3 py-2.5 text-[11px] font-black text-white disabled:cursor-default disabled:bg-ink-200 disabled:text-ink-500" disabled={created} onClick={() => setDecisionDrafts(previous => ({ ...previous, [row.documentNo]: true }))}>{created ? 'تم إنشاء مسودة القرار' : 'إنشاء مسودة قرار'}</button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-ink-100">
                  <table className="min-w-[980px] w-full text-right text-xs">
                    <thead className="bg-ink-50">
                      <tr>{(demoPath.includes('/reports/sales') ? ['المستند','التاريخ','الصنف','الصافي','التكلفة','الربح','المدفوع'] : ['المستند','التاريخ','الصنف','المستودع','المبيعات','الرصيد','التغطية','الحالة']).map(label => <th key={label} className="px-3 py-3 font-black text-ink-700">{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filtered.map(row => {
                        const coverage = row.salesQty > 0 ? row.currentStock / row.salesQty : 0;
                        const low = coverage < 2;
                        return (
                          <tr key={row.documentNo} className="border-t border-ink-100 transition hover:bg-primary-50/50">
                            <td className="px-3 py-3 font-black text-ink-900">{row.documentNo}</td>
                            <td className="px-3 py-3">{row.documentDate}</td>
                            <td className="px-3 py-3 font-semibold">{row.productCode} · {row.productName}</td>
                            {demoPath.includes('/reports/sales') ? (
                              <>
                                <td className="px-3 py-3">{row.netAmount.toLocaleString('ar-EG')}</td>
                                <td className="px-3 py-3">{row.cost.toLocaleString('ar-EG')}</td>
                                <td className="px-3 py-3 font-black">{row.profit.toLocaleString('ar-EG')}</td>
                                <td className="px-3 py-3">{row.paidAmount.toLocaleString('ar-EG')}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-3">{row.warehouse}</td>
                                <td className="px-3 py-3">{row.salesQty}</td>
                                <td className="px-3 py-3 font-black">{row.currentStock}</td>
                                <td className="px-3 py-3">{coverage.toFixed(2)}</td>
                                <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${low ? 'bg-warning-50 text-warning-800' : 'bg-emerald-50 text-emerald-800'}`}>{low ? 'تغطية منخفضة' : 'مراقبة'}</span></td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <div className="p-8 text-center text-sm text-ink-400">لا توجد صفوف مطابقة للبحث.</div>}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-primary-100 bg-primary-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black text-primary-900">إشارة قابلة للعمل</div>
                  <div className="mt-0.5 text-[10px] text-primary-700">{LOW_COVERAGE_ROWS.length} صفوف من أصل {LIVE_ROWS.length} لديها تغطية أقل من 2.00 بناءً على الرصيد ÷ المبيعات.</div>
                </div>
                <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-primary-800">{filtered.length} صف ظاهر</span>
              </div>
            </>
          );
        })()}
      </section>

      <CommercialValueChain
        title="ما الذي يراه العميل عندما يشتري الأغبري؟"
        subtitle="عرض واحد يربط إدخال المصدر بالدليل والذكاء والقرار والتنفيذ والنتيجة؛ كل مرحلة تقود إلى مساحة فعلية داخل المنصة."
        stages={[
          { label: 'المصدر', englishLabel: 'SOURCE', status: 'مسار فعلي', detail: 'إدخال Excel / CSV / مستندات عبر المسار الموحد.', href: '/import', tone: 'active' },
          { label: 'الدليل', englishLabel: 'EVIDENCE', status: 'مبني على الدليل', detail: 'فحص الثقة واللقطات والبصمة قبل اعتماد الاستنتاج.', href: '/trust', tone: 'active' },
          { label: 'الإشارة', englishLabel: 'SIGNAL', status: 'ذكاء مرتبط بالمصدر', detail: 'إشارات ومخاطر وفرص وتوقعات مرتبطة بالمصدر.', href: '/intelligence', tone: 'active' },
          { label: 'المستشار', englishLabel: 'ADVISOR', status: 'ملخص المستشار', detail: 'أهم نتيجة، لماذا، ماذا بعد، المالك، وحدود الدليل.', href: '/advisor-cases', tone: 'active' },
          { label: 'القرار', englishLabel: 'DECISION', status: 'اعتماد مستقل', detail: 'قرار مستقل عن التوصية وقابل للتدقيق والاعتماد.', href: '/decision-inbox', tone: 'attention' },
          { label: 'التنفيذ', englishLabel: 'WORK', status: 'مركز العمل', detail: 'تحويل القرار إلى عمل ومتابعة حالة التنفيذ.', href: '/work-center', tone: 'neutral' },
          { label: 'النتيجة', englishLabel: 'OUTCOME', status: 'قراءة النتيجة', detail: 'قراءة ما حدث فعليًا دون تحويل المتوقع إلى نتيجة.', href: '/decision-inbox', tone: 'neutral' },
          { label: 'التعلم', englishLabel: 'LEARNING', status: 'إعادة التتبع', detail: 'استخراج ما ثبت بعد التنفيذ وإعادة استخدامه في القرار القادم.', href: '/replay', tone: 'neutral' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader title="سياق الوظيفة" subtitle="اكتب المتطلبات الفعلية، ثم اعرض المطابقة قبل فتح العرض الحي." />
          <CardBody className="space-y-4">
            <div><label htmlFor="proposal-demo-title" className="mb-1 block text-xs font-medium text-ink-700">عنوان الوظيفة</label><input id="proposal-demo-title" value={jobTitle} onChange={event => setJobTitle(event.target.value)} className="input min-h-11 w-full" /></div>
            <div><label htmlFor="proposal-demo-client" className="mb-1 block text-xs font-medium text-ink-700">اسم العميل / السياق</label><input id="proposal-demo-client" value={client} onChange={event => setClient(event.target.value)} className="input w-full" /></div>
            <div><label htmlFor="proposal-demo-requirements" className="mb-1 block text-xs font-medium text-ink-700">متطلبات الوظيفة — سطر لكل مطلب</label><textarea id="proposal-demo-requirements" value={requirements} onChange={event => setRequirements(event.target.value)} className="input min-h-64 w-full resize-y" /></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="ملخص العرض" subtitle="صياغة عرض ديمو مبنية على المنتجات والمسارات الموجودة." />
          <CardBody>
            <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
              <div className="text-xs text-ink-400">العميل</div><div className="mt-1 text-lg font-bold text-ink-900">{client}</div>
              <div className="mt-4 text-xs text-ink-400">الوظيفة</div><div className="mt-1 text-base font-semibold text-ink-800">{jobTitle}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><div className="text-xs text-indigo-700">المطابق</div><div className="mt-1 text-2xl font-black text-indigo-800">{matched.length}</div></div>
              <div className="rounded-xl border border-warning-200 bg-warning-50 p-4"><div className="text-xs text-warning-700">يحتاج مراجعة</div><div className="mt-1 text-2xl font-black text-warning-800">{unmatched.length}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <Link to="/" className="btn-primary text-xs"><Target size={14} /> افتح المنتج</Link>
              <Link to="/reports/smart/demo" className="btn-secondary text-xs"><Wand2 size={14} /> شاهد التقرير الذكي</Link><Link to="/reports/executive" className="btn-secondary text-xs"><FileText size={14} /> افتح التقرير التنفيذي</Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="مطابقة قدرات المنصة" subtitle="كل مطلب يرتبط بمسار فعلي داخل المنصة، وما لا يطابقه النظام يبقى واضحًا للمراجعة." />
        <CardBody className="space-y-3">
          {mapped.length === 0 && <div className="rounded-xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400">أدخل متطلبات الوظيفة للبدء.</div>}
          {mapped.map(item => (
            <div key={item.requirement} className="rounded-xl border border-ink-100 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0"><div className="text-sm font-semibold text-ink-800">{item.requirement}</div>{item.match && <div className="mt-1 text-xs text-ink-400">مرتبط بـ: {item.match.title}</div>}</div>
                {item.match ? <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"><CheckCircle2 size={14} /> قدرة موجودة</span><Link to={item.match.path} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 print:hidden">العرض الحي <ArrowUpRight size={14} /></Link></div> : <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700">يحتاج مراجعة بشرية</span>}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="تسلسل العرض الحي" subtitle="تدفق مقترح لعرض حقيقي بدون نسخ منفصلة من المنتج." />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {matched.slice(0, 8).map((item, index) => <Link key={`${item.requirement}-${index}`} to={item.match!.path} className="rounded-xl border border-ink-100 p-4 transition hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50/40 print:border-ink-300"><div className="text-xs font-bold text-primary-600">0{index + 1}</div><div className="mt-2 text-sm font-semibold text-ink-800">{item.match!.title}</div><div className="mt-1 text-xs leading-5 text-ink-400">{item.match!.description}</div></Link>)}
          </div>
        </CardBody>
      </Card>

      <div className="text-xs leading-5 text-ink-400">لا تُنشئ هذه الشاشة بيانات أعمال اصطناعية؛ ولا تنقل الدليل أو النتيجة بين مصادر مختلفة. كل رابط يفتح الوحدة الفعلية داخل المنصة، وتبقى القيم والنتائج تحت مصدر الحقيقة والشركة الحالية.</div>
    </div>
  );
}


export function ProposalDemoPage() {
  const location = useLocation();
  const previewRoute = location.pathname !== '/proposal-demo';
  return previewRoute
    ? <PreviewBusinessSurface path={location.pathname} />
    : <ProposalCommercialDemoPage />;
}
