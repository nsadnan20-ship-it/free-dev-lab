import { deriveReportIntelligence, type ReportIntelligence, type BusinessFinding, type ReportSignal, type ReportRecommendation } from './report-smart-insights.js';
import { matchCanonicalField } from './canonical-schema.js';

type RuleProfile = {
  id: string;
  number: number;
  title: string;
  adapterSpecialty: string;
  ruleFamily?: string;
  requiredFields: string[];
  capabilities: string[];
  recommendationFocus: string[];
};

export type PersistedIntelligenceCalculation = {
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
};
type RuleReport = Parameters<typeof deriveReportIntelligence>[0] & {
  persistedIntelligenceCalculations?: PersistedIntelligenceCalculation[];
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const valueNum = Number(raw);
  return Number.isFinite(valueNum) ? valueNum : null;
}

function norm(value: unknown): string {
  return text(value).toLowerCase().normalize('NFKC').replace(/[\s_\-./]+/g, '');
}

function columnKey(report: RuleReport, field: string): string | null {
  const legacyAliases: Record<string, string[]> = {
    productCode: ['sku', 'itemcode', 'item_code'],
    currentStock: ['balance', 'stock', 'onhand', 'on_hand'],
    salesQty: ['net_sales', 'netsales', 'sales', 'sales_qty', 'صافيالمبيعات'],
  };
  const aliases = legacyAliases[field] ?? [];
  const datasets = Array.isArray(report.sourceAnalysis?.datasets) ? report.sourceAnalysis.datasets : [];
  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== 'object') continue;
    const columns = Array.isArray((dataset as Record<string, unknown>).columns)
      ? (dataset as Record<string, unknown>).columns as Array<Record<string, unknown>>
      : [];
    for (const column of columns) {
      const mappedField = text(column.mappedField);
      const columnName = text(column.name);
      if (norm(mappedField) === norm(field)) return mappedField || columnName;
      if (
        aliases.some((alias) => norm(mappedField) === norm(alias) || norm(columnName) === norm(alias))
      ) return mappedField || columnName;
      if (matchCanonicalField(mappedField) === field || matchCanonicalField(columnName) === field) {
        return mappedField || columnName;
      }
    }
  }

  // Real canonical imports may carry authoritative field keys in row data while
  // source-analysis metadata omits dataset column descriptors. Use those keys
  // as the evidence-bound fallback; never synthesize a field that is absent.
  const rowKeys = new Set<string>();
  for (const row of report.canonicalRows ?? []) {
    if (!row?.data || typeof row.data !== 'object') continue;
    for (const key of Object.keys(row.data)) rowKeys.add(key);
  }
  for (const key of rowKeys) {
    if (norm(key) === norm(field)) return key;
    if (aliases.some((alias) => norm(key) === norm(alias))) return key;
    if (matchCanonicalField(key) === field) return key;
  }

  return null;
}

function rawColumnKey(report: RuleReport, aliases: string[]): string | null {
  const datasets = Array.isArray(report.sourceAnalysis?.datasets) ? report.sourceAnalysis.datasets : [];
  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== 'object') continue;
    const columns = Array.isArray((dataset as Record<string, unknown>).columns)
      ? (dataset as Record<string, unknown>).columns as Array<Record<string, unknown>>
      : [];
    const found = columns.find((column) => {
      const mapped = norm(text(column.mappedField));
      const name = norm(text(column.name));
      return aliases.some((alias) => mapped === norm(alias) || name === norm(alias));
    });
    if (found) return text(found.mappedField ?? found.name);
  }
  return null;
}

function rowsOf(report: RuleReport): Array<{ data?: Record<string, unknown> | null }> {
  return report.canonicalRows ?? [];
}

function sumBy(rows: Array<{ data?: Record<string, unknown> | null }>, key: string): number {
  return rows.reduce((total, row) => total + (num(row.data?.[key]) ?? 0), 0);
}

function groupTop(rows: Array<{ data?: Record<string, unknown> | null }>, dimensionKey: string, valueKey: string) {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const dimension = text(row.data?.[dimensionKey]) || 'غير محدد';
    const value = num(row.data?.[valueKey]);
    if (value == null) continue;
    groups.set(dimension, (groups.get(dimension) ?? 0) + value);
  }
  return [...groups.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] ?? null;
}

function dateValue(rows: Array<{ data?: Record<string, unknown> | null }>, dateKey: string, valueKey: string) {
  const monthly = new Map<string, number>();
  for (const row of rows) {
    const raw = text(row.data?.[dateKey]);
    const value = num(row.data?.[valueKey]);
    const parsed = raw ? new Date(raw) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || value == null) continue;
    const month = parsed.getUTCFullYear() + '-' + String(parsed.getUTCMonth() + 1).padStart(2, '0');
    monthly.set(month, (monthly.get(month) ?? 0) + value);
  }
  const points = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (points.length < 2) return null;
  const previous = points[points.length - 2];
  const latest = points[points.length - 1];
  const delta = latest[1] - previous[1];
  const pct = previous[1] === 0 ? null : (delta / Math.abs(previous[1])) * 100;
  return { previous, latest, delta, pct };
}

function primaryDimension(profile: RuleProfile): string | null {
  const candidates = [
    ['customerCode', 'customer'],
    ['supplierCode', 'supplier'],
    ['productCode', 'product'],
    ['category', 'category'],
    ['brand', 'brand'],
    ['warehouse', 'warehouse'],
    ['salesRep', 'salesrep'],
    ['accountCode', 'account'],
  ] as const;
  for (const [field, label] of candidates) {
    if (profile.requiredFields.includes(field) || profile.capabilities.some((cap) => norm(cap).includes(norm(label)))) return field;
  }
  return null;
}

function baseOwnerHint(profile: RuleProfile): string {
  const id = String(profile.id).toLowerCase();
  if (id.includes('inventory') || id.includes('stock')) return 'مسؤول المخزون';
  if (id.includes('sales') || id.includes('customer')) return 'مسؤول المبيعات';
  if (id.includes('purchase') || id.includes('supplier')) return 'مسؤول المشتريات';
  if (id.includes('receivable') || id.includes('collection')) return 'مسؤول التحصيل';
  if (id.includes('profit') || id.includes('margin')) return 'المدير المالي';
  return 'المسؤول التشغيلي المناسب للمصدر';
}

function addModelFinding(
  intelligence: ReportIntelligence,
  profile: RuleProfile,
  finding: BusinessFinding,
): ReportIntelligence {
  const findings = [finding, ...intelligence.findings.filter((item) => item.id !== finding.id)];
  return {
    ...intelligence,
    findings,
    advisorBrief: {
      ...intelligence.advisorBrief,
      topFinding: findings[0] ?? null,
      recommendedAction: findings[0]?.action ?? intelligence.advisorBrief.recommendedAction,
      headline: findings[0]?.statement ?? intelligence.advisorBrief.headline,
      ownerHint: intelligence.advisorBrief.ownerHint,
      expectedOutcome: findings[0] ? 'تحويل هذه النتيجة إلى قرار/إجراء قابل للقياس بعد المراجعة.' : intelligence.advisorBrief.expectedOutcome,
      measurement: findings[0] ? 'إعادة قياس المؤشر نفسه بعد الإجراء مع الحفاظ على source/job/evidence lineage.' : intelligence.advisorBrief.measurement,
      proofRequirement: intelligence.advisorBrief.proofRequirement,
    },
  };
}

