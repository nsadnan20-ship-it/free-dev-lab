export type EvidenceDriver = {
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

export type EvidenceBusinessSignal = {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  evidence: string[];
  affectedRows?: number;
  drivers?: EvidenceDriver[];
};

export type EvidenceBusinessSignalInput = {
  specialty?: string | null;
  rowCount?: number | null;
  sourceAnalysis?: { datasets?: unknown[] } | null;
  canonicalRows?: Array<{ row_number?: number; data?: Record<string, unknown> | null }>;
};

function text(value: unknown): string { return String(value ?? '').trim(); }
function normalized(value: unknown): string { return text(value).toLowerCase().normalize('NFKC').replace(/[\s_\-./]+/g, ''); }
function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/[,٬]/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function columnsOf(report: EvidenceBusinessSignalInput): Array<Record<string, unknown>> {
  const datasets = report.sourceAnalysis?.datasets ?? [];
  const columns: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== 'object') continue;
    const items = (dataset as Record<string, unknown>).columns;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const column = item as Record<string, unknown>;
      const key = normalized(column.mappedField ?? column.name ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      columns.push(column);
    }
  }
  return columns;
}
function findColumn(columns: Array<Record<string, unknown>>, aliases: string[]): Record<string, unknown> | null {
  return columns.find((column) => {
    const key = normalized(column.mappedField ?? column.name);
    return aliases.some((alias) => key.includes(normalized(alias)));
  }) ?? null;
}
function dataKey(column: Record<string, unknown> | null): string { return text(column?.mappedField) || text(column?.name); }
function changePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function monthlySeries(rows: EvidenceBusinessSignalInput['canonicalRows'], dateKey: string, valueKey: string): Array<{ period: string; total: number }> {
  const grouped = new Map<string, number>();
  for (const row of rows ?? []) {
    const date = parseDate(row.data?.[dateKey]);
    const value = numeric(row.data?.[valueKey]);
    if (!date || value == null) continue;
    const period = date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
    grouped.set(period, (grouped.get(period) ?? 0) + value);
  }
  return [...grouped.entries()].map(([period, total]) => ({ period, total })).sort((a, b) => a.period.localeCompare(b.period));
}
function groupTotals(rows: EvidenceBusinessSignalInput['canonicalRows'], groupKey: string, valueKey: string): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const row of rows ?? []) {
    const group = text(row.data?.[groupKey]);
    const value = numeric(row.data?.[valueKey]);
    if (!group || value == null) continue;
    grouped.set(group, (grouped.get(group) ?? 0) + value);
  }
  return grouped;
}

