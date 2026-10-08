import { parseDate, parseNumber } from '../file-engine/normalizer.ts';

export type ReportSignalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ReportSignalDriver = {
  dimension: string;
  value: string;
  contribution: number | null;
  share: number | null;
  period: string | null;
  expected: number | null;
  actual: number | null;
  why: string;
  proof: string[];
};

export type ReportSignal = {
  id: string;
  severity: ReportSignalSeverity;
  title: string;
  message: string;
  evidence: string[];
  affectedRows?: number;
  soWhat: string;
  impact: string;
  ownerHint: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  priorityReason: string[];
  drivers?: ReportSignalDriver[];
};

export type ReportRecommendation = {
  id: string;
  status: 'PROPOSED';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  title: string;
  action: string;
  why: string;
  evidence: string[];
  ownerHint: string;
  impact: string;
  expectedOutcome: string;
  whyNow: string;
  measurement: string;
  risk: string;
  blocker: string;
  limitation: string;
  deadlineHint?: string;
};

export type ReportForecast = {
  status: 'AVAILABLE' | 'INSUFFICIENT_SAMPLE';
  metric: string | null;
  method: string;
  observedPeriods: number;
  nextPeriod: string | null;
  nextValue: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  note: string;
};

export type ReportGuidance = {
  focus: string;
  inspect: string[];
  ownerHint: string;
  boundary: string;
};

export type BusinessFindingKind = 'FINDING' | 'RISK' | 'OPPORTUNITY';

export type BusinessFinding = {
  id: string;
  kind: BusinessFindingKind;
  priority: 'high' | 'medium' | 'low';
  title: string;
  statement: string;
  value?: number | null;
  unit?: string | null;
  dimensionLabel?: string | null;
  dimensionValue?: string | null;
  evidence: string[];
  limitation: string;
  action: string;
};

export type AdvisorBrief = {
  health: 'HEALTHY' | 'ATTENTION' | 'REVIEW_REQUIRED';
  headline: string;
  topFinding: BusinessFinding | null;
  topRisk: BusinessFinding | null;
  topOpportunity: BusinessFinding | null;
  recommendedAction: string | null;
  ownerHint: string;
  expectedOutcome: string | null;
  measurement: string | null;
  proofRequirement: string;
};

export function selectExecutiveSignal(
  intelligence: Pick<ReportIntelligence, 'signals'>,
): ReportSignal | null {
  const signals = intelligence.signals ?? [];
  const isWeak = (signal: ReportSignal) => {
    const id = String(signal.id ?? '').trim();
    const evidence = signal.evidence ?? [];
    const haystack = [signal.title, signal.message, ...evidence].join(' ');
    if (id.startsWith('unmapped:') || id.startsWith('missing:') || id.startsWith('document:')) return true;
    if (signal.severity === 'info') return true;
    if (/غير محدد/.test(haystack) && evidence.some((item) => /^dimensionField=|^dimensionValue=/.test(item))) return true;
    return false;
  };
  const usable = signals.filter((signal) => !isWeak(signal));
  const pool = usable.length > 0 ? usable : signals.filter((signal) => signal.severity !== 'info');
  const priorityRank: Record<string, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };
  const severityRank: Record<ReportSignalSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  return [...pool].sort((a, b) =>
    (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0)
    || severityRank[b.severity] - severityRank[a.severity]
    || (Number(b.affectedRows ?? -1) - Number(a.affectedRows ?? -1))
    || a.title.localeCompare(b.title, 'ar'),
  )[0] ?? null;
}

export function selectExecutiveRecommendation(
  intelligence: Pick<ReportIntelligence, 'signals' | 'recommendations'>,
  signal: ReportSignal | null = selectExecutiveSignal(intelligence),
): ReportRecommendation | null {
  if (signal) {
    const matching = intelligence.recommendations.find((item) => item.id === 'rec:' + signal.id);
    if (matching) return matching;
  }
  return [...(intelligence.recommendations ?? [])].sort((a, b) => {
    const rank: Record<ReportRecommendation['priority'], number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0);
  })[0] ?? null;
}

export type ReportIntelligence = {
  businessQuestion: string;
  summary: string;
  signals: ReportSignal[];
  recommendations: ReportRecommendation[];
  forecast: ReportForecast;
  guidance: ReportGuidance;
  findings: BusinessFinding[];
  risks: BusinessFinding[];
  opportunities: BusinessFinding[];
  advisorBrief: AdvisorBrief;
};

type ReportInput = {
  specialty?: string | null;
  rowCount?: number | null;
  sourceAnalysis?: { datasets?: unknown[] } | null;
  renderedOutput?: Record<string, unknown>;
  canonicalRows?: Array<{ row_number?: number; data?: Record<string, unknown> | null }>;
  persistedIntelligenceCalculations?: Array<{
    metric_id?: string | null;
    name?: string | null;
    formula?: string | null;
    availability_state?: string | null;
    value?: number | null;
    unit?: string | null;
    sample_size?: number | null;
    usable_sample?: number | null;
    confidence?: number | null;
    limitation?: string | null;
    evidence?: unknown;
  }>;
};

function text(value: unknown): string { return String(value ?? '').trim(); }
function normalized(value: unknown): string { return text(value).toLowerCase().normalize('NFKC').replace(/[\s_\-./]+/g, ''); }
function numeric(value: unknown): number | null {
  return parseNumber(value);
}

function isExtractionArtifactHeader(value: unknown): boolean {
  const key = text(value);
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(key) || /^20\d{2}-?$/.test(key);
}

function canonicalSourceField(value: unknown, specialty?: ReportInput['specialty']): string | null {
  const key = normalized(value);
  const inventoryBalanceKeys = ['\u0627\u0644\u0631\u0635\u064a\u062f','\u0627\u0644\u0631\u0635\u064a\u062f\u0627\u0644\u062d\u0627\u0644\u064a','\u0627\u0644\u0645\u062e\u0632\u0648\u0646\u0627\u0644\u062d\u0627\u0644\u064a','\u0627\u0644\u0643\u0645\u064a\u0629\u0627\u0644\u0645\u062a\u0648\u0641\u0631\u0629','\u0627\u0644\u0643\u0645\u064a\u0629\u0627\u0644\u0645\u062a\u0627\u062d\u0629','currentstock','onhand'];
  if (specialty === 'inventory' && inventoryBalanceKeys.includes(key)) return 'current_stock';
  const aliases: Array<[string, string[]]> = [
    ['date', ['date','invoice_date','التاريخ','تاريخالفاتورة','التاريخ2026']],
    ['invoice_number', ['invoice_number','invoice number','invoice_no','رقمالفاتورة','رقمالفاتوره']],
    ['invoice_type', ['invoice_type','invoice type','نوعالفاتورة','نوعالفاتوره']],
    ['customer_name', ['customer_name','customer','client','اسم العميل','العميل']],
    ['supplier_name', ['supplier_name','supplier','اسم المورد','المورد']],
    ['product_name', ['product_name','product','item_name','item','name','اسم الصنف','اسم المنتج','الصنف']],
    ['total', ['total','total_amount','sales','purchase','amount','الإجمالي','الاجمالي','اجماليالفاتورة','اجماليالفاتوره']],
    ['net_amount', ['net_amount','مبلغالصافيبالمحلي','مبلغصافالمحلي','الصافيبالمحلي']],
    ['paid_amount', ['paid_amount','paid','المدفوع','المبلغالمدفوع']],
    ['balance', ['balance','outstanding_balance','الرصيد','الرصيدالمستحق','المتبقي']],
    ['credit', ['credit','دائن']],
    ['debit', ['debit','مدين']],
    ['quantity', ['quantity','qty','الكمية','العدد']],
    ['current_stock', ['current_stock','currentstock','stock','on_hand','onhand','الرصيدالحالي','المخزونالحالي','الكميةالمتوفرة','الكميةالمتاحة']],
    ['daily_sales_rate', ['daily_sales_rate','dailysalesrate','معدل البيع اليومي','معدل البيع ليومي','معدل البيعيومي','متوسط البيع اليومي']],
    ['annual_sales_rate', ['annual_sales_rate','annualsalesrate','معدل البيع العام','معدل البيع السنوي']],
    ['sales_qty', ['sales_qty','salesqty','كمية المبيعات','الكميةالمباعة','صافي المبيعات','صافيالمبيعات']],
    ['stockout_days', ['stockout_days','stockoutdays','أيام النفاد','فترة النفاد','الفترة المتوقعة لنفاد الكمية','الفترةالمتوقعةلنفادالكمية']],
    ['stock_age_days', ['stock_age_days','stockagedays','عمر المخزون','عمرالمخزون']],
    ['stock_age_period_days', ['stock_age_period_days','stockageperioddays','عمر المخزون للفترة','عمرالمخزونللفترة']],
    ['opening_stock', ['opening_stock','openingstock','الرصيد الافتتاحي','الرصيدالإفتتاحي','المخزون الافتتاحي']],
    ['incoming', ['incoming','inbound','الوارد','الـوارد']],
    ['net_inbound', ['net_inbound','netinbound','صافي الوارد','صافيوارد']],
    ['transfers_pending', ['transfers_pending','pending_transfer','تحويل غير مستلم','تحويلغيرمستلم']],
    ['unit_price', ['unit_price','سعرالوحدة']],
    ['cost', ['cost','cost_price','التكلفة']],
    ['price', ['price','السعر']],
    ['sku', ['sku','item_code','product_code','productcode','رقم الصنف','رقمالصنف','رمز الصنف','رمزالصنف','كود الصنف','كودالصنف']],
    ['category', ['category','الفئة','التصنيف']],
    ['warehouse', ['warehouse','المستودع','المخزن']],
  ];
  for (const [canonical, candidates] of aliases) {
    if (candidates.some((candidate) => normalized(candidate) === key)) return canonical;
  }
  return null;
}

function columnsOf(report: ReportInput): Array<Record<string, unknown>> {
  const dataset = report.sourceAnalysis?.datasets?.[0];
  if (!dataset || typeof dataset !== 'object') return [];
  const columns = (dataset as Record<string, unknown>).columns;
  if (!Array.isArray(columns)) return [];

  const descriptors = columns
    .map((item): Record<string, unknown> | null => {
      if (item && typeof item === 'object') {
        const column = item as Record<string, unknown>;
        const name = text(column.name ?? column.mappedField);
        if (!name || isExtractionArtifactHeader(name)) return null;
        const declaredMapped = text(column.mappedField);
        const semanticMapped = canonicalSourceField(name, report.specialty);
        const genericDeclared = /^(unknown|unmapped|غير.?معين|غير.?معرّف|undefined|null)$/i.test(declaredMapped);
        // The original header is the strongest local semantic evidence. Prefer
        // it over stale/placeholder persisted mappings so runtime intelligence
        // and the mapping table cannot disagree about the same source field.
        const mappedField = semanticMapped ?? (genericDeclared ? '' : declaredMapped);
        const mappingConfidence = semanticMapped ? Math.max(Number(column.mappingConfidence ?? 0), 96) : Number(column.mappingConfidence ?? 0);
        return { ...column, name, mappedField: mappedField || null, mappingConfidence };
      }
      const name = text(item);
      if (!name || isExtractionArtifactHeader(name)) return null;
      const mappedField = canonicalSourceField(name);
      return {
        name,
        mappedField,
        mappingConfidence: mappedField ? 85 : 0,
      };
    })
    .filter((item): item is Record<string, unknown> => item !== null);

  const rows = report.canonicalRows ?? [];
  return descriptors.map((column) => {
    if (!rows.length) return column;
    const key = dataKey(column);
    const nullCount = rows.reduce((count, row) => {
      const value = rowValue(row.data, key);
      return count + (value == null || String(value).trim() === '' ? 1 : 0);
    }, 0);
    if (column.nullCount == null) return { ...column, nullCount };
    return column;
  });
}