function addModelRecommendation(intelligence: ReportIntelligence, profile: RuleProfile, finding: BusinessFinding): ReportIntelligence {
  const recommendation: ReportRecommendation = {
    id: 'rec:archetype:' + profile.id,
    status: 'PROPOSED',
    priority: finding.priority === 'high' ? 'high' : 'medium',
    title: 'مراجعة: ' + profile.title,
    action: finding.action || profile.recommendationFocus[0] || 'راجع النتيجة مع الدليل قبل اتخاذ القرار.',
    why: finding.statement,
    evidence: finding.evidence,
    ownerHint: baseOwnerHint(profile),
    impact: finding.value == null ? 'الأثر المالي غير مثبت من المصدر الحالي.' : 'الأثر المثبت حاليًا مرتبط بالقيمة/النطاق الظاهر في الدليل.',
    expectedOutcome: 'إعادة القياس بعد تنفيذ الإجراء مع نفس source/job/evidence lineage.',
    whyNow: finding.priority === 'high'
      ? 'هذه النتيجة تستحق المراجعة الآن قبل تحويل المصدر إلى قرار تنفيذي.'
      : 'هذه النتيجة تستحق المراجعة قبل اعتماد أي إجراء مبني عليها.',
    measurement: 'أعد قياس المؤشر نفسه بعد الإجراء مع الاحتفاظ بنفس source/job/evidence lineage.',
    risk: 'خطر القرار المبكر هو اعتماد استنتاج فوق نتيجة تحتاج تحققًا أو تفسيرًا إضافيًا.',
    blocker: finding.evidence.length > 0
      ? 'اعتماد القرار متوقف على مطابقة الدليل المرتبط بهذه النتيجة.'
      : 'لا يوجد دليل كافٍ للاعتماد؛ يجب إيقاف التحويل إلى قرار حتى يظهر الدليل المطلوب.',
    limitation: finding.limitation || 'لا يثبت المصدر الحالي أثرًا سببيًا أو ماليًا أوسع من النتيجة المرصودة.',
  };
  return {
    ...intelligence,
    recommendations: [
      recommendation,
      ...intelligence.recommendations.filter((item) => item.id !== recommendation.id),
    ],
  };
}

