import { normalizeColumnName, parseNumber } from './normalizer.ts';

export type SchemaField = 'sku' | 'barcode' | 'product_name' | 'customer_id' | 'customer_name' | 'invoice_number' | 'price' | 'quantity' | 'date' | 'unit' | 'warehouse' | 'unknown';

export type SchemaEvidence = {
  field: SchemaField;
  confidence: number;
  evidence: string[];
  ambiguous: boolean;
};

const SYNONYMS: Record<Exclude<SchemaField, 'unknown'>, string[]> = {
  sku: ['sku', 'item code', 'product code', 'item number', 'رقم الصنف', 'كود الصنف', 'رمز الصنف'],
  barcode: ['barcode', 'bar code', 'باركود', 'الباركود'],
  product_name: ['product', 'product name', 'item', 'item name', 'name', 'اسم الصنف', 'اسم المنتج', 'الصنف', 'المنتج'],
  customer_id: ['customer id', 'customer number', 'client id', 'رقم العميل', 'كود العميل'],
  customer_name: ['customer', 'customer name', 'client', 'client name', 'اسم العميل', 'العميل'],
  invoice_number: ['invoice', 'invoice number', 'invoice no', 'رقم الفاتورة', 'الفاتورة'],
  price: ['price', 'unit price', 'sale price', 'cost', 'السعر', 'سعر البيع', 'سعر الوحدة'],
  quantity: ['quantity', 'qty', 'count', 'stock', 'الكمية', 'العدد', 'المخزون'],
  date: ['date', 'invoice date', 'transaction date', 'التاريخ', 'تاريخ الفاتورة'],
  unit: ['unit', 'uom', 'الوحدة', 'وحدة القياس'],
  warehouse: ['warehouse', 'store', 'المستودع', 'المخزن'],
};

function compact(value: unknown): string {
  return normalizeColumnName(String(value ?? '')).replace(/[._:/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreByHeader(header: string, field: Exclude<SchemaField, 'unknown'>): { score: number; evidence: string[] } {
  const normalized = compact(header);
  const aliases = SYNONYMS[field].map(compact);
  if (!normalized) return { score: 0, evidence: [] };
  if (aliases.includes(normalized)) return { score: 100, evidence: ['exact synonym'] };
  const matched = aliases.filter(alias => normalized.includes(alias) || alias.includes(normalized));
  if (matched.length) return { score: 72, evidence: [`partial synonym: ${matched[0]}`] };
  return { score: 0, evidence: [] };
}

function valueEvidence(values: unknown[], field: Exclude<SchemaField, 'unknown'>): number {
  const sample = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 200);
  if (!sample.length) return 0;
  if (field === 'price' || field === 'quantity') return sample.filter(v => parseNumber(v) !== null).length / sample.length * 20;
  if (field === 'barcode') return sample.filter(v => /^\d{6,18}$/.test(String(v).replace(/\s/g, ''))).length / sample.length * 25;
  if (field === 'sku') return sample.filter(v => /^[A-Za-z0-9._/-]{2,40}$/.test(String(v).trim())).length / sample.length * 15;
  return 0;
}

export function inferSchemaField(header: string, values: unknown[] = []): SchemaEvidence {
  const fields = (Object.keys(SYNONYMS) as Exclude<SchemaField, 'unknown'>[])
    .map(field => {
      const headerScore = scoreByHeader(header, field);
      const valueScore = valueEvidence(values, field);
      return { field, confidence: Math.min(100, Math.round(headerScore.score + valueScore)), evidence: [...headerScore.evidence, ...(valueScore ? ['value-shape evidence'] : [])] };
    })
    .filter(x => x.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const best = fields[0];
  const second = fields[1];
  if (!best) return { field: 'unknown', confidence: 0, evidence: ['no schema evidence'], ambiguous: true };
  const ambiguous = Boolean(second && best.confidence < 90 && best.confidence - second.confidence < 15);
  return { field: best.field, confidence: best.confidence, evidence: best.evidence, ambiguous };
}

export function inferSchema(headers: string[], rows: Record<string, unknown>[] = []): SchemaEvidence[] {
  return headers.map(header => inferSchemaField(header, rows.map(row => row[header])));
}