export function deriveEvidenceBusinessSignals(report: EvidenceBusinessSignalInput): EvidenceBusinessSignal[] {
  const rows = (report.canonicalRows ?? []).filter((row) => row && row.data);
  if (rows.length < 12) return [];
  const columns = columnsOf(report);
  const signals: EvidenceBusinessSignal[] = [];
  const specialty = text(report.specialty);
  const dateColumn = findColumn(columns, ['invoice_date', 'transaction_date', 'date', 'due_date', 'التاريخ']);
  const amountColumn = findColumn(columns, ['total_amount', 'net_amount', 'total', 'amount', 'sales', 'purchase', 'revenue', 'value', 'الإجمالي', 'المبلغ']);
  const dateKey = dataKey(dateColumn);
  const amountKey = dataKey(amountColumn);

  if (dateKey && amountKey) {
    const series = monthlySeries(rows, dateKey, amountKey);
    if (series.length >= 6) {
      const recent = series.slice(-6);
      const first = recent[0].total;
      const last = recent[recent.length - 1].total;
      const pct = changePercent(last, first);
      const mean = recent.reduce((sum, point) => sum + point.total, 0) / recent.length;
      if (pct != null && Math.abs(pct) >= 12 && mean > 0) {
        signals.push({
          id: 'business:trend',
          severity: Math.abs(pct) >= 30 ? 'high' : 'medium',
          title: 'اتجاه تجاري واضح في القيمة',
          message: 'السلسلة الشهرية تتحرك ' + (pct > 0 ? 'صعودًا' : 'هبوطًا') + ' بنحو ' + Math.round(Math.abs(pct)) + '% بين أول وآخر فترة من آخر 6 فترات.',
          evidence: ['dateField=' + dateKey, 'valueField=' + amountKey, 'first=' + first.toFixed(2), 'last=' + last.toFixed(2), 'changePercent=' + pct.toFixed(2)],
          affectedRows: rows.length,
          drivers: recent.slice(-3).map((point) => ({
            dimension: 'الفترة',
            value: point.period,
            contribution: point.total,
            share: mean === 0 ? null : point.total / mean * 100,
            period: point.period,
            expected: null,
            actual: point.total,
            why: 'إجمالي الفترة مشتق مباشرة من الصفوف المصدرية.',
            proof: ['dateField=' + dateKey, 'valueField=' + amountKey, 'periodTotal=' + point.total.toFixed(2)],
          })),
        });
      }
    }
  }

  if (amountKey && rows.length >= 20) {
    const values = rows.map((row) => numeric(row.data?.[amountKey])).filter((value): value is number => value != null);
    if (values.length >= 20) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      if (std > 0) {
        const anomalies = rows.map((row) => ({ row, value: numeric(row.data?.[amountKey]) }))
          .filter((item): item is { row: { row_number?: number; data?: Record<string, unknown> | null }; value: number } => item.value != null)
          .map((item) => ({ ...item, z: Math.abs((item.value - mean) / std) }))
          .filter((item) => item.z >= 3)
          .sort((a, b) => b.z - a.z)
          .slice(0, 5);
        if (anomalies.length >= 2) {
          signals.push({
            id: 'business:anomaly',
            severity: anomalies.length >= Math.max(5, Math.ceil(values.length * 0.02)) ? 'high' : 'medium',
            title: 'قيم شاذة قابلة للفحص',
            message: 'ظهرت ' + anomalies.length + ' صفوف تتجاوز 3 انحرافات معيارية عن متوسط القيمة.',
            evidence: ['valueField=' + amountKey, 'sample=' + values.length, 'mean=' + mean.toFixed(2), 'threshold=z>=3'],
            affectedRows: anomalies.length,
            drivers: anomalies.map((item) => ({
              dimension: 'صف المصدر',
              value: String(item.row.row_number ?? 'غير معروف'),
              contribution: item.value,
              share: mean === 0 ? null : item.value / mean * 100,
              period: null,
              expected: mean,
              actual: item.value,
              why: 'القيمة تتجاوز 3 انحرافات معيارية عن المتوسط.',
              proof: ['valueField=' + amountKey, 'zScore=' + item.z.toFixed(2)],
            })),
          });
        }
      }
    }
  }

  const entityColumn = specialty === 'sales'
    ? findColumn(columns, ['customer_name', 'customer', 'client', 'العميل'])
    : specialty === 'purchases'
      ? findColumn(columns, ['supplier_name', 'supplier', 'vendor', 'المورد'])
      : findColumn(columns, ['customer_name', 'customer', 'supplier_name', 'supplier', 'product_name', 'product', 'sku', 'الصنف']);
  const entityKey = dataKey(entityColumn);
  if (entityKey && amountKey) {
    const grouped = groupTotals(rows, entityKey, amountKey);
    const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
    if (grouped.size >= 5 && total > 0) {
      const top = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topShare = top[0][1] / total;
      if (topShare >= 0.4) {
        signals.push({
          id: 'business:concentration',
          severity: topShare >= 0.65 ? 'high' : 'medium',
          title: 'تركيز مرتفع في القيمة',
          message: 'أكبر كيان يحمل ' + Math.round(topShare * 100) + '% من إجمالي القيمة المجمعة في المصدر.',
          evidence: ['groupField=' + entityKey, 'valueField=' + amountKey, 'groupCount=' + grouped.size, 'topShare=' + (topShare * 100).toFixed(2)],
          affectedRows: top.length,
          drivers: top.map(([value, contribution]) => ({
            dimension: entityKey,
            value,
            contribution,
            share: contribution / total * 100,
            period: null,
            expected: null,
            actual: contribution,
            why: 'الكيان يحمل حصة مباشرة من القيمة المجمعة في المصدر.',
            proof: ['groupField=' + entityKey, 'valueField=' + amountKey, 'groupTotal=' + contribution.toFixed(2)],
          })),
        });
      }
    }
  }

  const revenueColumn = findColumn(columns, ['revenue', 'sales_value', 'sales_amount', 'total_amount', 'net_amount', 'sales', 'المبيعات', 'الإيراد']);
  const costColumn = findColumn(columns, ['cost', 'cost_amount', 'purchase_cost', 'cogs', 'التكلفة', 'تكلفة']);
  const revenueKey = dataKey(revenueColumn);
  const costKey = dataKey(costColumn);
  if (revenueKey && costKey) {
    let revenue = 0; let cost = 0; let matched = 0;
    for (const row of rows) {
      const r = numeric(row.data?.[revenueKey]); const c = numeric(row.data?.[costKey]);
      if (r != null && c != null) { revenue += r; cost += c; matched += 1; }
    }
    if (matched >= 10 && revenue > 0) {
      const margin = (revenue - cost) / revenue * 100;
      if (margin < 20) {
        signals.push({
          id: 'business:margin-pressure',
          severity: margin < 10 ? 'high' : 'medium',
          title: 'ضغط على الهامش',
          message: 'الهامش الإجمالي المشتق من المصدر بلغ ' + margin.toFixed(1) + '%، تحت حد المراجعة 20%.',
          evidence: ['revenueField=' + revenueKey, 'costField=' + costKey, 'revenue=' + revenue.toFixed(2), 'cost=' + cost.toFixed(2), 'margin=' + margin.toFixed(2)],
          affectedRows: matched,
          drivers: [{
            dimension: 'الهامش الإجمالي', value: margin.toFixed(2) + '%', contribution: revenue - cost, share: margin, period: null, expected: 20, actual: margin,
            why: 'الهامش مشتق من الإيراد والتكلفة في الصفوف نفسها.',
            proof: ['revenueField=' + revenueKey, 'costField=' + costKey, 'matchedRows=' + matched],
          }],
        });
      }
    }
  }

  const returnAmountColumn = findColumn(columns, ['return_amount', 'returns_amount', 'refund_amount', 'returned_amount', 'مبلغ المرتجع', 'المرتجعات']);
  const returnTypeColumn = findColumn(columns, ['invoice_type', 'transaction_type', 'type', 'نوع الفاتورة', 'مرتجع', 'return']);
  const returnAmountKey = dataKey(returnAmountColumn); const returnTypeKey = dataKey(returnTypeColumn);
  if (amountKey && (returnAmountKey || returnTypeKey)) {
    let gross = 0; let returns = 0; let returnRows = 0;
    for (const row of rows) {
      const grossValue = numeric(row.data?.[amountKey]); if (grossValue != null) gross += Math.max(0, grossValue);
      const explicitReturn = returnAmountKey ? numeric(row.data?.[returnAmountKey]) : null;
      const typeText = returnTypeKey ? normalized(row.data?.[returnTypeKey]) : '';
      if (explicitReturn != null && explicitReturn > 0) { returns += explicitReturn; returnRows += 1; }
      else if (/مرتجع|return|refund|returned/.test(typeText) && grossValue != null && grossValue > 0) { returns += grossValue; returnRows += 1; }
    }
    if (gross > 0 && returnRows > 0) {
      const returnShare = returns / gross * 100;
      if (returnShare >= 5) signals.push({
        id: 'business:return-effect', severity: returnShare >= 15 ? 'high' : 'medium', title: 'أثر مرتجعات ملحوظ',
        message: 'المرتجعات تمثل نحو ' + returnShare.toFixed(1) + '% من القيمة المجمعة في الصفوف المقروءة.',
        evidence: ['gross=' + gross.toFixed(2), 'returns=' + returns.toFixed(2), 'returnShare=' + returnShare.toFixed(2)],
        affectedRows: returnRows,
      });
    }
  }

  const discountColumn = findColumn(columns, ['discount_amount', 'discount', 'discount_value', 'الخصم']);
  const discountKey = dataKey(discountColumn);
  if (amountKey && discountKey) {
    let gross = 0; let discount = 0; let matched = 0;
    for (const row of rows) {
      const grossValue = numeric(row.data?.[amountKey]); const discountValue = numeric(row.data?.[discountKey]);
      if (grossValue != null && discountValue != null) { gross += Math.max(0, grossValue); discount += Math.max(0, discountValue); matched += 1; }
    }
    if (matched >= 10 && gross > 0) {
      const share = discount / gross * 100;
      if (share >= 5) signals.push({
        id: 'business:discount-effect', severity: share >= 12 ? 'high' : 'medium', title: 'أثر خصومات ملحوظ',
        message: 'الخصومات تمثل نحو ' + share.toFixed(1) + '% من القيمة الإجمالية في الصفوف القابلة للمقارنة.',
        evidence: ['gross=' + gross.toFixed(2), 'discount=' + discount.toFixed(2), 'discountShare=' + share.toFixed(2)],
        affectedRows: matched,
      });
    }
  }

  if (specialty === 'inventory') {
    const stockColumn = findColumn(columns, ['quantity', 'qty', 'stock', 'current_stock', 'الكمية', 'المخزون']);
    const reorderColumn = findColumn(columns, ['reorder_level', 'reorder_point', 'minimum_stock', 'حد_إعادة_الطلب', 'الحد الأدنى']);
    const avgDailyColumn = findColumn(columns, ['avg_daily_sales', 'daily_sales', 'average_daily_demand', 'متوسط_المبيعات_اليومية']);
    const stockKey = dataKey(stockColumn); const reorderKey = dataKey(reorderColumn); const avgDailyKey = dataKey(avgDailyColumn);
    let riskRows = 0; const drivers: EvidenceDriver[] = [];
    for (const row of rows) {
      const stock = stockKey ? numeric(row.data?.[stockKey]) : null;
      const reorder = reorderKey ? numeric(row.data?.[reorderKey]) : null;
      const daily = avgDailyKey ? numeric(row.data?.[avgDailyKey]) : null;
      const belowReorder = stock != null && reorder != null && stock <= reorder;
      const lowCover = stock != null && daily != null && daily > 0 && stock / daily <= 15;
      if (belowReorder || lowCover) {
        riskRows += 1;
        if (drivers.length < 5) drivers.push({
          dimension: stockKey || 'stock', value: String(row.data?.[stockKey || ''] ?? ('صف ' + String(row.row_number ?? ''))),
          contribution: stock, share: null, period: null, expected: reorder, actual: stock,
          why: belowReorder ? 'المخزون عند أو دون حد إعادة الطلب.' : 'التغطية المحسوبة 15 يومًا أو أقل من متوسط الطلب اليومي.',
          proof: [stockKey ? 'stockField=' + stockKey : 'stockField=missing', reorderKey ? 'reorderField=' + reorderKey : 'reorderField=missing', avgDailyKey ? 'avgDailyField=' + avgDailyKey : 'avgDailyField=missing'],
        });
      }
    }
    if (riskRows > 0 && (reorderKey || avgDailyKey)) signals.push({
      id: 'business:inventory-risk', severity: riskRows >= Math.max(5, Math.ceil(rows.length * 0.05)) ? 'high' : 'medium',
      title: 'مخاطر تغطية/إعادة طلب في المخزون', message: 'هناك ' + riskRows + ' صفوف تقع عند أو دون حد إعادة الطلب أو تملك تغطية يومية قصيرة.',
      evidence: ['riskRows=' + riskRows, 'stockField=' + stockKey, 'reorderField=' + reorderKey, 'avgDailyField=' + avgDailyKey], affectedRows: riskRows, drivers,
    });
  }

  if (specialty === 'purchases' && dateKey && amountKey) {
    const series = monthlySeries(rows, dateKey, amountKey);
    if (series.length >= 4) {
      const previous = series[series.length - 2].total; const latest = series[series.length - 1].total; const pct = changePercent(latest, previous);
      if (pct != null && Math.abs(pct) >= 20) signals.push({
        id: 'business:purchase-pattern', severity: Math.abs(pct) >= 40 ? 'high' : 'medium', title: 'تغير ملحوظ في نمط المشتريات',
        message: 'قيمة آخر فترة مشتريات تغيرت بنحو ' + Math.round(Math.abs(pct)) + '% مقارنة بالفترة السابقة.',
        evidence: ['previous=' + previous.toFixed(2), 'latest=' + latest.toFixed(2), 'changePercent=' + pct.toFixed(2), 'period=' + series[series.length - 1].period], affectedRows: rows.length,
      });
    }
  }

  if (specialty === 'sales') {
    const customerColumn = findColumn(columns, ['customer_name', 'customer', 'client', 'العميل']);
    const customerKey = dataKey(customerColumn);
    if (customerKey) {
      const frequencies = new Map<string, number>();
      for (const row of rows) { const value = text(row.data?.[customerKey]); if (value) frequencies.set(value, (frequencies.get(value) ?? 0) + 1); }
      const repeatCustomers = [...frequencies.values()].filter((count) => count >= 2).length; const totalCustomers = frequencies.size;
      if (totalCustomers >= 10 && repeatCustomers / totalCustomers >= 0.35) signals.push({
        id: 'business:customer-behavior', severity: 'info', title: 'سلوك تكرار العملاء ظاهر في المصدر',
        message: 'نحو ' + Math.round(repeatCustomers / totalCustomers * 100) + '% من العملاء لديهم أكثر من عملية داخل المصدر.',
        evidence: ['customerField=' + customerKey, 'repeatCustomers=' + repeatCustomers, 'totalCustomers=' + totalCustomers], affectedRows: repeatCustomers,
      });
    }
  }

  const receivableColumn = findColumn(columns, ['outstanding_balance', 'receivable', 'receivables', 'الرصيد المستحق', 'ذمم']);
  const payableColumn = findColumn(columns, ['payable', 'payables', 'outstanding_payables', 'مستحقات المورد']);
  const receivableKey = dataKey(receivableColumn); const payableKey = dataKey(payableColumn);
  if (receivableKey && payableKey) {
    let receivables = 0; let payables = 0; let matched = 0;
    for (const row of rows) { const r = numeric(row.data?.[receivableKey]); const p = numeric(row.data?.[payableKey]); if (r != null && p != null) { receivables += Math.max(0,r); payables += Math.max(0,p); matched += 1; } }
    if (matched >= 10 && payables > 0) {
      const ratio = receivables / payables;
      if (ratio >= 1.5) signals.push({
        id: 'business:working-capital', severity: ratio >= 3 ? 'high' : 'medium', title: 'إشارة رأس مال عامل',
        message: 'الرصيد المستحق للمدينين يساوي نحو ' + ratio.toFixed(2) + '× من الالتزامات الموردة في الصفوف القابلة للمقارنة.',
        evidence: ['receivable=' + receivables.toFixed(2), 'payable=' + payables.toFixed(2), 'ratio=' + ratio.toFixed(2)], affectedRows: matched,
      });
    }
  }

  return signals;
}