function findColumn(columns: Array<Record<string, unknown>>, aliases: string[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  columns.forEach((column) => {
    const mappedKey = normalized(column.mappedField);
    const rawKey = normalized(column.name);
    aliases.forEach((alias, rank) => {
      const token = normalized(alias);
      const matches = Boolean((mappedKey && mappedKey === token) || (rawKey && rawKey === token) || (mappedKey && mappedKey.includes(token)) || (rawKey && rawKey.includes(token)));
      if (matches && rank < bestRank) {
        best = column;
        bestRank = rank;
      }
    });
  });
  return best;
}

function dataKey(column: Record<string, unknown> | null | undefined): string {
  const name = text(column?.name);
  const mapped = text(column?.mappedField);
  return mapped || name;
}

function rowValue(row: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!row || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const target = normalized(key);
  const semantic = canonicalSourceField(key);
  for (const [rawKey, value] of Object.entries(row)) {
    if (normalized(rawKey) === target) return value;
    if (semantic && canonicalSourceField(rawKey) === semantic) return value;
  }
  return undefined;
}

function makePriority(severity: ReportSignalSeverity): ReportRecommendation['priority'] {
  if (severity === 'critical') return 'urgent';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function addSignal(signals: ReportSignal[], id: string, severity: ReportSignalSeverity, title: string, message: string, evidence: string[], affectedRows?: number): void {
  if (signals.some((item) => item.id === id)) return;
  signals.push({ id, severity, title, message, evidence, ...(affectedRows == null ? {} : { affectedRows }), soWhat: '', impact: '', ownerHint: '', priority: 'P3', priorityReason: [] });
}

function deriveSignals(report: ReportInput): ReportSignal[] {
  const signals: ReportSignal[] = [];
  const columns = columnsOf(report);
  const rows = report.canonicalRows ?? [];
  const renderedMetrics = report.renderedOutput?.sourceMetrics;
  const sourceMetrics = renderedMetrics && typeof renderedMetrics === 'object' ? renderedMetrics as Record<string, unknown> : {};
  const inventory = sourceMetrics.inventory && typeof sourceMetrics.inventory === 'object' ? sourceMetrics.inventory as Record<string, unknown> : {};
  const total = numeric(report.rowCount);

  for (const column of columns) {
    const nullCount = numeric(column.nullCount);
    if (nullCount != null && total != null && total > 0 && nullCount / total >= 0.2) {
      addSignal(
        signals,
        'missing:' + text(column.name ?? column.mappedField ?? 'field'),
        'medium',
        'نقص متكرر في حقل ' + text(column.name ?? column.mappedField ?? 'غير مسمى'),
        'الحقل يحتوي على ' + Math.round((nullCount / total) * 100) + '% من القيم غير المكتملة.',
        ['nullCount=' + nullCount, 'rowCount=' + total],
        nullCount,
      );
    }
    if (!column.mappedField && text(column.name)) {
      addSignal(
        signals,
        'unmapped:' + text(column.name),
        'low',
        'حقل غير معرّف دلاليًا: ' + text(column.name),
        'الحقل موجود في المصدر لكنه غير مرتبط بحقل أعمال كانونـي.',
        ['mappingConfidence=0'],
      );
    }
  }

  const specialty = text(report.specialty);
  if (specialty === 'inventory') {
    const missingPrice = numeric(inventory.missingPriceRows);
    const missingName = numeric(inventory.missingNameRows);
    const uniqueSku = numeric(inventory.uniqueSkuCount);
    const warehouses = numeric(inventory.warehouseCount);
    const unmappedFields = Array.isArray(inventory.unmappedFields) ? inventory.unmappedFields : [];
    if (missingPrice != null && missingPrice > 0) addSignal(signals, 'inventory:missing-price', 'high', 'أصناف بلا سعر', 'هناك ' + missingPrice + ' صفوف بلا سعر مثبت.', ['sourceMetrics.inventory.missingPriceRows'], missingPrice);
    if (missingName != null && missingName > 0) addSignal(signals, 'inventory:missing-name', 'medium', 'أصناف بلا اسم', 'هناك ' + missingName + ' صفوف تفتقد اسم الصنف.', ['sourceMetrics.inventory.missingNameRows'], missingName);
    if (uniqueSku != null && uniqueSku > 0) addSignal(signals, 'inventory:sku-coverage', 'info', 'هوية الأصناف قابلة للتجميع', 'يمكن تجميع المصدر إلى ' + uniqueSku + ' SKU فريدة.', ['sourceMetrics.inventory.uniqueSkuCount']);
    if (warehouses != null && warehouses > 1) addSignal(signals, 'inventory:warehouse-spread', 'info', 'المصدر موزع على مستودعات', 'تظهر البيانات عبر ' + warehouses + ' مستودعات.', ['sourceMetrics.inventory.warehouseCount']);
    if (unmappedFields.length > 0) addSignal(signals, 'inventory:unmapped-fields', 'medium', 'حقول تحتاج تعريفًا', 'توجد حقول غير مربوطة دلاليًا: ' + unmappedFields.map(String).join('، ') + '.', ['sourceMetrics.inventory.unmappedFields']);

    // Inventory reports often arrive as operational stock sheets rather than
    // standardized ERP exports. Analyze the actual business columns directly so
    // the advisor can produce useful, source-bound findings without fabricating a
    // price, cost, or financial valuation that the source does not contain.
    const stockColumn = findColumn(columns, ['current_stock', 'currentstock', 'stock', 'balance', 'الرصيد', 'الرصيد الحالي', 'المخزون الحالي', 'الكمية المتوفرة', 'الكمية المتاحة']);
    const skuColumn = findColumn(columns, ['sku', 'product_code', 'productcode', 'رقم الصنف', 'كود الصنف', 'رمز الصنف']);
    const productNameColumn = findColumn(columns, ['product_name', 'product', 'item_name', 'اسم الصنف', 'اسم المنتج', 'الصنف']);
    const dailyRateColumn = findColumn(columns, ['daily_sales_rate', 'dailysalesrate', 'معدل البيع اليومي', 'معدل البيع ليومي']);
    const annualRateColumn = findColumn(columns, ['annual_sales_rate', 'annualsalesrate', 'معدل البيع العام', 'معدل البيع السنوي']);
    const stockoutDaysColumn = findColumn(columns, ['stockout_days', 'stockoutdays', 'الفترة المتوقعة لنفاد الكمية', 'الفترةالمتوقعةلنفادالكمية', 'أيام النفاد']);
    const stockAgeColumn = findColumn(columns, ['stock_age_days', 'stockagedays', 'عمر المخزون', 'عمرالمخزون']);
    const stockAgePeriodColumn = findColumn(columns, ['stock_age_period_days', 'stockageperioddays', 'عمر المخزون للفترة', 'عمرالمخزونللفترة']);
    const openingColumn = findColumn(columns, ['opening_stock', 'openingstock', 'الرصيد الافتتاحي', 'الرصيدالإفتتاحي', 'المخزون الافتتاحي']);
    const incomingColumn = findColumn(columns, ['incoming', 'inbound', 'الوارد', 'الـوارد']);
    const netInboundColumn = findColumn(columns, ['net_inbound', 'netinbound', 'صافي الوارد', 'صافيوارد']);
    const netSalesColumn = findColumn(columns, ['sales_qty', 'salesqty', 'صافي المبيعات', 'صافيالمبيعات', 'كمية المبيعات']);
    const stockKey = dataKey(stockColumn);
    const skuKey = dataKey(skuColumn);
    const productNameKey = dataKey(productNameColumn);
    const dailyRateKey = dataKey(dailyRateColumn);
    const annualRateKey = dataKey(annualRateColumn);
    const stockoutDaysKey = dataKey(stockoutDaysColumn);
    const stockAgeKey = dataKey(stockAgeColumn);
    const stockAgePeriodKey = dataKey(stockAgePeriodColumn);
    const openingKey = dataKey(openingColumn);
    const incomingKey = dataKey(incomingColumn);
    const netInboundKey = dataKey(netInboundColumn);
    const netSalesKey = dataKey(netSalesColumn);
    const dateColumn = findColumn(columns, ['invoice_date', 'date', 'التاريخ']);
    const dateKey = dataKey(dateColumn);

    if (stockKey && rows.length) {
      let negativeStockRows = 0;
      let zeroStockRows = 0;
      let zeroStockWithSalesRows = 0;
      let stockoutWithin30Rows = 0;
      let stockoutWithin7Rows = 0;
      let knownStockoutRows = 0;
      let knownAgeRows = 0;
      let oldStockRows = 0;
      let reconciliationMismatches = 0;
      let totalStock = 0;
      let totalDailyRate = 0;
      let dailyRateRows = 0;
      const lowCoverageRows: Array<{ name: string; stock: number; demand: number; sales: number; coverageDays: number; basis: string }> = [];
      const datedDemandRows: Array<{ date: Date; sales: number }> = [];
      const fastMovingProducts: Array<{ name: string; rate: number }> = [];
      const urgentProducts: Array<{ name: string; days: number; stock: number }> = [];
      const negativeStockSamples: string[] = [];
      const stockoutSamples: string[] = [];

      for (const row of rows) {
        const stock = numeric(rowValue(row.data, stockKey));
        if (stock == null) continue;
        totalStock += stock;
        if (stock < 0) {
          negativeStockRows += 1;
          if (negativeStockSamples.length < 5) negativeStockSamples.push(rowRef + productName + ' · الرصيد=' + stock);
        }
        if (stock <= 0) zeroStockRows += 1;

        const dailyRate = dailyRateKey ? numeric(rowValue(row.data, dailyRateKey)) : null;
        const netSales = netSalesKey ? numeric(rowValue(row.data, netSalesKey)) : null;
        const sourceStockoutDays = stockoutDaysKey ? numeric(rowValue(row.data, stockoutDaysKey)) : null;
        const salesForCoverage = netSales;
        const productName = text(rowValue(row.data, productNameKey)) || text(rowValue(row.data, skuKey)) || 'صنف غير مسمى';
        const rowRef = row.row_number == null ? '' : 'الصف=' + row.row_number + ' · ';
        // Coverage is a time measure. Prefer the source's own stockout period;
        // otherwise derive days from current stock / daily sales rate.
        let coverageDays: number | null = null;
        let coverageBasis = '';
        if (sourceStockoutDays != null && Number.isFinite(sourceStockoutDays)) {
          coverageDays = sourceStockoutDays;
          coverageBasis = 'stockoutDaysField=' + stockoutDaysKey;
        } else if (dailyRate != null && dailyRate > 0) {
          coverageDays = stock / dailyRate;
          coverageBasis = 'stockField=' + stockKey + ' dailySalesField=' + dailyRateKey;
        }
        if (coverageDays != null && Number.isFinite(coverageDays) && coverageDays >= 0 && coverageDays <= 30) {
          lowCoverageRows.push({ name: productName, stock, demand: dailyRate ?? salesForCoverage ?? 0, sales: salesForCoverage ?? 0, coverageDays, basis: coverageBasis });
        }
        if (dateKey && salesForCoverage != null && salesForCoverage > 0) {
          const date = parseDateValue(rowValue(row.data, dateKey));
          if (date) datedDemandRows.push({ date, sales: salesForCoverage });
        }
        if (dailyRate != null && dailyRate > 0) {
          totalDailyRate += dailyRate;
          dailyRateRows += 1;
          fastMovingProducts.push({ name: productName, rate: dailyRate });
          if (stock <= 0) {
            zeroStockWithSalesRows += 1;
            if (stockoutSamples.length < 5) stockoutSamples.push(rowRef + productName + ' · الرصيد=' + stock + ' · معدل البيع اليومي=' + dailyRate);
          }
        } else if (netSales != null && netSales > 0 && stock <= 0) {
          zeroStockWithSalesRows += 1;
          if (stockoutSamples.length < 5) stockoutSamples.push(rowRef + productName + ' · الرصيد=' + stock + ' · صافي المبيعات=' + netSales);
        }

        const stockoutDays = stockoutDaysKey ? numeric(rowValue(row.data, stockoutDaysKey)) : null;
        if (stockoutDays != null && Number.isFinite(stockoutDays)) {
          knownStockoutRows += 1;
          if (stockoutDays >= 0 && stockoutDays <= 30 && (dailyRate == null || dailyRate > 0 || stock <= 0)) stockoutWithin30Rows += 1;
          if (stockoutDays >= 0 && stockoutDays <= 7 && (dailyRate == null || dailyRate > 0 || stock <= 0)) stockoutWithin7Rows += 1;
          if (stockoutDays >= 0 && stockoutDays <= 30) urgentProducts.push({ name: productName, days: stockoutDays, stock });
        }

        const age = stockAgePeriodKey ? numeric(rowValue(row.data, stockAgePeriodKey)) : (stockAgeKey ? numeric(rowValue(row.data, stockAgeKey)) : null);
        if (age != null) {
          knownAgeRows += 1;
          if (age >= 180 && (dailyRate == null || dailyRate <= 1)) oldStockRows += 1;
        }

        if (netSalesKey) {
          const opening = openingKey ? numeric(rowValue(row.data, openingKey)) : null;
          const incoming = incomingKey ? numeric(rowValue(row.data, incomingKey)) : null;
          const netInbound = netInboundKey ? numeric(rowValue(row.data, netInboundKey)) : null;
          const sales = numeric(rowValue(row.data, netSalesKey));
          let expectedClosing: number | null = null;
          // "صافي الوارد" in this source already includes the opening balance.
          // When explicit opening + incoming fields exist, use opening + incoming.
          // Otherwise fall back to netInbound as the cumulative inbound figure.
          if (opening != null && incoming != null) {
            expectedClosing = opening + incoming - (sales ?? 0);
          } else if (netInbound != null) {
            expectedClosing = netInbound - (sales ?? 0);
          }
          if (expectedClosing != null && stock != null && Math.abs(expectedClosing - stock) > 0.01) {
            reconciliationMismatches += 1;
          }
        }
      }

      if (negativeStockRows > 0) addSignal(
        signals,
        'inventory:negative-stock',
        negativeStockRows >= Math.max(5, Math.round(rows.length * 0.05)) ? 'critical' : 'high',
        'أرصدة مخزون سالبة',
        'يوجد ' + negativeStockRows + ' سجلًا برصيد سلبي؛ وهذا يمنع الاعتماد على حالة المخزون كما هي دون مطابقة الحركة والمستندات.',
        ['stockField=' + stockKey, 'negativeRows=' + negativeStockRows, 'sourceRows=' + rows.length, ...negativeStockSamples.map((sample) => 'sample=' + sample)],
        negativeStockRows,
      );
      if (zeroStockWithSalesRows > 0) addSignal(
        signals,
        'inventory:stockout',
        zeroStockWithSalesRows >= 5 ? 'critical' : 'high',
        'أصناف بلا رصيد مع وجود حركة بيع',
        'يوجد ' + zeroStockWithSalesRows + ' صنفًا بلا رصيد مع مؤشر بيع/طلب؛ هذه قائمة أولوية لفحص النفاد والتوريد.',
        ['stockField=' + stockKey, ...(dailyRateKey ? ['dailySalesField=' + dailyRateKey] : ['salesField=' + netSalesKey]), 'affectedRows=' + zeroStockWithSalesRows, ...stockoutSamples.map((sample) => 'sample=' + sample)],
        zeroStockWithSalesRows,
      );
      if (lowCoverageRows.length > 0) {
        const coverageSample = lowCoverageRows
          .slice()
          .sort((a, b) => a.coverageDays - b.coverageDays)
          .slice(0, 5)
          .map(item => item.name + ':' + item.coverageDays.toFixed(1) + ' يوم')
          .join('، ');
        const lowCoverageSales = lowCoverageRows.reduce((sum, item) => sum + (Number(item.sales) || 0), 0);
        const allSales = rows.reduce((sum, row) => {
          const value = netSalesKey ? numeric(rowValue(row.data, netSalesKey)) : null;
          return sum + (value != null && value > 0 ? value : 0);
        }, 0);
        const affectedSalesShare = allSales > 0 ? Math.round((lowCoverageSales / allSales) * 100) : null;
        const coverageEvidence = [
          'stockField=' + stockKey,
          ...(dailyRateKey ? ['dailySalesField=' + dailyRateKey] : []),
          ...(stockoutDaysKey ? ['stockoutDaysField=' + stockoutDaysKey] : []),
          'coverageThresholdDays=30',
          'affectedRows=' + lowCoverageRows.length,
          'sample=' + coverageSample,
          ...(affectedSalesShare == null ? [] : ['affectedSalesShare=' + affectedSalesShare + '%']),
        ];
        if (datedDemandRows.length >= 6) {
          const ordered = datedDemandRows.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
          const split = Math.max(2, Math.floor(ordered.length / 2));
          const early = ordered.slice(0, split);
          const recent = ordered.slice(-split);
          const earlyAvg = early.reduce((sum, point) => sum + point.sales, 0) / early.length;
          const recentAvg = recent.reduce((sum, point) => sum + point.sales, 0) / recent.length;
          if (earlyAvg > 0 && recentAvg / earlyAvg >= 1.25) {
            const acceleration = Math.round((recentAvg / earlyAvg - 1) * 100);
            addSignal(
              signals,
              'inventory:demand-pressure-low-coverage',
              'high',
              'الطلب يرتفع بينما التغطية قصيرة',
              'ارتفع متوسط الطلب في الجزء الأحدث من السلسلة بنحو ' + acceleration + '% مقارنة بالبداية، وفي الوقت نفسه يوجد ' + lowCoverageRows.length + ' سجلًا بتغطية لا تتجاوز 30 يومًا؛ هذا يجعل مراجعة إعادة الطلب أولوية تشغيلية.',
              [...coverageEvidence, 'earlyAverageSales=' + earlyAvg.toFixed(2), 'recentAverageSales=' + recentAvg.toFixed(2), 'demandAcceleration=' + acceleration + '%'],
              lowCoverageRows.length,
            );
          }
        }
        if (!signals.some((signal) => signal.id === 'inventory:demand-pressure-low-coverage')) {
          addSignal(
            signals,
            'inventory:low-coverage',
            'medium',
            'أصناف بتغطية لا تتجاوز 30 يومًا',
            'يوجد ' + lowCoverageRows.length + ' سجلًا لا تتجاوز تغطيته 30 يومًا وفق فترة النفاد المصدرية أو الرصيد ÷ معدل البيع اليومي؛ مراجعة إعادة الطلب مطلوبة قبل تحويل الإشارة إلى كمية شراء.',
            coverageEvidence,
            lowCoverageRows.length,
          );
        }
      }

      if (stockoutWithin7Rows > 0) addSignal(
        signals,
        'inventory:imminent-stockout-7d',
        'high',
        'نفاد متوقع خلال 7 أيام',
        'يوجد ' + stockoutWithin7Rows + ' صنفًا يظهر المصدر أنه قد ينفد خلال 7 أيام أو أقل.',
        ['stockoutDaysField=' + stockoutDaysKey, 'rows=' + stockoutWithin7Rows],
        stockoutWithin7Rows,
      );
      else if (stockoutWithin30Rows > 0) addSignal(
        signals,
        'inventory:low-coverage-30d',
        'medium',
        'أصناف بتغطية قصيرة',
        'يوجد ' + stockoutWithin30Rows + ' صنفًا بتغطية مصدرية لا تتجاوز 30 يومًا.',
        ['stockoutDaysField=' + stockoutDaysKey, 'rows=' + stockoutWithin30Rows],
        stockoutWithin30Rows,
      );
      if (reconciliationMismatches > 0) addSignal(
        signals,
        'inventory:movement-reconciliation',
        'high',
        'فجوة بين الحركة والرصيد النهائي',
        'يوجد ' + reconciliationMismatches + ' سجلًا لا يتطابق فيه الرصيد مع الرصيد الافتتاحي + صافي الوارد − صافي المبيعات.',
        ['openingField=' + openingKey, 'incomingField=' + incomingKey, 'netInboundField=' + netInboundKey, 'salesField=' + netSalesKey, 'stockField=' + stockKey, 'affectedRows=' + reconciliationMismatches],
        reconciliationMismatches,
      );
      if (dailyRateRows > 0) {
        const totalCoverage = totalDailyRate > 0 ? totalStock / totalDailyRate : null;
        addSignal(
          signals,
          'inventory:coverage-summary',
          'info',
          'تغطية المخزون قابلة للقياس',
          totalCoverage == null
            ? 'تم رصد معدل بيع يومي في ' + dailyRateRows + ' سجلًا، لكن لا يمكن حساب تغطية مجمعة آمنة.'
            : 'الرصيد الحالي يساوي مرجعيًا نحو ' + totalCoverage.toFixed(1) + ' يوم من معدل البيع اليومي المتاح.',
          ['stockField=' + stockKey, 'dailySalesField=' + dailyRateKey, 'stockRows=' + rows.length, 'dailyRateRows=' + dailyRateRows],
          dailyRateRows,
        );
      }
      if (oldStockRows > 0) addSignal(
        signals,
        'inventory:aging-attention',
        'medium',
        'مخزون قديم مع حركة يومية ضعيفة',
        'يوجد ' + oldStockRows + ' سجلًا بعمر مصدرّي مرتفع وحركة يومية منخفضة؛ يحتاج فحص الركود قبل إعادة الشراء.',
        ['ageField=' + (stockAgePeriodKey || stockAgeKey), ...(dailyRateKey ? ['dailySalesField=' + dailyRateKey] : []), 'affectedRows=' + oldStockRows],
        oldStockRows,
      );
    }
  } else if (specialty === 'sales' || specialty === 'purchases') {
    const amount = findColumn(columns, ['total_amount', 'net_amount', 'total', 'amount', 'sales', 'purchase']);
    const person = specialty === 'sales'
      ? findColumn(columns, ['customer_name', 'customer', 'العميل'])
      : findColumn(columns, ['supplier_name', 'supplier', 'المورد']);
    const dates = findColumn(columns, ['invoice_date', 'date', 'التاريخ']);
    if (!amount) addSignal(signals, specialty + ':amount-missing', 'high', 'القيمة المالية الأساسية غير واضحة', 'لا يوجد حقل مالي موثّق بما يكفي لإصدار إجمالي آمن.', ['amountField=missing']);
    if (!dates) addSignal(signals, specialty + ':date-missing', 'medium', 'الفترة الزمنية غير مثبتة', 'لا يوجد حقل تاريخ واضح؛ لذلك لا يصح بناء اتجاه زمني من هذا المصدر وحده.', ['dateField=missing']);
    if (!person) addSignal(signals, specialty + ':party-missing', 'medium', specialty === 'sales' ? 'هوية العميل غير متاحة' : 'هوية المورد غير متاحة', specialty === 'sales' ? 'لا يمكن توزيع التركيّز على العملاء دون حقل عميل.' : 'لا يمكن تقييم تركّز المشتريات دون هوية مورد.', ['partyField=missing']);
  } else if (specialty === 'receivables') {
    const balance = findColumn(columns, ['outstanding_balance', 'balance', 'receivable', 'الرصيد المستحق', 'المتبقي']);
    const age120 = findColumn(columns, ['age_over_120', 'over_120', '120']);
    if (!balance) addSignal(signals, 'receivables:balance-missing', 'high', 'الرصيد المستحق غير واضح', 'لا يوجد حقل رصيد مستحق قابل للتفسير بثقة كافية.', ['balanceField=missing']);
    if (!age120) addSignal(signals, 'receivables:aging-gap', 'medium', 'شرائح التأخر غير مكتملة', 'لا يظهر حقل واضح للفئة فوق 120 يومًا.', ['age120Field=missing']);
  }

  const textColumn = findColumn(columns, ['text', 'النص']);
  if (textColumn && rows.length) {
    const textKey = dataKey(textColumn);
    const lines = rows.map((row) => text(rowValue(row.data, textKey))).filter(Boolean);
    const pageColumn = findColumn(columns, ['page_number', 'page', 'الصفحة']);
    const pageKey = dataKey(pageColumn);
    const pages = pageKey
      ? new Set(rows.map((row) => text(rowValue(row.data, pageKey))).filter(Boolean)).size
      : null;
    const dateHits = lines.filter((line) => /(?:19|20)\d{2}[\/-]\d{1,2}[\/-]\d{1,2}|\b\d{1,2}[\/-]\d{1,2}[\/-](?:19|20)?\d{2}\b/.test(line)).length;
    const amountHits = lines.filter((line) => /(?:\d[\d,٬.]*)\s*(?:ريال|ر\.ي|YER|USD|دولار)?\b/i.test(line)).length;
    const headingLike = lines.filter((line) => line.length <= 90 && /(?:تقرير|كشف|إجمالي|اجمالي|المبيعات|المشتريات|المخزون|العملاء|المورد|الرصيد|الفاتورة|التاريخ|report|statement|total|sales|purchase|inventory|customer|supplier|invoice)/i.test(line)).length;

    addSignal(signals, 'document:structure', 'info', 'تم حفظ بنية الوثيقة', 'تمت المحافظة على ' + lines.length + ' سطرًا مقروءًا' + (pages == null ? '' : ' عبر ' + pages + ' صفحة') + ' بدل دمج الوثيقة في نص واحد.', ['lineCount=' + lines.length, 'pageCount=' + (pages == null ? 'unknown' : pages)]);
    if (headingLike > 0) addSignal(signals, 'document:sections', 'info', 'عناوين/أقسام قابلة للفهرسة', 'ظهرت ' + headingLike + ' أسطر تحمل مؤشرات عناوين أو أقسام أعمال يمكن استخدامها في التحليل التفصيلي.', ['headingLikeLines=' + headingLike]);
    if (dateHits === 0) addSignal(signals, 'document:date-gap', 'medium', 'التاريخ غير مثبت في النص المقروء', 'لم يظهر نمط تاريخ واضح في الأسطر المقروءة؛ لا يجوز بناء اتجاه زمني من الوثيقة وحدها.', ['datePatternHits=0']);
    else addSignal(signals, 'document:date-presence', 'info', 'تواريخ ظاهرة في المصدر', 'ظهرت أنماط تاريخ في ' + dateHits + ' أسطر من الوثيقة.', ['datePatternHits=' + dateHits]);
    if (amountHits > 0) addSignal(signals, 'document:amount-presence', 'info', 'قيم رقمية قابلة للفحص', 'ظهرت قيم رقمية/مالية في ' + amountHits + ' أسطر؛ يلزم تعيين دلالتها قبل استخدامها كإجماليات.', ['numericLineHits=' + amountHits]);
  }

  // Cross-field contradictions are source-quality signals. They identify records
  // that require direct source matching before they can support a financial decision.
  const invoiceColumn = findColumn(columns, ['invoice_number', 'invoice_no', 'رقم الفاتورة', 'فاتورة']);
  const totalColumn = findColumn(columns, ['total_amount', 'net_amount', 'total', 'amount', 'الإجمالي', 'الاجمالي']);
  const paidColumn = findColumn(columns, ['paid_amount', 'paid', 'المدفوع', 'المبلغ المدفوع']);
  if (rows.length && (totalColumn || paidColumn || invoiceColumn)) {
    const totalKey = dataKey(totalColumn);
    const paidKey = dataKey(paidColumn);
    const invoiceKey = dataKey(invoiceColumn);

    let paidAboveTotal = 0;
    const invoiceTotals = new Map<string, Set<number>>();
    for (const row of rows) {
      const totalValue = totalKey ? numeric(rowValue(row.data, totalKey)) : null;
      const paidValue = paidKey ? numeric(rowValue(row.data, paidKey)) : null;
      if (totalValue != null && paidValue != null && paidValue > totalValue + 0.01) paidAboveTotal += 1;

      if (invoiceKey && totalValue != null) {
        const invoice = text(rowValue(row.data, invoiceKey));
        if (invoice) {
          const values = invoiceTotals.get(invoice) ?? new Set<number>();
          values.add(totalValue);
          invoiceTotals.set(invoice, values);
        }
      }
    }

    if (paidAboveTotal > 0) {
      addSignal(
        signals,
        'source:paid-above-total',
        'high',
        'المدفوع يتجاوز الإجمالي في سجلات',
        'هناك ' + paidAboveTotal + ' سجلًا يظهر فيه المدفوع أكبر من إجمالي السجل؛ يجب مطابقة المصدر الأصلي والقيد المحاسبي قبل اعتماد التحصيل.',
        ['totalField=' + totalKey, 'paidField=' + paidKey, 'affectedRows=' + paidAboveTotal],
        paidAboveTotal,
      );
    }

    const conflictingInvoiceTotals = [...invoiceTotals.values()].filter((values) => values.size > 1).length;
    if (conflictingInvoiceTotals > 0) {
      addSignal(
        signals,
        'source:invoice-total-conflict',
        'high',
        'نفس رقم الفاتورة يظهر بإجماليات مختلفة',
        'يوجد ' + conflictingInvoiceTotals + ' أرقام فواتير لها أكثر من إجمالي داخل المصدر؛ قد تكون حركة صحيحة أو تعارضًا يحتاج مطابقة.',
        ['invoiceField=' + invoiceKey, 'totalField=' + totalKey, 'conflictingInvoices=' + conflictingInvoiceTotals],
        conflictingInvoiceTotals,
      );
    }
  }

  const keyColumn = findColumn(columns, ['sku', 'product_code', 'رقم الصنف', 'barcode']);
  const warehouseColumn = findColumn(columns, ['warehouse', 'المخزن', 'المستودع']);
  const priceColumn = findColumn(columns, ['price', 'السعر', 'selling_price', 'سعر البيع']);
  if (keyColumn && rows.length) {
    const keyName = dataKey(keyColumn);
    const warehouseName = dataKey(warehouseColumn);
    const priceName = dataKey(priceColumn);
    const seen = new Map<string, number>();
    const pricesBySku = new Map<string, Set<number>>();
    let duplicateCount = 0;
    for (const row of rows) {
      const value = text(rowValue(row.data, keyName));
      if (!value) continue;
      // Repeating a SKU across warehouses is a legitimate inventory grain.
      // Only flag a duplicate when it repeats within the same source context.
      const warehouse = warehouseName ? text(rowValue(row.data, warehouseName)) : '';
      const scopedKey = warehouse ? value + '|' + warehouse : value;
      const next = (seen.get(scopedKey) ?? 0) + 1;
      seen.set(scopedKey, next);
      if (next === 2) duplicateCount += 1;

      if (priceName) {
        const price = numeric(rowValue(row.data, priceName));
        if (price != null) {
          const values = pricesBySku.get(value) ?? new Set<number>();
          values.add(price);
          pricesBySku.set(value, values);
        }
      }
    }
    if (duplicateCount > 0) {
      addSignal(
        signals,
        'source:duplicate-key',
        'high',
        'تكرار داخل نفس سياق المصدر',
        'تم العثور على ' + duplicateCount + ' مفاتيح مكررة داخل نفس السياق؛ قد تكون ازدواجية فعلية وتحتاج مطابقة مع الدليل.',
        ['keyField=' + keyName, 'scopeField=' + (warehouseName || 'none'), 'duplicateKeys=' + duplicateCount],
      );
    }

    if (specialty === 'inventory' && priceColumn) {
      const variablePriceSkuCount = [...pricesBySku.values()].filter((values) => values.size > 1).length;
      if (variablePriceSkuCount > 0) {
        addSignal(
          signals,
          'inventory:price-variation',
          'medium',
          'السعر يختلف لنفس الصنف',
          'يوجد ' + variablePriceSkuCount + ' أصناف لها أكثر من سعر داخل المصدر؛ يجب تفسير اختلاف السعر بحسب المستودع/الوحدة/السياق قبل اعتماد مقارنة سعرية.',
          ['skuField=' + keyName, 'priceField=' + priceName, 'variablePriceSkuCount=' + variablePriceSkuCount],
          variablePriceSkuCount,
        );
      }
    }
  }

  const rank: Record<ReportSignalSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  const ownerHint = ownerForSpecialty(specialty);
  const enriched = signals.map((signal) => {
    const priority: ReportSignal['priority'] = signal.severity === 'critical' ? 'P0' : signal.severity === 'high' ? 'P1' : signal.severity === 'medium' ? 'P2' : 'P3';
    return {
      ...signal,
      drivers: signal.drivers ?? [],
      ownerHint,
      priority,
      priorityReason: [
        'الشدة: ' + signal.severity,
        signal.affectedRows == null ? 'النطاق المتأثر غير كمي من المصدر الحالي' : 'النطاق المتأثر: ' + signal.affectedRows + ' سجل',
        'قوة الدليل: ' + signal.evidence.length + ' مؤشرات مصدرية',
      ],
      soWhat: signal.id === 'inventory:demand-pressure-low-coverage'
        ? 'الخطر التشغيلي هنا ليس رقمًا منخفضًا فقط؛ الطلب يتسارع بينما التغطية تنخفض، لذلك الأولوية هي معالجة إعادة الطلب قبل أن يتحول الضغط إلى نفاد.'
        : signal.id === 'inventory:low-coverage'
          ? 'التغطية القصيرة تعني أن بعض الأرصدة قد لا تكفي للدورة التالية بالمعدل الحالي؛ يلزم ترتيب الأولويات قبل الشراء.'
          : signal.affectedRows == null
            ? 'تحتاج هذه الإشارة مراجعة مباشرة قبل القرار.'
            : 'تؤثر الإشارة على ' + signal.affectedRows + ' سجلًا من المصدر.',
      impact: signal.id === 'inventory:demand-pressure-low-coverage'
        ? 'الأثر المثبت: ' + signal.affectedRows + ' سجلًا متأثرًا بتغطية قصيرة مع ضغط طلب صاعد؛ لا يتم افتراض خسارة مالية مستقبلية.'
        : signal.affectedRows == null
          ? 'الأثر المالي غير مثبت من المصدر الحالي.'
          : 'الأثر المثبت حاليًا هو نطاق السجلات المتأثرة؛ لا يتم افتراض قيمة مالية.',
    };
  });
  return enriched
    .sort((a, b) => rank[b.severity] - rank[a.severity] || a.title.localeCompare(b.title))
    .slice(0, 24);
}

function deriveRecommendations(signals: ReportSignal[]): ReportRecommendation[] {
  return signals
    .filter((signal) => signal.severity !== 'info')
    .sort((a, b) => {
      const rank: Record<ReportSignalSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
      return rank[b.severity] - rank[a.severity] || a.title.localeCompare(b.title);
    })
    .slice(0, 24)
    .map((signal) => {
    let action = 'افحص الدليل المرتبط بهذا الاستثناء ثم قرر الإجراء المناسب.';
    if (signal.id.includes('inventory:stockout')) action = 'افتح قائمة الأصناف بلا رصيد مع مبيعات، راجع الكمية المتاحة والحركات، ثم أنشئ أولوية توريد بعد اعتماد الدليل.';
    else if (signal.id.includes('inventory:imminent-stockout')) action = 'راجع الأصناف المتوقع نفادها خلال 7 أيام وحدد التوريد أو التحويل قبل النفاد، ثم وثّق القرار.';
    else if (signal.id.includes('inventory:demand-pressure-low-coverage')) action = 'اجمع الأصناف المتأثرة في مراجعة واحدة لإعادة الطلب، ثبّت المسؤول والموعد، ثم اعتمد كمية الشراء فقط بعد التحقق من مهلة التوريد ونقطة إعادة الطلب.';
    else if (signal.id.includes('inventory:low-coverage')) action = 'رتّب الأصناف ذات التغطية القصيرة حسب سرعة البيع والمسؤول ثم راجع خطة إعادة الطلب قبل تحديد كمية شراء.';
    else if (signal.id.includes('inventory:negative-stock')) action = 'طابق الأرصدة السالبة مع حركات الوارد والمبيعات والتحويلات قبل تعديل أي رصيد.';
    else if (signal.id.includes('inventory:movement-reconciliation')) action = 'افتح السجلات غير المتطابقة وطابق الرصيد مع الحركة المصدرية قبل اعتماد التقرير.';
    else if (signal.id.includes('inventory:aging-attention')) action = 'راجع الأصناف القديمة منخفضة الحركة وحدد ما يجب إيقاف شرائه أو تصريفه بعد اعتماد الدليل.';
    else if (signal.id.includes('missing-price')) action = 'افتح صفوف المصدر التي بلا سعر وراجع التسعير قبل الاعتماد.';
    else if (signal.id.includes('missing-name')) action = 'ثبّت أسماء الأصناف وربطها بمفتاح الصنف قبل المقارنة أو التنبؤ.';
    else if (signal.id.includes('duplicate-key')) action = 'طابق السجلات المتكررة مع رقم الصنف والسياق (مثل المستودع) وحدد إن كانت حركات/أسعار صحيحة أم ازدواجية.';
    else if (signal.id.includes('price-variation')) action = 'قارن اختلاف السعر حسب المستودع والوحدة وتاريخ المصدر قبل إصدار تنبيه سعري أو قرار تسعير.';
    else if (signal.id.includes('date-missing')) action = 'ثبّت تاريخًا موحدًا للمصدر قبل بناء أي اتجاه زمني.';
    else if (signal.id.includes('amount-missing')) action = 'حدّد الحقل المالي الصحيح واربطه بالحقل الكانوني قبل إصدار إجمالي.';
    else if (signal.id.includes('paid-above-total')) action = 'افتح السجلات المتأثرة وطابق الإجمالي والمدفوع مع الفاتورة الأصلية والقيد المحاسبي قبل اعتماد التحصيل.';
    else if (signal.id.includes('invoice-total-conflict')) action = 'طابق أرقام الفواتير المتعارضة مع المستندات الأصلية وسبب التعديل/التجزئة قبل اعتبارها ازدواجية أو خطأ.';
    const isDemandPressure = signal.id === 'inventory:demand-pressure-low-coverage';
    const isSalesConcentration = signal.id === 'sales:top-party';
    const isPurchasesConcentration = signal.id === 'purchases:top-party';
    const recommendationTitle = isDemandPressure
      ? 'أعد ترتيب أولوية إعادة الطلب قبل قرار الشراء'
      : isSalesConcentration
        ? 'أعد تقييم التركيّز في المبيعات قبل اعتماد خطة النمو'
        : isPurchasesConcentration
          ? 'أعد تقييم تركّز المشتريات قبل اعتماد خطة التوريد'
          : 'راجع: ' + signal.title;
    return {
      id: 'rec:' + signal.id,
      status: 'PROPOSED' as const,
      priority: makePriority(signal.severity),
      title: recommendationTitle,
      action,
      why: signal.message,
      evidence: signal.evidence,
      ownerHint: signal.ownerHint,
      impact: signal.impact,
      expectedOutcome: isDemandPressure
        ? 'تحديد الأصناف التي تحتاج توريدًا أو تحويلًا واعتماد موعد الإجراء، مع منع شراء كمية غير مثبتة قبل اكتمال معطيات القرار.'
        : 'افحص الدليل المرتبط بهذا الاستثناء، نفّذ الإجراء بعد الاعتماد، ثم أعد القياس بنفس المصدر.',
      whyNow: isDemandPressure
        ? 'الطلب الأحدث أعلى من البداية بينما التغطية القصيرة قائمة الآن؛ التأجيل قد ينقل الإشارة من ضغط تشغيلي إلى نفاد.'
        : signal.severity === 'critical' || signal.severity === 'high'
          ? 'تستحق هذه الإشارة أولوية الآن قبل اعتماد قرار مبني على المصدر الحالي.'
          : 'تستحق هذه الإشارة المراجعة قبل تحويل التحليل إلى قرار تنفيذي.',
      measurement: signal.affectedRows == null
        ? 'أعد تشغيل القاعدة نفسها بعد المعالجة ودوّن عدد السجلات التي ما تزال تطابق الإشارة.'
        : 'أعد القياس على القاعدة نفسها وسجّل عدد السجلات المتأثرة قبل/بعد المعالجة؛ المصدر الحالي يثبت ' + signal.affectedRows + ' سجلًا متأثرًا.',
      risk: isDemandPressure
        ? 'خطران متعاكسان: نفاد المخزون إذا تأخر التدخل، أو شراء زائد إذا تم اعتماد كمية قبل التحقق من الطلب ومهلة التوريد.'
        : 'خطر القرار قبل المراجعة: قد يُعتمد استنتاج أو إجراء فوق استثناء مصدر لم يُعالج أو يُفسر بعد.',
      blocker: isDemandPressure
        ? 'لا توجد في المصدر الحالي مهلة توريد أو نقطة إعادة طلب أو كمية شراء معتمدة؛ لذلك التوصية تحدد الأولوية ولا تخترع كمية.'
        : signal.evidence.length > 0
          ? 'الحاجز الحالي هو تفسير الدليل المرتبط بالإشارة والتحقق منه قبل الاعتماد.'
          : 'لا يوجد دليل مصدرّي كافٍ للاعتماد؛ يجب إيقاف التحويل إلى قرار حتى يظهر الدليل المطلوب.',
      limitation: isDemandPressure
        ? 'لا يمكن تحويل الضغط إلى خسارة مالية مستقبلية أو كمية شراء دون بيانات تكلفة/مهلة توريد/نقطة إعادة الطلب.'
        : signal.impact || 'لا يمكن إثبات أثر مالي أو سببي أوسع من المصدر الحالي.',
      deadlineHint:
        signal.id === 'inventory:imminent-stockout-7d'
          ? 'التدخل خلال 7 أيام وفق فترة النفاد المثبتة في المصدر.'
          : signal.id === 'inventory:stockout'
            ? 'المراجعة قبل قرار التوريد أو التسوية التالي.'
            : signal.id === 'inventory:negative-stock'
              ? 'قبل أي تسوية رصيد أو قرار شراء جديد.'
              : signal.id === 'inventory:movement-reconciliation'
                ? 'قبل اعتماد التقرير أو استخدام الرصيد في قرار تنفيذي.'
                : isDemandPressure
                  ? 'قبل دورة إعادة الطلب التالية.'
                  : signal.severity === 'critical' || signal.severity === 'high'
                    ? 'قبل اعتماد القرار التنفيذي المبني على هذه الإشارة.'
                    : 'قبل تحويل الإشارة إلى إجراء تنفيذي.',
    };
  });
}

function parseDateValue(value: unknown): Date | null {
  const normalized = parseDate(value);
  if (!normalized) return null;
  const parsed = new Date(normalized + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deriveForecast(report: ReportInput): ReportForecast {
  const rows = metricRows(report);
  const columns = columnsOf(report);
  const dateColumn = findColumn(columns, ['invoice_date', 'date', 'due_date', 'التاريخ']);
  const valueColumn = findColumn(columns, ['total', 'total_amount', 'amount', 'sales', 'purchase', 'net_amount', 'balance']);
  const dateKey = dataKey(dateColumn);
  const valueKey = dataKey(valueColumn);
  if (!dateKey || !valueKey || rows.length < 12) {
    return { status: 'INSUFFICIENT_SAMPLE', metric: valueKey || null, method: 'deterministic-monthly-trend', observedPeriods: 0, nextPeriod: null, nextValue: null, direction: null, note: 'لا توجد سلسلة زمنية كافية؛ لن يتم اختراع توقع.' };
  }
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const date = parseDateValue(rowValue(row.data, dateKey));
    const value = numeric(rowValue(row.data, valueKey));
    if (!date || value == null) continue;
    const month = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    byMonth.set(month, (byMonth.get(month) ?? 0) + value);
  }
  const points = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (points.length < 6) {
    return { status: 'INSUFFICIENT_SAMPLE', metric: valueKey, method: 'deterministic-monthly-trend', observedPeriods: points.length, nextPeriod: null, nextValue: null, direction: null, note: 'السلسلة تحتوي على ' + points.length + ' فترات فقط؛ الحد الأدنى المتوقع 6.' };
  }
  const recent = points.slice(-12);
  const n = recent.length;
  const xs = recent.map((_, index) => index + 1);
  const ys = recent.map(([, value]) => value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  const numerator = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  const denominator = xs.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  const nextValueRaw = intercept + slope * (n + 1);
  const nextValue = Number.isFinite(nextValueRaw) ? Math.max(0, nextValueRaw) : null;
  const last = ys[ys.length - 1] ?? 0;
  const direction: ReportForecast['direction'] = nextValue == null || Math.abs(nextValue - last) < Math.max(1, Math.abs(last) * 0.02) ? 'flat' : nextValue > last ? 'up' : 'down';
  const lastDate = new Date(recent[recent.length - 1][0] + '-01T00:00:00Z');
  lastDate.setUTCMonth(lastDate.getUTCMonth() + 1);
  const nextPeriod = lastDate.getUTCFullYear() + '-' + String(lastDate.getUTCMonth() + 1).padStart(2, '0');
  return { status: 'AVAILABLE', metric: valueKey, method: 'deterministic-monthly-linear-trend', observedPeriods: recent.length, nextPeriod, nextValue, direction, note: 'توقع اتجاهي مبسط من السلسلة المصدرية، وليس حقيقة محاسبية أو ضمانًا للنتيجة.' };
}

function ownerForSpecialty(specialty: string): string {
  if (specialty === 'inventory') return 'مسؤول المخزون';
  if (specialty === 'sales') return 'مسؤول المبيعات';
  if (specialty === 'purchases') return 'مسؤول المشتريات';
  if (specialty === 'receivables') return 'مسؤول التحصيل';
  if (specialty === 'payments') return 'مسؤول الخزينة';
  if (specialty === 'profitability') return 'المدير المالي';
  return 'المسؤول التشغيلي المناسب للمصدر';
}

function isAggregateRow(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const label = text(
    data.customer_name ??
    data.customerName ??
    data['اسم العميل'] ??
    data.supplier_name ??
    data.supplierName ??
    data['اسم المورد'] ??
    data.invoice_type ??
    data.invoiceType ??
    data['نوع الفاتوره'] ??
    '',
  );
  if (/^(?:الإجمالي|اجمالي|المجموع|total|grand\\s+total)\\s*:?[s]*$/iu.test(label)) return true;

  const invoice = text(data.invoice_number ?? data.invoiceNumber ?? data.invoiceNo ?? data['رقم الفاتوره']);
  const date = text(data.date ?? data.invoice_date ?? data.invoiceDate ?? data.transactionDate ?? data['التاريخ']);
  const amount = numeric(
    data.total ??
    data.total_amount ??
    data.totalAmount ??
    data['اجمالي الفاتوره'] ??
    data.net_amount ??
    data.netAmount ??
    data['مبلغ الصافي بالمحلي'],
  );
  return !invoice && !date && amount != null;
}

function metricRows(report: ReportInput): Array<{ row_number?: number; data?: Record<string, unknown> | null }> {
  return (report.canonicalRows ?? []).filter((row) => !isAggregateRow(row.data));
}

function groupSum(rows: Array<{ data?: Record<string, unknown> | null }>, dimensionKey: string, valueKey: string): Array<{ dimension: string; value: number; rows: number }> {
  const groups = new Map<string, { value: number; rows: number }>();
  for (const row of rows) {
    const dimension = text(rowValue(row.data, dimensionKey)) || 'غير محدد';
    const value = numeric(rowValue(row.data, valueKey));
    if (value == null) continue;
    const current = groups.get(dimension) ?? { value: 0, rows: 0 };
    current.value += value;
    current.rows += 1;
    groups.set(dimension, current);
  }
  return [...groups.entries()]
    .map(([dimension, item]) => ({ dimension, ...item }))
    .sort((a, b) => b.value - a.value);
}

function deriveBusinessFindings(report: ReportInput): {
  findings: BusinessFinding[];
  risks: BusinessFinding[];
  opportunities: BusinessFinding[];
} {
  const sourceRows = report.canonicalRows ?? [];
  const rows = metricRows(report);
  const aggregateRowCount = sourceRows.length - rows.length;
  const columns = columnsOf(report);
  const specialty = text(report.specialty);
  const findings: BusinessFinding[] = [];
  const risks: BusinessFinding[] = [];
  const opportunities: BusinessFinding[] = [];

  const amountColumn = findColumn(columns, [
    'total', 'total_amount', 'amount', 'sales', 'purchase', 'net_amount',
    'outstanding_balance', 'balance', 'local_amount', 'value',
  ]);
  const partyColumn = specialty === 'purchases'
    ? findColumn(columns, ['supplier_name', 'supplier', 'vendor', 'المورد'])
    : findColumn(columns, ['customer_name', 'customer', 'client', 'العميل']);
  const productColumn = findColumn(columns, ['product_name', 'product', 'item', 'sku', 'product_code', 'رقم الصنف', 'الصنف']);
  const dateColumn = findColumn(columns, ['invoice_date', 'date', 'transaction_date', 'التاريخ']);
  const quantityColumn = findColumn(columns, ['current_stock', 'stock', 'quantity', 'qty', 'الرصيد', 'الكمية']);
  const priceColumn = findColumn(columns, ['selling_price', 'price', 'cost', 'السعر', 'التكلفة']);
  const balanceColumn = findColumn(columns, ['outstanding_balance', 'receivable', 'balance', 'الرصيد المستحق', 'المتبقي']);

  if (aggregateRowCount > 0) {
    findings.push({
      id: specialty + ':aggregate-rows-excluded',
      kind: 'FINDING',
      priority: 'low',
      title: 'صفوف تلخيص مستبعدة من المؤشرات',
      statement: 'تم استبعاد ' + aggregateRowCount + ' صفوف تلخيص/إجمالي من المؤشرات التنفيذية حتى لا تُحسب كمعاملات فعلية.',
      value: aggregateRowCount,
      unit: 'صف',
      evidence: ['aggregateRows=' + aggregateRowCount, 'sourceRows=' + sourceRows.length, 'metricRows=' + rows.length],
      limitation: 'الاستبعاد يخص الحسابات التنفيذية فقط؛ الصفوف الأصلية تبقى محفوظة ضمن المصدر والأدلة.',
      action: 'راجع صفوف التلخيص في مسار الدليل عند الحاجة إلى مطابقة الإجمالي الظاهر في المستند الأصلي.',
    });
  }

  if (!rows.length) {
    return { findings, risks, opportunities };
  }

  if ((specialty === 'sales' || specialty === 'purchases') && amountColumn) {
    const amountKey = dataKey(amountColumn);
    const amounts = rows.map((row) => numeric(rowValue(row.data, amountKey))).filter((value): value is number => value != null);
    const total = amounts.reduce((sum, value) => sum + value, 0);

    if (total !== 0) {
      findings.push({
        id: specialty + ':total-value',
        kind: 'FINDING',
        priority: 'high',
        title: specialty === 'sales' ? 'إجمالي قيمة المبيعات في المصدر' : 'إجمالي قيمة المشتريات في المصدر',
        statement: 'القيمة المحسوبة من ' + amounts.length + ' سجلًا صالحة هي ' + total.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value: total,
        unit: 'عملة المصدر',
        evidence: ['valueField=' + amountKey, 'usableRows=' + amounts.length],
        limitation: 'هذا إجمالي المصدر وفق الحقل المالي المختار، ولا يثبت الربحية أو التحصيل.',
        action: 'استخدم هذا الإجمالي كنقطة مرجعية، ثم انتقل إلى التوزيع على العملاء/الموردين والفترة قبل اتخاذ القرار.',
      });
    }

    if (partyColumn) {
      const partyKey = dataKey(partyColumn);
      const groups = groupSum(rows, partyKey, amountKey);
      const top = groups[0];
      if (top && total !== 0) {
        const share = Math.abs(top.value / total);
        findings.push({
          id: specialty + ':top-party',
          kind: 'FINDING',
          priority: share >= 0.5 ? 'high' : 'medium',
          title: specialty === 'sales' ? 'أعلى مساهم في قيمة المبيعات' : 'أعلى مساهم في قيمة المشتريات',
          statement: (specialty === 'sales' ? 'العميل' : 'المورد') + ' "' + top.dimension + '" يمثل ' + (share * 100).toFixed(1) + '% من القيمة المحسوبة.',
          value: top.value,
          unit: 'عملة المصدر',
          dimensionLabel: specialty === 'sales' ? 'العميل' : 'المورد',
          dimensionValue: top.dimension,
          evidence: [(specialty === 'sales' ? 'customerField=' : 'supplierField=') + partyKey, 'dimensionField=' + partyKey, 'valueField=' + amountKey, 'dimensionValue=' + top.dimension, 'dimensionValueTotal=' + top.value.toFixed(2), 'sourceTotal=' + total.toFixed(2)],
          limitation: 'التركيز الحسابي لا يثبت خطرًا تجاريًا بحد ذاته؛ يحتاج إلى تفسير حسب سياسة الشركة وتوزيع باقي القيمة.',
          action: specialty === 'sales'
            ? 'راجع هذا العميل أولًا ضمن خطة المحافظة على الإيراد ومخاطر التركيّز.'
            : 'راجع هذا المورد أولًا ضمن خطة التركيّز والشروط والأسعار والتوريد.',
        });
      }
    }

    if (dateColumn) {
      const dateKey = dataKey(dateColumn);
      const monthly = new Map<string, number>();
      for (const row of rows) {
        const parsedDate = parseDate(rowValue(row.data, dateKey));
        const date = parsedDate ? new Date(parsedDate) : null;
        const value = numeric(rowValue(row.data, amountKey));
        if (!date || Number.isNaN(date.getTime()) || value == null) continue;
        const month = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
        monthly.set(month, (monthly.get(month) ?? 0) + value);
      }
      const periods = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
      if (periods.length >= 2) {
        const previous = periods[periods.length - 2][1];
        const latest = periods[periods.length - 1][1];
        const delta = latest - previous;
        const pct = previous === 0 ? null : (delta / Math.abs(previous)) * 100;
        if (partyColumn && delta !== 0) {
          const partyKey = dataKey(partyColumn);
          const byPeriod = new Map<string, Map<string, number>>();
          for (const row of rows) {
            const parsedDate = parseDate(rowValue(row.data, dateKey));
            const date = parsedDate ? new Date(parsedDate) : null;
            const value = numeric(rowValue(row.data, amountKey));
            if (!date || Number.isNaN(date.getTime()) || value == null) continue;
            const month = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
            const party = text(rowValue(row.data, partyKey)) || 'غير محدد';
            const bucket = byPeriod.get(month) ?? new Map<string, number>();
            bucket.set(party, (bucket.get(party) ?? 0) + value);
            byPeriod.set(month, bucket);
          }
          const previousParties = byPeriod.get(periods[periods.length - 2][0]) ?? new Map<string, number>();
          const latestParties = byPeriod.get(periods[periods.length - 1][0]) ?? new Map<string, number>();
          const contributor = [...new Set([...previousParties.keys(), ...latestParties.keys()])]
            .map((party) => ({ party, delta: (latestParties.get(party) ?? 0) - (previousParties.get(party) ?? 0) }))
            .filter((item) => item.delta !== 0)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
          if (contributor) {
            findings.push({
              id: specialty + ':change-contributor',
              kind: 'FINDING',
              priority: Math.abs(contributor.delta) >= Math.abs(delta) * 0.5 ? 'high' : 'medium',
              title: 'أكبر مساهم في تغير الفترة',
              statement: (specialty === 'sales' ? 'العميل' : 'المورد') + ' "' + contributor.party + '" يمثل أكبر تغير منفرد بمقدار ' + contributor.delta.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
              value: contributor.delta,
              unit: 'فرق القيمة',
              dimensionLabel: specialty === 'sales' ? 'العميل' : 'المورد',
              dimensionValue: contributor.party,
              evidence: ['dimensionField=' + partyKey, 'previousPeriod=' + periods[periods.length - 2][0], 'latestPeriod=' + periods[periods.length - 1][0], 'partyDelta=' + contributor.delta.toFixed(2)],
              limitation: 'المساهمة في التغير تفكيك حسابي وليست إثباتًا للسبب.',
              action: 'افتح معاملات هذا الطرف ومصادر تغيره قبل اعتماد الإجراء.',
            });
          }
        }

        findings.push({
          id: specialty + ':period-change',
          kind: 'FINDING',
          priority: pct != null && Math.abs(pct) >= 20 ? 'high' : 'medium',
          title: 'تغير القيمة بين آخر فترتين',
          statement: 'تغيرت القيمة من ' + previous.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' إلى ' + latest.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + (pct == null ? '.' : ' بنسبة ' + pct.toFixed(1) + '%.'),
          value: delta,
          unit: 'فرق القيمة',
          dimensionLabel: 'الفترة',
          dimensionValue: periods[periods.length - 1][0],
          evidence: ['dateField=' + dateKey, 'valueField=' + amountKey, 'previousPeriod=' + periods[periods.length - 2][0], 'latestPeriod=' + periods[periods.length - 1][0]],
          limitation: 'المقارنة بين فترتين لا تثبت سبب التغير ولا تراعي الموسمية.',
          action: specialty === 'sales'
            ? 'افتح تحليل المساهمين في التغير قبل اعتماد أي قرار مبيعات.'
            : 'افتح تحليل الموردين والقيمة قبل اعتماد أي قرار مشتريات.',
        });
        if (pct != null && pct < -10) {
          risks.push({
            id: specialty + ':period-decline-risk',
            kind: 'RISK',
            priority: pct <= -20 ? 'high' : 'medium',
            title: 'انخفاض حديث يحتاج تفسيرًا',
            statement: 'القيمة في آخر فترة أقل من الفترة السابقة بنسبة ' + Math.abs(pct).toFixed(1) + '%.',
            value: delta,
            unit: '% change',
            evidence: ['previous=' + previous.toFixed(2), 'latest=' + latest.toFixed(2), 'deltaPercent=' + pct.toFixed(2)],
            limitation: 'هذا مؤشر اتجاهي وليس إثباتًا لسبب الانخفاض.',
            action: 'حلّل العملاء/الموردين والأصناف التي ساهمت في الانخفاض قبل اختيار الإجراء.',
          });
        } else if (pct != null && pct > 10) {
          opportunities.push({
            id: specialty + ':period-growth-opportunity',
            kind: 'OPPORTUNITY',
            priority: pct >= 20 ? 'high' : 'medium',
            title: 'نمو حديث يمكن متابعته',
            statement: 'القيمة في آخر فترة أعلى من الفترة السابقة بنسبة ' + pct.toFixed(1) + '%.',
            value: delta,
            unit: '% change',
            evidence: ['previous=' + previous.toFixed(2), 'latest=' + latest.toFixed(2), 'deltaPercent=' + pct.toFixed(2)],
            limitation: 'النمو بين فترتين لا يثبت الاستدامة أو السبب.',
            action: 'حدّد مصادر النمو الأعلى وراقب استمرارها في الفترة التالية.',
          });
        }
      }
    }
  }

  if (specialty === 'inventory' && quantityColumn) {
    const quantityKey = dataKey(quantityColumn);
    const priceKey = dataKey(priceColumn);
    let negative = 0;
    let zero = 0;
    let valuedRows = 0;
    let inventoryValue = 0;
    const valueByProduct = new Map<string, number>();

    for (const row of rows) {
      const quantity = numeric(rowValue(row.data, quantityKey));
      if (quantity == null) continue;
      if (quantity < 0) negative += 1;
      if (quantity === 0) zero += 1;
      const price = priceKey ? numeric(rowValue(row.data, priceKey)) : null;
      if (price != null) {
        const value = quantity * price;
        inventoryValue += value;
        valuedRows += 1;
        const key = productColumn ? text(rowValue(row.data, dataKey(productColumn))) || 'غير محدد' : 'غير محدد';
        valueByProduct.set(key, (valueByProduct.get(key) ?? 0) + value);
      }
    }

    findings.push({
      id: 'inventory:position',
      kind: 'FINDING',
      priority: inventoryValue > 0 ? 'high' : 'medium',
      title: 'صورة المخزون المحسوبة من المصدر',
      statement: 'تمت قراءة ' + rows.length + ' سجلًا؛ ' + zero + ' بلا رصيد و' + negative + ' برصيد سالب' + (valuedRows ? '، وقيمة مرجعية محسوبة لـ' + valuedRows + ' سجلًا.' : '.'),
      value: inventoryValue || null,
      unit: inventoryValue ? 'قيمة مرجعية' : null,
      evidence: ['quantityField=' + quantityKey, ...(priceKey ? ['priceField=' + priceKey] : []), 'rows=' + rows.length, 'zeroRows=' + zero, 'negativeRows=' + negative],
      limitation: 'قيمة المخزون هنا ناتجة عن كمية × سعر الحقل المختار؛ لا تعادل تلقائيًا تكلفة المخزون المحاسبية.',
      action: negative > 0 ? 'راجع الأرصدة السالبة ومصدر الحركة قبل أي قرار شراء أو صرف.' : 'رتّب أولويات المراجعة بحسب القيمة والتركيز، ثم اربطها بالحركة والتغطية.',
    });

    if (negative > 0) {
      risks.push({
        id: 'inventory:negative-balance-risk',
        kind: 'RISK',
        priority: negative >= Math.max(5, Math.round(rows.length * 0.05)) ? 'high' : 'medium',
        title: 'أرصدة مخزون سالبة',
        statement: 'يوجد ' + negative + ' سجلًا برصيد مخزون سالب.',
        value: negative,
        unit: 'rows',
        evidence: ['quantityField=' + quantityKey, 'negativeRows=' + negative],
        limitation: 'السبب غير مستنتج من جدول الرصيد وحده.',
        action: 'طابق الأرصدة السالبة مع الحركات والمستندات قبل تعديل الرصيد.',
      });
    }

    if (productColumn && valueByProduct.size > 0 && inventoryValue !== 0) {
      const top = [...valueByProduct.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const share = Math.abs(top[1] / inventoryValue);
        opportunities.push({
          id: 'inventory:value-focus-opportunity',
          kind: 'OPPORTUNITY',
          priority: share >= 0.5 ? 'high' : 'medium',
          title: 'فرصة لتركيز مراجعة رأس المال المخزني',
          statement: 'الصنف "' + top[0] + '" يمثل ' + (share * 100).toFixed(1) + '% من القيمة المرجعية المحسوبة للمخزون.',
          value: top[1],
          unit: 'قيمة مرجعية',
          dimensionLabel: 'الصنف',
          dimensionValue: top[0],
          evidence: ['productField=' + dataKey(productColumn), 'valueShare=' + (share * 100).toFixed(2), 'productValue=' + top[1].toFixed(2), 'inventoryValue=' + inventoryValue.toFixed(2)],
          limitation: 'التركيز لا يثبت ركود الصنف أو انخفاض الطلب.',
          action: 'ابدأ المراجعة من الأصناف الأعلى قيمة ثم قارنها بالحركة والطلب.',
        });
      }
    }
  }

  if (specialty === 'receivables' && balanceColumn) {
    const balanceKey = dataKey(balanceColumn);
    const balances = rows.map((row) => numeric(rowValue(row.data, balanceKey))).filter((value): value is number => value != null);
    const totalBalance = balances.reduce((sum, value) => sum + value, 0);
    findings.push({
      id: 'receivables:total-balance',
      kind: 'FINDING',
      priority: 'high',
      title: 'إجمالي الرصيد المستحق المحسوب',
      statement: 'إجمالي الرصيد المستحق من ' + balances.length + ' سجلًا هو ' + totalBalance.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
      value: totalBalance,
      unit: 'عملة المصدر',
      evidence: ['balanceField=' + balanceKey, 'usableRows=' + balances.length],
      limitation: 'لا يحدد هذا وحده قابلية التحصيل أو التعثر.',
      action: 'قسّم الرصيد حسب العميل وأعمار الدين قبل ترتيب أولويات التحصيل.',
    });
    if (partyColumn) {
      const partyKey = dataKey(partyColumn);
      const groups = groupSum(rows, partyKey, balanceKey);
      const top = groups[0];
      if (top && totalBalance !== 0) {
        const share = Math.abs(top.value / totalBalance);
        risks.push({
          id: 'receivables:concentration-risk',
          kind: 'RISK',
          priority: share >= 0.5 ? 'high' : 'medium',
          title: 'تركيز الرصيد المستحق في عميل',
          statement: 'العميل "' + top.dimension + '" يمثل ' + (share * 100).toFixed(1) + '% من الرصيد المحسوب.',
          value: top.value,
          unit: 'عملة المصدر',
          dimensionLabel: 'العميل',
          dimensionValue: top.dimension,
          evidence: ['customerField=' + partyKey, 'balanceField=' + balanceKey, 'customerBalance=' + top.value.toFixed(2), 'totalBalance=' + totalBalance.toFixed(2)],
          limitation: 'التركيز ليس دليل تعثر دون بيانات عمر الدين أو سلوك السداد.',
          action: 'راجع العميل ضمن أولويات التحصيل مع بيانات عمر الدين وأحدث حركة سداد.',
        });
      }
    }
  }

  if (specialty === 'profitability') {
    const revenueColumn = findColumn(columns, ['revenue', 'sales', 'net_amount', 'الإيراد', 'المبيعات']);
    const costColumn = findColumn(columns, ['cost', 'cogs', 'التكلفة', 'تكلفة']);
    if (revenueColumn && costColumn) {
      const revenueKey = dataKey(revenueColumn);
      const costKey = dataKey(costColumn);
      let revenue = 0;
      let cost = 0;
      let usable = 0;
      for (const row of rows) {
        const r = numeric(rowValue(row.data, revenueKey));
        const k = numeric(rowValue(row.data, costKey));
        if (r == null || k == null) continue;
        revenue += r;
        cost += k;
        usable += 1;
      }
      const margin = revenue === 0 ? null : ((revenue - cost) / revenue) * 100;
      findings.push({
        id: 'profitability:margin',
        kind: 'FINDING',
        priority: 'high',
        title: 'الهامش المحسوب من المصدر',
        statement: margin == null ? 'تعذر حساب الهامش من القيم المتاحة.' : 'الإيراد المحسوب ' + revenue.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، والتكلفة ' + cost.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، والهامش ' + margin.toFixed(1) + '%.',
        value: margin,
        unit: '% margin',
        evidence: ['revenueField=' + revenueKey, 'costField=' + costKey, 'usableRows=' + usable],
        limitation: 'الهامش يعتمد على الحقول المحددة ولا يثبت صافي الربح بعد باقي المصروفات.',
        action: 'قسّم الهامش حسب المنتج/العميل وحدد مصادر التآكل قبل اتخاذ قرار التسعير.',
      });
      if (margin != null && margin < 10) {
        risks.push({
          id: 'profitability:low-margin-risk',
          kind: 'RISK',
          priority: margin < 0 ? 'high' : 'medium',
          title: 'هامش منخفض في البيانات المتاحة',
          statement: 'الهامش المحسوب من الحقول المحددة أقل من 10%.',
          value: margin,
          unit: '% margin',
          evidence: ['margin=' + margin.toFixed(2), 'revenueField=' + revenueKey, 'costField=' + costKey],
          limitation: 'هذا ليس صافي الربح ولا يفسر السبب.',
          action: 'حلّل المنتجات/العملاء ذات الهامش الأضعف قبل تعديل الأسعار أو التكلفة.',
        });
      } else if (margin != null && margin >= 25) {
        opportunities.push({
          id: 'profitability:healthy-margin-opportunity',
          kind: 'OPPORTUNITY',
          priority: 'medium',
          title: 'مجال لمراجعة مصادر الهامش الجيد',
          statement: 'الهامش الإجمالي المحسوب من الحقول المحددة يبلغ ' + margin.toFixed(1) + '%.',
          value: margin,
          unit: '% margin',
          evidence: ['margin=' + margin.toFixed(2), 'revenueField=' + revenueKey, 'costField=' + costKey],
          limitation: 'الهامش الجيد لا يثبت جودة العميل أو المنتج على المدى الطويل.',
          action: 'قسّم مصادر الهامش الجيد وحدد ما يمكن المحافظة عليه مع استمرار المراقبة.',
        });
      }
    }
  }

  const findingOrder = (id: string): number => {
    if (id.endsWith(':total-value')) return 100;
    if (id.endsWith(':position')) return 100;
    if (id.endsWith(':margin')) return 100;
    if (id.endsWith(':total-balance')) return 100;
    if (id.endsWith(':top-party')) return 90;
    if (id.endsWith(':change-contributor')) return 80;
    if (id.endsWith(':period-change')) return 70;
    return 0;
  };
  return {
    findings: findings.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 } as const;
      return findingOrder(b.id) - findingOrder(a.id)
        || rank[b.priority] - rank[a.priority]
        || a.title.localeCompare(b.title);
    }),
    risks: risks.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 } as const;
      return rank[b.priority] - rank[a.priority] || a.title.localeCompare(b.title);
    }),
    opportunities: opportunities.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 } as const;
      return rank[b.priority] - rank[a.priority] || a.title.localeCompare(b.title);
    }),
  };
}

