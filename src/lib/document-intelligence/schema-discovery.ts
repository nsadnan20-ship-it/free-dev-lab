export type PrimitiveKind = 'empty' | 'string' | 'number' | 'date' | 'boolean' | 'mixed';

export type CandidateMeaning = {
  field: string;
  score: number;
  evidence: string[];
};

export type ColumnProfile = {
  index: number;
  originalHeader?: string;
  normalizedHeader: string;
  primitiveKind: PrimitiveKind;
  nonEmptyRatio: number;
  uniqueRatio: number;
  numericRatio: number;
  dateRatio: number;
  averageLength: number;
  min?: number;
  max?: number;
  patterns: string[];
  candidates: CandidateMeaning[];
  confidence: number;
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const LATIN_DIGITS = '0123456789';

export function normalizeHeader(value: unknown): string {
  let s = String(value ?? '').trim().toLowerCase();
  s = s.replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/ـ/g, '');
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(ARABIC_DIGITS[i], 'g'), LATIN_DIGITS[i]);
    s = s.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), LATIN_DIGITS[i]);
  }
  return s.replace(/[\s_\-./]+/g, ' ').trim();
}

function normalizeNumericText(value: unknown): string {
  let s = String(value ?? '').trim();
  for (let i = 0; i < 10; i++) {
    s = s.replace(new RegExp(ARABIC_DIGITS[i], 'g'), LATIN_DIGITS[i]);
    s = s.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), LATIN_DIGITS[i]);
  }
  return s
    .replace(/[٪%]/g, '%')
    .replace(/٬/g, '')
    .replace(/٫/g, '.')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
}

function numberValue(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = normalizeNumericText(v);
  if (!s || !/^-?\d+(\.\d+)?%?$/.test(s)) return undefined;
  const n = Number(s.endsWith('%') ? s.slice(0, -1) : s);
  return Number.isFinite(n) ? n : undefined;
}

function dateLike(v: unknown): boolean {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
  const s = String(v ?? '').trim();
  if (!s) return false;
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(s);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenScore(header: string, dictionary: Record<string, string[]>): CandidateMeaning[] {
  const results: CandidateMeaning[] = [];
  for (const [field, terms] of Object.entries(dictionary)) {
    const normalizedTerms = terms.map(normalizeHeader).filter(Boolean);
    const exact = normalizedTerms.filter(term => header === term);
    const contained = normalizedTerms.filter(term => term.length >= 4 && new RegExp(`(?:^| )${escapeRegExp(term)}(?:$| )`).test(header));
    const hits = [...new Set([...exact, ...contained])];
    if (!hits.length) continue;
    const score = exact.length ? Math.min(0.98, 0.90 + exact.length * 0.04) : Math.min(0.86, 0.62 + hits.length * 0.08);
    results.push({ field, score, evidence: [`header:${hits.join(',')}`, ...(exact.length ? ['exact-header-match'] : ['header-token-match'])] });
  }
  return results;
}

export const DEFAULT_SEMANTIC_DICTIONARY: Record<string, string[]> = {
  product_code: ['sku', 'item code', 'product code', 'item number', 'product number', 'رقم الصنف', 'كود الصنف', 'رمز الصنف'],
  product_name: ['product name', 'item name', 'description', 'اسم الصنف', 'اسم المنتج'],
  barcode: ['barcode', 'bar code', 'باركود', 'الباركود'],
  quantity: ['qty', 'quantity', 'count', 'units', 'كمية', 'الكمية', 'عدد'],
  unit: ['unit', 'uom', 'وحدة', 'الوحدة'],
  unit_price: ['unit price', 'selling price', 'سعر الوحدة', 'سعر البيع', 'السعر'],
  discount: ['discount', 'خصم', 'الخصم'],
  tax: ['tax', 'vat', 'ضريبة', 'الضريبة'],
  total_amount: ['total amount', 'net amount', 'grand total', 'الإجمالي', 'المجموع', 'صافي الإجمالي'],
  invoice_number: ['invoice no', 'invoice number', 'رقم الفاتورة'],
  invoice_date: ['invoice date', 'تاريخ الفاتورة'],
  customer_id: ['customer id', 'customer number', 'رقم العميل'],
  supplier_id: ['supplier id', 'supplier number', 'رقم المورد'],
  warehouse_id: ['warehouse id', 'warehouse number', 'مستودع', 'المستودع', 'المخزن']
};

export function profileColumns(rows: unknown[][], headers: unknown[] = [], dictionary = DEFAULT_SEMANTIC_DICTIONARY): ColumnProfile[] {
  const width = Math.max(headers.length, ...rows.map(r => r.length), 0);
  return Array.from({ length: width }, (_, index) => {
    const values = rows.map(r => r[index]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    const numeric = values.map(numberValue).filter((v): v is number => v !== undefined);
    const dates = values.filter(dateLike);
    const unique = new Set(values.map(v => normalizeHeader(v))).size;
    const lengths = values.map(v => String(v).length);
    const header = headers[index] === undefined ? undefined : String(headers[index]);
    const normalizedHeader = normalizeHeader(header ?? '');
    const patterns: string[] = [];
    const numericRatio = numeric.length / Math.max(values.length, 1);
    const dateRatio = dates.length / Math.max(values.length, 1);
    if (numericRatio > 0.8) patterns.push('numeric');
    if (dateRatio > 0.8) patterns.push('date');
    if (values.length && unique / values.length < 0.2) patterns.push('low-cardinality');
    if (values.some(v => /\b[A-Z]{2,}\-?\d{2,}\b/i.test(String(v)))) patterns.push('identifier-like');

    const candidates = tokenScore(normalizedHeader, dictionary);
    if (numericRatio > 0.85) {
      if (/^(qty|quantity|كمية|الكمية|عدد)$/.test(normalizedHeader)) candidates.push({ field: 'quantity', score: 0.92, evidence: ['numeric-profile', 'exact-semantic-pattern'] });
      if (/^(unit price|selling price|سعر الوحدة|سعر البيع|السعر)$/.test(normalizedHeader)) candidates.push({ field: 'unit_price', score: 0.90, evidence: ['numeric-profile', 'exact-semantic-pattern'] });
      if (/^(total amount|net amount|grand total|الإجمالي|المجموع)$/.test(normalizedHeader)) candidates.push({ field: 'total_amount', score: 0.90, evidence: ['numeric-profile', 'exact-semantic-pattern'] });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0]?.score ?? 0;
    const second = candidates[1]?.score ?? 0;
    const ambiguous = Boolean(candidates[1]) && best - second < 0.08;
    if (ambiguous) {
      candidates[0].evidence.push('ambiguous-top-candidates');
      candidates[1].evidence.push('ambiguous-top-candidates');
    }
    const confidence = ambiguous ? Math.min(best, 0.69) : best;
    return {
      index,
      originalHeader: header,
      normalizedHeader,
      primitiveKind: numeric.length === values.length && values.length ? 'number' : dates.length === values.length && values.length ? 'date' : values.length ? 'string' : 'empty',
      nonEmptyRatio: values.length / Math.max(rows.length, 1),
      uniqueRatio: values.length ? unique / values.length : 0,
      numericRatio,
      dateRatio,
      averageLength: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0,
      min: numeric.length ? Math.min(...numeric) : undefined,
      max: numeric.length ? Math.max(...numeric) : undefined,
      patterns,
      candidates: candidates.slice(0, 5),
      confidence
    };
  });
}