export function applyArchetypeRuleSet(
  profile: RuleProfile,
  report: RuleReport,
  base: ReportIntelligence,
): ReportIntelligence {
  const rows = rowsOf(report);
  if (!rows.length) return base;

  let intelligence = base;
  const required = new Set((profile.capabilities ?? []).map(norm));
  const family = text(profile.ruleFamily);
  if (!family) throw new Error('ARCHETYPE_RULE_FAMILY_MISSING:' + profile.id);
  const has = (field: string) => Boolean(columnKey(report, field));

  const dateKey = columnKey(report, 'documentDate');
  const amountKey = columnKey(report, 'netAmount') ?? columnKey(report, 'grossAmount') ?? columnKey(report, 'targetAmount');
  const qtyKey = columnKey(report, 'quantity') ?? columnKey(report, 'salesQty');
  const dimensionKey = primaryDimension(profile);

  let modelFinding: BusinessFinding | null = null;

  if (family === 'trend' || required.has('trend') || required.has('growth') || required.has('periodcomparison') || required.has('continuity') || required.has('seasonality')) {
    if (dateKey && amountKey) {
      const trend = dateValue(rows, dateKey, amountKey);
      if (trend) {
        const pctText = trend.pct == null ? 'غير متاح كنسبة لأن الفترة السابقة تساوي صفرًا.' : ' بنسبة ' + trend.pct.toFixed(1) + '%';
        modelFinding = {
          id: 'archetype:' + profile.id + ':trend',
          kind: 'FINDING',
          priority: trend.pct != null && Math.abs(trend.pct) >= 20 ? 'high' : 'medium',
          title: profile.title + ' — التغير الزمني',
          statement: 'تحولت القيمة المحسوبة من ' + trend.previous[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' إلى ' + trend.latest[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + pctText + '.',
          value: trend.delta,
          unit: 'فرق الفترة',
          dimensionLabel: 'الفترة',
          dimensionValue: trend.latest[0],
          evidence: ['dateField=' + dateKey, 'valueField=' + amountKey, 'previousPeriod=' + trend.previous[0], 'latestPeriod=' + trend.latest[0]],
          limitation: 'هذا تفكيك وصفي للفترة ولا يثبت السبب أو الاستدامة.',
          action: profile.recommendationFocus[0] || 'راجع المحركات التي غيّرت النتيجة قبل اعتماد قرار.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'party-concentration' || required.has('concentration') || required.has('customervalue') || required.has('supplierdependency') || required.has('topsuppliershare') || required.has('productconcentration') || required.has('portfolio'))) {
    if (dimensionKey && amountKey) {
      const top = groupTop(rows, dimensionKey, amountKey);
      const total = sumBy(rows, amountKey);
      if (top && total !== 0) {
        const share = Math.abs(top[1] / total) * 100;
        const label = dimensionKey === 'customerCode' ? 'العميل' : dimensionKey === 'supplierCode' ? 'المورد' : dimensionKey === 'productCode' ? 'الصنف' : dimensionKey === 'salesRep' ? 'المندوب' : dimensionKey === 'accountCode' ? 'الحساب' : 'البعد';
        modelFinding = {
          id: 'archetype:' + profile.id + ':concentration',
          kind: share >= 50 ? 'RISK' : 'FINDING',
          priority: share >= 50 ? 'high' : 'medium',
          title: profile.title + ' — التركّز',
          statement: label + ' "' + top[0] + '" يمثل ' + share.toFixed(1) + '% من القيمة المحسوبة في هذا المصدر.',
          value: top[1],
          unit: 'قيمة المصدر',
          dimensionLabel: label,
          dimensionValue: top[0],
          evidence: ['dimensionField=' + dimensionKey, 'valueField=' + amountKey, 'dimensionValue=' + top[0], 'share=' + share.toFixed(2) + '%', 'sourceTotal=' + total.toFixed(2)],
          limitation: 'التركيز حساب وصفي؛ لا يعني وحده خطرًا أو اعتمادًا غير مقبول.',
          action: profile.recommendationFocus[0] || 'راجع البعد الأعلى تركّزًا ثم افحص السجلات المصدرية.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'price' || required.has('price') || required.has('pricevariance') || required.has('sellingprice') || required.has('marginimpactwhencostexists'))) {
    const priceKey = columnKey(report, 'unitPrice') ?? columnKey(report, 'sellingPrice') ?? columnKey(report, 'cost');
    if (priceKey) {
      const values = rows.map((row) => num(row.data?.[priceKey])).filter((value): value is number => value != null);
      if (values.length) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const spread = avg === 0 ? null : ((max - min) / Math.abs(avg)) * 100;
        modelFinding = {
          id: 'archetype:' + profile.id + ':price',
          kind: spread != null && spread >= 25 ? 'RISK' : 'FINDING',
          priority: spread != null && spread >= 25 ? 'high' : 'medium',
          title: profile.title + ' — تشتت السعر/التكلفة',
          statement: 'القيمة تتراوح بين ' + min.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' و' + max.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' بمتوسط ' + avg.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + (spread == null ? '.' : '، وتشتتها النسبي التقريبي ' + spread.toFixed(1) + '%.'),
          value: spread,
          unit: '% spread',
          evidence: ['priceField=' + priceKey, 'usableRows=' + values.length, 'min=' + min.toFixed(2), 'max=' + max.toFixed(2)],
          limitation: 'التشتت لا يثبت خطأ تسعيريًا دون تحديد السياق والوحدة والمخزن والتاريخ.',
          action: profile.recommendationFocus[0] || 'افحص اختلافات السعر حسب السياق قبل اتخاذ قرار سعري.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'coverage' || required.has('stockout risk') || required.has('coveragerisk') || required.has('days-weeks-cover') || required.has('stockout-risk') || required.has('stock-linkage') || required.has('coverage'))) {
    const stockKey = columnKey(report, 'currentStock');
    const salesKey = columnKey(report, 'salesQty') ?? columnKey(report, 'quantity');
    if (stockKey && salesKey) {
      const stock = sumBy(rows, stockKey);
      const demand = sumBy(rows, salesKey);
      const ratio = demand === 0 ? null : stock / Math.abs(demand);
      modelFinding = {
        id: 'archetype:' + profile.id + ':coverage',
        kind: ratio != null && ratio < 1 ? 'RISK' : 'FINDING',
        priority: ratio != null && ratio < 1 ? 'high' : 'medium',
        title: profile.title + ' — تغطية المصدر',
        statement: ratio == null ? 'تعذر حساب نسبة تغطية وصفية من الرصيد والطلب المتاحين.' : 'الرصيد الحالي يعادل ' + ratio.toFixed(2) + ' من كمية الطلب/المبيعات المستخدمة كمرجع في المصدر.',
        value: ratio,
        unit: 'stock-to-demand ratio',
        evidence: ['stockField=' + stockKey, 'demandField=' + salesKey, 'stock=' + stock.toFixed(2), 'demand=' + demand.toFixed(2)],
        limitation: 'هذه نسبة كمية وصفية وليست أيام تغطية؛ أيام التغطية تحتاج فترة زمنية وتعريفًا للطلب.',
        action: profile.recommendationFocus[0] || 'راجع المخزون مقابل الطلب قبل قرار إعادة الطلب.',
      };
    }
  }

  if (!modelFinding && (family === 'returns' || required.has('return-rate') || required.has('returns') || required.has('returnrate'))) {
    const returnKey = columnKey(report, 'returnQty');
    const baseQtyKey = columnKey(report, 'quantity') ?? columnKey(report, 'salesQty');
    if (returnKey && baseQtyKey) {
      const returned = sumBy(rows, returnKey);
      const baseQty = sumBy(rows, baseQtyKey);
      const rate = baseQty === 0 ? null : (returned / Math.abs(baseQty)) * 100;
      modelFinding = {
        id: 'archetype:' + profile.id + ':returns',
        kind: rate != null && rate >= 10 ? 'RISK' : 'FINDING',
        priority: rate != null && rate >= 10 ? 'high' : 'medium',
        title: profile.title + ' — معدل المرتجعات',
        statement: rate == null ? 'تعذر حساب معدل المرتجعات من الحقول المتاحة.' : 'المرتجعات تمثل ' + rate.toFixed(1) + '% من الكمية المرجعية المحسوبة.',
        value: rate,
        unit: '% return rate',
        evidence: ['returnField=' + returnKey, 'baseQuantityField=' + baseQtyKey, 'returned=' + returned.toFixed(2), 'baseQuantity=' + baseQty.toFixed(2)],
        limitation: 'المعدل وصفي؛ لا يحدد سبب المرتجع أو مسؤوليته دون دليل إضافي.',
        action: profile.recommendationFocus[0] || 'حدد الأصناف والعملاء الأكثر مساهمة في المرتجعات قبل الإجراء.',
      };
    }
  }

  if (!modelFinding && (family === 'discount' || required.has('discount-distribution') || required.has('discounts'))) {
    const discountKey = columnKey(report, 'discount');
    if (discountKey) {
      const totalDiscount = sumBy(rows, discountKey);
      modelFinding = {
        id: 'archetype:' + profile.id + ':discount',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — قيمة الخصومات',
        statement: 'إجمالي الخصومات المحسوب من المصدر هو ' + totalDiscount.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value: totalDiscount,
        unit: 'عملة المصدر',
        evidence: ['discountField=' + discountKey, 'rows=' + rows.length],
        limitation: 'لا يحدد الإجمالي وحده ما إذا كان الخصم صحيحًا أو مؤثرًا على الهامش.',
        action: profile.recommendationFocus[0] || 'حلل الخصومات حسب العميل/الصنف والسياق قبل اعتماد قرار.',
      };
    }
  }

  if (!modelFinding && (family === 'target-gap' || required.has('gap') || required.has('pace') || required.has('targetactual') || profile.id === 'sales.target-vs-actual')) {
    const targetKey = columnKey(report, 'targetAmount');
    const actualKey = columnKey(report, 'netAmount') ?? columnKey(report, 'grossAmount');
    if (targetKey && actualKey) {
      const target = sumBy(rows, targetKey);
      const actual = sumBy(rows, actualKey);
      const gap = actual - target;
      modelFinding = {
        id: 'archetype:' + profile.id + ':target-gap',
        kind: gap < 0 ? 'RISK' : 'FINDING',
        priority: gap < 0 ? 'high' : 'medium',
        title: profile.title + ' — الفجوة',
        statement: 'الفعلي المحسوب ' + actual.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' مقابل مستهدف ' + target.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '؛ الفجوة ' + gap.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value: gap,
        unit: 'actual-target',
        evidence: ['actualField=' + actualKey, 'targetField=' + targetKey],
        limitation: 'المقارنة لا تفسر سبب الفجوة.',
        action: profile.recommendationFocus[0] || 'حلل المساهمين في الفجوة ثم صحح المسار.',
      };
    }
  }

  if (!modelFinding && (family === 'lead-time' || required.has('delivery') || required.has('lead-time') || required.has('leadtime'))) {
    const leadKey = columnKey(report, 'leadTimeDays');
    if (leadKey) {
      const values = rows.map((row) => num(row.data?.[leadKey])).filter((value): value is number => value != null);
      if (values.length) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        modelFinding = {
          id: 'archetype:' + profile.id + ':lead-time',
          kind: max >= 30 ? 'RISK' : 'FINDING',
          priority: max >= 30 ? 'high' : 'medium',
          title: profile.title + ' — مدة التوريد',
          statement: 'متوسط مدة التوريد ' + avg.toFixed(1) + ' يوم، وأعلى مدة مرصودة ' + max.toFixed(1) + ' يوم.',
          value: avg,
          unit: 'days',
          evidence: ['leadTimeField=' + leadKey, 'usableRows=' + values.length, 'max=' + max.toFixed(2)],
          limitation: 'لا تقارن المدة وحدها بمستوى الخدمة دون تحديد معيار تعاقدي.',
          action: profile.recommendationFocus[0] || 'راجع الموردين ذوي مدد التوريد الأعلى قبل قرار شراء.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'aging' || required.has('aging-buckets') || required.has('overdue-exposure') || required.has('collection-queue') || required.has('due-schedule') || required.has('obligations'))) {
    const dueKey = columnKey(report, 'dueDate');
    const valueKey = columnKey(report, 'netAmount') ?? columnKey(report, 'balance');
    if (dueKey && valueKey) {
      const parsed = rows.map((row) => {
        const due = new Date(text(row.data?.[dueKey]));
        const value = num(row.data?.[valueKey]);
        return !Number.isNaN(due.getTime()) && value != null ? { due, value } : null;
      }).filter((item): item is { due: Date; value: number } => Boolean(item));
      if (parsed.length) {
        const asOf = parsed.reduce((latest, item) => item.due > latest ? item.due : latest, parsed[0].due);
        const overdue = parsed.filter((item) => item.due < asOf);
        const overdueValue = overdue.reduce((total, item) => total + item.value, 0);
        modelFinding = {
          id: 'archetype:' + profile.id + ':aging',
          kind: overdue.length ? 'RISK' : 'FINDING',
          priority: overdue.length ? 'high' : 'medium',
          title: profile.title + ' — استحقاقات حسب آخر تاريخ في المصدر',
          statement: 'حتى آخر تاريخ استحقاق ظاهر في المصدر، يوجد ' + overdue.length + ' سجلًا أقدم بقيمة ' + overdueValue.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
          value: overdueValue,
          unit: 'عملة المصدر',
          evidence: ['dueDateField=' + dueKey, 'valueField=' + valueKey, 'asOf=' + asOf.toISOString().slice(0,10), 'overdueRows=' + overdue.length],
          limitation: 'المرجع الزمني هنا هو أحدث تاريخ ظاهر في المصدر، وليس تاريخ اليوم؛ لا يثبت التعثر.',
          action: profile.recommendationFocus[0] || 'رتّب الاستحقاقات المتأخرة ثم راجع الحسابات/الموردين الأصلية.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'cashflow' || required.has('cash-position') || required.has('inflows-outflows') || required.has('liquidity-gap') || required.has('obligations-vs-collections'))) {
    const debitKey = columnKey(report, 'debit');
    const creditKey = columnKey(report, 'credit');
    const netKey = columnKey(report, 'netAmount');
    const inflow = creditKey ? sumBy(rows, creditKey) : netKey ? Math.max(0, sumBy(rows, netKey)) : 0;
    const outflow = debitKey ? sumBy(rows, debitKey) : netKey ? Math.abs(Math.min(0, sumBy(rows, netKey))) : 0;
    if (debitKey || creditKey || netKey) {
      const net = inflow - outflow;
      modelFinding = {
        id: 'archetype:' + profile.id + ':cashflow',
        kind: net < 0 ? 'RISK' : 'FINDING',
        priority: net < 0 ? 'high' : 'medium',
        title: profile.title + ' — صافي الحركة',
        statement: 'التدفقات الداخلة المحسوبة ' + inflow.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، والخارجة ' + outflow.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، والصافي ' + net.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value: net,
        unit: 'عملة المصدر',
        evidence: ['inflow=' + inflow.toFixed(2), 'outflow=' + outflow.toFixed(2), 'net=' + net.toFixed(2)],
        limitation: 'التصنيف داخلي على حقول المصدر؛ لا يثبت التدفق النقدي المحاسبي دون تعريف نوع الحركة.',
        action: profile.recommendationFocus[0] || 'راجع مصادر التدفق الداخلة والخارجة قبل قرار السيولة.',
      };
    }
  }

  if (!modelFinding && (family === 'balance-sheet' || required.has('assets-liabilities-equity-when-present') || required.has('assetsliabilitiesequitywhenpresent') || profile.id === 'finance.balance-sheet')) {
    const assetKey = columnKey(report, 'asset');
    const liabilityKey = columnKey(report, 'liability');
    const equityKey = columnKey(report, 'equity');
    if (assetKey || liabilityKey || equityKey) {
      const assets = assetKey ? sumBy(rows, assetKey) : null;
      const liabilities = liabilityKey ? sumBy(rows, liabilityKey) : null;
      const equity = equityKey ? sumBy(rows, equityKey) : null;
      modelFinding = {
        id: 'archetype:' + profile.id + ':balance-sheet',
        kind: 'FINDING',
        priority: 'high',
        title: profile.title + ' — المراكز المتاحة',
        statement: 'الأصول ' + (assets == null ? 'غير متاحة' : assets.toLocaleString('ar-YE', { maximumFractionDigits: 2 })) + '، الخصوم ' + (liabilities == null ? 'غير متاحة' : liabilities.toLocaleString('ar-YE', { maximumFractionDigits: 2 })) + '، وحقوق الملكية ' + (equity == null ? 'غير متاحة' : equity.toLocaleString('ar-YE', { maximumFractionDigits: 2 })) + '.',
        value: assets,
        unit: 'عملة المصدر',
        evidence: ['assetField=' + (assetKey ?? 'missing'), 'liabilityField=' + (liabilityKey ?? 'missing'), 'equityField=' + (equityKey ?? 'missing')],
        limitation: 'هذه مجاميع الحقول الموجودة فقط ولا تعني ميزانًا محاسبيًا متوازنًا ما لم تُستوفَ الحسابات.',
        action: profile.recommendationFocus[0] || 'راجع حسابات المركز المالي ومطابقتها قبل أي قرار.',
      };
    }
  }

  if (!modelFinding && (family === 'account' || required.has('account-movement') || required.has('unusual-entries') || required.has('reconciliation-audit'))) {
    const accountKey = columnKey(report, 'accountCode') ?? columnKey(report, 'accountName');
    const valueKey = columnKey(report, 'netAmount') ?? columnKey(report, 'debit') ?? columnKey(report, 'credit');
    if (accountKey && valueKey) {
      const top = groupTop(rows, accountKey, valueKey);
      const total = sumBy(rows, valueKey);
      if (top) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':account',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — الحساب الأعلى حركة',
          statement: 'الحساب "' + top[0] + '" يحمل أعلى حركة محسوبة بقيمة ' + top[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + (total === 0 ? '.' : ' من إجمالي محسوب ' + total.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.'),
          value: top[1],
          unit: 'عملة المصدر',
          dimensionLabel: 'الحساب',
          dimensionValue: top[0],
          evidence: ['accountField=' + accountKey, 'valueField=' + valueKey],
          limitation: 'الحركة الأعلى لا تعني شذوذًا أو خطأ دون معيار مقارنة.',
          action: profile.recommendationFocus[0] || 'افحص القيود الأعلى حركة وطابقها مع المستندات.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'transfer' || required.has('source-destination-flow') || required.has('transfer-optimization'))) {
    const fromKey = columnKey(report, 'fromWarehouse');
    const toKey = columnKey(report, 'toWarehouse');
    const valueKey = columnKey(report, 'quantity') ?? columnKey(report, 'salesQty');
    if (fromKey && toKey && valueKey) {
      const transferGroups = new Map<string, number>();
      for (const row of rows) {
        const from = text(row.data?.[fromKey]) || 'غير محدد';
        const to = text(row.data?.[toKey]) || 'غير محدد';
        const value = num(row.data?.[valueKey]);
        if (value != null) transferGroups.set(from + ' → ' + to, (transferGroups.get(from + ' → ' + to) ?? 0) + value);
      }
      const top = [...transferGroups.entries()].sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))[0];
      if (top) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':transfer',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — مسار التحويل الأعلى',
          statement: 'أعلى مسار تحويل هو "' + top[0] + '" بقيمة كمية ' + top[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
          value: top[1],
          unit: 'كمية',
          evidence: ['fromWarehouse=' + fromKey, 'toWarehouse=' + toKey, 'quantityField=' + valueKey],
          limitation: 'الحجم الأعلى لا يثبت أن التحويل غير كفؤ دون احتياج وتوقيت ومخزون الموقعين.',
          action: profile.recommendationFocus[0] || 'راجع مسار التحويل مقابل اختلال المخزون قبل التنفيذ.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'mix' || required.has('mix')) && dimensionKey && amountKey) {
    const top = groupTop(rows, dimensionKey, amountKey);
    if (top) {
      modelFinding = {
        id: 'archetype:' + profile.id + ':mix',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — أعلى مكوّن في المزيج',
        statement: 'المكوّن "' + top[0] + '" يحمل أكبر قيمة محسوبة في المزيج.',
        value: top[1],
        unit: 'قيمة المصدر',
        dimensionValue: top[0],
        evidence: ['dimensionField=' + dimensionKey, 'valueField=' + amountKey],
        limitation: 'هذا ترتيب وصفي ولا يثبت سبب المزيج أو جودة مكوّن بعينه.',
        action: profile.recommendationFocus[0] || 'راجع المكونات الأعلى أثرًا قبل القرار.',
      };
    }
  }

  if (!modelFinding && has('requestedQty') && has('fulfilledQty')) {
    const requestedKey = columnKey(report, 'requestedQty')!;
    const fulfilledKey = columnKey(report, 'fulfilledQty')!;
    const requested = sumBy(rows, requestedKey);
    const fulfilled = sumBy(rows, fulfilledKey);
    const rate = requested === 0 ? null : (fulfilled / Math.abs(requested)) * 100;
    modelFinding = {
      id: 'archetype:' + profile.id + ':fulfillment',
      kind: rate != null && rate < 80 ? 'RISK' : 'FINDING',
      priority: rate != null && rate < 80 ? 'high' : 'medium',
      title: profile.title + ' — نسبة تلبية الطلب',
      statement: rate == null ? 'تعذر حساب نسبة التلبية.' : 'تم تلبية ' + rate.toFixed(1) + '% من الكمية المطلوبة ضمن السجلات المتاحة.',
      value: rate,
      unit: '% fulfillment',
      evidence: ['requestedField=' + requestedKey, 'fulfilledField=' + fulfilledKey],
      limitation: 'لا يثبت سبب عدم التلبية أو الخلل التشغيلي.',
      action: profile.recommendationFocus[0] || 'افحص الطلبات غير الملباة وأسبابها قبل الإجراء.',
    };
  }



  if (!modelFinding && family === 'invoice') {
    const docKey = columnKey(report, 'documentNo');
    const valueKey = columnKey(report, 'netAmount') ?? columnKey(report, 'grossAmount');
    if (docKey) {
      const docs = new Set(rows.map((row) => text(row.data?.[docKey])).filter(Boolean));
      const total = valueKey ? sumBy(rows, valueKey) : null;
      modelFinding = {
        id: 'archetype:' + profile.id + ':invoice',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — كثافة الفواتير',
        statement: 'يوجد ' + docs.size + ' رقم مستند/فاتورة فريد في ' + rows.length + ' سجلًا' + (total == null ? '.' : ' بإجمالي قيمة محسوبة ' + total.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.'),
        value: total ?? docs.size,
        unit: total == null ? 'unique documents' : 'source value',
        evidence: ['documentField=' + docKey, 'uniqueDocuments=' + docs.size, 'rows=' + rows.length],
        limitation: 'عدد المستندات لا يثبت صحة الفواتير أو جودة التحصيل.',
        action: profile.recommendationFocus[0] || 'راجع المستندات الأعلى أثرًا قبل اعتماد قرار.',
      };
    }
  }

  if (!modelFinding && family === 'continuity') {
    const partyKey = columnKey(report, 'customerCode') ?? columnKey(report, 'supplierCode');
    const dateKey = columnKey(report, 'documentDate');
    if (partyKey && dateKey) {
      const latestByParty = new Map<string, string>();
      for (const row of rows) {
        const party = text(row.data?.[partyKey]);
        const date = text(row.data?.[dateKey]);
        if (party && date) {
          const current = latestByParty.get(party);
          if (!current || date > current) latestByParty.set(party, date);
        }
      }
      const latestDates = [...latestByParty.values()].sort();
      const latest = latestDates[latestDates.length - 1] ?? null;
      modelFinding = {
        id: 'archetype:' + profile.id + ':continuity',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — استمرارية الكيانات',
        statement: 'النموذج يتابع ' + latestByParty.size + ' كيانًا؛ أحدث تاريخ مرصود ضمن هذه العلاقات هو ' + (latest ?? 'غير متاح') + '.',
        value: latestByParty.size,
        unit: 'unique entities',
        evidence: ['partyField=' + partyKey, 'dateField=' + dateKey, 'uniqueEntities=' + latestByParty.size],
        limitation: 'وجود تاريخ أخير لا يثبت الخمول أو فقد العميل/المورد دون تعريف نافذة الانقطاع.',
        action: profile.recommendationFocus[0] || 'راجع الكيانات التي انقطع نشاطها خارج نافذة المتابعة المعتمدة.',
      };
    }
  }

  if (!modelFinding && family === 'location') {
    const locationKey = columnKey(report, 'warehouse');
    const valueKey = columnKey(report, 'netAmount') ?? columnKey(report, 'quantity') ?? columnKey(report, 'currentStock');
    if (locationKey && valueKey) {
      const groups = groupTop(rows, locationKey, valueKey);
      const unique = new Set(rows.map((row) => text(row.data?.[locationKey])).filter(Boolean)).size;
      if (groups) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':location',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — توزيع المواقع',
          statement: 'يغطي المصدر ' + unique + ' مواقع، وأعلى موقع في القيمة/الكمية المحسوبة هو "' + groups[0] + '".',
          value: groups[1],
          unit: 'source value',
          dimensionLabel: 'الموقع',
          dimensionValue: groups[0],
          evidence: ['locationField=' + locationKey, 'valueField=' + valueKey, 'uniqueLocations=' + unique],
          limitation: 'التركيز المكاني لا يثبت كفاءة الموقع أو الحاجة إلى التحويل.',
          action: profile.recommendationFocus[0] || 'قارن المواقع مع الطلب والمخزون/المبيعات قبل الإجراء.',
        };
      }
    }
  }

  if (!modelFinding && family === 'representative') {
    const repKey = columnKey(report, 'salesRep');
    const valueKey = columnKey(report, 'netAmount');
    if (repKey && valueKey) {
      const top = groupTop(rows, repKey, valueKey);
      if (top) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':representative',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — مساهمة المندوب',
          statement: 'المندوب "' + top[0] + '" يحمل أعلى قيمة محسوبة بمقدار ' + top[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
          value: top[1],
          unit: 'source value',
          dimensionLabel: 'المندوب',
          dimensionValue: top[0],
          evidence: ['representativeField=' + repKey, 'valueField=' + valueKey],
          limitation: 'القيمة الأعلى لا تعني بالضرورة أفضل أداء دون مقارنة الفرص والحصص والفترة.',
          action: profile.recommendationFocus[0] || 'راجع محفظة المندوب والأصناف والعملاء المساهمين.',
        };
      }
    }
  }

  if (!modelFinding && family === 'payment') {
    const methodKey = columnKey(report, 'paymentMethod') ?? columnKey(report, 'paymentTerms') ?? columnKey(report, 'currency');
    const valueKey = columnKey(report, 'netAmount') ?? columnKey(report, 'paidAmount');
    if (methodKey && valueKey) {
      const top = groupTop(rows, methodKey, valueKey);
      if (top) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':payment',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — توزيع طريقة/شروط الدفع',
          statement: 'القيمة الأعلى مرتبطة بـ"' + top[0] + '" بإجمالي محسوب ' + top[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
          value: top[1],
          unit: 'source value',
          dimensionLabel: 'طريقة/شرط الدفع',
          dimensionValue: top[0],
          evidence: ['groupField=' + methodKey, 'valueField=' + valueKey],
          limitation: 'التوزيع الوصفي لا يثبت مخاطرة ائتمانية أو مشكلة تحصيل.',
          action: profile.recommendationFocus[0] || 'راجع توزيع الدفع وشروطه مع الذمم الفعلية.',
        };
      }
    }
  }

  if (!modelFinding && family === 'inventory-aging') {
    const stockKey = columnKey(report, 'currentStock');
    const dateKey = columnKey(report, 'documentDate');
    if (stockKey && dateKey) {
      const dated = rows.map((row) => {
        const raw = text(row.data?.[dateKey]);
        const date = new Date(raw);
        const stock = num(row.data?.[stockKey]);
        return Number.isNaN(date.getTime()) || stock == null ? null : { date, stock };
      }).filter((item): item is { date: Date; stock: number } => Boolean(item));
      if (dated.length) {
        const asOf = dated.reduce((latest, item) => item.date > latest ? item.date : latest, dated[0].date);
        const nonZero = dated.filter((item) => item.stock > 0);
        const oldest = nonZero.reduce((oldest, item) => item.date < oldest ? item.date : oldest, asOf);
        const ageDays = Math.max(0, Math.round((asOf.getTime() - oldest.getTime()) / 86400000));
        modelFinding = {
          id: 'archetype:' + profile.id + ':inventory-aging',
          kind: ageDays >= 90 ? 'RISK' : 'FINDING',
          priority: ageDays >= 90 ? 'high' : 'medium',
          title: profile.title + ' — عمر الرصيد المرصود',
          statement: 'أقدم تاريخ مرصود لرصيد موجب يسبق آخر تاريخ للمصدر بنحو ' + ageDays + ' يومًا.',
          value: ageDays,
          unit: 'days',
          evidence: ['stockField=' + stockKey, 'dateField=' + dateKey, 'asOf=' + asOf.toISOString().slice(0, 10), 'oldestPositiveStockDate=' + oldest.toISOString().slice(0, 10)],
          limitation: 'العمر هنا مشتق من تواريخ السجلات المتاحة وليس من تاريخ دخول المخزون الفعلي ما لم يكن مسجلًا.',
          action: profile.recommendationFocus[0] || 'حدد الأرصدة الأقدم واربطها بحركة البيع قبل قرار التصفية.',
        };
      }
    }
  }

  if (!modelFinding && family === 'inventory-velocity') {
    const dateKey = columnKey(report, 'documentDate');
    const salesKey = columnKey(report, 'salesQty') ?? (text(report.specialty) === 'inventory' ? rawColumnKey(report, ['net_sales', 'صافي المبيعات']) : null);
    if (dateKey && salesKey) {
      const trend = dateValue(rows, dateKey, salesKey);
      if (trend) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':inventory-velocity',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — حركة الكمية',
          statement: 'كمية الحركة انتقلت من ' + trend.previous[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' إلى ' + trend.latest[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' بين آخر فترتين.',
          value: trend.delta,
          unit: 'quantity delta',
          dimensionLabel: 'الفترة',
          dimensionValue: trend.latest[0],
          evidence: ['dateField=' + dateKey, 'salesQtyField=' + salesKey, 'previousPeriod=' + trend.previous[0], 'latestPeriod=' + trend.latest[0]],
          limitation: 'هذا تغير في الكمية وليس معدل دوران محاسبي؛ معدل الدوران يحتاج متوسط مخزون موثق.',
          action: profile.recommendationFocus[0] || 'اربط حركة الكمية بالرصيد المتوسط لتقييم السرعة الفعلية.',
        };
      }
    }
  }

  if (!modelFinding && family === 'inventory-position') {
    const stockKey = columnKey(report, 'currentStock');
    if (stockKey) {
      const totalStock = sumBy(rows, stockKey);
      const negative = rows.filter((row) => (num(row.data?.[stockKey]) ?? 0) < 0).length;
      modelFinding = {
        id: 'archetype:' + profile.id + ':inventory-position',
        kind: negative ? 'RISK' : 'FINDING',
        priority: negative ? 'high' : 'medium',
        title: profile.title + ' — الرصيد الحالي',
        statement: 'إجمالي الرصيد الحالي المحسوب هو ' + totalStock.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' مع ' + negative + ' سجل سالب.',
        value: totalStock,
        unit: 'quantity',
        evidence: ['stockField=' + stockKey, 'negativeRows=' + negative, 'rows=' + rows.length],
        limitation: 'الرصيد لا يوضح الحركة أو الطلب المستقبلي وحده.',
        action: profile.recommendationFocus[0] || 'راجع الأرصدة غير الطبيعية ثم اربطها بالحركة والطلب.',
      };
    }
  }

  if (!modelFinding && family === 'inventory-movement') {
    const openingKey = columnKey(report, 'openingStock') ?? columnKey(report, 'openingBalance');
    const inboundKey = columnKey(report, 'inbound');
    const outboundKey = columnKey(report, 'outbound');
    const currentKey = columnKey(report, 'currentStock');
    if (openingKey && inboundKey && outboundKey && currentKey) {
      let gap = 0;
      let usable = 0;
      for (const row of rows) {
        const opening = num(row.data?.[openingKey]);
        const inbound = num(row.data?.[inboundKey]);
        const outbound = num(row.data?.[outboundKey]);
        const current = num(row.data?.[currentKey]);
        if ([opening, inbound, outbound, current].every((v) => v != null)) {
          gap += (opening! + inbound! - outbound!) - current!;
          usable += 1;
        }
      }
      modelFinding = {
        id: 'archetype:' + profile.id + ':inventory-movement',
        kind: gap === 0 ? 'FINDING' : 'RISK',
        priority: gap === 0 ? 'medium' : 'high',
        title: profile.title + ' — تسوية الحركة',
        statement: 'تمت مطابقة ' + usable + ' سجلًا؛ فجوة التسوية الإجمالية = ' + gap.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value: gap,
        unit: 'reconciliation gap',
        evidence: ['opening=' + openingKey, 'inbound=' + inboundKey, 'outbound=' + outboundKey, 'current=' + currentKey, 'usableRows=' + usable],
        limitation: 'الفجوة الحسابية لا تفسر وحدها مصدر الفرق.',
        action: profile.recommendationFocus[0] || 'طابق الحركات المصدرية مع الرصيد النهائي قبل تعديل المخزون.',
      };
    }
  }

  if (!modelFinding && family === 'stockout-reorder') {
    const stockKey = columnKey(report, 'currentStock');
    const demandKey = columnKey(report, 'salesQty') ?? columnKey(report, 'requestedQty');
    if (stockKey && demandKey) {
      const stock = sumBy(rows, stockKey);
      const demand = sumBy(rows, demandKey);
      const ratio = demand === 0 ? null : stock / Math.abs(demand);
      modelFinding = {
        id: 'archetype:' + profile.id + ':stockout-reorder',
        kind: ratio != null && ratio < 1 ? 'RISK' : 'FINDING',
        priority: ratio != null && ratio < 1 ? 'high' : 'medium',
        title: profile.title + ' — أولوية إعادة الطلب',
        statement: ratio == null ? 'تعذر حساب نسبة كمية بين الرصيد والطلب المرجعي.' : 'نسبة الرصيد إلى الطلب المرجعي = ' + ratio.toFixed(2) + '.',
        value: ratio,
        unit: 'stock-to-demand ratio',
        evidence: ['stockField=' + stockKey, 'demandField=' + demandKey],
        limitation: 'لا تكفي هذه النسبة وحدها لتحديد كمية إعادة الطلب أو تاريخ النفاد.',
        action: profile.recommendationFocus[0] || 'اربط الرصيد بالمهلة والطلب التاريخي قبل اعتماد كمية شراء.',
      };
    }
  }

  if (!modelFinding && family === 'inventory-valuation') {
    const stockKey = columnKey(report, 'currentStock');
    const costKey = columnKey(report, 'cost');
    if (stockKey && costKey) {
      const value = rows.reduce((sum, row) => sum + (num(row.data?.[stockKey]) ?? 0) * (num(row.data?.[costKey]) ?? 0), 0);
      modelFinding = {
        id: 'archetype:' + profile.id + ':inventory-valuation',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — قيمة المخزون المرجعية',
        statement: 'القيمة المرجعية المحسوبة من الكمية × التكلفة = ' + value.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value,
        unit: 'reference inventory value',
        evidence: ['stockField=' + stockKey, 'costField=' + costKey],
        limitation: 'هذه قيمة مرجعية وليست بالضرورة قيمة دفترية أو تقييمًا محاسبيًا نهائيًا.',
        action: profile.recommendationFocus[0] || 'طابق التقييم المرجعي مع سياسة التكلفة والسجل المحاسبي.',
      };
    }
  }

  if (!modelFinding && family === 'inventory-adjustment') {
    const adjustmentKey = columnKey(report, 'adjustmentQty') ?? columnKey(report, 'quantity');
    if (adjustmentKey) {
      const values = rows.map((row) => num(row.data?.[adjustmentKey])).filter((v): v is number => v != null);
      const abs = values.reduce((sum, value) => sum + Math.abs(value), 0);
      const nonZero = values.filter((value) => value !== 0).length;
      modelFinding = {
        id: 'archetype:' + profile.id + ':inventory-adjustment',
        kind: nonZero ? 'RISK' : 'FINDING',
        priority: nonZero ? 'medium' : 'low',
        title: profile.title + ' — حجم التسويات',
        statement: 'تم رصد ' + nonZero + ' حركة غير صفرية بقيمة مطلقة إجمالية ' + abs.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
        value: abs,
        unit: 'absolute adjustment quantity',
        evidence: ['adjustmentField=' + adjustmentKey, 'nonZeroRows=' + nonZero],
        limitation: 'وجود التسوية لا يثبت خطأً؛ يلزم سبب الحركة ومستندها.',
        action: profile.recommendationFocus[0] || 'راجع الحركات غير الصفرية مع المستندات الأصلية.',
      };
    }
  }

  if (!modelFinding && family === 'activity') {
    const partyKey = columnKey(report, 'customerCode') ?? columnKey(report, 'supplierCode');
    const dateKey = columnKey(report, 'documentDate');
    if (partyKey) {
      const unique = new Set(rows.map((row) => text(row.data?.[partyKey])).filter(Boolean)).size;
      modelFinding = {
        id: 'archetype:' + profile.id + ':activity',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — نطاق النشاط',
        statement: 'المصدر يغطي ' + unique + ' كيانًا فريدًا ضمن ' + rows.length + ' سجلًا.',
        value: unique,
        unit: 'unique entities',
        evidence: ['entityField=' + partyKey, 'uniqueEntities=' + unique, 'dateField=' + (dateKey ?? 'missing')],
        limitation: 'عدد الكيانات لا يثبت نشاطًا فعالًا دون نافذة زمنية وتعريف النشاط.',
        action: profile.recommendationFocus[0] || 'قسّم النشاط حسب الفترة والقيمة قبل ترتيب المتابعة.',
      };
    }
  }

  if (!modelFinding && family === 'rfm') {
    const customerKey = columnKey(report, 'customerCode');
    const dateKey = columnKey(report, 'documentDate');
    const valueKey = columnKey(report, 'netAmount');
    if (customerKey && dateKey && valueKey) {
      const customers = new Map<string, { last: number; frequency: number; monetary: number }>();
      for (const row of rows) {
        const customer = text(row.data?.[customerKey]);
        const date = new Date(text(row.data?.[dateKey]));
        const value = num(row.data?.[valueKey]);
        if (!customer || Number.isNaN(date.getTime()) || value == null) continue;
        const item = customers.get(customer) ?? { last: 0, frequency: 0, monetary: 0 };
        item.last = Math.max(item.last, date.getTime());
        item.frequency += 1;
        item.monetary += value;
        customers.set(customer, item);
      }
      const scored = [...customers.entries()].sort((a,b)=>b[1].monetary-a[1].monetary)[0];
      if (scored) {
        const sourceAsOfMs = Math.max(...[...customers.values()].map((item) => item.last));
        const recencyDays = Math.max(0, Math.round((sourceAsOfMs - scored[1].last) / 86400000));
        modelFinding = {
          id: 'archetype:' + profile.id + ':rfm',
          kind: 'FINDING',
          priority: 'medium',
          title: profile.title + ' — أعلى ملف RFM',
          statement: 'العميل "' + scored[0] + '" لديه تكرار ' + scored[1].frequency + ' وقيمة ' + scored[1].monetary.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، وحداثة مرصودة تقارب ' + recencyDays + ' يومًا حتى تاريخ آخر سجل في المصدر.' ,
          value: scored[1].monetary,
          unit: 'monetary',
          dimensionLabel: 'العميل',
          dimensionValue: scored[0],
          evidence: ['customerField=' + customerKey, 'dateField=' + dateKey, 'valueField=' + valueKey, 'sourceAsOf=' + new Date(sourceAsOfMs).toISOString().slice(0, 10), 'frequency=' + scored[1].frequency, 'monetary=' + scored[1].monetary.toFixed(2)],
          limitation: 'RFM وصفي ويحتاج نافذة ومرجعًا زمنيًا معتمدًا قبل تصنيف شرائح كاملة.',
          action: profile.recommendationFocus[0] || 'راجع العملاء الأعلى قيمة وحداثة قبل بناء حملة متابعة.',
        };
      }
    }
  }

  if (!modelFinding && family === 'supplier-performance') {
    const supplierKey = columnKey(report, 'supplierCode');
    const leadKey = columnKey(report, 'leadTimeDays');
    const priceKey = columnKey(report, 'unitPrice');
    if (supplierKey && (leadKey || priceKey)) {
      const suppliers = new Map<string, { count: number; lead: number; leadCount: number; price: number; priceCount: number }>();
      for (const row of rows) {
        const supplier = text(row.data?.[supplierKey]);
        if (!supplier) continue;
        const item = suppliers.get(supplier) ?? { count: 0, lead: 0, leadCount: 0, price: 0, priceCount: 0 };
        item.count += 1;
        const lead = leadKey ? num(row.data?.[leadKey]) : null;
        const price = priceKey ? num(row.data?.[priceKey]) : null;
        if (lead != null) { item.lead += lead; item.leadCount += 1; }
        if (price != null) { item.price += price; item.priceCount += 1; }
        suppliers.set(supplier, item);
      }
      const candidate = [...suppliers.entries()].sort((a,b)=>(b[1].lead / Math.max(1,b[1].leadCount))-(a[1].lead / Math.max(1,a[1].leadCount)))[0];
      if (candidate) {
        const avgLead = candidate[1].leadCount ? candidate[1].lead / candidate[1].leadCount : null;
        modelFinding = {
          id: 'archetype:' + profile.id + ':supplier-performance',
          kind: avgLead != null && avgLead >= 30 ? 'RISK' : 'FINDING',
          priority: avgLead != null && avgLead >= 30 ? 'high' : 'medium',
          title: profile.title + ' — أداء المورد',
          statement: 'المورد "' + candidate[0] + '" لديه ' + candidate[1].count + ' سجلًا ومتوسط مدة توريد مرصودة ' + (avgLead == null ? 'غير متاحة' : avgLead.toFixed(1) + ' يوم') + '.',
          value: avgLead,
          unit: 'days',
          dimensionLabel: 'المورد',
          dimensionValue: candidate[0],
          evidence: ['supplierField=' + supplierKey, 'leadTimeField=' + (leadKey ?? 'missing'), 'records=' + candidate[1].count],
          limitation: 'هذه قراءة وصفية ولا تقيس الالتزام بموعد تعاقدي غير موجود.',
          action: profile.recommendationFocus[0] || 'راجع المورد مقابل المهلة المتفق عليها والأسعار والتأخيرات.',
        };
      }
    }
  }

  if (!modelFinding && family === 'profitability') {
    const revenueKey = columnKey(report, 'netAmount') ?? columnKey(report, 'grossAmount');
    const costKey = columnKey(report, 'cost');
    if (revenueKey && costKey) {
      const revenue = sumBy(rows, revenueKey);
      const cost = sumBy(rows, costKey);
      const margin = revenue === 0 ? null : ((revenue - cost) / Math.abs(revenue)) * 100;
      modelFinding = {
        id: 'archetype:' + profile.id + ':profitability',
        kind: margin != null && margin < 10 ? 'RISK' : 'FINDING',
        priority: margin != null && margin < 10 ? 'high' : 'medium',
        title: profile.title + ' — هامش المصدر',
        statement: margin == null
          ? 'تعذر حساب الهامش من الإيراد والتكلفة المتاحة.'
          : 'الإيراد المحسوب ' + revenue.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، والتكلفة ' + cost.toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '، والهامش ' + margin.toFixed(1) + '%.',
        value: margin,
        unit: '% margin',
        evidence: ['revenueField=' + revenueKey, 'costField=' + costKey, 'revenue=' + revenue.toFixed(2), 'cost=' + cost.toFixed(2)],
        limitation: 'هذا هامش مبني على الحقول المحددة ولا يساوي صافي الربح بعد المصروفات.',
        action: profile.recommendationFocus[0] || 'قسّم الهامش حسب المنتج/العميل قبل اعتماد قرار تسعير أو شراء.',
      };
    }
  }

  if (!modelFinding && family === 'demand') {
    const dateKey = columnKey(report, 'documentDate');
    const demandKey = columnKey(report, 'salesQty') ?? columnKey(report, 'requestedQty');
    if (dateKey && demandKey) {
      const trend = dateValue(rows, dateKey, demandKey);
      if (trend) {
        modelFinding = {
          id: 'archetype:' + profile.id + ':demand',
          kind: trend.pct != null && trend.pct < -10 ? 'RISK' : 'FINDING',
          priority: trend.pct != null && Math.abs(trend.pct) >= 20 ? 'high' : 'medium',
          title: profile.title + ' — اتجاه الطلب',
          statement: 'الطلب المحسوب انتقل من ' + trend.previous[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + ' إلى ' + trend.latest[1].toLocaleString('ar-YE', { maximumFractionDigits: 2 }) + '.',
          value: trend.delta,
          unit: 'demand period delta',
          dimensionLabel: 'الفترة',
          dimensionValue: trend.latest[0],
          evidence: ['dateField=' + dateKey, 'demandField=' + demandKey, 'previousPeriod=' + trend.previous[0], 'latestPeriod=' + trend.latest[0]],
          limitation: 'هذا اتجاه وصفي؛ التنبؤ يحتاج تاريخًا كافيًا ولا يضمن نتيجة مستقبلية.',
          action: profile.recommendationFocus[0] || 'اربط اتجاه الطلب بالمخزون وتاريخ التوريد قبل القرار.',
        };
      }
    }
  }

  if (!modelFinding && (family === 'customer-product' || (has('customerCode') && has('productCode') && profile.capabilities.some((cap) => norm(cap).includes('customerproduct') || norm(cap).includes('mix'))))) {
    const customerKey = columnKey(report, 'customerCode')!;
    const productKey = columnKey(report, 'productCode')!;
    const pairs = new Map<string, number>();
    for (const row of rows) {
      const pair = text(row.data?.[customerKey]) + ' × ' + text(row.data?.[productKey]);
      if (pair.trim() !== '×') pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    }
    const top = [...pairs.entries()].sort((a,b)=>b[1]-a[1])[0];
    if (top) {
      modelFinding = {
        id: 'archetype:' + profile.id + ':customer-product',
        kind: 'FINDING',
        priority: 'medium',
        title: profile.title + ' — العلاقة الأعلى تكرارًا',
        statement: 'العلاقة "' + top[0] + '" ظهرت في ' + top[1] + ' سجلًا داخل المصدر.',
        value: top[1],
        unit: 'rows',
        evidence: ['customerField=' + customerKey, 'productField=' + productKey, 'pairCount=' + top[1]],
        limitation: 'تكرار العلاقة لا يثبت فرصة بيع إضافية دون قياس السلة والقيمة.',
        action: profile.recommendationFocus[0] || 'راجع العلاقة الأعلى تكرارًا مع قيمة المبيعات والوتيرة.',
      };
    }
  }

  if (!modelFinding && report.persistedIntelligenceCalculations?.length && family === 'inventory-movement') {
    const usable = report.persistedIntelligenceCalculations.filter((item) =>
      String(item.availability_state ?? '').toUpperCase() === 'CALCULATED'
      && Number.isFinite(Number(item.value))
    );
    const metric = (name: string) => usable.find((item) => text(item.name) === name);
    const coverage = metric('نسبة الرصيد إلى الطلب المرجعي');
    const negative = metric('سجلات الرصيد السالب');
    const zero = metric('سجلات الرصيد الصفري');
    const completeness = metric('اكتمال البيانات');

    const coverageValue = coverage ? num(coverage.value) : null;
    const negativeValue = negative ? num(negative.value) : null;
    const zeroValue = zero ? num(zero.value) : null;
    const sample = Number(coverage?.sample_size ?? negative?.sample_size ?? zero?.sample_size ?? report.rowCount ?? 0);
    const zeroRate = zeroValue != null && sample > 0 ? (zeroValue / sample) * 100 : null;

    if (coverageValue != null || negativeValue != null || zeroValue != null || completeness) {
      const highRisk = coverageValue != null && coverageValue < 1;
      const evidence = [
        coverage ? 'metric=' + text(coverage.name) + ':' + coverageValue : '',
        negative ? 'metric=' + text(negative.name) + ':' + negativeValue : '',
        zero ? 'metric=' + text(zero.name) + ':' + zeroValue : '',
        completeness ? 'metric=' + text(completeness.name) + ':' + num(completeness.value) + '%' : '',
        'sampleSize=' + sample,
        ...[coverage, negative, zero, completeness].filter(Boolean).map((item) => 'confidence=' + Number(item?.confidence ?? 0).toFixed(4)),
      ].filter(Boolean);

      const parts: string[] = [];
      if (coverageValue != null) parts.push('نسبة الرصيد إلى الطلب المرجعي = ' + coverageValue.toFixed(2));
      if (negativeValue != null) parts.push(negativeValue + ' سجلًا برصيد سالب');
      if (zeroValue != null) parts.push(zeroValue + ' سجلًا برصيد صفري' + (zeroRate != null ? ' (' + zeroRate.toFixed(1) + '% من العينة)' : ''));
      if (completeness && num(completeness.value) != null) parts.push('اكتمال البيانات ' + Number(completeness.value).toFixed(1) + '%');

      modelFinding = {
        id: 'archetype:' + profile.id + ':persisted-calculation',
        kind: highRisk || (negativeValue != null && negativeValue > 0) ? 'RISK' : 'FINDING',
        priority: highRisk || (negativeValue != null && negativeValue > 0) ? 'high' : 'medium',
        title: profile.title + ' — إشارة من الحسابات الموثقة',
        statement: parts.join('، ') + '.',
        value: coverageValue ?? negativeValue ?? zeroValue ?? num(completeness?.value),
        unit: coverageValue != null ? 'stock-to-demand ratio' : negativeValue != null ? 'negative-balance rows' : zeroValue != null ? 'zero-balance rows' : '% completeness',
        evidence,
        limitation: 'هذه الإشارة مبنية على حسابات Intelligence محفوظة لنفس التقرير؛ الحقول الخام غير المتاحة لا تُستبدل ولا تُعتبر متاحة.',
        action: profile.recommendationFocus[0] || 'راجع تفاصيل الحسابات والأدلة المصدرية ثم حوّل النتيجة إلى إجراء.',
      };
    }
  }

  if (!modelFinding) return intelligence;

  intelligence = addModelFinding(intelligence, profile, modelFinding);
  intelligence = addModelRecommendation(intelligence, profile, modelFinding);

  const modelSignal: ReportSignal = {
    id: 'model:' + profile.id,
    severity: modelFinding.kind === 'RISK' ? (modelFinding.priority === 'high' ? 'high' : 'medium') : 'info',
    title: 'النموذج ' + String(profile.number).padStart(2, '0') + ' قُرئ من المصدر',
    message: modelFinding.statement,
    evidence: modelFinding.evidence,
    soWhat: modelFinding.action,
    impact: modelFinding.value == null ? 'الأثر المالي غير مثبت من المصدر الحالي.' : 'الأثر المثبت حاليًا مرتبط بالقيمة/النطاق الظاهر في الدليل.',
    ownerHint: baseOwnerHint(profile),
    priority: modelFinding.kind === 'RISK' && modelFinding.priority === 'high' ? 'P1' : 'P2',
    priorityReason: ['الأهمية مشتقة من نتيجة النموذج', 'الدليل: ' + modelFinding.evidence.length + ' مؤشرات مصدرية'],
  };

  return {
    ...intelligence,
    signals: [modelSignal, ...intelligence.signals.filter((signal) => signal.id !== modelSignal.id)],
  };
}