function deriveFindingRecommendations(business: { findings: BusinessFinding[]; risks: BusinessFinding[]; opportunities: BusinessFinding[] }): ReportRecommendation[] {
  const items = [...business.risks, ...business.findings, ...business.opportunities];
  const rank = { high: 3, medium: 2, low: 1 } as const;
  return items
    .filter((finding) => finding.priority !== 'low')
    .sort((a, b) => rank[b.priority] - rank[a.priority] || a.id.localeCompare(b.id))
    .slice(0, 24)
    .map((finding) => {
      const id = finding.id;
      const isSales = id.startsWith('sales:');
      const isPurchases = id.startsWith('purchases:');
      const isReceivables = id.startsWith('receivables:');
      const isProfitability = id.startsWith('profitability:');
      const owner = isSales ? 'مسؤول المبيعات' : isPurchases ? 'مسؤول المشتريات' : isReceivables ? 'مسؤول التحصيل' : isProfitability ? 'المدير المالي' : 'المسؤول التشغيلي المناسب للمصدر';
      let title = 'حوّل هذه القضية إلى إجراء مقترح';
      let action = finding.action;
      let whyNow = finding.statement;
      let expectedOutcome = 'معالجة القضية أو تفسيرها ثم إعادة قياس المؤشر نفسه من نفس المصدر.';
      let risk = 'خطر اعتماد قرار قبل مراجعة الدليل المرتبط بالقضية.';
      const blocker = finding.limitation;
      const limitation = finding.limitation;

      if (id === 'sales:top-party') {
        title = 'ضع العميل الأعلى مساهمة تحت مراجعة التركيّز';
        action = 'راجع معاملات العميل الأعلى مساهمة، شروطه واتجاه مساهمته قبل اعتبار الاعتماد عليه مستقرًا.';
        whyNow = 'هذا العميل يمثل الحصة الأكبر من القيمة المحسوبة في المصدر الحالي.';
        expectedOutcome = 'خطة متابعة واضحة للعميل وتقليل مفاجآت التركيّز دون اختلاق توقع إيراد.';
        risk = 'خطر الاعتماد غير المرئي على عميل واحد إذا كانت الحصة المرتفعة غير مقصودة.';
      } else if (id === 'sales:period-decline-risk') {
        title = 'افتح سبب انخفاض المبيعات قبل اعتماد خطة تصحيح';
        action = 'حدّد العملاء والأصناف التي صنعت الانخفاض ثم اعتمد إجراءً مخصصًا بدل معالجة الإجمالي فقط.';
        whyNow = finding.statement;
        expectedOutcome = 'تحديد محرك الانخفاض وتحويله إلى إجراء قابل للقياس.';
      } else if (id === 'sales:period-growth-opportunity') {
        title = 'ثبّت محركات نمو المبيعات قبل توسيعها';
        action = 'حدّد العملاء/الأصناف التي صنعت النمو وراقب استمرارها في الفترة التالية قبل توسيع القرار.';
        whyNow = finding.statement;
        expectedOutcome = 'تحويل النمو المرصود إلى متابعة قابلة للقياس دون افتراض استدامته.';
      } else if (id === 'sales:change-contributor') {
        title = 'راجع العميل الأكثر تأثيرًا في تغير المبيعات';
        action = 'افتح معاملات العميل صاحب أكبر تغير وطابق السبب في المصدر قبل اعتماد خطة مبيعات.';
      } else if (id === 'purchases:top-party') {
        title = 'ضع المورد الأعلى مساهمة تحت مراجعة التركيّز';
        action = 'راجع أسعار وشروط ومواعيد المورد الأعلى مساهمة قبل زيادة الاعتماد عليه.';
        whyNow = 'هذا المورد يمثل الحصة الأكبر من القيمة المحسوبة في المصدر الحالي.';
        expectedOutcome = 'صورة واضحة لتركيز المشتريات وشروط المورد المؤثر.';
        risk = 'خطر الاعتماد غير المرئي على مورد واحد أو تعرض التكلفة لتغير غير مفسر.';
      } else if (id === 'purchases:period-decline-risk') {
        title = 'فسّر انخفاض المشتريات قبل تغيير خطة التوريد';
        action = 'حدّد الموردين والأصناف التي صنعت الانخفاض وميّز بين تحسن الكفاءة ونقص التوريد.';
      } else if (id === 'purchases:period-growth-opportunity') {
        title = 'راجع محركات نمو المشتريات قبل زيادة الالتزام';
        action = 'حدّد الموردين والأصناف التي صنعت النمو ثم افحص الأسعار والشروط قبل توسيع الالتزام.';
      } else if (id === 'purchases:change-contributor') {
        title = 'راجع المورد الأكثر تأثيرًا في تغير المشتريات';
        action = 'افتح معاملات المورد صاحب أكبر تغير وطابق السبب مع الفواتير والشروط قبل اعتماد الإجراء.';
      } else if (id === 'receivables:total-balance') {
        title = 'حوّل الرصيد المستحق إلى قائمة تحصيل ذات أولوية';
        action = 'قسّم الرصيد حسب العميل والعمر وسلوك السداد، ثم ثبّت أولويات التحصيل بدل التعامل مع الإجمالي ككتلة واحدة.';
        expectedOutcome = 'قائمة تحصيل مرتبة حسب الرصيد والأولوية المدعومة بالدليل.';
      } else if (id === 'receivables:concentration-risk') {
        title = 'ابدأ مراجعة التحصيل من العميل الأعلى تعرضًا';
        action = 'اربط حصة العميل الأعلى من الرصيد بعمر الدين وأحدث حركة سداد قبل اتخاذ إجراء تحصيلي.';
        expectedOutcome = 'تحديد ما إذا كان التركيّز يحتاج تدخلًا فعليًا أو مجرد متابعة.';
        risk = 'خطر تركّز الذمم دون معرفة عمر الدين أو سلوك السداد.';
      } else if (id === 'profitability:margin') {
        title = 'حوّل الهامش إلى خريطة ربحية حسب المصدر';
        action = 'قسّم الهامش حسب المنتج والعميل والفئة وحدد أين يتآكل الهامش قبل تعديل السعر أو التكلفة.';
        expectedOutcome = 'تحديد مصادر الهامش ومصادر التآكل في نفس المصدر.';
      } else if (id === 'profitability:low-margin-risk') {
        title = 'افتح أسباب تآكل الهامش قبل قرار التسعير';
        action = 'اعزل المنتجات والعملاء منخفضي الهامش وطابق الإيراد والتكلفة قبل تغيير الأسعار أو الشروط.';
        expectedOutcome = 'خطة معالجة للهوامش الضعيفة مبنية على مصدر قابل للتتبع.';
        risk = 'خطر رفع الأسعار أو خفض التكلفة دون معرفة المحرك الحقيقي لتآكل الهامش.';
      } else if (id === 'profitability:healthy-margin-opportunity') {
        title = 'ثبّت مصادر الهامش الجيد وراقب استدامتها';
        action = 'حدّد المنتجات والعملاء التي تصنع الهامش الجيد ثم راقب استمرارها بدل افتراض استدامة النتيجة.';
        expectedOutcome = 'خريطة واضحة لما يجب المحافظة عليه ومراقبته.';
      }

      return {
        id: 'rec:' + id,
        status: 'PROPOSED' as const,
        priority: finding.priority === 'high' ? 'high' : 'medium',
        title,
        action,
        why: finding.statement,
        evidence: finding.evidence,
        ownerHint: owner,
        impact: finding.value == null ? 'الأثر الحالي مثبت على مستوى القضية/السجلات، وليس خسارة أو ربحًا مستقبليًا.' : String(finding.value) + (finding.unit ? ' ' + finding.unit : ''),
        expectedOutcome,
        whyNow,
        measurement: 'أعد قياس نفس المؤشر بعد الإجراء مع الاحتفاظ بنفس sourceHash + jobId.',
        risk,
        blocker,
        limitation,
      };
    });
}

function buildAdvisorBrief(
  report: ReportInput,
  business: { findings: BusinessFinding[]; risks: BusinessFinding[]; opportunities: BusinessFinding[] },
  signals: ReportSignal[],
  recommendations: ReportRecommendation[],
): AdvisorBrief {
  const specialty = text(report.specialty);
  const executiveSignal = selectExecutiveSignal({ signals });
  const topFinding = business.findings.find((finding) => {
    const evidence = finding.evidence ?? [];
    const haystack = [finding.title, finding.statement, ...evidence].join(' ');
    return !(/غير محدد/.test(haystack) && evidence.some((item) => /^dimensionField=|^dimensionValue=/.test(item)));
  }) ?? null;
  const topRisk = business.risks[0] ?? null;
  const topOpportunity = business.opportunities[0] ?? null;
  const highImpactSignal = signals.some((signal) => signal.severity === 'critical' || signal.severity === 'high');
  const materialReviewSignal = signals.some((signal) => {
    if (signal.severity !== 'medium') return false;
    if (signal.affectedRows == null || !report.rowCount) return true;
    return signal.affectedRows / Math.max(1, report.rowCount) >= 0.2;
  });
  const sourceRowCount = Number(report.rowCount ?? 0);
  const health: AdvisorBrief['health'] =
    sourceRowCount <= 0
      ? 'HEALTHY'
      : topRisk?.priority === 'high' || highImpactSignal || materialReviewSignal
        ? 'REVIEW_REQUIRED'
        : topRisk || signals.some((signal) => signal.severity === 'medium') || signals.length > 0
          ? 'ATTENTION'
          : 'HEALTHY';
  const executiveRecommendation = selectExecutiveRecommendation({ signals, recommendations }, executiveSignal);
  const recommendedAction = executiveRecommendation?.action ?? topRisk?.action ?? topFinding?.action ?? topOpportunity?.action ?? null;
  const headline = executiveSignal?.message
    ?? topRisk?.statement
    ?? topFinding?.statement
    ?? topOpportunity?.statement
    ?? 'لا توجد نتيجة أعمال كافية لبناء موجز استشاري.';

  return {
    health,
    headline,
    topFinding,
    topRisk,
    topOpportunity,
    recommendedAction,
    ownerHint: ownerForSpecialty(specialty),
    expectedOutcome: topRisk
      ? 'إزالة سبب الاستثناء أو خفض الجزء المتأثر منه بعد التحقق.'
      : topOpportunity
        ? 'الحفاظ على الاتجاه أو توسيع الأثر الذي أظهره المصدر.'
        : topFinding
          ? 'تحويل النتيجة إلى قرار قابل للقياس بعد المراجعة.'
          : null,
    measurement: topRisk
      ? 'أعد قياس المؤشر المتأثر نفسه بعد الإجراء، مع الاحتفاظ بنفس source/job lineage.'
      : topOpportunity
        ? 'قارن المؤشر نفسه في الفترة التالية أو دورة المتابعة التالية.'
        : topFinding
          ? 'سجّل قرارًا وإجراءً ثم اقرأ النتيجة الفعلية من المسار التشغيلي.'
          : null,
    proofRequirement: 'كل توصية يجب أن تبقى مرتبطة بـsourceHash + jobId + evidence قبل اعتمادها.',
  };
}

export function deriveReportIntelligence(report: ReportInput): ReportIntelligence {
  const signals = deriveSignals(report);
  const recommendations = deriveRecommendations(signals);
  const specialty = text(report.specialty);
  const sourceRowCount = Number(report.rowCount ?? report.canonicalRows?.length ?? 0);
  const summary = specialty === 'inventory'
    ? 'المصدر يصف ' + sourceRowCount + ' سجلًا للمخزون مع رصيد وحركة ومعدل بيع وفترة متوقعة للنفاد؛ الذكاء يركز على النفاد، الأرصدة السالبة، مطابقة الحركة، والتغطية قبل القرار.'
    : specialty === 'sales'
      ? 'المصدر يصف المبيعات؛ الذكاء يركز على العميل والقيمة والفترة والاتجاه.'
      : specialty === 'purchases'
        ? 'المصدر يصف المشتريات؛ الذكاء يركز على المورد والقيمة والفترة والتكرار.'
        : specialty === 'receivables'
          ? 'المصدر يصف الذمم؛ الذكاء يركز على الرصيد وأعمار التأخر وهوية العميل.'
          : specialty === 'payments'
            ? 'المصدر يصف المدفوعات/السيولة؛ الذكاء يركز على التسوية والفترة والعملة.'
            : 'المصدر محلل من بنية الحقول والقيم؛ العناصر غير المثبتة تبقى معلنة كمراجعة.';

  const businessQuestion = specialty === 'sales'
    ? 'ما الذي حدث في المبيعات وأين توجد إشارات تحتاج تدخلًا؟'
    : specialty === 'receivables'
      ? 'ما حجم الذمم وأين تتركز مخاطر التحصيل؟'
      : specialty === 'inventory'
        ? 'أين توجد أصناف معرضة للنفاد أو الأرصدة السالبة أو فجوات في مطابقة الحركة والتغطية؟'
        : specialty === 'purchases'
          ? 'أين توجد استثناءات في المشتريات والموردين والتكلفة؟'
          : specialty === 'payments'
            ? 'هل حركة التحصيل/السيولة مكتملة ويمكن تسويتها بثقة؟'
            : 'ما أهم ما تثبته بيانات المصدر، وما الذي يحتاج مراجعة قبل القرار؟';

  const top = selectExecutiveSignal({ signals });
  const guidance: ReportGuidance = {
    focus: top ? top.title : 'لا توجد إشارة حرجة مثبتة من البيانات المتاحة.',
    inspect: signals.slice(0, 5).map((signal) => signal.message),
    ownerHint: specialty === 'inventory' ? 'مسؤول المخزون/التسعير' : specialty === 'receivables' ? 'مسؤول التحصيل' : specialty === 'sales' ? 'مسؤول المبيعات' : specialty === 'purchases' ? 'مسؤول المشتريات' : 'المسؤول التشغيلي المناسب للمصدر',
    boundary: 'الإشارة تحدد موضعًا يحتاج تدقيقًا؛ لا تتحول إلى اتهام أو قرار نهائي دون دليل إضافي. الوثائق النصية غير المهيكلة تحتاج تعيينًا دلاليًا قبل اعتماد أرقامها كحقيقة تجارية.',
  };

  const business = deriveBusinessFindings(report);
  const findingRecommendations = deriveFindingRecommendations(business);
  const recommendationsById = new Map<string, ReportRecommendation>();
  for (const recommendation of findingRecommendations) recommendationsById.set(recommendation.id, recommendation);
  for (const recommendation of recommendations) {
    if (!recommendationsById.has(recommendation.id)) recommendationsById.set(recommendation.id, recommendation);
  }
  const mergedRecommendations = [...recommendationsById.values()];
  const advisorBrief = buildAdvisorBrief(report, business, signals, mergedRecommendations);
  return {
    businessQuestion,
    summary,
    signals,
    recommendations: mergedRecommendations,
    forecast: deriveForecast(report),
    guidance,
    findings: business.findings,
    risks: business.risks,
    opportunities: business.opportunities,
    advisorBrief,
  };
}
